import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import sharp from 'sharp'
import { uploadRouter } from '../src/routes/upload'
import path from 'path'
import express from 'express'
import request from 'supertest'
import prisma from '../src/config/database'
import { mediaRouter } from '../src/routes/media'
import { adoptLegacyMedia, setProductImages, saveMediaConfig } from '../src/services/MediaService'
import { inspectMedia, mediaPath, localUploadPath } from '../src/utils/mediaFiles'
import { getInsights } from '../src/services/ProductInsightsService'
import * as products from '../src/services/ProductService'
if(!process.env.DATABASE_URL?.startsWith('file:/tmp/media-product-')||!process.env.UPLOADS_PATH?.startsWith('/tmp/media-product-'))throw Error('USE_DISPOSABLE_MEDIA_TEST_DATABASE_AND_UPLOADS')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z9DQAMIMMAYASegH/eJzaysAAAAASUVORK5CYII=','base64')
const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:'test-user',storeId:req.get('X-Test-Store')||'media-a',role:req.get('X-Test-Role')||'admin',staffId:'',...(req.get('X-Test-Permissions')?{accessRole:{permissions:JSON.parse(req.get('X-Test-Permissions')!)}}:{})};next()});app.use('/api/media',mediaRouter);app.use('/api/upload',uploadRouter)
let categoryId:string,productId:string
const tenant='media-test-tenant'
test.before(async()=>{
 await prisma.tenant.create({data:{id:tenant,name:'Disposable media tests'}})
 for(const id of ['media-a','media-b'])await prisma.store.create({data:{id,tenantId:tenant,name:id}})
 const category=await prisma.category.create({data:{storeId:'media-a',name:'Tea',code:'TEA'}});categoryId=category.id
 const p=await products.createProduct({storeId:'media-a',categoryId,name:'Tea',code:'MEDIA-TEA'});productId=p.id
})
test.after(async()=>{await prisma.$disconnect()})
async function upload(store='media-a',scene='library',file=png,name='tea.png') {
 const result=await request(app).post('/api/media').query({scene}).set('X-Test-Store',store).attach('files',file,name)
 assert.equal(result.status,200,JSON.stringify(result.body));return result.body.data.list[0]
}
test('file signatures reject spoofed extension and recognize image/audio/video',()=>{
 assert.equal(inspectMedia(Buffer.from('not a png image, despite filename.png')),null)
 assert.equal(inspectMedia(png)?.kind,'image')
 assert.equal(localUploadPath('https://images.example/uploads/products/remote.png'),null)
 assert.equal(localUploadPath('/uploads/../secret'),null)
 assert.equal(localUploadPath('https://api.aicube.online/uploads/products/legacy.png'),'products/legacy.png')
 assert.equal(inspectMedia(Buffer.concat([Buffer.from('RIFFxxxxWAVE'),Buffer.alloc(4)]))?.kind,'audio')
 assert.equal(inspectMedia(Buffer.from('0000ftypM4A 00000000'))?.kind,'audio')
 assert.equal(inspectMedia(Buffer.from('0000ftypisom00000000'))?.kind,'video')
})
test('uploads, lists, renames and deletes are isolated by authenticated store',async()=>{
 const a=await upload(),b=await upload('media-b')
 const list=await request(app).get('/api/media').query({scene:'library'})
 assert.ok(list.body.data.list.some((m:any)=>m.id===a.id));assert.ok(!list.body.data.list.some((m:any)=>m.id===b.id))
 for(const verb of ['patch','delete'] as const){const result=await request(app)[verb](`/api/media/${b.id}`).send({name:'attempt'});assert.equal(result.status,404)}
 assert.equal((await request(app).get(`/api/media/${b.id}/references`)).status,404)
 const renamed=await request(app).patch(`/api/media/${a.id}`).send({name:'Tea poster'});assert.equal(renamed.status,200)
 const search=await request(app).get('/api/media').query({search:'Tea poster'});assert.equal(search.body.data.total,1)
 assert.equal((await request(app).delete(`/api/media/${a.id}`)).status,200);assert.ok(!fs.existsSync(mediaPath(a.storagePath)))
})
test('ordered product gallery preserves main image and protects referenced files',async()=>{
 const a=await upload(),b=await upload()
 await prisma.$transaction(tx=>setProductImages(tx,productId,'media-a',[b.id,a.id]))
 const p=await products.getProductById(productId);assert.equal(p.image,b.url);assert.deepEqual(p.images.map((i:any)=>i.mediaId),[b.id,a.id])
 assert.equal((await request(app).delete(`/api/media/${a.id}`)).status,409)
 const refs=await request(app).get(`/api/media/${a.id}/references`);assert.equal(refs.body.data.list[0].id,productId)
 await prisma.$transaction(tx=>setProductImages(tx,productId,'media-a',[a.id]))
 assert.equal((await products.getProductById(productId)).image,a.url)
 assert.ok(fs.existsSync(mediaPath(b.storagePath)))
 await prisma.$transaction(tx=>setProductImages(tx,productId,'media-a',[]));assert.equal((await products.getProductById(productId)).image,null)
 assert.ok(fs.existsSync(mediaPath(a.storagePath)));assert.equal((await request(app).delete(`/api/media/${a.id}`)).status,200)
})
test('gallery rejects wrong store, audio, duplicate IDs and more than five images atomically',async()=>{
 const foreign=await upload('media-b'),audio=await upload('media-a','library',Buffer.concat([Buffer.from('RIFFxxxxWAVE'),Buffer.alloc(8)]),'sound.wav'),a=await upload()
 for(const ids of [[foreign.id],[audio.id],[a.id,a.id],Array(6).fill(a.id)])await assert.rejects(()=>prisma.$transaction(tx=>setProductImages(tx,productId,'media-a',ids)))
 assert.equal(await prisma.productImage.count({where:{productId}}),0)
 await assert.rejects(()=>products.updateProduct(productId,{image:foreign.url}))
})
test('screen configs canonicalize URLs, enforce type/store and hold deletion references',async()=>{
 const a=await upload(),foreign=await upload('media-b'),audio=await upload('media-a','library',Buffer.concat([Buffer.from('RIFFxxxxWAVE'),Buffer.alloc(8)]),'sound.wav')
 const config={dualScreen:{mediaFiles:[{mediaId:a.id,url:'https://wrong.example/file'}]}}
 await prisma.$transaction(tx=>saveMediaConfig(tx,'media-a','hardwareSettings',config,'pos'))
 assert.equal(config.dualScreen.mediaFiles[0].url,a.url)
 assert.equal((await request(app).delete(`/api/media/${a.id}`)).status,409)
 for(const media of [foreign,audio])await assert.rejects(()=>prisma.$transaction(tx=>saveMediaConfig(tx,'media-a','hardwareSettings',{dualScreen:{mediaFiles:[{mediaId:media.id,url:media.url}]}},'pos')))
 await prisma.$transaction(tx=>saveMediaConfig(tx,'media-a','tv_screen_marketing_config',{mediaFiles:[],idleMusic:{enabled:true,tracks:[{mediaId:audio.id,url:audio.url}]}},'marketing'))
 await assert.rejects(()=>prisma.$transaction(tx=>saveMediaConfig(tx,'media-a','tv_screen_marketing_config',{mediaFiles:[{mediaId:audio.id,url:audio.url}],idleMusic:{enabled:true,tracks:[{mediaId:audio.id,url:audio.url}]}},'marketing')))
 await prisma.$transaction(tx=>saveMediaConfig(tx,'media-a','hardwareSettings',{dualScreen:{mediaFiles:[]}},'pos'))
 assert.equal((await request(app).delete(`/api/media/${a.id}`)).status,200)
})
test('scene permissions allow product selection without granting library management',async()=>{
 const headers={'X-Test-Role':'manager','X-Test-Permissions':'["products.read","products.write"]'}
 assert.equal((await request(app).get('/api/media').query({scene:'product'}).set(headers)).status,200)
 assert.equal((await request(app).get('/api/media').query({scene:'library'}).set(headers)).status,403)
 assert.equal((await request(app).post('/api/media').query({scene:'product'}).set(headers).attach('files',png,'tea.png')).status,200)
 assert.equal((await request(app).delete('/api/media/unknown').query({scene:'product'}).set(headers)).status,403)
 assert.equal((await request(app).get('/api/media').query({scene:'invalid'})).status,400)
 assert.equal((await request(app).delete('/api/media/unknown').query({scene:'display'}).set('X-Test-Role','cashier')).status,403)
 assert.equal((await request(app).patch('/api/media/unknown').query({scene:'display'}).set('X-Test-Role','cashier').send({name:'wrong'})).status,403)
})
test('invalid and oversized uploads are rejected and pending files cleaned',async()=>{
 assert.equal((await request(app).post('/api/media').attach('files',Buffer.from('invalid png file'),'fake.png')).status,400)
 assert.equal((await request(app).post('/api/media').attach('files',Buffer.concat([png,Buffer.alloc(5*1024*1024)]),'large.png')).status,400)
 assert.equal((await request(app).post('/api/media').query({scene:'product'}).attach('files',Buffer.concat([Buffer.from('RIFFxxxxWAVE'),Buffer.alloc(8)]),'audio.wav')).status,400)
 assert.deepEqual(fs.readdirSync(mediaPath('.media-pending')),[])
})
test('legacy adoption uses explicit unique ownership and is repeatable',async()=>{
 fs.mkdirSync(mediaPath('products'),{recursive:true});fs.writeFileSync(mediaPath('products/legacy.png'),png)
 const p=await prisma.product.create({data:{storeId:'media-a',categoryId,code:'LEGACY-MEDIA',name:'Legacy',image:'/uploads/products/legacy.png'}})
 await adoptLegacyMedia('media-a');await adoptLegacyMedia('media-a')
 const loaded=await products.getProductById(p.id);assert.equal(loaded.images.length,1)
 const collision=await prisma.product.create({data:{storeId:'media-b',categoryId,code:'COLLISION-MEDIA',name:'Shared legacy',image:'/uploads/products/shared.png'}})
 await prisma.product.create({data:{storeId:'media-a',categoryId,code:'COLLISION-A',name:'Shared legacy',image:collision.image}})
 fs.writeFileSync(mediaPath('products/shared.png'),png)
 await adoptLegacyMedia('media-a');assert.equal(await prisma.mediaAsset.count({where:{storagePath:'products/shared.png'}}),0)
})

test('database-backed insights unify summary, lazy details, preferences and store filters',async()=>{
 const spec=await prisma.spec.create({data:{productId,name:'Medium',price:300,isDefault:true}})
 const second=await products.createProduct({storeId:'media-a',categoryId,name:'Second',code:'INSIGHTS-SECOND'})
 const secondSpec=await prisma.spec.create({data:{productId:second.id,name:'Large',price:400,isDefault:true}})
 const channel=await prisma.channel.create({data:{storeId:'media-a',name:'POS',code:'INSIGHTS-POS'}})
 for(let i=0;i<5;i++)await prisma.order.create({data:{storeId:'media-a',staffId:'test-staff',channelId:channel.id,orderNumber:'MEDIA-INSIGHTS-'+i,totalAmount:1000,discountAmount:100,finalAmount:990,checkoutTaxAmount:90,requestFingerprint:'v1:test',paymentMethod:'cash',status:'completed',items:{create:[{productId,specId:spec.id,productName:'Tea',specName:'Medium',quantity:2,unitPrice:300,bomCost:100,addons:'[{"name":"Pearl"}]'},{productId:second.id,specId:secondSpec.id,productName:'Second',specName:'Large',quantity:1,unitPrice:400,bomCost:200,addons:'[]'}]}}})
 const summary:any=await getInsights('media-a',{days:30})
 assert.equal(summary.overview.quantity,15);assert.equal(summary.overview.orderCount,5)
 assert.equal(summary.top.find((r:any)=>r.productId===productId).penetration,100)
 assert.equal(summary.pairs[0].orderCount,5);assert.equal(summary.channels[0].percentage,2/3*100)
 const detail:any=await getInsights('media-a',{days:30},{detail:true,search:'Tea'})
 assert.equal(detail.list.find((r:any)=>r.productId===productId).quantity,10)
 const prefs:any=await getInsights('media-a',{days:30},{productId})
 assert.equal(prefs.specs[0].percentage,100);assert.equal(prefs.addons[0].percentage,100)
 const foreign:any=await getInsights('media-b',{days:30})
 assert.equal(foreign.overview.quantity,0)
 await assert.rejects(()=>getInsights('media-b',{days:30},{productId}),/PRODUCT_NOT_FOUND/)
 const filtered:any=await getInsights('media-a',{days:30,channelId:'foreign-channel'})
 assert.equal(filtered.overview.quantity,0)
})

test('media, legacy product and customer-display uploads store one optimized image with matching metadata',async()=>{
 const image=await sharp({create:{width:1280,height:720,channels:4,background:'#ffaabb80'}}).png({compressionLevel:0}).toBuffer()
 for(const [endpoint,field,scene]of [['/api/media','files','product'],['/api/upload/product','images','product'],['/api/upload/dualScreen','files','display']]){
  const response=await request(app).post(endpoint).query({scene}).attach(field,image,'screen.png')
  assert.equal(response.status,200,JSON.stringify(response.body))
  const asset=response.body.data.list?.[0]||response.body.data.files[0]
  assert.equal(asset.mimeType,'image/webp');assert.ok(asset.url.endsWith('.webp'));assert.ok(asset.size<image.length)
  const stored=fs.readFileSync(mediaPath(asset.storagePath));assert.equal(asset.size,stored.length)
  const meta=await sharp(stored).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,720);assert.ok(meta.hasAlpha)
  assert.equal((await request(app).delete('/api/media/'+asset.id)).status,200)
 }
 assert.deepEqual(fs.readdirSync(mediaPath('.media-pending')),[])
})
test('a database failure cleans optimized files and pending originals',async()=>{
 const before=fs.readdirSync(mediaPath('media')).sort()
 const image=await sharp({create:{width:800,height:600,channels:4,background:'#abcdef'}}).png({compressionLevel:0}).toBuffer()
 const transaction=prisma.$transaction
 ;(prisma as any).$transaction=(fn:any)=>transaction.call(prisma,async(tx:any)=>{await fn(tx);throw Error('SYNTHETIC_COMMIT_FAILURE')})
 let response:any
 try{response=await request(app).post('/api/media').query({scene:'product'}).attach('files',image,'screen.png')}finally{prisma.$transaction=transaction}
 assert.equal(response.status,400);assert.deepEqual(fs.readdirSync(mediaPath('media')).sort(),before);assert.deepEqual(fs.readdirSync(mediaPath('.media-pending')),[])
})
