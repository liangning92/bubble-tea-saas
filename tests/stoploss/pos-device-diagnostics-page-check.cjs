// Real React, camera decoder and IndexedDB. Fake video/device/API boundaries use owned fixtures only.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');const {pathToFileURL}=require('node:url');
(async()=>{
 const output=path.resolve(process.env.DEVICE_EVIDENCE_DIR||'/tmp/pos-device-diagnostics-evidence');fs.mkdirSync(output,{recursive:true});
 const qr=path.join(output,'barcode.png'),video=path.join(output,'barcode.y4m');await require('qrcode').toFile(qr,'camera-product',{width:320,margin:4});
 execFileSync('ffmpeg',['-y','-loop','1','-i',qr,'-vf','pad=640:480:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p','-r','10','-t','2',video],{stdio:'ignore'});
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')];
 const vite=await createServer({configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-devices-vite-cache',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:6204,strictPort:true},resolve:{alias:{'@':path.resolve('client-pos/src')}}});let browser;
 try{
 await vite.listen();browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-video-capture=${video}`]});
 const make=async(scenario)=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});const calls=[];
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:6204')return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();calls.push(u.pathname);let data={},status=200;
   if(u.pathname==='/api/health')return route.fulfill({status:scenario==='server-down'?503:200,contentType:'application/json',body:JSON.stringify({status:scenario==='server-down'?'degraded':'ok',dependencies:scenario==='server-unknown'?{}:{database:scenario==='server-down'?'unavailable':'ok'}})});
   if(u.pathname==='/api/products')data={list:[]};if(u.pathname==='/api/channels'||u.pathname==='/api/shifts')data=[];
   if(u.pathname==='/api/config')data={paymentMethods:{cash:true,defaultMethod:'cash'}};
   if(u.pathname==='/api/products/barcode/camera-product')data={id:'camera-product',storeId:'synthetic-store',name:'Camera Tea'};
   if(u.pathname==='/api/products/barcode/member-only'){status=404;data=null;}
   if(u.pathname==='/api/members/barcode/member-only')data={id:'m1',storeId:'synthetic-store',name:'Scanned Member',phone:'08123',points:20};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({data})});
  });
  await context.addInitScript(({scenario})=>{
   localStorage.setItem('pos-api-url','http://127.0.0.1:6204/api');localStorage.setItem('pos_lang','en');localStorage.setItem('pos_language','en');
   sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',apiUrl:'http://127.0.0.1:6204/api',user:{id:'cashier',role:'cashier',storeId:'synthetic-store'}},version:0}));
   if(scenario==='display-states') localStorage.setItem('dualScreenConfig',JSON.stringify({enabled:true,autoSyncPromotions:false,idleLayout:{columns:[{width:50,content:'promotions'},{width:50,content:'welcome'}]},orderingLayout:{columns:[{width:40,content:'promotions'},{width:60,content:'order'}]},stateAppearance:{idle:{promotions:['Idle title','Idle subtitle'],promotionsStyle:{fontSize:48},welcomeText:'Idle welcome',backgroundColor:'#EC6D88'},ordering:{promotions:['Order title','Order subtitle'],promotionsStyle:{fontSize:24},orderHeaderColor:'#112233',orderBackgroundColor:'#FFFFFF',backgroundColor:'#EC6D88'},complete:{backgroundColor:'#123456'}}}));
   window.handlers={};window.listenerRemovals=0;window.trackRefs=[];
   const subscribe=channel=>callback=>{window.handlers[channel]=callback;return()=>{delete window.handlers[channel];window.listenerRemovals++;};};
   window.electronAPI={getAppVersion:async()=> '2026.10.311',onOrderUpdate:subscribe('update'),onOrderComplete:subscribe('complete'),onOrderClear:subscribe('clear'),onPaymentQr:subscribe('qr'),onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{}};
   if(scenario==='storage-failure'){const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='POSOffline'&&String(args[0]?.key||'').startsWith('diagnostics.probe.'))throw new DOMException('Synthetic quota refusal','QuotaExceededError');return put.apply(this,args);};}
   if(scenario==='storage-read-failure'){const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(this.transaction.db.name==='POSOffline'&&String(key).startsWith('diagnostics.probe.'))throw new DOMException('Synthetic read refusal','UnknownError');return get.call(this,key);};}
   if(scenario==='storage-delete-failure'){const remove=IDBObjectStore.prototype.delete;const refused=new Set();IDBObjectStore.prototype.delete=function(key){if(!refused.has(key)&&this.transaction.db.name==='POSOffline'&&String(key).startsWith('diagnostics.probe.')){refused.add(key);throw new DOMException('Synthetic delete refusal','UnknownError');}return remove.call(this,key);};}
   if(scenario==='denied'||scenario==='missing')navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic camera failure',scenario==='denied'?'NotAllowedError':'NotFoundError');};
   else if(scenario==='unsupported')Object.defineProperty(navigator,'mediaDevices',{value:undefined});
   else {const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.trackRefs.push(...stream.getTracks());if(scenario==='late-permission')await new Promise(resolve=>window.releaseCamera=resolve);return stream;};}
  },{scenario});
  const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});return{context,page,calls,errors};
 };
 {
  const {context,page,errors}=await make('display');await page.goto('http://127.0.0.1:6204/#/customer-display');await expect.poll(()=>page.evaluate(()=>Object.keys(window.handlers).length),{timeout:20000}).toBe(4);await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
  const order={items:[{id:'b',productName:'Next Tea',specName:'Regular',quantity:1,unitPrice:16000,addons:[]}],subtotal:16000,ppn:0,discount:0,total:16000};
  await page.evaluate(()=>window.handlers.complete('ORDER-A'));await page.clock.fastForward(2000);
  await page.evaluate(order=>window.handlers.update(order),order);await page.getByText('Next Tea',{exact:true}).waitFor();await page.clock.fastForward(6000);await expect(page.getByText('Next Tea',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.handlers.complete('ORDER-B'));await page.clock.fastForward(3000);await page.evaluate(()=>window.handlers.complete('ORDER-C'));await page.clock.fastForward(2500);await expect(page.getByText('ORDER-C')).toBeVisible();await page.clock.fastForward(2600);await expect(page.getByText('ORDER-C')).toHaveCount(0);
  await page.evaluate(()=>{window.handlers.complete('ORDER-D');window.handlers.qr({qrImage:'data:image/png;base64,iVBORw0KGgo=',amount:16000});});await page.clock.fastForward(6000);await expect(page.getByText('ORDER-D')).toHaveCount(0);
  // QR remains displayed after the old completion timer would have fired.
  assert.ok((await page.locator('img').evaluateAll(imgs=>imgs.map(i=>i.src))).some(src=>src.startsWith('data:image/png;base64,iVBORw0KGgo=')));
  await page.evaluate(()=>{window.handlers.complete('ORDER-E');window.handlers.clear();});await expect(page.getByText('ORDER-E')).toHaveCount(0);
  await page.evaluate(()=>location.hash='/login');await expect.poll(()=>page.evaluate(()=>Object.keys(window.handlers).length)).toBe(0);await page.clock.fastForward(6000);assert.deepEqual(errors,[]);await context.close();console.log('PASS customer display: new order/payment cancels old timer, repeated completion resets timer, clear and unmount clean subscriptions');
 }
 {
  const {context,page,errors}=await make('display-states');await page.goto('http://127.0.0.1:6204/#/customer-display');await expect(page.getByText('Idle title',{exact:true})).toBeVisible();await expect(page.getByText('Idle subtitle',{exact:true})).toBeVisible();await expect(page.getByText('Idle title',{exact:true})).toHaveCSS('font-size','48px');
  await expect(page.getByText('Idle welcome',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.handlers.update({items:[{id:'p',productName:'State Tea',specName:'Regular',quantity:1,unitPrice:12000,addons:[]}],subtotal:12000,total:12000,ppn:0,discount:0}));
  await expect(page.getByText('Order title',{exact:true})).toHaveCSS('font-size','24px');await expect(page.getByText('Order subtitle',{exact:true})).toBeVisible();await expect(page.getByText('Idle welcome',{exact:true})).toHaveCount(0);await expect(page.locator('div.py-3.px-4.text-center.font-bold')).toHaveCSS('background-color','rgb(17, 34, 51)');
  await page.evaluate(()=>window.handlers.complete('COLOR'));await expect(page.getByText('COLOR',{exact:false})).toBeVisible();await expect(page.locator('[data-customer-display-canvas] > div')).toHaveCSS('background-color','rgb(18, 52, 86)');
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'customer-independent-states.png')});await context.close();console.log('PASS independent idle, ordering and completed colors, title/subtitle and typography');
 }
 for(const scenario of ['storage-ok','storage-failure','storage-read-failure','storage-delete-failure','server-down','server-unknown']){
  const {context,page,errors}=await make(scenario);await page.goto('http://127.0.0.1:6204/#/diagnostics');
  const local=page.getByText('Local Database',{exact:true}).locator('..'),server=page.getByText('Server Database',{exact:true}).locator('..');
  await expect(local).toContainText(scenario.includes('failure')?'ERROR':'OK');await expect(server).toContainText(scenario==='server-down'?'ERROR':scenario==='server-unknown'?'UNKNOWN':'OK');
  const probe=await page.evaluate(async()=>{const{db}=await import('/src/db/offline.ts');return (await db.config.toArray()).filter(c=>c.key.startsWith('diagnostics.probe.'));});assert.deepEqual(probe,[]);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS diagnostics: '+scenario+' real IndexedDB probe and server dependency state');
 }
 for(const scenario of ['camera','denied','missing','unsupported','late-permission','member-fallback']){
  const {context,page,calls,errors}=await make(scenario);await page.goto('http://127.0.0.1:6204/#/scan');await page.getByRole('heading',{name:'Barcode Scan',exact:true}).waitFor();
  if(scenario==='member-fallback'){
   await page.getByPlaceholder('Scan or enter barcode...').fill('member-only');await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.getByText('Scanned Member',{exact:true}).waitFor();
  }else{
   await page.getByRole('button',{name:'Camera Mode',exact:true}).click();
   if(scenario==='camera'){
    try{await page.getByText('Camera Tea',{exact:true}).waitFor();}catch(error){console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>({tracks:window.trackRefs.map(t=>({state:t.readyState,settings:t.getSettings()})),video:document.querySelector('video')&&{ready:document.querySelector('video').readyState,width:document.querySelector('video').videoWidth}})));throw error;}assert.equal(calls.filter(p=>p==='/api/products/barcode/camera-product').length,1);await expect.poll(()=>page.evaluate(()=>window.trackRefs.every(t=>t.readyState==='ended'))).toBe(true);
   }else if(scenario==='late-permission'){
    await expect.poll(()=>page.evaluate(()=>typeof window.releaseCamera)).toBe('function');await page.getByRole('button',{name:'Keyboard Mode',exact:true}).click();await page.evaluate(()=>window.releaseCamera());await expect.poll(()=>page.evaluate(()=>window.trackRefs.every(t=>t.readyState==='ended'))).toBe(true);assert.equal(calls.filter(p=>p.includes('/barcode/')).length,0);
   }else{
    await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Retry camera',exact:true}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Keyboard Mode',exact:true}).click();await expect(page.getByPlaceholder('Scan or enter barcode...')).toBeVisible();assert.equal(calls.filter(p=>p.includes('/barcode/')).length,0);
   }
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS scanner: '+scenario+(scenario==='camera'?' (real ZXing video decode)':''));
 }
 }finally{await browser?.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
