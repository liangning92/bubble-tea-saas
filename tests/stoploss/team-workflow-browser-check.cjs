/* Actual built admin routes. Every API and identity is synthetic; no model transport. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),{chromium}=require(root+'/node_modules/playwright'),express=require(root+'/server/node_modules/express');
const out=root+'/output/team-workflow-approval-20261020/browser';fs.mkdirSync(out,{recursive:true});
const channelId='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002';
const user={id:'synthetic-admin',role:'admin',storeId:'synthetic-store',managementAccess:true,staff:{id:'s-admin',name:'Synthetic Owner',position:'admin'}};
const channel={id:channelId,title:'Synthetic pilot channel',kind:'group',ownerId:'s-admin',version:1,lastSeq:1,archived:false,member:true,canEdit:true,canAudit:false,unread:0,round:null,members:[{staffId:'s-admin',fromSeq:1},{staffId:'s-alice',fromSeq:1},{staffId:'s-bob',fromSeq:1}]};
const directory=[{id:'s-admin',name:'Synthetic Owner'},{id:'s-alice',name:'Synthetic Alice'},{id:'s-bob',name:'Synthetic Bob'}];
const initialJob=()=>({id:'00000000-0000-4000-8000-000000000101',sourceSeq:1,sourceAuthorId:'s-alice',version:2,attempt:1,status:'awaiting_approval',updatedAt:new Date().toISOString(),billingStatus:'usage_recorded',result:{replyText:'Baik, mohon kirim langkah pemeriksaan.',summaryZh:'员工陈述需要培训，尚未核实。#1',suggestedTask:{category:'training',text:'合成设备检查培训',evidenceRequired:'本人检查步骤文字',acceptanceCriteria:'主管核对所有步骤'},exceptions:[]}});
let job=initialJob(),tasks=[],policy={version:0,enabled:false,paused:true,employeeIds:[],automaticSend:false};
let settings={version:4,checkRevision:0,enabled:true,keyConfigured:true,provider:'minimax',region:'cn',model:'MiniMax-M3',monthlyBudgetUsd:null,inputPerMillionUsd:.3,outputPerMillionUsd:1.2,month:'2026-10',estimatedMonthUsd:0,connection:null};
let loseResponse=false,losePolicyResponse=false,gatewayFail=false,failRead=false,secondPage=false,postCount=0,replyCount=0,taskCount=0;
const passed=[],pageErrors=[],requests=[],external=[],receipts=new Map(),policyWrites=[];
const app=express();app.use(express.json());
app.all('/api/*',(req,res)=>{
 const ok=data=>res.json({code:200,data}),role=req.headers.authorization?.includes('manager')?'manager':'admin';
 if(req.path==='/api/auth/me')return ok({...user,role});
 if(req.path==='/api/staff-work/my/inbox')return ok({items:[],chats:[],counts:{unread:0,chatUnread:0,trainingUnread:0,approvalPending:0}});
 if(req.path==='/api/team/ai/settings')return ok(settings);
 if(req.path==='/api/ai/permissions')return ok({executionEnabled:false});
 if(['/api/team/admin/channels','/api/team/channels'].includes(req.path))return ok([channel,{...channel,id:otherId,title:'Other channel',member:false}]);
 if(req.path==='/api/team/directory')return ok(directory);
 if(req.path==='/api/team/capabilities')return ok({manage:true,audit:false});
 if(req.path.endsWith('/messages'))return ok({channel,canEdit:true,messages:[{id:'source',requestId:'source',seq:1,authorId:'s-alice',authorName:'Synthetic Alice',text:'Saya perlu pelatihan.',files:[],createdAt:new Date().toISOString()}],cursor:1,hasMore:false,receipts:[]});
 if(req.path.endsWith('/tasks'))return ok(tasks);
 if(req.path.endsWith('/minutes')||req.path.endsWith('/operations'))return ok([]);
 if(req.path.endsWith('/workflow/policy')){
  if(req.method==='GET')return ok(policy);
  policyWrites.push(req.body);if(req.body.enabled&&!req.body.paused&&(req.body.expectedAiConfigVersion!==settings.version||req.body.expectedAiCheckRevision!==settings.connection?.checkRevision||settings.connection?.status!=='ready'))return res.status(409).json({message:'TEAM_WORKFLOW_CONNECTION_REQUIRED'});if(req.body.expectedVersion!==policy.version)return res.status(409).json({message:'TEAM_VERSION_CONFLICT'});
  policy={...req.body,operatorStaffId:'s-admin',version:policy.version+1};if(losePolicyResponse){losePolicyResponse=false;return res.status(504).json({message:'SYNTHETIC_POLICY_RESPONSE_LOST'})}return ok(policy);
 }
 if(req.path.includes('/workflow/')){
  assert(req.path.startsWith('/api/team/channels/'+channelId+'/workflow/'));
  if(role!=='admin')return res.status(403).json({message:'TEAM_WORKFLOW_ADMIN_REQUIRED'});
  if(req.path.endsWith('/jobs')){
   if(failRead)return res.status(403).json({message:'TEAM_WORKFLOW_ADMIN_REQUIRED'});
   return ok({jobs:Number(req.query.after)>0?[{...job,id:'later',sourceSeq:101}]:[job],cursor:Number(req.query.after)>0?101:1,hasMore:secondPage&&Number(req.query.after)===0,automaticSend:false});
  }
  if(req.path.endsWith('/export'))return ok({textZh:Number(req.query.after)?'后续消息 #101：任务尚待主管验收':'消息 #1：AI 草稿（员工陈述，未核实）；回复已人工批准；任务待主管验收',cursor:Number(req.query.after)?101:1,hasMore:!Number(req.query.after)});
  if(req.path.endsWith('/actions')){
   postCount++;requests.push(req.body);
   if(gatewayFail)return res.status(503).json({message:'SYNTHETIC_GATEWAY_FAILURE'});
   if(receipts.has(req.body.requestId))return ok(receipts.get(req.body.requestId));
   if(req.body.expectedVersion!==job.version)return res.status(409).json({message:'TEAM_VERSION_CONFLICT'});
   assert(req.body.note.trim());
   if(req.body.action==='approve_reply'){assert.equal(req.body.approved,true);job.replyMessageId='synthetic-reply';replyCount++}
   if(req.body.action==='approve_task'){
    assert.equal(req.body.content.items[0].ownerId,'s-alice');assert.equal(req.body.content.reviewerId,'s-admin');assert.equal(req.body.approved,true);
    job.planId='synthetic-plan';taskCount++;const i=req.body.content.items[0];tasks=[{...i,id:'synthetic-task',text:i.text,planId:job.planId,planRevision:1,reviewerId:'s-admin',fromSeq:1,sourceSeq:[1],minuteVersion:0,version:1,status:'assigned',dueDate:i.deadlineAt.slice(0,10),events:[]}];
   }
   if(req.body.action==='retry'){assert.equal(req.body.approved,true);assert.equal(req.body.acknowledgePossibleCharge,true);job.status='queued'}
   if(req.body.action==='dismiss')job.status='dismissed';
   if(job.replyMessageId&&job.planId)job.status='reviewed';job.version++;receipts.set(req.body.requestId,{...job});
   if(loseResponse){loseResponse=false;return res.status(504).json({message:'SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT'})}return ok(job);
  }
 }
 return ok([]);
});
app.use(express.static(root+'/client-admin/dist'));app.get('*',(_req,res)=>res.sendFile(root+'/client-admin/dist/index.html'));
let server,browser,origin;
const pass=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
async function open(language='zh',width=1440,role='admin'){
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Jakarta'});
 await context.addInitScript(({user,language,role})=>{localStorage.setItem('bubble-tea-language',language);sessionStorage.setItem('auth-storage',JSON.stringify({state:{token:'synthetic-'+role+'-session-only',isAuthenticated:true,user:{...user,role}},version:0}))},{user,language,role});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort()}return route.continue()});
 return {page,context};
}
async function work(page,expectFailure=false){await page.goto(origin+'/staff/communication');await page.getByRole('button',{name:'Synthetic pilot channel',exact:false}).click();await page.getByRole('button',{name:'任务与纪要',exact:false}).click();await page.getByTestId('team-workflow').locator('summary').click();await (expectFailure?page.getByTestId('team-workflow').getByRole('alert'):page.getByTestId('workflow-job-1')).waitFor()}
async function reviewReply(page){await page.getByRole('button',{name:'审阅回复',exact:true}).click();const form=page.getByTestId('workflow-review-form');await form.getByLabel('将发送的回复').fill('Balasan diperiksa manusia.');await form.getByLabel('审批说明').fill('合成人工核对通过');assert(await form.getByRole('button',{name:'批准并发送回复'}).isDisabled());await form.getByRole('checkbox').check();return form}
(async()=>{try{
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
 const {page,context}=await open();
 await pass('permissions stay in AI settings; unverified connection and missing consent block activation',async()=>{
  await page.goto(origin+'/settings/ai');const area=page.getByTestId('workflow-settings');await area.getByRole('combobox').selectOption(channelId);await area.getByText('未启用 · 许可版本 0', {exact:false}).waitFor();assert.equal(await area.getByRole('option').count(),2);
  await area.getByLabel('Synthetic Alice',{exact:true}).check();await area.getByRole('checkbox').last().check();assert(await area.getByRole('button',{name:'保存并允许生成草稿'}).isDisabled());assert.equal(policyWrites.length,0);
  settings.checkRevision=1;settings.connection={status:'ready',configVersion:4,checkRevision:1,region:'cn',model:'MiniMax-M3'};await area.getByRole('button',{name:'重新读取许可',exact:true}).click();await area.getByLabel('Synthetic Alice',{exact:true}).check();assert(await area.getByRole('button',{name:'保存并允许生成草稿'}).isDisabled());await area.getByRole('checkbox').last().check();await area.getByRole('button',{name:'保存并允许生成草稿'}).click();await area.getByText('许可已保存',{exact:true}).waitFor();assert.deepEqual(policyWrites[0].employeeIds,['s-alice']);assert.equal(policyWrites[0].automaticSend,false);assert.equal(policyWrites[0].expectedVersion,0);
  await area.getByRole('button',{name:'暂停此频道',exact:true}).click();await area.getByRole('status').filter({hasText:'已暂停'}).waitFor();assert.equal(policy.paused,true);await area.getByRole('button',{name:'禁用此频道',exact:true}).click();await area.getByRole('status').filter({hasText:'未启用'}).waitFor();assert.equal(policy.enabled,false);
 });
 await pass('saving a new unverified model above invalidates old ready consent before any activation PUT',async()=>{
  const area=page.getByTestId('workflow-settings'),before=policyWrites.length;settings={...settings,version:5,connection:null};await area.getByRole('checkbox').last().check();await area.getByRole('button',{name:'保存并允许生成草稿'}).click();await area.getByRole('alert').filter({hasText:'验证已保存'}).waitFor();assert.equal(policyWrites.length,before);assert(await area.getByRole('button',{name:'保存并允许生成草稿'}).isDisabled());
  settings={...settings,version:4,checkRevision:1,connection:{status:'ready',configVersion:4,checkRevision:1,region:'cn',model:'MiniMax-M3'}};await area.getByRole('button',{name:'重新读取许可'}).click();await area.getByRole('status').filter({hasText:'许可版本'}).waitFor();
 });
 await pass('uncertain policy save stays locked across reload until the saved state is explicitly read',async()=>{
  const area=page.getByTestId('workflow-settings');await area.getByRole('checkbox').last().check();losePolicyResponse=true;await area.getByRole('button',{name:'保存并允许生成草稿'}).click();await area.getByRole('alert').filter({hasText:'保存结果待核对'}).waitFor();assert.equal(policy.enabled,true);assert(await area.getByRole('button',{name:'禁用此频道'}).isDisabled());
  await page.reload();await area.getByRole('combobox').selectOption(channelId);await area.getByRole('alert').filter({hasText:'保存结果待核对'}).waitFor();const before=policyWrites.length;await area.getByRole('button',{name:'放弃本地表单并读取已保存状态'}).click();await area.getByRole('button',{name:'禁用此频道'}).click();await area.getByRole('status').filter({hasText:'未启用'}).waitFor();assert.equal(policyWrites.length,before+1);assert.equal(policy.enabled,false);
 });
 await pass('review requires edited content, note and explicit approval; lost response replays only the original ID after reload',async()=>{
  await work(page);const form=await reviewReply(page);loseResponse=true;await form.getByRole('button',{name:'批准并发送回复'}).click();await page.getByText('未取得可靠结果',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('team-workflow:')).length),1);const original=requests.at(-1).requestId;assert.equal(replyCount,1);
  await work(page);await page.getByRole('button',{name:'核对原操作',exact:true}).click();await page.getByText('操作已保存',{exact:true}).waitFor();assert.equal(requests.at(-1).requestId,original);assert.equal(replyCount,1);assert.equal(await page.getByRole('button',{name:'审阅回复',exact:true}).count(),0);
 });
 await pass('task approval fixes source employee and reviewer and collects dates and criteria; existing follow-up remains present',async()=>{
  await page.getByRole('button',{name:'审阅任务',exact:true}).click();const form=page.getByTestId('workflow-review-form');await form.getByLabel('最晚接收时间').fill('2026-10-22T08:00');await form.getByLabel('完成期限').fill('2026-10-22T10:00');await form.getByLabel('审批说明').fill('合成任务标准已核对');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'批准并下达任务'}).click();await page.getByText('操作已保存',{exact:true}).waitFor();assert.equal(taskCount,1);await page.getByTestId('team-task').waitFor();assert((await page.getByTestId('team-workflow').textContent()).includes('待员工接收'));
 });
 await pass('Chinese report paginates and keeps AI statements separate from human acceptance',async()=>{
  await page.getByRole('button',{name:'生成中文汇报',exact:true}).click();await page.getByRole('button',{name:'继续读取汇报',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=team-workflow] textarea[readonly]')?.value.includes('#101'));const text=await page.getByLabel('中文汇报 · 按来源和人工验收区分').inputValue();assert(text.includes('未核实'));assert(text.includes('#101'));assert(text.includes('任务尚待主管验收'));
 });
 await pass('unknown model billing stays visible and new attempt needs both explicit confirmations',async()=>{
  job={...initialJob(),status:'uncertain',billingStatus:'possible',error:'TEAM_AI_PROVIDER_UNAVAILABLE',billingAttempts:[{attempt:1,requestId:'synthetic-unresolved',status:'uncertain',billingStatus:'possible'}]};await page.getByRole('button',{name:'刷新处理记录',exact:true}).click();await page.getByText('结果不明，禁止自动重试',{exact:true}).waitFor();await page.getByRole('button',{name:'批准新尝试',exact:true}).click();const form=page.getByTestId('workflow-review-form');await form.getByLabel('审批说明').fill('明确批准一次新尝试');await form.getByRole('checkbox').first().check();assert(await form.getByRole('button',{name:'确认操作',exact:true}).isDisabled());await form.getByRole('checkbox').last().check();const before=postCount;await form.getByRole('button',{name:'确认操作',exact:true}).click();await page.getByText('操作已保存',{exact:true}).waitFor();assert.equal(postCount,before+1);assert.equal(job.status,'queued');assert.equal(job.billingStatus,'possible');
 });
 await pass('concurrent version change retains form and prevents stale approval',async()=>{
  job=initialJob();await page.getByRole('button',{name:'刷新处理记录',exact:true}).click();await page.getByRole('button',{name:'审阅回复',exact:true}).click();job.version++;await page.getByRole('button',{name:'刷新处理记录',exact:true}).click();await page.getByTestId('workflow-review-form').getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'批准并发送回复',exact:true}).isDisabled());await page.getByTestId('workflow-review-form').getByRole('button',{name:'取消',exact:true}).click();
 });
 await pass('browser receipt failure stops before API mutation',async()=>{
  const before=postCount,form=await reviewReply(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(key,value){if(key.startsWith('team-workflow:'))throw Error('SYNTHETIC_STORAGE_FAILURE');return original.call(this,key,value)}});await form.getByRole('button',{name:'批准并发送回复'}).click();await page.getByText('无法安全保存操作记录',{exact:false}).waitFor();assert.equal(postCount,before);await page.evaluate(()=>window.restoreStorage());
 });
 await pass('permission failure is visible and is never reported as an empty successful result',async()=>{
  failRead=true;await work(page,true);await page.getByTestId('team-workflow').getByRole('alert').filter({hasText:'当前身份'}).waitFor();failRead=false;
 });
 await context.close();
 for(const language of ['zh','id','en'])for(const width of [390,768,1440])await pass(language+' '+width+' responsive review and policy controls',async()=>{
  job=initialJob();const {page,context}=await open(language,width);await page.goto(origin+'/settings/ai');const permission=page.getByTestId('workflow-settings');await permission.getByRole('combobox').selectOption(channelId);await permission.locator('fieldset').waitFor();await permission.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+language+'-'+width+'-policy.png'});
  await page.goto(origin+'/staff/communication');await page.getByRole('button',{name:'Synthetic pilot channel',exact:false}).click();await page.locator('.team-tabs button').nth(1).click();await page.getByTestId('team-workflow').locator('summary').click();await page.getByTestId('workflow-job-1').waitFor();await page.getByTestId('team-workflow').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+language+'-'+width+'-review.png'});if(language==='zh'&&width===390){await page.getByRole('button',{name:'审阅任务',exact:true}).click();const form=page.getByTestId('workflow-review-form');await form.getByLabel('最晚接收时间').fill('2026-10-22T08:00');await form.getByLabel('完成期限').fill('2026-10-22T10:00');await form.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/zh-390-task-form.png'});}await context.close();
 });
 await pass('manager does not receive AI review controls or workflow reads',async()=>{const {page,context}=await open('zh',390,'manager');let count=0;page.on('request',r=>{if(r.url().includes('/workflow/'))count++});await page.goto(origin+'/staff/communication');await page.getByRole('button',{name:'Synthetic pilot channel',exact:false}).click();await page.locator('.team-tabs button').nth(1).click();assert.equal(await page.getByTestId('team-workflow').count(),0);assert.equal(count,0);await context.close()});
 assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({passed,pageErrors,externalRequests:external,allApiRequestsMocked:true,realModelCalls:0,productionWrites:0,replyCount,taskCount},null,2)+'\n');
 }catch(e){fs.writeFileSync(out+'/failure.json',JSON.stringify({error:e.message,pageErrors,passed,externalRequests:external},null,2)+'\n');if(browser)for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:out+'/failure.png',fullPage:true});throw e}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
