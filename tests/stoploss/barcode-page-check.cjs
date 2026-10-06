// Real POS + scanner React/IndexedDB; synthetic API/device boundaries only.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')];
 const server=await createServer({configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-barcode-vite-cache',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:6200,strictPort:true,proxy:{}},resolve:{alias:{'@':path.resolve('client-pos/src')}}});let browser;let normalItems;
 try{await server.listen();browser=await chromium.launch({headless:true});fs.mkdirSync('/tmp/pos-barcode-page-evidence',{recursive:true});
 for(const scenario of (process.env.BARCODE_SCENARIOS || 'single,multi,zero,same-name,repeat,repriced-repeat,addons,parity-normal,parity-scan,updated-price,missing-price,read-failure,cross-store,route-preserve,cancel').split(',')){
  const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'}),errors=[],orders=[],queries=[];let failure=false,currentPrice=10000;
  const spec=(id,name,price)=>({id,name,price,isDefault:true});
  const base={id:'base',storeId:'synthetic-store',name:'Existing Tea',status:'active',deletedAt:null,category:{id:'tea',name:'Tea'},specs:[spec('base-spec','Regular',5000)],addons:[]};
  const p={id:'p1',storeId:'synthetic-store',name:scenario==='same-name'?'Same Tea':'Scanned Tea',status:'active',deletedAt:null,category:{id:'tea',name:'Tea'},specs:[spec('s1','Regular',10000)],addons:[{addonId:'boba',addon:{id:'boba',name:'Synthetic Boba',price:2000}}]};
  const p2={...p,id:'p2',specs:[spec('s2','Regular',12000)]};
  if(['multi','parity-normal','parity-scan'].includes(scenario))p.specs.push(spec('large','Large',15000));
  if(scenario==='zero'){p.specs[0].price=0;currentPrice=0;}
  const directory=()=>{const fresh=structuredClone(p);fresh.specs[0].price=currentPrice;if(scenario==='missing-price'&&failure)delete fresh.specs[0].price;return [base,fresh,...(scenario==='same-name'?[p2]:[])];};
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!=='http://127.0.0.1:6200')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();let data={},status=200;
   if(url.pathname==='/api/products'){queries.push({storeId:url.searchParams.get('storeId'),token:req.headers().authorization});data={list:directory()};if(scenario==='read-failure'&&failure)status=503;}
   if(url.pathname.startsWith('/api/products/barcode/')){
    const id=decodeURIComponent(url.pathname.split('/').pop());data={...(id==='p2'?p2:p),price:999999};
    if(scenario==='cross-store')data.storeId='other-store';
    if(scenario==='updated-price')currentPrice=15500;
    if(['missing-price','read-failure'].includes(scenario))failure=true;
   }
   if(url.pathname==='/api/config')data={paymentMethods:{cash:true,defaultMethod:'cash'},hardwareSettings:{autoOpenCashDrawer:false,printers:[{type:'receipt',enabled:true,printerName:'Synthetic Receipt'}]}};
   if(url.pathname==='/api/shifts')data=[{key:'morning',name:'Morning'}];
   if(url.pathname==='/api/channels'||url.pathname.includes('discount-rules'))data=[];
   if(url.pathname==='/api/pos-cash/shifts/current')data={hasOpenShift:false};
   if(url.pathname==='/api/orders'&&req.method()==='POST'){const body=req.postDataJSON();orders.push(body);data={id:'synthetic-order',orderNumber:'PAID-SYNTHETIC',pickupNumber:'A001',grandTotal:body.items.reduce((sum,item)=>sum+(item.unitPrice+item.addons.reduce((s,a)=>s+a.price,0))*item.quantity,0)};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data})});
  });
  await context.addInitScript(()=>{
   localStorage.setItem('pos-api-url','http://127.0.0.1:6200/api');localStorage.setItem('pos_lang','en');localStorage.setItem('pos_language','en');
   sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'synthetic',role:'cashier',storeId:'synthetic-store',staff:{id:'synthetic-staff',name:'Synthetic'}}},version:0}));
   window.deviceCalls=[];window.electronAPI={onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},sendOrderComplete:()=>window.deviceCalls.push('complete'),sendPrintReceipt:async()=>{window.deviceCalls.push('receipt');return {success:true};},sendKitchenOrder:async()=>{throw Error('Unexpected kitchen');},sendCupStickers:async()=>{throw Error('Unexpected label');}};
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:6200/#/pos');await page.getByText('Existing Tea',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
  const add=()=>page.getByRole('button',{name:/Add to Cart/}).click();
  const normal=async(name='Existing Tea')=>{await page.getByRole('button',{name:new RegExp('^'+name)}).first().click();};
  const scan=async(id='p1',viaRoute=false)=>{
   if(viaRoute)await page.evaluate(()=>{location.hash='/scan';});else await page.getByRole('button',{name:'Scan',exact:true}).click();
   await page.getByRole('heading',{name:'Barcode Scan',exact:true}).waitFor();
   const input=page.getByPlaceholder('Scan or enter barcode...');await input.pressSequentially(id);await input.press('Enter');await page.getByRole('button',{name:'Choose options in POS',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:/Add to Cart/}).count(),0); // scanner keys never opened product options
   if(scenario==='cross-store'){
    await page.getByRole('button',{name:'Choose options in POS',exact:true}).click();await page.getByText(/cannot be verified for this store/).first().waitFor();
    await page.getByRole('heading',{name:'Barcode Scan',exact:true}).locator('..').getByRole('button').click();return;
   }
   await page.getByRole('button',{name:'Choose options in POS',exact:true}).click();
   if(['missing-price','read-failure'].includes(scenario)){await page.getByText(/your cart is preserved/).first().waitFor();return;}
   await page.getByRole('heading',{name:scenario==='same-name'?'Same Tea':'Scanned Tea',exact:true}).waitFor();
  };
  if(['missing-price','read-failure','cross-store','route-preserve','cancel'].includes(scenario)){await normal();await add();}
  if(scenario==='parity-normal'){await normal('Scanned Tea');}
  else if(scenario==='cancel'){
   await page.getByRole('button',{name:'Scan',exact:true}).click();const input=page.getByPlaceholder('Scan or enter barcode...');await input.pressSequentially('123');await page.keyboard.press('Escape');
   assert.equal(await page.getByRole('button',{name:/Add to Cart/}).count(),0);
  }else await scan('p1',scenario==='route-preserve');
  if(['multi','parity-normal','parity-scan'].includes(scenario)){
   const button=page.getByRole('button',{name:/Add to Cart/});await expect(button).toBeDisabled();if(scenario==='multi')await page.screenshot({path:'/tmp/pos-barcode-page-evidence/multi-choice.png'});await page.getByRole('button',{name:/^Large/}).click();await expect(button).toBeEnabled();
   if(scenario.startsWith('parity-')){await page.getByRole('button',{name:/Synthetic Boba/}).click();await page.getByRole('button',{name:'+',exact:true}).last().click();}
  }
  if(scenario==='addons')await page.getByRole('button',{name:/Synthetic Boba/}).click();
  if(!['missing-price','read-failure','cross-store','cancel'].includes(scenario))await add();
  if(['same-name','repeat','repriced-repeat','addons'].includes(scenario)){if(scenario==='repriced-repeat')currentPrice=15500;await scan(scenario==='same-name'?'p2':'p1');await add();}
  assert.equal(orders.length,0);assert.deepEqual(await page.evaluate(()=>window.deviceCalls),[]);
  await page.screenshot({path:'/tmp/pos-barcode-page-evidence/'+scenario+'.png'});
  await page.getByRole('button',{name:/Checkout/}).click();await page.getByRole('button',{name:/Exact/}).click();await page.getByRole('button',{name:/Confirm Payment/}).click();await expect.poll(()=>orders.length).toBe(1);
  const items=orders[0].items;
  if(scenario==='single')assert.equal(JSON.stringify(items.map(i=>[i.productId,i.specId,i.unitPrice])),JSON.stringify([['p1','s1',10000]]));
  if(scenario==='multi')assert.equal(items[0].specId,'large');
  if(scenario==='zero')assert.equal(items[0].unitPrice,0);
  if(scenario==='same-name'){assert.equal(items.length,2);assert.equal(items[0].productId,'p1');assert.equal(items[1].productId,'p2');}
  if(scenario==='repriced-repeat'){assert.equal(items.length,2);assert.equal(items[0].unitPrice,10000);assert.equal(items[1].unitPrice,15500);}
  if(scenario==='repeat'){assert.equal(items.length,1);assert.equal(items[0].quantity,2);}
  if(scenario==='addons'){assert.equal(items.length,2);assert.equal(items[0].addons[0].name,'Synthetic Boba');assert.equal(items[1].addons.length,0);}
  if(scenario==='parity-normal')normalItems=items;
  if(scenario==='parity-scan')assert.deepEqual(items,normalItems);
  if(scenario==='updated-price')assert.equal(items[0].unitPrice,15500);
  if(['missing-price','read-failure','cross-store','cancel'].includes(scenario)){assert.equal(items.length,1);assert.equal(items[0].productId,'base');}
  if(scenario==='route-preserve'){assert.equal(items.length,2);assert.equal(items[0].productId,'base');assert.equal(items[1].productId,'p1');}
  assert.ok(queries.every(q=>q.storeId==='synthetic-store'&&q.token==='Bearer synthetic-only'));assert.deepEqual(errors,[]);
  console.log('PASS actual barcode '+scenario+': identity/current price, explicit specs, cart/payload boundary, zero page errors');await context.close();
 }
 }finally{if(browser)await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
