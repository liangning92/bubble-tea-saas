const {createServer} = require('vite');
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const workspace=process.cwd();
const output=__dirname;
const fixtureTime='2026-10-20T12:00:00.000Z';
const baseItems=[
 {id:'chat-1',kind:'chat',event:'chat',title:'Morning shift group',url:'/team?channel=room-1',adminUrl:'/staff/communication?channel=room-1',read:false,objectId:'room-1',createdAt:fixtureTime},
 {id:'training-1',kind:'training_update',event:'training',title:'New tea brewing guide',url:'/training/library?item=guide-1',adminUrl:'/staff/training/library?item=guide-1',read:false,createdAt:fixtureTime},
 {id:'approval-1',kind:'approval_request',event:'approval',title:'Refund request awaiting review',url:'/approvals?requestId=request-1',read:false,pending:true,status:'pending',objectId:'request-1',createdAt:fixtureTime},
 {id:'result-1',kind:'approval_result',event:'result',title:'Your request was approved',url:'/inbox?notice=result-1',read:false,status:'approved',objectId:'result-object',createdAt:fixtureTime}
];
const report=[];
let browser;
(async()=>{
const servers=[];
try{
 browser=await chromium.launch({headless:true});
 for(const app of ['client-staff','client-admin']){
  const config=(await import(require('node:url').pathToFileURL(path.join(workspace,app,'tailwind.config.js')).href)).default; config.content=config.content.map(file=>path.resolve(workspace,app,file));
  const server=await createServer({root:path.join(workspace,app),configFile:path.join(workspace,app,'vite.config.ts'),css:{postcss:{plugins:[require('tailwindcss')(config),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'}); await server.listen();servers.push(server);
  const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-GB'});
  const errors=[], posts=[], requests=[];let items=structuredClone(baseItems),added=false,hold=false, held=[],malformed=true;
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  const user=app==='client-staff'?{id:'fixture-user',phone:'0000',name:'Fixture member',role:'admin',storeId:'fixture-store',staffId:'fixture-staff',position:'Manager'}:{id:'fixture-user',phone:'0000',role:'admin',managementAccess:true,storeId:'fixture-store',staff:{id:'fixture-staff',name:'Fixture manager',position:'Manager'}};
  await context.addInitScript(({user})=>{try{sessionStorage.setItem(user.staffId?'staff-auth-storage':'auth-storage',JSON.stringify({state:{user,token:'fixture-session',isAuthenticated:true},version:0}));localStorage.setItem('bubble-tea-language','en');localStorage.setItem('employee-language','en');}catch{}},{user});
  await context.route('**/api/**',async route=>{
   const request=route.request(),u=new URL(request.url()),pathname=u.pathname.replace(/^\/api/,'');requests.push({method:request.method(),pathname});
   const send=data=>route.fulfill({json:{code:200,data}});
   if(pathname==='/staff-work/my/inbox'){
    assert.equal(request.headers()['x-client-app'],app==='client-staff'?'employee':'admin','Personal inbox uses the actual app channel');
    if(malformed)return send([]);
    const second=request.headers().authorization?.includes('fixture-session-2');
    const data=second?{items:[],chats:[],counts:{unread:0,chatUnread:0,trainingUnread:0,approvalPending:0}}:{items:structuredClone(items),chats:[{id:'room-1',title:'Morning shift group',unread:3,url:'/team?channel=room-1',preview:{text:'<img src=x onerror="window.fixtureXss=1"> Please check the stock.',authorName:'Maya',createdAt:fixtureTime}}],counts:{unread:items.filter(i=>!i.read).length,chatUnread:3,trainingUnread:1,approvalPending:1}};
    if(hold&&!second){held.push(()=>send(data));return;}
    return send(data);
   }
   if(pathname.match(/^\/staff-work\/my\/inbox\/[^/]+\/read$/)) {assert.equal(request.headers()['x-client-app'],app==='client-staff'?'employee':'admin','Personal read uses the actual app channel');const id=decodeURIComponent(pathname.split('/').at(-2));posts.push(id);items=items.map(i=>i.id===id?{...i,read:true}:i);return send({read:true});}
   if(pathname==='/staff-permissions/approvals')return send([{id:'request-1',action:'orders.refund',targetId:'order-1',payload:JSON.stringify({amount:10000,note:'Incorrect drink'}),status:'pending',applicantId:'other-user',createdAt:fixtureTime}]);
   if(pathname==='/staff-permissions/stores')return send([{id:'fixture-store',name:'Fixture store'}]);
   if(pathname==='/team/channels'||pathname==='/team/admin/channels')return send([{id:'room-1',title:'Morning shift group',kind:'group',ownerId:'fixture-staff',lastSeq:1,version:1,archived:false,members:[{staffId:'fixture-staff',fromSeq:0}],member:true,canEdit:true,canAudit:false,unread:3,round:null,preview:{text:'<script>window.fixtureXss=1</script> Hello from Maya',authorName:'Maya',createdAt:fixtureTime}}]);
   if(pathname==='/team/directory')return send([{id:'fixture-staff',name:'Fixture member'}]);
   if(pathname==='/team/capabilities')return send({manage:true,audit:false});
   if(pathname.includes('/messages')) {await new Promise(r=>setTimeout(r,300));return send({channel:{id:'room-1',member:true,kind:'group',canEdit:true,archived:false},messages:[{id:'m1',requestId:'msg1',seq:1,authorId:'other',authorName:'Maya',text:'Hello from Maya',files:[],createdAt:fixtureTime},{id:'ai-integrated',requestId:'ai-integrated',seq:2,authorId:'other-ai',authorName:'Authorized AI operator',text:'Please confirm the existing work task details.',files:[],createdAt:fixtureTime,ai:{provider:'minimax',model:'MiniMax-M3.1-Flash',authorizedBy:'fixture-operator',routineAuthorization:{jobId:'source-1',sourceSeq:1,policyHash:'synthetic',policyVersion:1,epoch:1,replyCode:'clarify'}}}],cursor:2,hasMore:false});}
   if(pathname.endsWith('/read')) {posts.push('team-read');return send({read:true});}
   if(pathname.includes('/settings')) return send({timezone:'Asia/Jakarta',dateFormat:'dd/MM/yyyy',timeFormat:'24h'});
   if(pathname==='/staff-permissions/me')return send({managementAccess:true,role:null});
   if(pathname.endsWith('/dashboard'))return send({});
   return send([]);
  });
  const page=await context.newPage();await page.goto(url+'/inbox');
  await page.locator('.awareness-error').waitFor();
  assert.equal(await page.locator('.awareness-inbox').count(),1,'Malformed successful response cannot crash the app shell');
  assert.equal(await page.locator('.awareness-item').count(),0);
  await page.screenshot({path:path.join(output,`${app}-malformed-response.png`),fullPage:true});
  malformed=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('.awareness-item').first().waitFor();
  assert.equal(await page.locator('.awareness-item').count(),4);
  assert.equal(await page.evaluate(()=>window.fixtureXss),undefined);
  assert.equal(await page.locator('.awareness-preview img').count(),0);
  assert.equal(posts.length,0,'Opening inbox must not mark any item read');
  malformed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.awareness-error').waitFor();
  assert.equal(await page.locator('.awareness-item').count(),4,'Malformed refresh preserves the last valid personal response');
  malformed=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>!document.querySelector('.awareness-error'));
  for(const width of [390,768,1365]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.waitForTimeout(400);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'No horizontal page overflow');
   await page.screenshot({path:path.join(output,`${app}-${width}.png`),fullPage:true});
  }
  await page.locator('#awareness-notice-approval-1 button').click();
  await page.waitForURL('**/approvals?requestId=request-1');
  assert(posts.includes('approval-1'));
  const approvalSelector=app==='client-staff'?'#staff-approval-request-1':'article';
  await page.locator(approvalSelector).first().waitFor();
  await page.goto(url+'/inbox');await page.locator('#awareness-notice-approval-1').waitFor();
  const approval=await page.locator('#awareness-notice-approval-1').innerText();assert(approval.includes('Read'));assert(approval.includes('Approvals pending'));
  await page.screenshot({path:path.join(output,`${app}-read-still-pending.png`),fullPage:true});
  await page.locator('#awareness-notice-training-1 button').click();
  await page.waitForURL(app==='client-staff'?'**/training/library?item=guide-1':'**/staff/training/library?item=guide-1');
  assert(!posts.includes('training-1'));
  await page.goto(url+(app==='client-staff'?'/team':'/staff/communication'));
  await page.locator('.team-channel-preview').first().waitFor();
  assert.equal(posts.filter(id=>id==='team-read').length,0,'Conversation list does not mark chat read');
  assert.equal(await page.locator('.team-channel-preview script').count(),0);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
  await page.screenshot({path:path.join(output,`${app}-chat-preview-390.png`),fullPage:true});
  await page.goto(url+'/inbox');await page.locator('#awareness-notice-chat-1').waitFor();
  const before=posts.length; await page.locator('#awareness-notice-chat-1 button').click();
  await page.waitForURL(app==='client-staff'?'**/team?channel=room-1':'**/staff/communication?channel=room-1');
  assert(!posts.includes('chat-1'));
  await page.getByText('Hello from Maya',{exact:true}).waitFor();
  await page.getByText('Please confirm the existing work task details.',{exact:true}).waitFor();
  await page.locator('#team-message-2 .team-ai-label').filter({hasText:'AI assisted · automatically sent under ongoing consent · MiniMax-M3.1-Flash'}).waitFor();
  await page.screenshot({path:path.join(output,`${app}-integrated-ai-reply-390.png`),fullPage:true});
  await page.waitForFunction(()=>!!document.querySelector('[data-testid="team-communication"]'));
  await new Promise(r=>setTimeout(r,800));
  assert(posts.slice(before).includes('team-read'),'Only actual opened conversation marks its messages read');
  await page.goto(url+'/inbox?notice=result-1');await page.locator('#awareness-notice-result-1.awareness-target').waitFor();
  assert((await page.locator('#awareness-notice-result-1').innerText()).includes('Approved'));
  await page.waitForFunction(()=>document.querySelector('#awareness-notice-result-1')?.innerText.includes('Read'));
  added=true;items.unshift({id:'reminder-2',event:'business',kind:'business_reminder',title:'Foreground reminder arrived',url:'/inbox?notice=reminder-2',read:false,createdAt:fixtureTime});
  await page.getByText('Foreground reminder arrived').waitFor({timeout:7000});
  const hiddenBefore=requests.filter(r=>r.pathname==='/staff-work/my/inbox').length;
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
  await page.waitForTimeout(5200);
  assert.equal(requests.filter(r=>r.pathname==='/staff-work/my/inbox').length,hiddenBefore,'Hidden page does not poll inbox');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});window.dispatchEvent(new Event('focus'));});
  await page.waitForTimeout(150);
  assert(requests.filter(r=>r.pathname==='/staff-work/my/inbox').length>hiddenBefore,'Focus resumes inbox polling');
  hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await new Promise(r=>setTimeout(r,150));
  assert.equal(held.length,1);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('employee-inbox-updated'));});
  await page.waitForTimeout(100); assert.equal(held.length,1,'Concurrent focus/events cannot overlap inbox requests');
  // Exercise the real Axios deadline: a hung request must release single-flight
  // and allow a subsequent focus refresh on both clients.
  await page.locator('.awareness-error').waitFor({timeout:18000});
  const timedOutCount=requests.filter(r=>r.pathname==='/staff-work/my/inbox').length;
  hold=false;await Promise.all(held.map(fn=>fn().catch(()=>{})));held=[];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>!document.querySelector('.awareness-error')&&document.querySelectorAll('.awareness-item').length===5);
  assert(requests.filter(r=>r.pathname==='/staff-work/my/inbox').length>timedOutCount,'Timed-out single-flight must resume');
  hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);assert.equal(held.length,1);
  await page.evaluate(async()=>{const {useAuthStore}=await import('/src/stores/auth.ts');const old=useAuthStore.getState().user;useAuthStore.getState().login('fixture-session-2',{...old,id:'fixture-user-2',storeId:'fixture-store-2'});});
  await page.waitForFunction(()=>document.querySelectorAll('.awareness-item').length===0);
  await Promise.all(held.map(fn=>fn().catch(()=>{}))); held=[];
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await page.locator('.awareness-item').count(),0);
  await page.screenshot({path:path.join(output,`${app}-store-switch-empty.png`),fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
report.push({app,widths:[390,768,1365],malformedResponseContainedAndRecovers:true,malformedRefreshPreservesValidData:true,openingInboxDoesNotRead:true,approvalReadRemainsPending:true,trainingNotReadByInbox:true,chatListDoesNotRead:true,chatReadAfterMessages:true,integratedAutomaticReplyBodyAndProvenanceVisible:true,inboxResultStatus:true,foregroundPollWithoutPush:added,crossIdentityAbortAndClear:true,safePlainTextPreview:true,hiddenPollPaused:true,focusResumes:true,inFlightProtected:true,hungRequestTimesOutAndRecovers:true,browserErrors:errors,posts,requestCount:requests.length});
  await context.close();
 }
 fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await Promise.all(servers.map(s=>s.close()));}
})().catch(error=>{console.error(error);process.exitCode=1});
