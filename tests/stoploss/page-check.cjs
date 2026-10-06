const {chromium,expect}=require('@playwright/test');
const evidenceDir=process.env.POS_EVIDENCE_DIR || '/tmp/pos-config-page-evidence';
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default; tw.content=[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')];
 const server=await createServer({css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-stoploss-vite-cache',server:{host:'127.0.0.1',port:6197,strictPort:true,proxy:{}},resolve:{alias:{'@':path.resolve('client-pos/src')}}});
 let browser;
 try {
  await server.listen(); browser=await chromium.launch({headless:true});
  fs.mkdirSync(evidenceDir,{recursive:true});
  for (const scenario of (process.env.POS_SCENARIOS || 'success,refused,rejected,config,shifts').split(',')) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  let posts=0,configReads=0,configStatus=200; const blocked=[],shiftPosts=[];
  let paymentConfig=scenario==='config'?{cash:true,qris:false,defaultMethod:'qris'}:{cash:true,qris:true,defaultMethod:'cash'};
  let shiftOptions=[{key:'off',name:'Rest'},{key:'morning',name:'Morning'},{key:'evening',name:'Evening'}];
  let currentShift={hasOpenShift:false};
  await context.route('**/*',async route=>{
   const req=route.request(), url=new URL(req.url());
   if(url.origin!=='http://127.0.0.1:6197'){blocked.push(url.origin);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   let data={};let status=200;
   if(url.pathname==='/api/products')data={list:[{id:'synthetic-tea',name:'Synthetic Tea',category:{id:'tea',name:'Tea'},specs:[{id:'regular',name:'Regular',price:10000}],addons:[]}]};
   if(url.pathname==='/api/config'){configReads++;status=configStatus;data={paymentMethods:paymentConfig};}
   if(url.pathname==='/api/shifts')data=shiftOptions;
   if(url.pathname==='/api/pos-cash/shifts/current')data=currentShift;
   if(url.pathname==='/api/pos-cash/shifts/open'&&req.method()==='POST'){shiftPosts.push(req.postDataJSON());status=201;data={};}
   if(url.pathname==='/api/channels')data=[];
   if(url.pathname.includes('discount-rules'))data=[];
   if(url.pathname==='/api/orders' && req.method()==='POST'){posts++;await new Promise(r=>setTimeout(r,200));if(scenario==='rejected')status=409;else return route.abort('internetdisconnected');}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,message:status===409?'PAYMENT_METHOD_DISABLED':undefined})});
  });
  await context.addInitScript(({refused})=>{
   window.rejectOrderWrite=refused;window.orderWriteAttempts=0;
   const add=IDBObjectStore.prototype.add;
   IDBObjectStore.prototype.add=function(...args){
    if(this.name==='orders' && this.transaction.db.name==='POSOffline'){window.orderWriteAttempts++;if(window.rejectOrderWrite)throw new DOMException('Synthetic quota refusal','QuotaExceededError');}
    return add.apply(this,args);
   };
   localStorage.setItem('pos-api-url','http://127.0.0.1:6197/api');localStorage.setItem('pos_language','en');localStorage.setItem('pos_lang','en');
   localStorage.setItem('hardware_settings',JSON.stringify({autoOpenCashDrawer:false,printers:['receipt','kitchen','label'].map(type=>({type,enabled:true,printerName:'Synthetic '+type}))}));
   sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'synthetic',storeId:'synthetic-store',role:'cashier',staff:{id:'synthetic-staff',name:'Synthetic Cashier'}}},version:0}));
   window.fixtureCalls=[];
   window.electronAPI={onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},sendPrintReceipt:async()=>{window.fixtureCalls.push('receipt');return {success:true};},sendKitchenOrder:async()=>{window.fixtureCalls.push('kitchen');return {success:true};},sendCupStickers:async()=>{window.fixtureCalls.push('cups');return {success:true};},sendOrderComplete:()=>window.fixtureCalls.push('complete')};
  },{refused:scenario==='refused'});
  const errors=[];const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:6197/#/pos');
  await page.getByText('Synthetic Tea',{exact:true}).first().waitFor({timeout:25000});
  await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
  if(scenario==='shifts') {
   const open=()=>page.getByRole('button',{name:'Shift',exact:true}).click();
   const close=()=>page.getByRole('heading',{name:'Open Shift',exact:true}).locator('..').getByRole('button').click();
   const confirm=page.getByRole('button',{name:'Confirm Open Shift',exact:true});
   shiftOptions=[{key:'off',name:'Rest'},{key:'morning',name:'Morning'}];
   await open();await page.getByRole('button',{name:'Morning',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Rest',exact:true}).count(),0);
   await confirm.click();await expect.poll(()=>shiftPosts.length).toBe(1);assert.equal(shiftPosts[0].shift,'morning');await close();
   shiftOptions=[{key:'off',name:'Rest'}];await open();await expect(confirm).toBeDisabled();
   await page.getByText('No active shift is selected. Reload shift configuration.',{exact:true}).waitFor();await close();
   shiftOptions=[{key:'custom',name:'Custom Shift'}];await open();await page.getByRole('button',{name:'Custom Shift',exact:true}).waitFor();
   await confirm.click();await expect.poll(()=>shiftPosts.length).toBe(2);assert.equal(shiftPosts[1].shift,'custom');await close();
   shiftOptions=[];currentShift={hasOpenShift:true,shift:{shift:'off',openedAt:new Date().toISOString()},expectedCash:0};await open();
   await page.getByRole('heading',{name:'Shift Change',exact:true}).waitFor();await page.getByText('off',{exact:true}).waitFor();
   await page.screenshot({path:path.join(evidenceDir,'historical-off-session.png')});
   assert.deepEqual(errors,[]);assert.equal(posts,0);assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);
   console.log('PASS actual POS shifts: [off,morning] defaults morning; all-off blocks; custom submitted; historical off still displayed.');await context.close();continue;
  }
  await page.getByRole('button',{name:/Synthetic Tea/}).click();
  await page.getByRole('button',{name:/Add to Cart/}).click();
  await page.getByRole('button',{name:/Checkout/}).click();
  await page.getByRole('button',{name:/Exact/}).click();
  const pay=page.getByRole('button',{name:/Confirm Payment/});
  const before=await page.evaluate(async()=>{
   const {useOrderStore}=await import('/src/stores/orderStore.ts');
   return {paid:useOrderStore.getState().paidAmount,method:useOrderStore.getState().paymentMethod};
  });
  assert.ok(Number(before.paid)>0);
  if(scenario==='config') {
   const method=()=>page.evaluate(async()=>{const {useOrderStore}=await import('/src/stores/orderStore.ts');return useOrderStore.getState().paymentMethod;});
   const refresh=async()=>{const seen=configReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>configReads).toBeGreaterThan(seen);};
   assert.equal(await method(),'cash'); // disabled QRIS default never selected
   paymentConfig={cash:true,qris:true,defaultMethod:'cash'};await refresh();
   await page.getByRole('button',{name:/QRIS/}).click();assert.equal(await method(),'qris');
   const seen=configReads;await expect.poll(()=>configReads,{timeout:16000}).toBeGreaterThan(seen);assert.equal(await method(),'qris');
   paymentConfig={cash:false,qris:false,defaultMethod:'cash'};await refresh();await expect(pay).toBeDisabled();assert.equal(await method(),'qris');
   await page.screenshot({path:path.join(evidenceDir,'all-payments-disabled.png')});
   configStatus=503;await refresh();await page.getByText('Payment configuration is unavailable. Reconnect and retry; your order is preserved.',{exact:true}).first().waitFor();await expect(pay).toBeDisabled();
   configStatus=200;paymentConfig={cash:true,qris:false,defaultMethod:'qris'};await refresh();await page.getByRole('button',{name:/Cash/}).last().click();await expect(pay).toBeEnabled();
   assert.equal(await method(),'cash');assert.equal(posts,0);assert.equal(await page.evaluate(()=>window.orderWriteAttempts),0);assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);
   assert.equal(await page.getByText('Synthetic Tea',{exact:true}).count(),2);assert.deepEqual(errors,[]);
   console.log('PASS actual POS configuration: disabled default, real 10s polling while paying, all-off, config read 503, reconnect; cart retained and zero print/queue.');await context.close();continue;
  }
  await pay.evaluate(button=>{button.click();button.click();});
  if(scenario==='rejected') {
   const rejection=page.getByText('This payment method is disabled. Choose an active method; your order is preserved.',{exact:true});
   await rejection.waitFor();await expect(rejection.locator('..')).toHaveCSS('opacity','1');
   assert.equal(posts,1);assert.equal(await page.evaluate(()=>window.orderWriteAttempts),0);
   assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);assert.equal(await pay.isVisible(),true);
   assert.deepEqual(errors,[]);console.log('PASS actual POS: HTTP 409 retains payment/cart; zero local queue, print and completion.');
   await page.screenshot({path:path.join(evidenceDir,'http-rejected.png')});
   await context.close();continue;
  }
  await page.waitForFunction(()=>window.orderWriteAttempts===1);
  const readOrders=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
   const r=indexedDB.open('POSOffline');r.onerror=()=>reject(r.error);r.onsuccess=()=>{
    const db=r.result;const tx=db.transaction('orders','readonly');const all=tx.objectStore('orders').getAll();
    tx.oncomplete=()=>{db.close();resolve(all.result);};tx.onerror=()=>reject(tx.error);
   };
  }));
  if(scenario==='refused') {
   const warning=page.locator('[role="alert"]').filter({hasText:'The order could not be saved'});
   await warning.waitFor({state:'visible'});assert.ok((await warning.innerText()).includes('do not charge the customer again'));
   assert.equal(await pay.isVisible(),true);assert.equal(await pay.isEnabled(),true);
   assert.equal(await page.getByText('Synthetic Tea',{exact:true}).count(),2); // product + retained cart
   assert.equal((await readOrders()).length,0);
   assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);
   const after=await page.evaluate(async()=>{const {useOrderStore}=await import('/src/stores/orderStore.ts');return {paid:useOrderStore.getState().paidAmount,method:useOrderStore.getState().paymentMethod,busy:useOrderStore.getState().isCheckingOut};});
   assert.equal(after.paid,before.paid);assert.equal(after.method,before.method);assert.equal(after.busy,false);assert.equal(posts,1);
   await page.screenshot({path:path.join(evidenceDir,'page-refused.png')});
   console.log('PASS actual POS: controlled native IndexedDB order-add refusal retains cart, payment modal and amount; visible caution; zero print/completion; double click one POST.');
   await page.evaluate(()=>{window.rejectOrderWrite=false;});
   await new Promise(r=>setTimeout(r,200));assert.equal(posts,1);assert.equal((await readOrders()).length,0);
   await pay.click();await page.waitForFunction(()=>window.orderWriteAttempts===2);
  }
  await page.waitForFunction(()=>window.fixtureCalls.includes('complete'));
  await pay.waitFor({state:'hidden'});
  await page.getByText('Cart is empty',{exact:true}).waitFor({state:'visible'});
  const rows=await readOrders();assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(rows[0].items[0].productName,'Synthetic Tea');
  assert.deepEqual((await page.evaluate(()=>window.fixtureCalls)).sort(),['complete','cups','kitchen','receipt']);
  assert.equal(posts,scenario==='success'?1:2);
  assert.equal(await page.locator('[role="alert"]').filter({hasText:'The order could not be saved'}).count(),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(evidenceDir,'page-'+scenario+'-saved.png')});
  console.log('PASS actual POS '+scenario+': real IndexedDB committed one pending order; receipt/kitchen/cup/display once; cart cleared and modal closed; page errors zero. External requests blocked: '+blocked.length);
  await context.close();
  }
 }finally{if(browser)await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
