import {test,expect} from '@jest/globals'
import {saveActivityInTransaction,listActivities} from '../src/services/ActivityService'
import {posterVisionMessages,publicProductPosterUrls} from '../src/services/ActivityPosterPreviewService'
function fixture(){
 const rows:any[]=[],p={id:'p',storeId:'store',status:'active',name:'Brown Sugar Pearl Sundae',image:'/uploads/p.webp',specs:[{id:'spec',name:'Regular',price:16000,isDefault:true}],images:[]}
 const match=(r:any,w:any)=>Object.entries(w||{}).every(([k,v]:any)=>v&&typeof v==='object'?v.startsWith?r[k]?.startsWith(v.startsWith):true:r[k]===v)
 const db:any={config:{findMany:async({where}:any)=>rows.filter(r=>match(r,where)),findUnique:async({where}:any)=>rows.find(r=>match(r,where.storeId_key)),create:async({data}:any)=>{if(rows.some(r=>r.key===data.key))throw Error('DUPLICATE');rows.push({id:String(rows.length),...data});return data},upsert:async({where,create,update}:any)=>{const r=rows.find(r=>match(r,where.storeId_key));if(r){Object.assign(r,update);return r}const n={id:String(rows.length),...create};rows.push(n);return n},updateMany:async({where,data}:any)=>{const r=rows.filter(r=>match(r,where));r.forEach(r=>Object.assign(r,data));return {count:r.length}}},
 store:{update:async()=>({id:'store'})},product:{findFirst:async({where}:any)=>where.id==='p'&&where.storeId==='store'?p:null,count:async()=>1},
 spec:{count:async()=>1,findFirst:async()=>({...p.specs[0],productId:'p'})},member:{findFirst:async({where}:any)=>where.id==='active'?{id:'active',status:'active',storeId:'store',level:'bronze',points:0}:where.id==='pending'?{id:'pending',status:'pending',storeId:'store',points:0}:null},
 channel:{findFirst:async()=>null},order:{findFirst:async()=>null},productChannelPrice:{findFirst:async()=>null}}
 return {db,rows,p}
}
const draft={name:'Promo Harian',type:'special_price',status:'draft',productIds:['p'],weekdays:[1,2,3,4,5],memberOnly:true,rule:{price:12000}}
test('the native activity service saves all weekdays in one draft and updates with its own version',async()=>{
 const f=fixture(),a=await saveActivityInTransaction(f.db,'store',draft)
 expect(a.status).toBe('draft');expect(a.memberOnly).toBe(true);expect(a.weekdays).toEqual([1,2,3,4,5]);expect(await listActivities('store',f.db)).toHaveLength(1)
 const updated=await saveActivityInTransaction(f.db,'store',{...draft,description:'Harga khusus member'},a.id,a.version)
 expect(updated.id).toBe(a.id);expect(updated.version).toBe(a.version+1)
 await expect(saveActivityInTransaction(f.db,'store',draft,a.id,a.version)).rejects.toThrow('ACTIVITY_VERSION_CHANGED')
 expect(await listActivities('store',f.db)).toHaveLength(1)
})
test('native save validates requested product scope and does not invent missing rules',async()=>{
 const f=fixture();await expect(saveActivityInTransaction(f.db,'store',{...draft,rule:{}})).rejects.toThrow()
 f.db.product.count=async()=>0;await expect(saveActivityInTransaction(f.db,'store',draft)).rejects.toThrow()
 expect(f.rows).toHaveLength(0)
})
test('the native poster vision payload contains real image parts and linked private paths are rejected',()=>{
 const value={ok:true,poster:{activityId:'a',displayImage:{dataUrl:'data:image/jpeg;base64,AA==',sha256:'hash'}}}
 const r=posterVisionMessages([{role:'tool',tool_call_id:'x',content:JSON.stringify(value)}]);expect(r).toHaveLength(2);expect(r[0].content).not.toContain('base64');expect(r[1].content[1].type).toBe('image_url');expect(posterVisionMessages(r)).toEqual(r)
 expect(publicProductPosterUrls({imageUrl:'/uploads/p.webp'},{image:'/uploads/p.webp',images:[]})).toEqual(['/uploads/p.webp'])
 expect(()=>publicProductPosterUrls({imageUrl:'/uploads/other.webp'},{image:'/uploads/p.webp',images:[]})).toThrow('POSTER_LOCAL_LINKED_IMAGE_REQUIRED')
})
