// Real POS React/IndexedDB, actual read-only evidence service, synthetic HTTP/device boundaries.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {pathToFileURL}=require('node:url');const evidenceDir='/tmp/pos-shift-page-evidence';
const moduleObject={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/services/ShiftSummaryEvidence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleObject,exports:moduleObject.exports,Date});
const load=moduleObject.exports.loadShiftSummaryEvidence;
async function evidence(scenario){
 const start=new Date('2026-10-06T16:00Z'),end=new Date('2026-10-06T18:00Z');
 const sessions=[{id:'s1',storeId:'synthetic-store',shift:'evening',status:'open',openFloat:500,openedAt:start}];
 const events=[{storeId:'synthetic-store',type:'cash_sale',amount:999999,shift:'evening',createdAt:new Date('2026-10-06T15:00Z')},{storeId:'synthetic-store',type:'cash_sale',amount:200,shift:scenario==='legacy'?null:'evening',createdAt:new Date('2026-10-06T16:30Z')},{storeId:'synthetic-store',type:'cash_in',amount:30,shift:'evening',createdAt:new Date('2026-10-06T17:30Z')}];
 const orders=[{storeId:'synthetic-store',finalAmount:110,totalAmount:999999,paymentMethod:'qris',status:scenario==='refund'?'refunded':'completed',createdAt:new Date('2026-10-06T17:00Z')}];
 const match=(row,w)=>row.storeId===w.storeId&&row.createdAt>=w.createdAt.gte&&row.createdAt<w.createdAt.lt;
 return load({shiftSession:{findMany:async()=>sessions},cashEvent:{findMany:async q=>events.filter(x=>match(x,q.where))},order:{findMany:async q=>orders.filter(x=>match(x,q.where))}},'synthetic-store',end);
}
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.resolve('client-pos/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-pos/src/**/*.{js,ts,jsx,tsx}')];
 const server=await createServer({configFile:false,root:path.resolve('client-pos'),cacheDir:'/tmp/pos-shift-vite-cache',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:6198,strictPort:true,proxy:{}},resolve:{alias:{'@':path.resolve('client-pos/src')}}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true});fs.mkdirSync(evidenceDir,{recursive:true});
  for(const scenario of ['healthy','legacy','refund','queued','read-failure','manual','cash-page']){
   const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});let closeCalls=[],failRead=false;const data=await evidence(scenario);const errors=[];
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!=='http://127.0.0.1:6198')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
    let response={},status=200;
    if(url.pathname==='/api/config')response={paymentMethods:{cash:true,defaultMethod:'cash'},shiftSettings:{requireSupervisorConfirm:false}};
    if(url.pathname==='/api/products')response={list:[]};
    if(url.pathname==='/api/channels'||url.pathname.includes('discount-rules'))response=[];
    if(url.pathname==='/api/shifts')response=[{key:'evening',name:'Evening',isActive:true}];
    if(url.pathname==='/api/pos-cash/shifts/current'||url.pathname==='/api/pos-cash/balance'){response=data;if(failRead)status=503;}
    if(url.pathname==='/api/pos-cash/events')response={list:[]};
    if(url.pathname==='/api/pos-cash/shifts/close'&&req.method()==='POST'){closeCalls.push(req.postDataJSON());}
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,data:response})});
   });
   await context.addInitScript(()=>{
    localStorage.setItem('pos-api-url','http://127.0.0.1:6198/api');localStorage.setItem('pos_lang','en');localStorage.setItem('pos_language','en');
    sessionStorage.setItem('pos-auth',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'synthetic',role:'cashier',storeId:'synthetic-store',staff:{id:'staff',name:'Synthetic'}}},version:0}));
    window.shiftPrints=[];window.electronAPI={sendPrintShiftReport:async x=>window.shiftPrints.push(x),onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{}};
   });
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:6198/#/'+(scenario==='cash-page'?'cash':'pos'));
   if(scenario!=='cash-page'){
    await page.getByRole('button',{name:'Confirm Channel',exact:true}).click();
    if(scenario==='queued')await page.evaluate(async()=>{const {db}=await import('/src/db/offline.ts');await db.orders.add({storeId:'synthetic-store',localId:'synthetic-queue',status:'failed',syncAttempts:999,createdAt:new Date()});});
    await page.getByRole('button',{name:'Shift',exact:true}).click();await page.getByRole('heading',{name:'Shift Change',exact:true}).waitFor();
   }
   const card=page.getByTestId('shift-evidence');await card.waitFor();await expect(card).not.toContainText('999.999');
   const value=label=>card.locator('dl > div').filter({has:page.locator('dt',{hasText:label})}).locator('dd');
   await expect(value('Expected Cash')).toHaveText('Unverifiable');
   if(scenario==='legacy')await expect(value('Recorded cash sales')).toHaveText('Unverifiable');
   else if(scenario==='queued'){await expect(card).toContainText('1 local orders remain unsynced');await expect(value('Recorded cash sales')).toHaveText('Unverifiable');}
   else {await expect(value('Recorded cash sales')).toContainText('200');await expect(value('Recorded cash in')).toContainText('30');}
   if(scenario==='refund')await expect(value('Recorded QRIS receipts')).toHaveText('Unverifiable');
   if(scenario==='read-failure'){
    await page.getByRole('heading',{name:'Shift Change',exact:true}).locator('..').getByRole('button').click();failRead=true;
    await page.getByRole('button',{name:'Shift',exact:true}).click();await expect(value('Recorded cash sales')).toHaveText('Unverifiable');await expect(value('Recorded opening float')).toHaveText('Unverifiable');
   }
   if(scenario==='manual'){
    const confirm=page.getByRole('button',{name:'Confirm Shift Change',exact:true});await confirm.click();assertNoCalls(closeCalls);
    await page.getByText('Enter counted cash',{exact:true}).first().click();for(const digit of ['1','2','5'])await page.getByRole('button',{name:digit,exact:true}).click();
    await confirm.click();await expect.poll(()=>closeCalls.length).toBe(1);if(closeCalls[0].actualCash!==125)throw Error('Manual count changed');
   } else if(scenario==='cash-page'){
    await page.getByRole('button',{name:'Close Shift',exact:true}).click();await page.getByRole('button',{name:'Close Shift',exact:true}).last().click();assertNoCalls(closeCalls);
    await page.getByPlaceholder('Enter counted cash').fill('0');await page.getByRole('button',{name:'Close Shift',exact:true}).last().click();await expect.poll(()=>closeCalls.length).toBe(1);if(closeCalls[0].actualCash!==0)throw Error('Explicit zero changed');
   }
   await page.screenshot({path:path.join(evidenceDir,scenario+'.png')});
   if((await page.evaluate(()=>window.shiftPrints)).length)throw Error('Unverified Z-report printed');if(errors.length)throw Error(errors.join(';'));
   console.log('PASS real POS shift evidence: '+scenario+'; zero unverified Z-report and zero page errors');await context.close();
  }
 }finally{if(browser)await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
function assertNoCalls(calls){if(calls.length)throw Error('Empty manual input submitted');}
