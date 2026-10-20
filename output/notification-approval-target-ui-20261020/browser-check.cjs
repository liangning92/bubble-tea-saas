const {createServer}=require('vite');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const output=__dirname,workspace=process.cwd();
const user={id:'fixture-user',phone:'0000',name:'Fixture member',role:'admin',storeId:'fixture-store',staffId:'fixture-staff',position:'Manager'};
const row=(id)=>({id,action:'members.balance',targetId:id,payload:JSON.stringify({amount:1000,note:`Approval details for ${id}`}),status:'pending',applicantId:'other-user',createdAt:'2026-10-20T12:00:00Z'});
(async()=>{let browser,server;try{
 const config=(await import(require('node:url').pathToFileURL(path.join(workspace,'client-staff/tailwind.config.js')).href)).default;config.content=config.content.map(file=>path.resolve(workspace,'client-staff',file));
 server=await createServer({root:path.join(workspace,'client-staff'),configFile:path.join(workspace,'client-staff/vite.config.ts'),css:{postcss:{plugins:[require('tailwindcss')(config),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-GB'});
 await context.addInitScript(({user})=>{try{sessionStorage.setItem('staff-auth-storage',JSON.stringify({state:{user,token:'fixture-session',isAuthenticated:true},version:0}));localStorage.setItem('bubble-tea-language','en')}catch{}},{user});
 let held,release,holdNative=false;const requested=[],posts=[],errors=[];let pageLoads=0;
 const native=Array.from({length:100},(_,i)=>row(`native-${i}`));
 await context.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace(/^\/api/,'');const send=(data,status=200)=>route.fulfill({status,json:{code:status,data,message:status===200?'OK':`FIXTURE_${status}`}});
  if(req.method()!=='GET'){if(p.startsWith('/staff-permissions/approvals'))posts.push(p);return send({});}
  if(p==='/staff-permissions/approvals') {if(holdNative){await new Promise(r=>{release=r})}return send(native);}
  if(p.startsWith('/staff-permissions/approvals/')){
   const id=decodeURIComponent(p.split('/').at(-1));requested.push(id);
   if(id==='late-old') {await new Promise(r=>{held=r});return send(row(id));}
   if(id==='forbidden')return send(null,403);
   if(id==='not-found')return send(null,404);
   if(id==='unauthorized')return send(null,401);
   return send(row(id));
  }
  if(p==='/staff-work/my/inbox')return send({items:[],chats:[],counts:{unread:0,chatUnread:0,trainingUnread:0,approvalPending:0}});
  return send([]);
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('domcontentloaded',()=>pageLoads++);
 await page.goto(base+'/approvals?noticeObject=target-a');await page.locator('#staff-approval-target-a').waitFor();
 assert.equal(await page.locator('article').count(),101);assert.equal(await page.locator('#staff-approval-target-a').count(),1);assert(await page.locator('#staff-approval-target-a').evaluate(el=>el.classList.contains('awareness-target')));assert((await page.locator('#staff-approval-target-a').innerText()).includes('Pending'));
 await page.screenshot({path:path.join(output,'beyond-latest-100.png')});
 const navigate=async id=>page.evaluate(id=>{history.pushState({},'',`/approvals?requestId=${encodeURIComponent(id)}`);window.dispatchEvent(new PopStateEvent('popstate'));},id);
 holdNative=true;await navigate('target-b');await page.waitForFunction(()=>document.querySelectorAll('article').length===0);
 assert.equal(await page.getByText('Approval details for target-a',{exact:false}).count(),0);holdNative=false;release();await page.locator('#staff-approval-target-b').waitFor();assert.equal(await page.locator('#staff-approval-target-a').count(),0);assert.equal(await page.locator('article').count(),101);
 await page.screenshot({path:path.join(output,'same-page-target-b.png')});
 const before=requested.length;await navigate('native-5');await page.locator('#staff-approval-native-5.awareness-target').waitFor();assert.equal(await page.locator('article').count(),100);assert.equal(requested.length,before,'Native list target must not trigger unnecessary detail load');
 await navigate('late-old');await page.waitForFunction(()=>document.querySelectorAll('article').length===0);await page.waitForTimeout(150);assert(held);
 await navigate('target-c');await page.locator('#staff-approval-target-c').waitFor();held();await page.waitForTimeout(200);assert.equal(await page.locator('#staff-approval-late-old').count(),0);assert.equal(await page.locator('#staff-approval-target-c').count(),1);
 for(const id of ['forbidden','not-found']){await navigate(id);await page.getByRole('alert').waitFor();assert.equal(await page.locator('article').count(),0);assert.equal(await page.getByText('Approval details for target-c',{exact:false}).count(),0);await page.screenshot({path:path.join(output,`${id}-cleared.png`)});await navigate('target-c');await page.locator('#staff-approval-target-c').waitFor();}
 await navigate('unauthorized');await page.waitForURL('**/login');assert.equal(await page.locator('article').count(),0);assert.equal(await page.getByText('Approval details for target-c',{exact:false}).count(),0);
 assert.equal(posts.length,0,'Navigation cannot approve, reject, or clear pending');assert.equal(errors.length,0,errors.join('\n'));
 const report={noticeObjectSupported:true,beyondLatest100:true,mergedAndDeduplicated:true,nativeListAvoidsDetail:true,samePageRequestIdSwitch:true,clearedWhileNewTargetLoading:true,latePriorResponseIgnored:true,forbidden403Clears:true,missing404Clears:true,unauthorized401Clears:true,pendingRetained:true,noApprovalMutation:posts.length===0,sameDocumentNavigation:pageLoads===1,browserErrors:errors,detailRequests:requested};fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await context.close();
}finally{await browser?.close();await server?.close()}})().catch(error=>{console.error(error);process.exitCode=1});
