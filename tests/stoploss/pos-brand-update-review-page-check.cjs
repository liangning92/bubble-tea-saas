const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const server=await createServer({configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-brand-review-vite',server:{host:'127.0.0.1',port:6206,strictPort:true}});
 let browser;await server.listen();try{
 browser=await chromium.launch();const context=await browser.newContext({serviceWorkers:'block'}),origin='http://127.0.0.1:6206';let writes=0;
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();if(req.method()!=='GET' && ['/api/orders','/api/expenses','/api/pos-cash'].some(prefix=>u.pathname.startsWith(prefix)))writes++;
 let data={};if(u.pathname==='/api/products')data={list:[{id:'p',name:'Synthetic Tea',status:'active',category:{id:'tea',name:'Tea'},specs:[{id:'s',name:'Regular',price:10000}],addons:[]}]};
 if(u.pathname==='/api/config')data={storeInfo:{storeLogo:'data:image/png;base64,old-black-logo'},posReceipt:{storeLogo:'data:image/png;base64,old-black-logo'},paymentMethods:{cash:true,defaultMethod:'cash'},taxSettings:{enabled:false}};
 if(u.pathname==='/api/channels'||u.pathname.includes('discount-rules')||u.pathname==='/api/marketing/activities')data=[];if(u.pathname==='/api/shifts')data=[{key:'day',name:'Day'}];if(u.pathname==='/api/pos-cash/shifts/current')data={hasOpenShift:true,shift:{id:'session',shift:'day'}};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data})});});
 await context.addInitScript(origin=>{
 localStorage.setItem('pos-api-url',origin+'/api');localStorage.setItem('pos_language','zh');localStorage.setItem('pos_store_logo','data:image/png;base64,old-black-logo');
 localStorage.setItem('pos.update.dismissed',JSON.stringify({version:'2026.10.396',until:Date.now()+86400000}));
 sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic',apiUrl:origin+'/api',user:{id:'admin',role:'admin',storeId:'store',staff:{id:'staff',name:'Admin'}}},version:0}));
 const status=new Set();window.updateEvents={emit:(next,info)=>status.forEach(cb=>cb(next,info))};window.electronAPI={getAppVersion:async()=> '2026.10.372',onUpdateStatus:cb=>(status.add(cb),()=>status.delete(cb)),onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},checkForUpdates:async()=>{setTimeout(()=>window.updateEvents.emit('available',{version:'2026.10.396',currentVersion:'2026.10.372'}),200);return {}},downloadUpdate:async()=>{window.updateEvents.emit('downloaded',{version:'2026.10.396',currentVersion:'2026.10.372'});return true},showUpdateInstaller:async()=>({success:true})};},origin);
 await require('./empty-activity-browser-fixture.cjs').emptyActivityQuotes(context);const page=await context.newPage();page.setDefaultTimeout(12000);
 await page.goto(origin+'/#/login');await expect(page.getByAltText('YOUME')).toBeVisible();assert.ok(await page.getByAltText('YOUME').evaluate(async img=>img.src===(await import('/src/assets/logo.ts')).YOUME_LOGO_RED));
 await page.evaluate(()=>window.updateEvents.emit('available',{version:'2026.10.396',currentVersion:'2026.10.372'}));assert.equal(await page.getByRole('button',{name:'下载更新',exact:true}).count(),0);
 await page.getByRole('button',{name:'检查更新',exact:true}).click();await page.getByRole('button',{name:'下载更新',exact:true}).click();await page.getByRole('button',{name:'安装并重启',exact:true}).waitFor();await page.getByRole('button',{name:'关闭',exact:true}).click();
 console.log('PASS login brand color despite cached receipt logo; manual update overrides dismissal and offers download/install');
 await page.goto(origin+'/#/pos');await page.getByText('Synthetic Tea',{exact:true}).first().waitFor();await page.getByRole('button',{name:'确认渠道',exact:true}).click();
 assert.ok(await page.getByAltText('Logo',{exact:true}).evaluate(async img=>img.src===(await import('/src/assets/logo.ts')).YOUME_LOGO_WHITE));
 await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');for(let n=0;n<69;n++)await db.orders.add({localId:'legacy-'+n,orderNumber:'20260720'+n,storeId:'store',staffId:'staff',items:[],finalAmount:16000,status:'quarantined',createdAt:new Date(),syncAttempts:0,quarantineAudit:{actorId:'admin',at:new Date()}})});
 await expect(page.getByTestId('checkout-quarantine')).toHaveCount(0);await page.reload();await page.getByRole('button',{name:'确认渠道',exact:true}).click();await expect(page.getByTestId('checkout-quarantine')).toHaveCount(0);
 await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');await db.orders.add({localId:'synthetic-pending',orderNumber:'DO-NOT-SHOW-SYNC-DETAILS',storeId:'store',staffId:'staff',items:[],finalAmount:16000,status:'pending',createdAt:new Date(),syncAttempts:0,locallyAcceptedAt:new Date()})});
 await expect(page.getByTestId('offline-sales')).toHaveCount(0);await expect(page.getByTestId('checkout-recovery-list')).toHaveCount(0);await expect(page.getByText('DO-NOT-SHOW-SYNC-DETAILS')).toHaveCount(0);
 await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');const row=await db.orders.where('localId').equals('synthetic-pending').first();if(!row)throw new Error('Pending sale was lost');await db.orders.delete(row.id)});
 const retained=await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');return db.orders.toArray()});
 assert.equal(retained.length,69);assert.ok(retained.every(r=>r.status==='quarantined'&&r.finalAmount===16000&&r.syncAttempts===0));
 await page.evaluate(async()=>{const {useAuthStore}=await import('/src/stores/auth.ts');useAuthStore.setState({user:{...useAuthStore.getState().user,role:'cashier'}})});await expect(page.getByTestId('checkout-quarantine')).toHaveCount(0);
 assert.equal(writes,0);
 console.log('PASS 69 historical local copies preserved without cashier/admin checkout banner or repeat-review action; zero order/payment API writes');

 }finally{if(browser)await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
