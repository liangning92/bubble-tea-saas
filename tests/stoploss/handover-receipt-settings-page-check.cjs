// Actual admin and POS React pages. Config service and physical printer are synthetic boundaries.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const servers=[];let browser;
 let configs={shiftSettings:{summaryItems:{cashReceipts:true},requireSupervisorConfirm:false},hardwareSettings:{printers:[{id:'receipt',type:'receipt',enabled:true,connectionType:'usb',printerName:'Synthetic printer'}]},posReceipt:{paperSize:'80mm'}};
 let writes=0,reads=0;const errors=[];
 try {
  browser=await chromium.launch({headless:true});
  const pages={};
  for(const client of ['client-admin','client-pos']){
   const admin=client==='client-admin',port=admin?6231:6232;
   const common=`import React from 'react';import{createRoot}from'react-dom/client';import './src/i18n/index.ts';import{useAuthStore}from'./src/stores/auth.ts';useAuthStore.setState({user:{id:'staff',role:'manager',storeId:'owned',staff:{id:'staff',name:'Staff'}},token:'synthetic',isAuthenticated:true,apiUrl:location.origin+'/api'});`;
   const fixtureJs=common+(admin?`
import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{POSSettingsPage}from'./src/pages/settings/POSSettingsPage.tsx';import{configApi,receiptTemplateApi,shiftApi}from'./src/services/api.ts';
configApi.get=async()=>({data:{data:await(await fetch('/fixture-config')).json()}});configApi.set=async(storeId,key,value)=>fetch('/fixture-config',{method:'POST',body:JSON.stringify({storeId,key,value})});receiptTemplateApi.list=async()=>({data:{data:[]}});shiftApi.list=async()=>({data:{data:[]}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><POSSettingsPage initialTab="shift"/></QueryClientProvider>);`:`
import{MemoryRouter}from'react-router-dom';import{CashManagementPage}from'./src/pages/CashManagementPage.tsx';import{posApi,shiftApi}from'./src/services/api.ts';
posApi.getCashBalance=async()=>({data:{data:{openFloat:0,shift:null}}});posApi.getCashEvents=async()=>({data:{data:{list:[]}}});posApi.getShifts=async()=>({data:{data:{list:[{id:'old',shift:'morning',status:'closed',closedAt:'2026-10-13T10:00:00Z'}]}}});shiftApi.list=async()=>({data:{code:200,data:[]}});
posApi.getShiftHandover=async()=>({data:{data:{shift:'morning',actualCash:0,report:{summaryItems:{cashReceipts:true},summaryEvidence:{verified:false}}}}});
posApi.getConfigs=async()=>({data:{data:await(await fetch('/fixture-config')).json()}});window.calls=[];window.electronAPI={sendPrintShiftReport:async data=>{window.calls.push(data);return{success:true}}};
createRoot(document.getElementById('root')).render(<MemoryRouter><CashManagementPage/></MemoryRouter>);`);
   const fixture=path.resolve(client,'fixture.tsx');
   const server=await createServer({configFile:false,appType:'custom',root:path.resolve(client),cacheDir:'/tmp/handover-receipt-vite-'+client,esbuild:{jsx:'automatic'},plugins:[{name:'fixture',resolveId:id=>id==='/fixture.tsx'?fixture:null,load:id=>id===fixture?fixtureJs:null}],css:{postcss:{plugins:[]}},server:{host:'127.0.0.1',port,strictPort:true}});servers.push(server);
   server.middlewares.use((req,res,next)=>{if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/fixture.tsx"></script>');return}if(req.url==='/fixture.tsx'){server.transformRequest('/fixture.tsx').then(r=>{res.setHeader('Content-Type','application/javascript');res.end(r.code)}).catch(next);return}if(req.url==='/fixture-config'){if(req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{const value=JSON.parse(body);assert.equal(value.storeId,'owned');configs[value.key]=value.value;writes++;res.end('{}')})}else{reads++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(configs))}return}next()});
   await server.listen();const context=await browser.newContext();await context.addInitScript(()=>{localStorage.setItem('bubble-tea-language','zh');localStorage.setItem('pos_language','zh')});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));pages[client]=page;await page.goto(`http://127.0.0.1:${port}/fixture`);
  }
  const admin=pages['client-admin'],pos=pages['client-pos'],card=admin.getByTestId('handover-receipt-settings');
  await expect(card.getByRole('checkbox')).toHaveCount(21);
  await card.getByRole('checkbox',{name:'现金收款',exact:true}).uncheck();await expect.poll(()=>writes).toBe(1);assert.equal(configs.shiftSettings.receiptItems.cashReceipts,false);assert.equal(configs.shiftSettings.summaryItems.cashReceipts,true,'print settings do not alter reconciliation UI');
  const before=reads;await pos.getByRole('button',{name:'补打',exact:true}).click();await expect.poll(()=>pos.evaluate(()=>window.calls.length)).toBe(1);assert.ok(reads>before);assert.equal((await pos.evaluate(()=>window.calls[0])).receiptItems.cashReceipts,false,'latest config overrides historical summary');
  await admin.reload();await expect(card.getByRole('checkbox',{name:'现金收款',exact:true})).not.toBeChecked();
  await card.getByRole('checkbox',{name:'现金收款',exact:true}).check();await expect.poll(()=>writes).toBe(2);
  await pos.getByRole('button',{name:'补打',exact:true}).click();await expect.poll(()=>pos.evaluate(()=>window.calls.length)).toBe(2);assert.equal((await pos.evaluate(()=>window.calls[1])).receiptItems.cashReceipts,true);
  assert.deepEqual(errors,[]);console.log('PASS actual admin autosave/reload and mounted POS reprint pulls latest display choices');
 } finally {if(browser)await browser.close();for(const server of servers)await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
