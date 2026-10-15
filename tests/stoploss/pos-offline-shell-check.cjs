// Real Chromium service worker against the production bundle, with the web server stopped.
const {chromium,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('client-pos/dist'),out=path.resolve('../output/pos-offline-20261015');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,name==='/'?'index.html':name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
  const ext=path.extname(file),type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream';
  res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  let offline=false,uploads=0,receiptNumber='';
  await context.addInitScript(()=>{localStorage.setItem('pos_lang','en');localStorage.setItem('pos_language','en');window.prints=0;window.electronAPI={getAppVersion:async()=> 'synthetic',onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},sendPrintReceipt:async()=>{window.prints++;return {success:true}},sendKitchenOrder:async()=>{},sendCupStickers:async()=>{},sendOrderComplete:()=>{}}});
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
    if(offline)return route.abort('internetdisconnected');const url=new URL(route.request().url());let data={},status=200;
    if(url.pathname==='/api/auth/login')data={token:'synthetic-session-only',user:{id:'u',phone:'synthetic',role:'cashier',storeId:'store',staff:{id:'staff',name:'Synthetic'}}};
    if(url.pathname==='/api/sync/status')return route.fulfill({json:{isSetUp:true,data:{isSetUp:true}}});
    if(url.pathname==='/api/staff-permissions/me')data={role:{version:2,modes:{'orders.create':'allow','orders.read':'allow','pos.cash':'allow'}}};
    if(url.pathname==='/api/products')data={list:[{id:'p',storeId:'store',name:'Synthetic Tea',status:'active',category:{id:'tea',name:'Tea'},specs:[{id:'s',name:'Regular',price:10000}],addons:[]}]};
    if(url.pathname==='/api/config')data={paymentMethods:{cash:true,qris:true,defaultMethod:'cash'},taxSettings:{enabled:false},posReceipt:{autoPrint:true},hardwareSettings:{autoOpenCashDrawer:false,printers:[{type:'receipt',enabled:true,printerName:'Synthetic receipt'}]}};
    if(url.pathname==='/api/shifts')data=[{key:'custom-day',name:'Custom day'}];
    if(url.pathname==='/api/channels'||url.pathname==='/api/marketing/activities'||url.pathname==='/api/marketing/activity-prices')data=[];
    if(url.pathname==='/api/pos-cash/shifts/current')data={hasOpenShift:true,shift:{id:'session',shift:'custom-day',openFloat:0,openedAt:new Date(Date.now()-60000).toISOString()},cashReconciliation:{revenue:0,expenses:0,qris:0,cashFromRevenue:0,openFloat:0,expectedCash:0},includedOrderNumbers:[],includedOfflineOperationIds:[]};
    if(url.pathname==='/api/orders/received-receipts'){const body=route.request().postDataJSON();receiptNumber=body.orderNumber;status=201;data={id:'synthetic-journal',orderNumber:receiptNumber}};
    if(url.pathname==='/api/orders/bulk-sync'){const body=route.request().postDataJSON();assert.equal(body.orders[0].orderNumber,receiptNumber);uploads++;data={results:[{success:true,data:{id:'synthetic-order',orderNumber:receiptNumber,grandTotal:10000}}]}};
    await route.fulfill({status,json:{data}});
  });
  await require('./empty-activity-browser-fixture.cjs').emptyActivityQuotes(context,{isOffline:()=>offline});
  await page.goto(origin+'/#/login');await page.locator('input[type=tel]').waitFor();
  await page.locator('input[type=tel]').fill('synthetic');await page.locator('input[type=password]').fill('synthetic-password');await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByText('Synthetic Tea',{exact:true}).first().waitFor();
  await expect.poll(()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('POSOffline');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('config');const get=tx.objectStore('config').getAll();get.onsuccess=()=>{resolve(get.result.filter(r=>r.key.startsWith('offline.snapshot:')).length);db.close()};get.onerror=reject}}))).toBe(9);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/pos-sw.js');await navigator.serviceWorker.ready});
  await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  const caches=await page.evaluate(async()=>{const names=await window.caches.keys();const cache=await window.caches.open(names.find(n=>n.startsWith('youme-pos-shell-')));return (await cache.keys()).map(r=>new URL(r.url).pathname)});
  assert(caches.includes('/index.html'));assert(caches.some(p=>p.includes('POSPage')));assert(caches.some(p=>p.includes('LoginPage')));assert(!caches.some(p=>p.startsWith('/api/')));
  await new Promise(resolve=>server.close(resolve));offline=true;await context.setOffline(true);
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
   await page.setViewportSize({width,height});await page.reload();await page.getByText('Synthetic Tea',{exact:true}).first().waitFor({state:'attached'});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.screenshot({path:path.join(out,'shell-offline-'+name+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();
  await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
  await page.getByRole('button',{name:/^Synthetic Tea/}).click();await page.getByRole('button',{name:/Add to Cart/}).click();await page.getByRole('button',{name:/Checkout/}).click();await page.getByRole('button',{name:/Exact/}).click();await page.getByRole('button',{name:/Confirm Payment/}).click();
  await expect.poll(()=>page.evaluate(()=>window.prints)).toBe(1);assert.equal(uploads,0);
  await page.screenshot({path:path.join(out,'no-wifi-cash-sale.png'),fullPage:true});
  offline=false;await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>uploads).toBe(1);assert.equal(await page.evaluate(()=>window.prints),1);
  console.log('PASS no Wi-Fi + stopped Web server: cached POS cash sale saved and printed locally, one automatic upload on reconnect, no recovery reprint');
  assert.deepEqual(errors,[]);console.log('PASS production app opens after server shutdown; lazy chunks cached, API excluded; desktop/tablet/phone no horizontal overflow');
 }finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
