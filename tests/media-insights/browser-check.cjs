const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const base='http://127.0.0.1:5187'
const picture={mediaId:'m1',url:'/uploads/media/tea.png',position:0}
const product={id:'p1',name:'Brown Sugar Pearl Tea',code:'TEA-001',categoryId:'c1',category:{id:'c1',name:'Milk Tea'},status:'active',costPrice:5000,image:picture.url,images:[picture,{mediaId:'m2',url:'/uploads/media/tea2.png',position:1}],specs:[{id:'s1',name:'Medium',price:16000,isDefault:true},{id:'s2',name:'Large',price:19000}],bomItemCount:2,bomCost:5000,sellingPrice:16000,profitRate:69,channelPrices:[],addons:[],bomItems:[]}
const assets=[{id:'m1',name:'Tea image',kind:'image',mimeType:'image/png',size:1024,url:picture.url},{id:'m2',name:'Tea image 2',kind:'image',mimeType:'image/png',size:1024,url:'/uploads/media/tea2.png'},{id:'m3',name:'Store music',kind:'audio',mimeType:'audio/mpeg',size:2000,url:'/uploads/media/music.mp3'},{id:'m4',name:'Store video',kind:'video',mimeType:'video/mp4',size:4000,url:'/uploads/media/store.mp4'}]
const row={productId:'p1',productName:product.name,categoryId:'c1',category:'Milk Tea',quantity:24,revenue:360000,cost:120000,orderCount:16,penetration:80,margin:66.67,matrixType:'star',previousQuantity:12,change:100,evidence:true,costKnown:true}
const insight={overview:{productsSold:1,quantity:24,unsold:1,incomplete:0,orderCount:20},period:{timeZone:'Asia/Jakarta'},categories:[{id:'c1',name:'Milk Tea',quantity:24,revenue:360000}],top:[row],revenueTop:[row],matrix:[row],benchmarks:{avgQuantity:24,avgMargin:66.67},strategies:['star','plowhorse','puzzle','dog'].map(type=>({type,count:7,products:Array.from({length:5},(_,i)=>({...row,productId:type+'-'+i,productName:type+' '+(i+1),matrixType:type}))})),changes:[row],channels:[{channelId:'ch1',channel:'POS',productId:'p1',productName:product.name,quantity:24}],pairs:[],products:[{id:'p1',name:product.name}]}
let uploadMode='success',pendingUpload=null,uploadRequests=0
let detailsRequests=0,postedProduct=null,postedHardware=null
let hardwareConfig={dualScreen:{enabled:true,mediaFiles:[],idleLayout:{columns:[{width:100,content:'media'}]},orderingLayout:{columns:[{width:100,content:'order'}]},carouselIntervalSeconds:6}}
;(async()=>{
 const browser=await chromium.launch({headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 await context.addInitScript(()=>{sessionStorage.setItem('auth-storage',JSON.stringify({state:{token:'test',user:{id:'u1',phone:'000',role:'admin',storeId:'s1',staff:null},isAuthenticated:true},version:0}));if(!localStorage.getItem('bubble-tea-language'))localStorage.setItem('bubble-tea-language','zh')})
 const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),pathname=u.pathname
   let data={}
   if(pathname==='/api/media'&&req.method()==='POST'){uploadRequests++;assert.match(req.headers()['content-type'],/multipart\/form-data; boundary=/);if(uploadMode==='hang'){pendingUpload=route;return}if(uploadMode==='fail'){await route.fulfill({status:500,json:{code:500,message:'MEDIA_UPLOAD_FAILED'}});return}data={list:[assets[0]]}}
   else if(pathname==='/api/media')data={list:assets.filter(a=>u.searchParams.get('scene')==='library'||(u.searchParams.get('scene')==='product'||u.searchParams.get('kind')==='image'?a.kind==='image':a.kind!=='audio')),total:u.searchParams.get('scene')==='library'?3:2,page:1,pageSize:24}
   else if(pathname==='/api/categories')data=[{id:'c1',name:'Milk Tea',code:'TEA'}]
   else if(pathname==='/api/channels')data={list:[{id:'ch1',name:'POS'}]}
   else if(pathname==='/api/products'&&req.method()==='POST'){postedProduct=req.postDataJSON();data={...product,...postedProduct}}
   else if(pathname==='/api/products')data={list:[product]}
   else if(pathname==='/api/products/p1')data=product
   else if(pathname==='/api/bom/products')data={list:[{...product,category:'Milk Tea'}]}
   else if(pathname==='/api/bom/products/p1')data={...product,category:'Milk Tea',totalBomCost:5000,bomDetails:[{inventoryId:'i1',name:'Tea',unit:'g',quantity:10,costPerUnit:500,totalCost:5000,inventoryType:'raw_material'}]}
   else if(pathname==='/api/product-analysis/insights')data=insight
   else if(pathname==='/api/product-analysis/insights/details'){detailsRequests++;data={list:[row],total:1,page:1}}
   else if(pathname.startsWith('/api/product-analysis/insights/preferences'))data={total:24,specs:[{id:'s1',name:'Medium',quantity:24,percentage:100}],addons:[{name:'Pearl',quantity:12,percentage:50}]}
   else if(pathname==='/api/inventory/alert-config')data={enableLowStockAlert:true,lowStockWarningDays:7,lowStockCriticalDays:3,autoCheckIntervalHours:24}
   else if(pathname.includes('/materials/low-stock-alert'))data=[]
   else if(pathname.includes('/materials/usage'))data=[{inventoryId:'i1',name:'Milk',unit:'ml',currentStock:100,dailyUsage:0,daysUntilStockOut:null,suggestedReorderQty:null}]
   else if(pathname==='/api/config'&&req.method()==='POST'){const body=req.postDataJSON();if(body.key==='hardwareSettings'){postedHardware=body.value;hardwareConfig=body.value}data={}}
   else if(pathname==='/api/config')data={hardwareSettings:hardwareConfig}
   else if(pathname==='/api/receipt-templates')data=[]
   else if(pathname==='/api/marketing/tv-screen/config')data={enabled:true,storeName:'YOUME',welcomeText:'Welcome',carouselIntervalSeconds:6,layout:{columns:[{width:60,content:'media'},{width:40,content:'specials'}]},mediaFiles:[],dailySpecials:[],lottery:{enabled:false,triggerMinOrderAmount:50000,title:'Lucky',subtitle:'',prizes:[]},ticker:{enabled:false,text:''}}
   else if(pathname==='/api/marketing/activities/resources')data={products:[],channels:[],members:[],coupons:[],rewards:[]}
   else if(pathname.includes('list')||pathname.includes('addons'))data={list:[]}
   await route.fulfill({json:{code:200,data}})
 })
 await page.route('**/uploads/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64')}))
 await page.goto(base+'/marketing/media');await page.getByRole('heading',{name:'媒体库',exact:true}).waitFor();await page.getByText('Tea image',{exact:true}).waitFor();assert.equal(await page.locator('audio').count(),1)
 await page.screenshot({path:'/tmp/media-library-page.png',fullPage:true})
 await page.goto(base+'/products/analysis');await page.getByRole('heading',{name:'产品分析',exact:true}).waitFor();await page.getByText('四象限分析',{exact:true}).waitFor();assert.equal(detailsRequests,0)
 assert.equal(await page.getByLabel('全部渠道').count(),0)
 assert.equal(await page.getByText('渠道产品偏好',{exact:true}).count(),0)
 for(const label of ['高销高利','高销低利','低销高利','低销低利'])assert.equal(await page.getByRole('region',{name:label,exact:true}).count(),1)
 assert.equal(await page.getByRole('region',{name:'高销高利',exact:true}).locator('li').count(),5)
 await page.locator('summary').click();await page.getByRole('columnheader',{name:'订单渗透率',exact:true}).waitFor();await page.locator('tbody tr').first().waitFor();assert.equal(detailsRequests,1)
 await page.getByLabel('选择产品').selectOption('p1');await page.getByText('Pearl',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/product-insights-page.png',fullPage:true})
 await page.goto(base+'/products/recipes?productId=p1');await page.getByRole('heading',{name:'产品详情',exact:true}).waitFor();await page.getByRole('img',{name:product.name,exact:true}).waitFor();await page.getByLabel('规格销量占比').selectOption('s2');await page.getByText('Rp 19.000',{exact:true}).waitFor();assert.equal(await page.getByText('原料预测',{exact:true}).count(),0)
 await page.screenshot({path:'/tmp/product-detail-page.png',fullPage:true})
 await page.goto(base+'/products');await page.getByRole('button',{name:'添加产品',exact:true}).click();await page.getByRole('button',{name:'从媒体库选择',exact:true}).click();await page.getByRole('dialog',{name:'媒体库'}).waitFor();assert.equal(await page.locator('audio').count(),0);await page.getByRole('button',{name:'选择',exact:true}).first().click();await page.getByRole('button',{name:'使用所选素材（1）',exact:true}).click();await page.getByText('主图',{exact:true}).waitFor()
 // Cancel leaves uploaded/library files untouched, then reopening starts a fresh form.
 await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'添加产品',exact:true}).click();assert.equal(await page.getByText('主图',{exact:true}).count(),0)
 // A stalled upload must leave loading state, then allow a successful retry.
 const imageInput=page.locator('form input[type="file"]').first()
 const pngFile={name:'tea.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64')}
 uploadMode='hang';await imageInput.setInputFiles(pngFile)
 await page.getByRole('alert').filter({hasText:'上传超时'}).waitFor({timeout:35000})
 assert.equal(await imageInput.isDisabled(),false)
 if(pendingUpload)await pendingUpload.abort().catch(()=>{})
 uploadMode='fail';await imageInput.setInputFiles(pngFile)
 await page.getByRole('alert').filter({hasText:'操作失败'}).waitFor()
 assert.equal(await imageInput.isDisabled(),false)
 const count=uploadRequests
 await imageInput.setInputFiles({...pngFile,buffer:Buffer.alloc(5*1024*1024+1)})
 await page.getByRole('alert').filter({hasText:'图片不能超过'}).waitFor();assert.equal(uploadRequests,count)
 uploadMode='success';await imageInput.setInputFiles(pngFile)
 await page.getByText('主图',{exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0)
 await page.locator('form input[type="text"]').first().fill('New tea')
 await page.locator('form select').first().selectOption('c1')
 await page.getByRole('button',{name:'从媒体库选择',exact:true}).click()
 await page.getByRole('button',{name:'选择',exact:true}).first().click()
 await page.getByRole('button',{name:'使用所选素材（1）',exact:true}).click()
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await page.waitForFunction(()=>!document.querySelector('form'))
 assert.deepEqual(postedProduct.mediaIds,['m1'])
 await page.goto(base+'/settings/tv-screen')
 await page.getByRole('button',{name:'从媒体库选择',exact:true}).click()
 const picker=page.getByRole('dialog',{name:'媒体库'})
 await picker.getByText('Store video',{exact:true}).waitFor()
 assert.equal(await picker.locator('audio').count(),0)
 await picker.getByRole('button',{name:'选择',exact:true}).last().click()
 await picker.getByRole('button',{name:'使用所选素材（1）',exact:true}).click()
 assert.equal(await page.locator('video').count(),1)
 await page.goto(base+'/settings/pos')
 await page.getByRole('button',{name:'显示',exact:true}).click()
 await page.getByText('共用素材库',{exact:true}).click()
 await page.getByRole('button',{name:'从媒体库选择',exact:true}).click()
 const displayPicker=page.getByRole('dialog',{name:'媒体库'})
 await displayPicker.getByText('Store video',{exact:true}).waitFor()
 assert.equal(await displayPicker.locator('audio').count(),0)
 await displayPicker.getByRole('button',{name:'选择',exact:true}).last().click()
 await displayPicker.getByRole('button',{name:'使用所选素材（1）',exact:true}).click()
 await page.waitForTimeout(200)
 assert.equal(postedHardware.dualScreen.mediaFiles[0].mediaId,'m4')
 assert.equal(postedHardware.dualScreen.mediaFiles[0].isVideo,true)
 for(const lang of ['en','id']){
  await page.evaluate(lang=>localStorage.setItem('bubble-tea-language',lang),lang)
  await page.goto(base+'/products/analysis');await page.getByRole('heading',{name:lang==='en'?'Product analysis':'Analisis produk',exact:true}).waitFor();await page.locator('summary').waitFor();const text=await page.locator('body').innerText();assert.ok(!/insights\.|media\./.test(text),lang+' missing translation')
 }
 assert.deepEqual(errors,[]);console.log('Browser checks passed: library, analysis, lazy details, preferences, product gallery, quick-add picker, cancel, TV/customer display, EN/ID translations.')
 await browser.close()
})().catch(e=>{console.error(e);process.exit(1)})
