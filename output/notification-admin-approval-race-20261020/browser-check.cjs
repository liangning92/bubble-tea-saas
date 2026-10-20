const {createServer}=require('vite');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workspace=process.cwd(),output=__dirname;
const approvalPath=path.join(workspace,'client-admin/src/pages/StaffApprovalPage.tsx');
const original=fs.readFileSync(path.join(output,'before-StaffApprovalPage.tsx.txt'),'utf8');
const actor=(id='actor-one',storeId='store-one')=>({id,phone:'0000',role:'admin',managementAccess:true,storeId,staff:{id:`staff-${id}`,name:id,position:'Manager'}});
const row=(id,tag,store)=>({id,action:'members.balance',targetId:id,payload:JSON.stringify({amount:1000,note:`${id} / ${tag} / ${store}`}),status:'pending',applicantId:'other-user',applicantName:'Fixture applicant',createdAt:'2026-10-20T12:00:00Z'});
const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Fixture request did not arrive')};
(async()=>{let browser;const reports=[];try{
 browser=await chromium.launch({headless:true});
 for(const mode of ['before','after']){
  let server,context;const holds=[];
  try{
   const config=(await import(require('node:url').pathToFileURL(path.join(workspace,'client-admin/tailwind.config.js')).href)).default;config.content=config.content.map(file=>path.resolve(workspace,'client-admin',file));
   const plugins=mode==='before'?[{name:'baseline-page-only',enforce:'pre',transform(code,id){if(id.split('?')[0]===approvalPath)return{code:original,map:null}}}]:[];
   server=await createServer({root:path.join(workspace,'client-admin'),configFile:path.join(workspace,'client-admin/vite.config.ts'),plugins,css:{postcss:{plugins:[require('tailwindcss')(config),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
   context=await browser.newContext({viewport:{width:768,height:1000},locale:'en-GB'});
   await context.addInitScript(({user})=>{try{if(!sessionStorage.getItem('fixture-initialized')){sessionStorage.setItem('fixture-initialized','1');sessionStorage.setItem('auth-storage',JSON.stringify({state:{user,token:'session-one',isAuthenticated:true},version:0}));localStorage.setItem('bubble-tea-language','en')}}catch{}},{user:actor()});
   const detailRequests=[],approvalWrites=[],errors=[];let gateDetail=null,gateList=false;
   const hold=async(label)=>{let release;const promise=new Promise(resolve=>release=resolve);const entry={label,release};holds.push(entry);await promise;};
   await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^\/api/,''),store=url.searchParams.get('storeId')||'store-one',tag=(req.headers().authorization||'').replace('Bearer ','');
    const send=(data,status=200)=>route.fulfill({status,json:{code:status,data,message:status===200?'OK':`FIXTURE_${status}`}}).catch(()=>{});
    if(req.method()!=='GET'){if(p.startsWith('/staff-permissions/approvals')||p==='/staff-permissions/approval-pin')approvalWrites.push(p);return send({});}
    if(p==='/staff-permissions/stores')return send(['store-one','store-two','store-three'].map(id=>({id,name:id})));
    if(p==='/staff-permissions/approvals'){if(gateList){gateList=false;await hold('list')}return send(Array.from({length:100},(_,i)=>row(`native-${i}`,tag,store)));}
    if(p.startsWith('/staff-permissions/approvals/')){
     const id=decodeURIComponent(p.split('/').at(-1));detailRequests.push({id,tag,store});
     if(id==='A'||gateDetail?.({id,tag,store})){gateDetail=null;await hold(id);}
     const status=({forbidden:403,missing:404,unauthorized:401})[id];return send(status?null:row(id,tag,store),status||200);
    }
    if(p==='/staff-work/my/inbox')return send({items:[],chats:[],counts:{unread:0,chatUnread:0,trainingUnread:0,approvalPending:0}});
    if(p.includes('/settings'))return send({timezone:'Asia/Jakarta',dateFormat:'dd/MM/yyyy',timeFormat:'24h'});
    return send([]);
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
   const target=id=>page.locator(`article[data-notice-object="${id}"]`);
   const navigate=id=>page.evaluate(id=>{history.pushState({},'',`/approvals?noticeObject=${encodeURIComponent(id)}`);window.dispatchEvent(new PopStateEvent('popstate'));},id);
   const release=label=>{const entry=holds.find(item=>item.label===label);assert(entry,`Expected held ${label}`);entry.release();holds.splice(holds.indexOf(entry),1)};
   await page.goto(origin+'/approvals?noticeObject=A');await waitFor(()=>holds.some(entry=>entry.label==='A'));
   await navigate('B');await target('B').waitFor();assert.equal(await page.locator('article').count(),101);
   release('A');await page.waitForTimeout(300);
   const staleA=await target('A').count(),currentB=await target('B').count();
   if(mode==='before'){
    assert.equal(staleA,1,'Original page must reproduce late A overriding B');assert.equal(currentB,0);assert((await target('A').innerText()).includes('Pending'));assert.equal(await target('A').getByRole('button',{name:'Approve and execute',exact:true}).count(),1);
    await page.screenshot({path:path.join(output,'before-url-B-shows-approvable-A.png'),fullPage:false});reports.push({mode,reproduced:true,url:new URL(page.url()).pathname+new URL(page.url()).search,lateAVisible:true,BMissing:true,staleApprovalButtonVisible:true,approvalWrites,browserErrors:errors});
   }else{
    assert.equal(staleA,0);assert.equal(currentB,1);assert((await target('B').innerText()).includes('Pending'));await page.screenshot({path:path.join(output,'after-url-B-keeps-B.png')});
    gateList=true;await navigate('C');await waitFor(()=>holds.some(entry=>entry.label==='list'));assert.equal(await page.locator('article').count(),0);assert.equal(await page.getByRole('button',{name:'Approve and execute',exact:true}).count(),0);release('list');await target('C').waitFor();
    const beforeNative=detailRequests.length;await navigate('native-7');await page.waitForFunction(()=>document.querySelectorAll('article').length===100&&!document.querySelector('article[data-notice-object="C"]'));assert.equal(await page.locator('article').count(),100);assert.equal(detailRequests.length,beforeNative);
    gateDetail=({id,tag})=>id==='identity-target'&&tag==='session-one';await navigate('identity-target');await waitFor(()=>holds.some(entry=>entry.label==='identity-target'));
    await page.evaluate(async user=>{const{useAuthStore}=await import('/src/stores/auth.ts');useAuthStore.getState().login('session-two',user)},actor('actor-two','store-two'));
    await target('identity-target').filter({hasText:'session-two / store-two'}).waitFor();release('identity-target');await page.waitForTimeout(200);assert.equal(await page.getByText('identity-target / session-one / store-one',{exact:false}).count(),0);assert.equal(await target('identity-target').count(),1);
    gateDetail=({id,store})=>id==='store-target'&&store==='store-two';await navigate('store-target');await waitFor(()=>holds.some(entry=>entry.label==='store-target'));
    const section=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Approval center',exact:true})});await section.getByRole('combobox').first().selectOption('store-one');await target('store-target').filter({hasText:'session-two / store-one'}).waitFor();release('store-target');await page.waitForTimeout(200);assert.equal(await page.getByText('store-target / session-two / store-two',{exact:false}).count(),0);
    gateDetail=({id,tag})=>id==='session-target'&&tag==='session-two';await navigate('session-target');await waitFor(()=>holds.some(entry=>entry.label==='session-target'));
    await page.evaluate(async()=>{const{useAuthStore}=await import('/src/stores/auth.ts');useAuthStore.getState().login('session-three',useAuthStore.getState().user)});await target('session-target').filter({hasText:'session-three'}).waitFor();release('session-target');await page.waitForTimeout(200);assert.equal(await page.getByText('session-target / session-two',{exact:false}).count(),0);
    await page.screenshot({path:path.join(output,'after-identity-store-session-switch.png')});
    gateDetail=({id})=>id==='late-before-error';await navigate('late-before-error');await waitFor(()=>holds.some(entry=>entry.label==='late-before-error'));await navigate('forbidden');await page.getByRole('alert').waitFor();release('late-before-error');await page.waitForTimeout(200);assert.equal(await page.locator('article').count(),0);
    for(const id of ['forbidden','missing']){await navigate(id);await page.getByRole('alert').waitFor();assert.equal(await page.locator('article').count(),0);assert.equal(await page.getByRole('button',{name:'Approve and execute',exact:true}).count(),0);await page.screenshot({path:path.join(output,`after-${id}-cleared.png`)});await navigate('recovery');await target('recovery').waitFor();}
    await navigate('unauthorized');await page.waitForURL('**/login');assert.equal(await page.locator('article').count(),0);assert.equal(await page.getByRole('button',{name:'Approve and execute',exact:true}).count(),0);
    assert.equal(errors.length,0,errors.join('\n'));assert.equal(approvalWrites.length,0);
    reports.push({mode,lateARejected:true,BRemainsAtURLB:true,beyondLatest100:true,deduplicated:true,nativeTargetNoExtraGET:true,samePageQueryClearsImmediately:true,identitySwitchRejectsOldResponse:true,selectedStoreSwitchRejectsOldResponse:true,sessionChangeRejectsOldResponse:true,lateOldResponseCannotRestoreAfterError:true,forbidden403Clears:true,missing404Clears:true,unauthorized401Clears:true,pendingRetained:true,noApprovalWrites:true,browserErrors:errors,detailRequests});
   }
  }finally{for(const entry of holds)entry.release();await context?.close();await server?.close()}
 }
 fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser?.close()}})().catch(error=>{console.error(error);process.exitCode=1});
