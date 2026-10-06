// Actual POS React/IndexedDB; only API/device boundaries are synthetic. No physical output.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')];
 const server=await createServer({configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-printer-vite-cache',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:6199,strictPort:true,proxy:{}},resolve:{alias:{'@':path.resolve('client-pos/src')}}});let browser;
 try{await server.listen();browser=await chromium.launch({headless:true});fs.mkdirSync('/tmp/pos-printer-page-evidence',{recursive:true});
 for(const scenario of ['enabled','disabled','empty','unconfigured','offline-device','rejected-device','timeout','network','offline-order']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});let posts=0;const errors=[];
  const receipt={type:'receipt',enabled:true,printerName:'Synthetic Receipt'};
  const hw={autoOpenCashDrawer:false,printerName:'Stale Legacy',printers:[{...receipt,enabled:false,printerName:'Disabled'},receipt,{type:'label',enabled:false,printerName:'Wrong Label'}]};
  if(scenario==='disabled')hw.printers.forEach(p=>p.enabled=false);
  if(scenario==='empty')hw.printers=[];
  if(scenario==='unconfigured'){hw.printers=[];delete hw.printerName;}
  if(scenario==='network')hw.printers=[{...receipt,connectionType:'network',printerIp:'127.0.0.1',printerPort:9101}];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!=='http://127.0.0.1:6199')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();let data={};
   if(url.pathname==='/api/products')data={list:[{id:'synthetic-tea',name:'Synthetic Tea',category:{id:'tea',name:'Tea'},specs:[{id:'regular',name:'Regular',price:10000}],addons:[]}]};
   if(url.pathname==='/api/config')data={paymentMethods:{cash:true,defaultMethod:'cash'},hardwareSettings:hw,toolbarSettings:{showHardware:true}};
   if(url.pathname==='/api/shifts')data=[{key:'morning',name:'Morning'}];
   if(url.pathname==='/api/channels'||url.pathname.includes('discount-rules'))data=[];
   if(url.pathname==='/api/pos-cash/shifts/current')data={hasOpenShift:false};
   if(url.pathname==='/api/orders'&&req.method()==='POST'){posts++;if(scenario==='offline-order')return route.abort('internetdisconnected');data={id:'synthetic-order',orderNumber:'PAID-SYNTHETIC',pickupNumber:'A001',grandTotal:10000};}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await context.addInitScript(({hw,scenario})=>{
   localStorage.setItem('hardware_settings',JSON.stringify({...hw,printers:[{type:'receipt',enabled:true,printerName:'Stale Cached'}]}));localStorage.setItem('receipt_printer_name','Stale Cached');
   localStorage.setItem('pos-api-url','http://127.0.0.1:6199/api');localStorage.setItem('pos_lang','en');localStorage.setItem('pos_language','en');
   sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'synthetic',role:'cashier',storeId:'synthetic-store',staff:{id:'synthetic-staff',name:'Synthetic'}}},version:0}));
   window.printCalls=[];window.completions=[];window.electronAPI={onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},listPrinters:async()=>{window.detectedCount=(window.detectedCount||0)+1;return {printers:['Wrong Label']};},sendOrderComplete:x=>window.completions.push(x),sendPrintReceipt:async data=>{window.printCalls.push(data);if(scenario==='timeout')return new Promise(()=>{});if(scenario==='rejected-device')throw new Error('Synthetic bridge rejection');return {success:scenario!=='offline-device'&&scenario!=='network',error:'Synthetic device offline'};},sendKitchenOrder:async()=>{throw Error('Unexpected kitchen');},sendCupStickers:async()=>{throw Error('Unexpected label');}};
  },{hw,scenario});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto('http://127.0.0.1:6199/#/pos');await page.getByText('Synthetic Tea',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hardware_settings')).printers.map(p=>p.printerName).join(','))).toBe(hw.printers.map(p=>p.printerName).join(','));
  await page.getByRole('button',{name:/Synthetic Tea/}).click();await page.getByRole('button',{name:/Add to Cart/}).click();await page.getByRole('button',{name:/Checkout/}).click();await page.getByRole('button',{name:/Exact/}).click();const pay=page.getByRole('button',{name:/Confirm Payment/});await pay.evaluate(b=>{b.click();b.click();});
  await expect.poll(()=>page.evaluate(()=>window.completions.length),{timeout:10000}).toBe(1);await pay.waitFor({state:'hidden'});await page.getByText('Cart is empty',{exact:true}).waitFor();assert.equal(posts,1);
  const calls=await page.evaluate(()=>window.printCalls);const blocked=['disabled','empty','unconfigured'].includes(scenario);assert.equal(calls.length,blocked?0:1);
  if(!blocked){if(scenario==='network'){assert.equal(calls[0].printerName,undefined);assert.equal(calls[0].printerHost,'127.0.0.1');}else assert.equal(calls[0].printerName,'Synthetic Receipt');}
  const rows=await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');return db.orders.toArray();});assert.equal(rows.length,scenario==='offline-order'?1:0);if(rows.length)assert.equal(rows[0].status,'pending');
  if(blocked)await page.getByText(/Configure an enabled printer for this purpose/).first().waitFor();
  if(['offline-device','rejected-device','timeout','network'].includes(scenario))await page.getByText(/Printing failed or is unconfirmed/).first().waitFor();
  if(scenario==='enabled'){
   await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
   await page.getByRole('button',{name:'Hardware',exact:true}).click();
   await page.getByRole('button',{name:'Test Receipt',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.printCalls.length)).toBe(2);
   assert.equal(posts,1);assert.equal(await page.evaluate(()=>window.completions.length),1);
   const beforeDetect=await page.evaluate(()=>window.detectedCount||0);
   await page.getByRole('button',{name:'Sync Local Printers to Admin',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>window.printCalls.length)).toBe(2);
   await expect.poll(()=>page.evaluate(()=>window.detectedCount||0)).toBeGreaterThan(beforeDetect);
   await page.waitForTimeout(100);
   await page.getByRole('button',{name:'Test Receipt',exact:true}).click();
   await page.getByText(/Configure an enabled printer for this purpose/).first().waitFor();assert.equal(await page.evaluate(()=>window.printCalls.length),2);assert.equal(posts,1);
  }
  assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/pos-printer-page-evidence/'+scenario+'.png'});console.log('PASS actual POS printer '+scenario+': one order request, correct/zero bridge target, paid/pending state retained, no page errors');await context.close();
 }
 }finally{if(browser)await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
