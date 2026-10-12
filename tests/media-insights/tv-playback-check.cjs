const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch({headless:true})
 try {
 const context=await browser.newContext()
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const config={enabled:true,storeName:'Test TV',welcomeText:'Welcome',carouselIntervalSeconds:2,layout:{columns:[{width:60,content:'media'},{width:40,content:'specials'}]},mediaFiles:[{mediaId:'v1',url:'/uploads/media/test.mp4',kind:'video',title:'Video'},{mediaId:'i1',url:'/uploads/media/image.png',kind:'image',title:'Image'}],dailySpecials:[],lottery:{enabled:false,triggerMinOrderAmount:1,title:'',subtitle:'',prizes:[]},ticker:{enabled:false,text:''}}
 await page.route('**/api/**',route=>route.fulfill({json:{code:200,data:config}}))
 // Keep the video request pending: completion/error is dispatched deterministically.
 let pending
 await page.route('**/uploads/media/test.mp4',route=>new Promise(resolve=>{pending={route,resolve}}))
 await page.route('**/uploads/media/image.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64')}))
 await page.goto('http://127.0.0.1:5188/#/tv-display?storeId=test&displayToken=test')
 const video=page.locator('video');await video.waitFor()
 assert.equal(await video.evaluate(v=>v.muted),true)
 await page.waitForTimeout(2300);assert.equal(await video.count(),1,'video should not be interrupted by image rotation interval')
 await video.dispatchEvent('ended');await video.waitFor({state:'detached'})
 await page.locator('img[alt="Image"]').waitFor()
 await video.waitFor();await video.dispatchEvent('error');await video.waitFor({state:'detached'})
 assert.deepEqual(errors,[])
 if(pending){await pending.route.abort();pending.resolve()}
 console.log('TV playback passed: muted video, no timer interruption, end advances, image interval resumes, error advances.')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)})
