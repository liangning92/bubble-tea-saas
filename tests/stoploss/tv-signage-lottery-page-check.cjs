const {chromium}=require('@playwright/test'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('server/public/tv'),output=process.env.TV_LOTTERY_EVIDENCE||'/tmp/tv-lottery-evidence';fs.mkdirSync(output,{recursive:true});
let apiCalls=0;
const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/')){apiCalls++;res.writeHead(500);return res.end()}const file=path.join(root,req.url.split('?')[0].replace(/^\/tv\//,'')||'index.html');if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);let now=0;window.requestAnimationFrame=cb=>raf(()=>cb(now+=100));});
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/tv/?preview=1');
 const snapshot={screen:{isActive:true},settings:{orientation:'landscape',themeStyle:'international_dark',layoutTemplate:'menu_full',safeAreaPadding:1.5,showActivities:true,activityDisplayType:'all',musicEnabled:false,pageSeconds:12,marqueeText:'Welcome',marqueeSpeed:3},store:{name:'TV animation check',locale:'id',timezone:'Asia/Jakarta',currency:'IDR'},channel:{name:'Dine in'},menu:[],media:[],music:[],promotions:[],assets:[],version:'a'.repeat(64),serverTime:new Date().toISOString(),validUntil:new Date(Date.now()+60000).toISOString()};
 await page.evaluate(snapshot=>window.postMessage({type:'tv-preview',snapshot},location.origin),snapshot);
 const prizes=['ice cream original','tas','voucher','topping','Thanks','satu lagi','uang 2000','voucher Rp4.000'].map((name,i)=>({id:'p'+i,name,color:["#F8BFD0", "#F6D99B", "#BFE2CE", "#BFDDF1", "#D9C7EC", "#F5C7AF", "#C6DFDF","#F8BFD0"][i]}));
 const event={eventId:'preview-1',orderNumber:'DEMO',prizeName:'uang 2000',prizeId:'p6',prizeIndex:6,prizes,testMode:true};
 const start=()=>page.evaluate(event=>window.postMessage({type:'tv-lottery-preview',event},location.origin),event);
 await start();await page.waitForSelector('#lottery[data-phase="countdown"]');assert.equal(await page.locator('#lottery').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(3, 4, 6)');assert.equal(await page.locator('#lottery-prize').isVisible(),false);assert.deepEqual(await page.locator('#draw-board .draw-prize-card').evaluateAll(nodes=>nodes.map(n=>'#'+n.style.backgroundColor.match(/\d+/g).map(v=>Number(v).toString(16).padStart(2,'0')).join('').toUpperCase())),prizes.map(p=>p.color));await page.screenshot({path:path.join(output,'countdown-1920.png')});
 await page.waitForSelector('#lottery[data-phase="spinning"]');const seen=new Set();for(let i=0;i<4;i++){seen.add(await page.locator('#draw-board').getAttribute('data-active'));await page.waitForTimeout(50)}assert.ok(seen.size>1);assert.equal(await page.locator('.is-trail-1').count(),1);await page.screenshot({path:path.join(output,'spinning-1920.png')});
 await page.waitForSelector('#lottery[data-phase="result"]');assert.equal(await page.locator('#lottery-prize').innerText(),'uang 2000');assert.equal(await page.locator('#draw-board').getAttribute('data-active'),'6');await page.screenshot({path:path.join(output,'result-1920.png')});await page.waitForSelector('#lottery[hidden]',{state:'attached'});
 for(const [width,height] of [[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await start();await page.waitForSelector('#lottery[data-phase="result"]');const rect=await page.locator('#lottery-prize').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height);await page.screenshot({path:path.join(output,`result-${width}.png`)});await page.waitForSelector('#lottery[hidden]',{state:'attached'});
 }
 // Voucher reveal remains visible long enough to photograph and uses a demo-only code.
 await page.setViewportSize({width:1920,height:1080});event.prizeName='voucher';event.prizeId='p2';event.prizeIndex=2;event.coupon={code:'DEMO-NOT-REDEEMABLE',type:'discount_fixed',value:2000,minOrder:16000,validUntil:'9999-12-31T23:59:59.999Z'};
 await start();await page.waitForSelector('#lottery[data-phase="result"]');assert.equal(await page.locator('#draw-coupon-code').innerText(),'DEMO-NOT-REDEEMABLE');assert.match(await page.locator('#draw-coupon-terms').innerText(),/Tanpa kedaluwarsa/);await page.screenshot({path:path.join(output,'voucher-1920.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'voucher-390.png')});const card=await page.locator('#draw-coupon').boundingBox();assert.ok(card.x>=0&&card.x+card.width<=390&&card.y+card.height<=844);
 await page.evaluate(()=>window.TVLottery.cancel());delete event.coupon;
 // Unpairing / cancelling during a draw hides it without creating any acknowledgement.
 await start();await page.waitForSelector('#lottery:not([hidden])');await page.evaluate(()=>window.TVLottery.cancel());await page.waitForSelector('#lottery[hidden]',{state:'attached'});
 // Prize text is rendered as text even if an operator enters markup.
 event.prizeName='<img src=x onerror=alert(1)>';event.prizes=[{id:'x',name:event.prizeName}];event.prizeId='x';event.prizeIndex=0;
 await start();await page.waitForSelector('#lottery[data-phase="result"]');assert.equal(await page.locator('#lottery-prize img').count(),0);await page.waitForSelector('#lottery[hidden]',{state:'attached'});
 assert.equal(apiCalls,0,'Preview must not call order, grant, stock or acknowledgement APIs');assert.deepEqual(errors,[]);
 console.log('PASS countdown, moving prize lights, exact result, portrait/tablet/mobile layouts, cancellation, escaped text and no preview mutations');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
