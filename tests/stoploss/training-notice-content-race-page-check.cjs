/* Real React pages; synthetic delayed APIs and the actual server fingerprint algorithm. */
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');require(require.resolve('tsx/cjs',{paths:[path.join(root,'server')]}));
const {trainingContentFingerprint}=require(path.join(root,'server/src/services/TrainingLibraryStore.ts'));
const text=value=>({zh:value,id:value,en:value}),course=(key,value)=>({key,reviewed:true,title:text(key==='first'?'延迟课程甲':'稳定课程乙'),subtitle:text(value),minutes:4,sections:[{key:'editor-only',title:text('测试章节'),points:[text(value)]}],quiz:[],practical:[],sources:[]});
const catalogue=(revision,value)=>({version:1,revision,modules:[course('first',value),course('second','稳定正文')],checklists:[{key:'opening',title:text('测试清单'),items:[text(value)]}]});
const notice=(book,id,kind,key)=>{const item=book[kind==='module'?'modules':'checklists'].find(item=>item.key===key),fingerprint=trainingContentFingerprint(kind,item);return{id,event:'training-content:'+fingerprint,read:false,trainingUpdate:{kind,moduleKey:key,...(kind==='checklist'?{itemKey:key}:{}),fingerprint,revision:book.revision,generation:book.revision}}};
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 let browser;try{
 browser=await chromium.launch();
 for(const app of ['client-staff','client-admin']){
  const staff=app==='client-staff',output=path.join(root,'output/training-content-race',app),entry=path.join(root,app,'/.training-content-race-check.tsx');fs.mkdirSync(output,{recursive:true});
  let server,context;const delayed=[];let book=catalogue('r1','旧版正文'),notices=[],holdLibrary=false,failLibrary=false,readRequests=[],otherWrites=[],libraryStarts=0,inboxReads=0;
  const target=(kind,key,id='')=>(staff?'/training':'/staff/training')+'?tab='+(kind==='module'?'courses&module=':'checklists&item=')+key+'&notice='+id;
  const releaseLibrary=async()=>{const pending=delayed.splice(0);for(const item of pending)await item.route.fulfill({json:{code:200,data:item.body}}).catch(()=>{})};
  try{
   fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {createBrowserRouter,RouterProvider} from 'react-router-dom';import './src/i18n';import './src/index.css';import i18n from 'i18next';import {useAuthStore} from './src/stores/auth';import {${staff?'TrainingPage':'TrainingListPage'}} from './src/pages/${staff?'TrainingPage':'staff/TrainingListPage'}';i18n.changeLanguage('zh');const original={id:'user-a',role:'${staff?'staff':'admin'}',phone:'synthetic',storeId:'store-a',${staff?"staffId:'staff-a',name:'Synthetic'":"staff:{id:'staff-a',name:'Synthetic'}"}};useAuthStore.setState({user:original,token:'synthetic-a',isAuthenticated:true});window.switchTrainingAccount=()=>useAuthStore.setState({user:{...original,id:'user-b',storeId:'store-b',${staff?"staffId:'staff-b'":"staff:{id:'staff-b',name:'Other'}"}},token:'synthetic-b'});window.trainingHoldHash=false;window.trainingHashWaiters=[];const digest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(window.trainingHoldHash)await new Promise(resolve=>window.trainingHashWaiters.push(resolve));return result};import ${staff?' {employeeApi as inboxApi}':'inboxApi'} from './src/services/api';window.trainingInboxPending=0;const inboxGet=inboxApi.get.bind(inboxApi);inboxApi.get=(...args)=>{if(args[0]!==${staff?"'/my/inbox'":"'/staff-work/my/inbox'"})return inboxGet(...args);window.trainingInboxPending++;return inboxGet(...args).finally(()=>{window.trainingInboxPending--})};const router=createBrowserRouter([{path:'*',element:<${staff?'TrainingPage':'TrainingListPage'}/>}]);window.trainingNavigate=url=>router.navigate(url);createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`);
   const tw=(await import(pathToFileURL(path.join(root,app,'tailwind.config.js')).href)).default;tw.content=[path.join(root,app,'src/**/*.{js,ts,jsx,tsx}')];
   const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
   server=await createServer({cacheDir:path.join(output,'vite-cache'),configFile:false,esbuild:{jsx:'automatic'},root:path.join(root,app),css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'synthetic-training-race',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith(staff?'/training':'/staff/training'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/training','<html><div id="root"></div><script type="module" src="/.training-content-race-check.tsx"></script></html>'))})}}]});await server.listen();
   context=await browser.newContext({viewport:{width:900,height:900}});const errors=[];
   await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();let data=[];
    if(url.pathname==='/api/training/library'){libraryStarts++;if(failLibrary){await route.fulfill({status:503,json:{message:'SYNTHETIC_CATALOGUE_FAILURE'}});return}const body=clone(book);if(holdLibrary){delayed.push({route,body});return}data=body}
    else if(url.pathname==='/api/staff-work/my/inbox'){inboxReads++;data={items:request.headers().authorization==='Bearer synthetic-b'?[]:clone(notices)}}
    else if(url.pathname.startsWith('/api/staff-work/my/inbox/')&&url.pathname.endsWith('/read')){const id=url.pathname.split('/').at(-2);readRequests.push({id,actor:request.headers().authorization});notices=notices.map(n=>n.id===id?{...n,read:true}:n);data={read:true}}
    else if(url.pathname.endsWith('/my/checklist'))data={};
    if(!['GET','HEAD'].includes(method)&&!url.pathname.endsWith('/read'))otherWrites.push(url.pathname);
    await route.fulfill({json:{code:200,data}});
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const base='http://127.0.0.1:'+port;
   const nav=async url=>page.evaluate(url=>window.trainingNavigate(url),url);
   // Request admission is not response consumption: the hook deliberately drops
   // overlapping focus refreshes. Drain the actual Axios promise/microtasks,
   // while leaving the separately held catalogue/hash requests untouched.
   const inboxIdle=async()=>{await expect.poll(()=>page.evaluate(()=>window.trainingInboxPending)).toBe(0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))};
   const sync=async()=>{await inboxIdle();const before=inboxReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>inboxReads).toBeGreaterThan(before);await inboxIdle()};
   const pauseHash=async()=>page.evaluate(()=>{window.trainingHoldHash=true});
   const releaseHash=async()=>page.evaluate(()=>{window.trainingHoldHash=false;window.trainingHashWaiters.splice(0).forEach(resolve=>resolve())});
   const settle=async()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.goto(base+target('module','first'));await expect(page.getByRole('dialog')).toContainText('旧版正文');
   // New item notice arrives first; the old open material remains visible while refresh hangs.
   book=catalogue('r2','新版正文');notices=[notice(book,'first-r2','module','first')];holdLibrary=true;await sync();await expect.poll(()=>delayed.length).toBeGreaterThan(0);await settle();
   await expect(page.getByRole('dialog')).toContainText('旧版正文');assert.deepEqual(readRequests,[]);assert.equal(notices[0].read,false);
   await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))});
   await page.screenshot({path:path.join(output,'notice-before-material-remains-unread.png'),fullPage:true});
   fs.writeFileSync(path.join(output,'notice-before-material-remains-unread.json'),JSON.stringify({scenario:'new notice before matching material',renderedText:await page.getByRole('dialog').innerText(),renderedFingerprint:trainingContentFingerprint('module',course('first','旧版正文')),noticeFingerprint:notices[0].trainingUpdate.fingerprint,noticeRead:notices[0].read,readRequests:clone(readRequests)},null,2));
   holdLibrary=false;await releaseLibrary();await expect(page.getByRole('dialog')).toContainText('新版正文');await expect.poll(()=>readRequests.some(r=>r.id==='first-r2')).toBe(true);
   console.log('PASS',app,'new reminder before delayed material cannot acknowledge the old open course');
   // An unchanged course remains readable even if its reminder predates an unrelated catalogue revision.
   notices=[notice(book,'stable-old-revision','module','second')];book=catalogue('r3','其他课程更新');await nav(target('module','second'));await sync();await expect(page.getByRole('dialog')).toContainText('稳定正文');await expect.poll(()=>readRequests.some(r=>r.id==='stable-old-revision')).toBe(true);
   console.log('PASS',app,'stable item is acknowledged across an unrelated catalogue revision');
   // A newer checklist notice must not read the old checklist while the content request is held.
   await nav(target('checklist','opening'));await expect(page.getByText('其他课程更新',{exact:true})).toBeVisible();book=catalogue('r4','清单新版正文');notices=[notice(book,'check-r4','checklist','opening')];holdLibrary=true;await sync();await expect.poll(()=>delayed.length).toBeGreaterThan(0);await settle();assert.equal(readRequests.some(r=>r.id==='check-r4'),false);
   holdLibrary=false;await releaseLibrary();await expect(page.getByText('清单新版正文',{exact:true})).toBeVisible();await expect.poll(()=>readRequests.some(r=>r.id==='check-r4')).toBe(true);
   console.log('PASS',app,'delayed checklist content is acknowledged only after the matching item is rendered');
   // Late old catalogue response cannot read a newer reminder, including on same-page query changes.
   book=catalogue('r5','过时响应正文');holdLibrary=true;await sync();await expect.poll(()=>delayed.length).toBeGreaterThan(0);
   book=catalogue('r6','最终课程正文');notices=[notice(book,'first-r6','module','first')];await sync();await nav(target('module','first','first-r6'));await settle();assert.equal(readRequests.some(r=>r.id==='first-r6'),false);
   holdLibrary=false;await releaseLibrary();await expect(page.getByRole('dialog')).toContainText('过时响应正文');await settle();assert.equal(readRequests.some(r=>r.id==='first-r6'),false);
   await sync();await expect(page.getByRole('dialog')).toContainText('最终课程正文');await expect.poll(()=>readRequests.some(r=>r.id==='first-r6')).toBe(true);
   console.log('PASS',app,'an older pending response and same-page query cannot acknowledge a later version');
   // A failed refresh cannot acknowledge a newly announced version using the former item.
   book=catalogue('r7','失败后恢复正文');notices=[notice(book,'failed-refresh-version','module','first')];failLibrary=true;await sync();await expect(page.getByRole('alert')).toBeVisible();await settle();assert.equal(readRequests.some(r=>r.id==='failed-refresh-version'),false);
   failLibrary=false;await sync();await expect(page.getByRole('dialog')).toContainText('失败后恢复正文');await expect.poll(()=>readRequests.some(r=>r.id==='failed-refresh-version')).toBe(true);
   console.log('PASS',app,'failed catalogue refresh keeps the newer reminder unread until matching content recovers');
   // Employee presentation normalizes known legacy copy; the bound raw source is still the digest input.
   book=catalogue('r8','转换测试');book.modules[0].sections[0].points[0].zh='当前版本未证实支持分层扣料，员工应怎样做？';notices=[notice(book,'bound-raw-source','module','first')];await sync();await expect(page.getByRole('dialog')).toContainText(staff?'登记原料出库时，怎样避免重复扣料？':'当前版本未证实支持分层扣料，员工应怎样做？');await expect.poll(()=>readRequests.some(r=>r.id==='bound-raw-source')).toBe(true);
   console.log('PASS',app,'display normalization remains bound to the exact raw source item fingerprint');
   // Hash completion is itself asynchronous; leaving that actual item invalidates its proof.
   notices=[];await sync();await nav(target('module','first'));await pauseHash();notices=[notice(book,'switch-during-hash','module','first')];await sync();await expect.poll(()=>page.evaluate(()=>window.trainingHashWaiters.length)).toBeGreaterThan(0);
   await nav(target('module','second'));await expect(page.getByRole('dialog')).toContainText('稳定正文');await releaseHash();await settle();assert.equal(readRequests.some(r=>r.id==='switch-during-hash'),false);
   console.log('PASS',app,'same-page item switch invalidates an in-flight content hash');
   // Missing fingerprint is never treated as a match; no revision-only fallback is permitted.
   const missing=notice(book,'missing-fingerprint','module','second');delete missing.trainingUpdate.fingerprint;notices=[missing];await sync();await settle();assert.equal(readRequests.some(r=>r.id==='missing-fingerprint'),false);
   // Identity change invalidates a pending hash; late catalogue replies cannot resurrect the previous view.
   notices=[];await sync();await nav(target('module','first'));await pauseHash();notices=[notice(book,'old-account-hash','module','first')];await sync();await expect.poll(()=>page.evaluate(()=>window.trainingHashWaiters.length)).toBeGreaterThan(0);
   holdLibrary=true;await sync();await expect.poll(()=>delayed.length).toBeGreaterThan(0);await page.evaluate(()=>window.switchTrainingAccount());await releaseHash();holdLibrary=false;await releaseLibrary();await settle();assert.equal(readRequests.some(r=>r.id==='old-account-hash'),false);assert(readRequests.every(r=>r.actor==='Bearer synthetic-a'));assert.deepEqual(otherWrites,[]);assert.deepEqual(errors,[]);
   console.log('PASS',app,'missing proof, identity switch, and late replies never mark another item/account or complete learning');
  }finally{holdLibrary=false;await releaseLibrary();if(context)await context.close();if(server)await server.close();fs.rmSync(entry,{force:true})}
 }
 }finally{if(browser)await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
