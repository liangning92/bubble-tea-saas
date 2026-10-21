/* Real MCP + native employee services + wrapper-owned PostgreSQL. Never production. */
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),lib=n=>require(root+'/server/node_modules/'+n),built=n=>require(root+'/server/dist/services/'+n);
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/team_test');
const {PrismaClient}=lib('@prisma/client'),{McpServer,createMcpHandler}=lib('@modelcontextprotocol/server'),{toNodeHandler}=lib('@modelcontextprotocol/node'),{Client,StreamableHTTPClientTransport}=lib('@modelcontextprotocol/client');
const {createTeamAgentBridge}=built('teamAgentBridge/service'),{actions}=built('teamAgentBridge/contract');
const {createWorkItemService}=built('externalMcp/workItemService'),{createWorkItemTools}=built('externalMcp/workItemTools'),{workItemActions}=built('externalMcp/workItemContract');
const {teamCommunication,readTeam,writeTeam}=built('TeamCommunicationService'),{readWork,writeWork}=built('EmployeeWorkspaceStore'),{teamTaskReminderRelevant}=built('TeamTaskReminderService');
const db=new PrismaClient(),storeId='work-items-synthetic',agentId=randomUUID(),task={taskId:randomUUID(),version:1},passed=[];
const employee={id:'wi-employee-user',staffId:'wi-employee',storeId,role:'staff',employeeApp:true},owner={id:'wi-owner-user',staffId:'wi-owner',storeId,role:'admin'};
let grant={agentId,displayName:'Synthetic Hermes',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:[...actions],staffIds:[owner.staffId,employee.staffId],channelIds:[]};
const grantKey='fixture.work-items.grant',saveGrant=()=>db.config.upsert({where:{storeId_key:{storeId,key:grantKey}},create:{storeId,key:grantKey,category:'test',value:JSON.stringify(grant)},update:{value:JSON.stringify(grant)}});
const bridgeDeps={enabled:true,resolveGrant:async tx=>JSON.parse((await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:grantKey}}})).value),tasks:{assert:async(tx,g,ref)=>{assert.equal(g.storeId,storeId);const row=await tx.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'fixture.task'}}});assert.deepEqual(ref,JSON.parse(row.value));}},readAttachment:async()=>{throw Error('not used')}};
let approvalAllowed=true;
const deps={enabled:true,withActor:(tx,action,ctx,operation)=>createTeamAgentBridge(tx,bridgeDeps).withActor(action,ctx.task,ctx.channelId,operation),assertApprovalTarget:async(tx,actor,ctx,target)=>{assert.equal(actor.role,'agent');if(!approvalAllowed||target.domain!=='leave'||target.objectId!=='wi-leave')throw Error('OBJECT_SCOPE_REQUIRED')},now:()=>new Date('2030-01-01T00:00:00Z')};
let service=createWorkItemService(db,deps),channel,assigned,sent,client,server,sdk,ctx;
const native=()=>teamCommunication(db),req=()=>randomUUID(),pad=n=>String(n).padStart(12,'0');
function faultDatabase(){let seen=false;return{seen:()=>seen,db:{$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='config')return new Proxy(target.config,{get(model,method){if(method==='upsert')return async args=>{const result=await model.upsert(args);if(args.where.storeId_key.key==='employee.workspace.notification.chat.pending'){seen=true;throw Error('after durable signal')}return result};return typeof model[method]==='function'?model[method].bind(model):model[method]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}}))),user:db.user,staff:db.staff,config:db.config}}}
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name)}
async function call(name,args,ok=true){const r=await client.callTool({name,arguments:args});if(ok){assert(!r.isError,JSON.stringify(r));return r.structuredContent.result}assert(r.isError);return r}
const taskRows=()=>db.config.count({where:{storeId,key:{startsWith:'team.communication.task.'}}});
const reminders=async()=> (await db.config.findMany({where:{storeId,key:{startsWith:'employee.workspace.reminder.'}}})).map(r=>JSON.parse(r.value));
async function main(){
 const tenant=await db.tenant.create({data:{name:'Isolated work-item test'}});await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic store'}});
 for(const [a,phone,name] of [[owner,'08880199101','Synthetic sponsor'],[employee,'08880199102','Synthetic employee']])await db.user.create({data:{id:a.id,storeId,role:a.role,phone,password:'fixture-no-login',staff:{create:{id:a.staffId,storeId,name,employeeNumber:a.staffId}}}});
 await saveGrant();await db.config.create({data:{storeId,key:'fixture.task',category:'test',value:JSON.stringify(task)}});
 const bridge=createTeamAgentBridge(db,bridgeDeps);channel=await bridge.create({task,requestId:req(),title:'Synthetic native employee work',members:[owner.staffId,employee.staffId]});ctx={task,channelId:channel.id};
 sent=await bridge.send({...ctx,requestId:req(),expectedLastSeq:0,text:'Synthetic work source'});
 const roundId=req(),minutes={id:roundId,title:'Confirmed synthetic minute',participants:[owner.staffId,employee.staffId],fromSeq:1,toSeq:1,version:1,status:'confirmed',decisions:[],pending:[],sourceSeq:[1],actions:[{text:'Clean synthetic station',ownerId:employee.staffId,dueDate:'2029-12-31',sourceSeq:[1]}]};
 await writeTeam(db,storeId,`minutes.${channel.id}.${roundId}`,minutes);
 sdk=createMcpHandler(async()=>{const s=new McpServer({name:'isolated-work-items',version:'1'});createWorkItemTools(s,service,workItemActions);return s},{legacy:'stateless',responseMode:'json'});
 const handler=toNodeHandler({fetch:request=>request.headers.get('authorization')==='Bearer synthetic-work-items-only'?sdk.fetch(request):new Response(null,{status:401})});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));client=new Client({name:'synthetic-work-items-client',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
 await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer synthetic-work-items-only'}}}));
 await check('default disabled and only explicitly scoped five tools advertised',async()=>{
  const off=createWorkItemService(db,{...deps,enabled:false}),names=[];createWorkItemTools({registerTool:n=>names.push(n)},off,workItemActions);assert.deepEqual(names,[]);await assert.rejects(()=>off.get({...ctx,employeeTaskId:req()}));
  const advertised=(await client.listTools()).tools.map(t=>t.name).sort();assert.deepEqual(advertised,['approval_awareness_get','team_delivery_get','team_task_assign','team_task_get','team_task_review']);
  const limited=[];createWorkItemTools({registerTool:n=>limited.push(n)},service,['tasks.read']);assert.deepEqual(limited,['team_task_get']);
 });
 const assign={...ctx,requestId:req(),roundId,minuteVersion:1,actionIndex:0};
 await check('native assignment preserves confirmed source and is idempotent',async()=>{
  const before=await taskRows();assigned=await call('team_task_assign',assign);assert.equal(assigned.assignedStaffId,employee.staffId);assert.equal(assigned.dueDate,'2029-12-31');assert.equal(assigned.overdue,null);assert.equal(assigned.deadlinePrecision,'date_only');assert.equal(assigned.status,'assigned');
  assert.equal((await call('team_task_assign',assign)).id,assigned.id);assert.equal(await taskRows(),before+1);
  await call('team_task_assign',{...assign,requestId:req(),minuteVersion:2},false);await call('team_task_assign',{...assign,ownerId:'forged'},false);await call('team_task_assign',{...assign,actor:owner},false);
 });
 await check('native task, reminder and wake marker commit together with accurate task link',async()=>{
  const rows=(await reminders()).filter(r=>r.teamTask?.taskId===assigned.id);assert.equal(rows.length,1);assert.equal(rows[0].userId,employee.id);assert(rows[0].url.includes('task='+assigned.id));assert.equal(await teamTaskReminderRelevant(db,storeId,rows[0]),true);
  const marker=await readWork(storeId,'notification.chat.pending',db);assert.equal(marker.eventId,rows[0].id);
  await db.$transaction(async tx=>{const t=await readTeam(tx,storeId,`task.${channel.id}.${assigned.id}`);assert(t);assert(await readWork(storeId,`reminder.${employee.staffId}.${rows[0].id}`,tx))});
 });
 await check('task get projects current responsibility, evidence and status without STOCK evidence',async()=>{
  const r=await call('team_task_get',{...ctx,employeeTaskId:assigned.id});assert.equal(r.status,'assigned');assert.equal(r.evidenceVerification,'not_performed');assert(!('agentTask'in r));assert(r.url.includes('work=1'));
  await call('team_task_get',{...ctx,employeeTaskId:req()},false);await call('team_task_get',{...ctx,employeeTaskId:assigned.id,role:'admin'},false);
 });
 await check('actual employee inbox opens native task; reading notification cannot finish it',async()=>{
  const {notificationInbox}=built('NotificationInboxService'),inbox=notificationInbox(db);const card=(await inbox.read(employee)).items.find(i=>i.url.includes('task='+assigned.id));assert(card);assert.equal(card.kind,'business_reminder');assert.equal(card.domain,'team_task');assert.equal(card.objectId,assigned.id);assert.equal(card.status,'assigned');assert.equal(card.pending,true);assert.equal(card.adminUrl,'/staff/communication'+new URL(card.url,'https://inbox.invalid').search);const receipt=await inbox.markRead(employee,card.id);assert.equal(receipt.pending,true);
  assert.equal((await service.get({...ctx,employeeTaskId:assigned.id})).status,'assigned');const readCard=(await inbox.read(employee)).items.find(i=>i.id===card.id);assert.equal(readCard.read,true);assert.equal(readCard.pending,true);
 });
 await check('ordinary employee cannot assign/review and sponsor downgrade does not inherit admin wildcard',async()=>{
  await assert.rejects(()=>native().createTask(employee,channel.id,{requestId:req(),roundId,minuteVersion:1,actionIndex:0}));
  await assert.rejects(()=>native().taskAction(employee,channel.id,assigned.id,{requestId:req(),expectedVersion:1,action:'complete'}));
  await db.user.update({where:{id:owner.id},data:{role:'manager'}});await call('team_task_assign',{...assign,requestId:req()},false);await db.user.update({where:{id:owner.id},data:{role:'admin'}});
 });
 await check('read-only delivery starts unconfirmed with zero active subscriptions, never device accepted',async()=>{
  const {notificationInbox}=built('NotificationInboxService');const card=(await notificationInbox(db).read(employee)).items.find(i=>i.domain==='chat'&&i.objectId===channel.id);assert(card);assert.equal(card.adminUrl,`/staff/communication?channel=${encodeURIComponent(channel.id)}&message=${sent.seq}`);
  const r=await call('team_delivery_get',{...ctx,messageId:sent.id,messageSeq:sent.seq,recipientStaffId:employee.staffId});assert.equal(r.device,'unknown');assert.equal(r.read.state,'unread');assert.equal(r.push.state,'queued');assert.equal(r.subscriptions.ready,0);assert.equal(r.response.state,'not_observed');assert(r.url.includes('message=1'));
  assert.equal(await readTeam(db,storeId,`read.${channel.id}.${employee.staffId}`),null);
 });
 await check('provider acceptance and safe failure codes stay separate from device display',async()=>{
  const r=(await reminders()).find(r=>r.chat?.messageId===sent.id&&r.staffId===employee.staffId);
  await writeWork(storeId,`delivery.${r.id}.synthetic1`,{status:'sent',attempts:1,sentAt:'2026-10-21T00:00:00.000Z'},db);
  await writeWork(storeId,`delivery.${r.id}.synthetic2`,{status:'failed',attempts:2,error:'410',nextAttemptAt:'2026-10-22T00:00:00.000Z',providerBody:'SECRET_NOT_PROJECTED'},db);
  await writeWork(storeId,'subscription.synthetic',{userId:employee.id,staffId:employee.staffId,active:true,issuedAtMs:Date.now()+1000,subscription:{endpoint:'SECRET_ENDPOINT',keys:{auth:'SECRET_AUTH'}}},db);
  const d=await call('team_delivery_get',{...ctx,messageId:sent.id,messageSeq:sent.seq,recipientStaffId:employee.staffId});assert.equal(d.device,'unknown');assert.equal(d.push.state,'partial_service_accepted');assert.equal(d.push.accepted,1);assert.deepEqual(d.push.failures,['HTTP_410']);assert.equal(d.subscriptions.ready,1);assert(!JSON.stringify(d).includes('SECRET_'));
 });
 await check('other employees historical subscriptions cannot block recipient diagnostics',async()=>{
  await db.config.createMany({data:Array.from({length:205},(_,i)=>({storeId,key:'employee.workspace.subscription.other-'+i,category:'test',value:JSON.stringify({userId:'other-user',staffId:'other-staff',active:false,subscription:{endpoint:'OTHER_SECRET'}})}))});
  const d=await service.delivery({...ctx,messageId:sent.id,messageSeq:sent.seq,recipientStaffId:employee.staffId});assert.deepEqual(d.subscriptions,{ready:1,inactive:0,stale:0});assert(!JSON.stringify(d).includes('OTHER_SECRET'));
 });
 await check('later employee message is an observation, not proof of reply or human read',async()=>{
  await native().send(employee,channel.id,{requestId:req(),text:'Synthetic result evidence'});const d=await service.delivery({...ctx,messageId:sent.id,messageSeq:sent.seq,recipientStaffId:employee.staffId});assert.equal(d.response.state,'later_message_observed');assert.equal(d.response.attribution,'not_proven');assert.equal(d.read.state,'unread');
  await native().markRead(employee,channel.id,2);const read=await service.delivery({...ctx,messageId:sent.id,messageSeq:sent.seq,recipientStaffId:employee.staffId});assert.equal(read.read.state,'read');assert.equal(read.device,'unknown');
 });
 await check('employee accepts/submits own task; agent cannot impersonate these actions',async()=>{
  await call('team_task_review',{...ctx,employeeTaskId:assigned.id,requestId:req(),expectedVersion:1,action:'accept',note:'forged'},false);
  await createTeamAgentBridge(db,bridgeDeps).withActor('tasks.review',task,channel.id,async a=>assert.rejects(()=>native().taskAction(a,channel.id,assigned.id,{requestId:req(),expectedVersion:1,action:'accept'})));
  await native().taskAction(employee,channel.id,assigned.id,{requestId:req(),expectedVersion:1,action:'accept'});
  await assert.rejects(()=>native().taskAction(employee,channel.id,assigned.id,{requestId:req(),expectedVersion:2,action:'submit',note:'missing evidence'}));
  await native().taskAction(employee,channel.id,assigned.id,{requestId:req(),expectedVersion:2,action:'submit',note:'Synthetic evidence',sourceSeq:[2]});
 });
 await check('native review uses version and real sponsor, preserves agent audit identity',async()=>{
  const args={...ctx,employeeTaskId:assigned.id,requestId:req(),expectedVersion:3,action:'return',note:'Synthetic correction needed'};
  const r=await call('team_task_review',args);assert.equal(r.status,'changes_requested');assert.equal(r.version,4);assert.equal((await call('team_task_review',args)).version,4);await call('team_task_review',{...args,requestId:req()},false);
  const audit=await db.financeAuditLog.findFirst({where:{storeId,entityId:channel.id,action:'update'},orderBy:{createdAt:'desc'}});assert.equal(audit.userId,owner.id);const detail=JSON.parse(audit.newValue);assert.equal(detail.agent.agentId,agentId);assert.equal(r.events.at(-1).by,'agent:'+agentId);
  const old=(await reminders()).find(x=>x.teamTask?.taskId===assigned.id&&x.teamTask.version===1);assert.equal(await teamTaskReminderRelevant(db,storeId,old),false);
 });
 await check('plan reviewer and criteria remain native requirements, deadlines projected accurately',async()=>{
  const taskRow=await readTeam(db,storeId,`task.${channel.id}.${assigned.id}`),c=await readTeam(db,storeId,'channel.'+channel.id),planId=req();
  Object.assign(taskRow,{status:'submitted',version:5,planId,planRevision:1,reviewerId:employee.staffId,audienceIds:[owner.staffId,employee.staffId],deadlineAt:'2029-12-31T00:00:00.000Z',acceptByAt:'2029-12-30T00:00:00.000Z',evidenceRequired:'Synthetic evidence',acceptanceCriteria:'Synthetic criteria'});
  await writeTeam(db,storeId,`task.${channel.id}.${assigned.id}`,taskRow);await writeTeam(db,storeId,`operationPlan.${channel.id}.${planId}`,{status:'published',revision:1,audienceHash:createHash('sha256').update(JSON.stringify(c.members)).digest('hex')});
  const args={...ctx,employeeTaskId:assigned.id,requestId:req(),expectedVersion:5,action:'complete',note:'Reviewed',criteriaConfirmed:true};await call('team_task_review',args,false);
  taskRow.reviewerId=owner.staffId;await writeTeam(db,storeId,`task.${channel.id}.${assigned.id}`,taskRow);await call('team_task_review',{...args,requestId:req(),criteriaConfirmed:false},false);
  const view=await service.get({...ctx,employeeTaskId:assigned.id});assert.equal(view.overdue,true);assert.equal(view.deadlinePrecision,'instant');
  const fault=faultDatabase(),beforeReminders=(await reminders()).length,marker=await readWork(storeId,'notification.chat.pending',db);
  await assert.rejects(()=>createWorkItemService(fault.db,deps).review({...args,requestId:req()}));assert(fault.seen());assert.equal((await service.get({...ctx,employeeTaskId:assigned.id})).status,'submitted');assert.equal((await reminders()).length,beforeReminders);assert.deepEqual(await readWork(storeId,'notification.chat.pending',db),marker);
  assert.equal((await call('team_task_review',{...args,requestId:req()})).status,'completed');
 });
 await check('completed task reminder rechecks live assignee identity and plan audience',async()=>{
  const r=(await reminders()).find(r=>r.teamTask?.taskId===assigned.id&&r.teamTask.status==='completed');assert(r);assert(await teamTaskReminderRelevant(db,storeId,r));
  await db.staff.update({where:{id:employee.staffId},data:{status:'inactive'}});assert.equal(await teamTaskReminderRelevant(db,storeId,r),false);await db.staff.update({where:{id:employee.staffId},data:{status:'active'}});
  const c=await readTeam(db,storeId,'channel.'+channel.id),saved=structuredClone(c);c.members=c.members.filter(m=>m.staffId!==employee.staffId);await writeTeam(db,storeId,'channel.'+channel.id,c);assert.equal(await teamTaskReminderRelevant(db,storeId,r),false);await writeTeam(db,storeId,'channel.'+channel.id,saved);
  assert.equal(await teamTaskReminderRelevant(db,storeId,{...r,userId:'forged-user'}),false);
 });
 await check('scoped approval awareness uses exact-object projection and performs zero business writes',async()=>{
  await db.leave.create({data:{id:'wi-leave',storeId,staffId:employee.staffId,leaveType:'sick',startDate:new Date('2029-01-01'),endDate:new Date('2029-01-01'),totalDays:1,reason:'PRIVATE_DO_NOT_PROJECT',status:'pending'}});
  const before=await db.leave.findUnique({where:{id:'wi-leave'}}),count=await db.financeAuditLog.count({where:{storeId}});
  const r=await call('approval_awareness_get',{...ctx,domain:'leave',objectId:'wi-leave'});assert.equal(r.executionGranted,false);assert.equal(r.notices.length,1);assert.equal(r.notices[0].pending,true);assert(r.notices[0].adminUrl.includes('noticeObject=wi-leave'));assert(!JSON.stringify(r).includes('PRIVATE_'));
  assert.deepEqual(await db.leave.findUnique({where:{id:'wi-leave'}}),before);assert.equal(await db.financeAuditLog.count({where:{storeId}}),count);
  approvalAllowed=false;await call('approval_awareness_get',{...ctx,domain:'leave',objectId:'wi-leave'},false);approvalAllowed=true;await call('approval_awareness_get',{...ctx,domain:'reimbursement',objectId:'other'},false);
 });
 await check('revocation, client revision and execution task version are rechecked for logged-in client',async()=>{
  grant.revoked=true;await saveGrant();await call('team_task_get',{...ctx,employeeTaskId:assigned.id},false);grant.revoked=false;await saveGrant();
  await createTeamAgentBridge(db,bridgeDeps).withActor('tasks.read',task,channel.id,async actor=>{grant.clientRevision++;await saveGrant();await assert.rejects(()=>native().tasks(actor,channel.id))});
  await db.config.update({where:{storeId_key:{storeId,key:'fixture.task'}},data:{value:JSON.stringify({...task,version:2})}});await call('team_task_get',{...ctx,employeeTaskId:assigned.id},false);await db.config.update({where:{storeId_key:{storeId,key:'fixture.task'}},data:{value:JSON.stringify(task)}});
  grant.expiresAt=new Date(Date.now()-1).toISOString();await saveGrant();await call('team_delivery_get',{...ctx,messageId:sent.id,messageSeq:1,recipientStaffId:employee.staffId},false);grant.expiresAt=new Date(Date.now()+3600000).toISOString();await saveGrant();
 });
 await check('revocation between bridge admission and native transaction aborts mutation',async()=>{
  const before=await taskRows();await createTeamAgentBridge(db,bridgeDeps).withActor('tasks.assign',task,channel.id,async actor=>{grant.revoked=true;await saveGrant();await assert.rejects(()=>native().createTask(actor,channel.id,{requestId:req(),roundId,minuteVersion:1,actionIndex:0}))});grant.revoked=false;await saveGrant();assert.equal(await taskRows(),before);
 });
 await check('cross channel/store and pre-membership messages are denied',async()=>{
  await call('team_delivery_get',{...ctx,channelId:req(),messageId:sent.id,messageSeq:1,recipientStaffId:employee.staffId},false);
  await call('team_delivery_get',{...ctx,messageId:sent.id,messageSeq:1,recipientStaffId:'other-store-staff'},false);
  const c=await readTeam(db,storeId,'channel.'+channel.id),saved=structuredClone(c);c.members.find(m=>m.staffId===employee.staffId).fromSeq=2;await writeTeam(db,storeId,'channel.'+channel.id,c);await call('team_delivery_get',{...ctx,messageId:sent.id,messageSeq:1,recipientStaffId:employee.staffId},false);await writeTeam(db,storeId,'channel.'+channel.id,saved);
 });
 await check('stopped sponsor and forged agent cannot reuse native management permissions',async()=>{
  await assert.rejects(()=>native().tasks({...owner,role:'agent',staffId:'agent:'+agentId},channel.id));
  await db.staff.update({where:{id:owner.staffId},data:{status:'inactive'}});await call('team_task_get',{...ctx,employeeTaskId:assigned.id},false);await db.staff.update({where:{id:owner.staffId},data:{status:'active'}});
 });
 await check('task and reminder roll back when durable wake write fails',async()=>{
  const round=req(),m={...minutes,id:round,actions:[{...minutes.actions[0],text:'Rollback synthetic source'}]};await writeTeam(db,storeId,`minutes.${channel.id}.${round}`,m);
  const before=await taskRows(),beforeReminders=(await reminders()).length,marker=await readWork(storeId,'notification.chat.pending',db),fault=faultDatabase();
  await assert.rejects(()=>createWorkItemService(fault.db,deps).assign({...ctx,requestId:req(),roundId:round,minuteVersion:1,actionIndex:0}));assert(fault.seen());assert.equal(await taskRows(),before);assert.equal((await reminders()).length,beforeReminders);assert.deepEqual(await readWork(storeId,'notification.chat.pending',db),marker);
 });
 const out=path.join(root,'output/agent-notification-work-items');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/pg-mcp.json',JSON.stringify({tests:passed.length,passed,production:false,pushTransportCalls:0,modelCalls:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(client)await client.close();if(server)await new Promise(r=>server.close(r));if(sdk)await sdk.close?.();await db.$disconnect()});
