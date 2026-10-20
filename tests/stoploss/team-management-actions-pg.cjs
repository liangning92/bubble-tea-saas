/* Native PostgreSQL transactions, with only synthetic users/messages. No model or external delivery. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/team_test');assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert(process.env.UPLOADS_PATH?.includes(process.env.BT_TEST_RUN));
const {prisma}=require(root+'/server/dist/config/database'),native=require(root+'/server/dist/services/TeamCommunicationService'),work=require(root+'/server/dist/services/EmployeeWorkspaceStore'),ts=require(root+'/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync(root+'/server/src/services/TeamManagementActions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={};new Function('require','exports',code)(name=>name==='crypto'?crypto:name==='zod'?require(root+'/server/node_modules/zod'):name==='./TeamWorkflowQueue.js'?require(root+'/server/dist/services/TeamWorkflowQueue'):name==='./TeamCommunicationService'?native:name==='./EmployeeWorkspaceStore'?work:name==='../utils/storeDateSettings'?require(root+'/server/dist/utils/storeDateSettings'):(()=>{throw Error(name)})(),mod);
const {randomUUID}=crypto,tx=fn=>prisma.$transaction(fn,{timeout:20000}),passed=[];let tenant,n=0;
const caseFilter=process.env.CASE_FILTER?new RegExp(process.env.CASE_FILTER):null;
const check=async(name,fn)=>{if(caseFilter&&!caseFilter.test(name))return;await fn();passed.push(name);console.log('PASS',name)};
(async()=>{try{
 tenant=await prisma.tenant.create({data:{name:'Synthetic management action tests'}});
 async function fixture(text='包材不足，请核实数量。'){
  const i=++n,storeId='action-store-'+i;await prisma.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic action store'}});const actors={};
  for(const [name,role] of [['owner','admin'],['employee','staff'],['other','staff']]){const id='act-user-'+i+'-'+name,staffId='act-staff-'+i+'-'+name;await prisma.user.create({data:{id,storeId,role,phone:'0897'+i+name,password:'synthetic-unused',staff:{create:{id:staffId,storeId,name:'Synthetic '+name,employeeNumber:'ACT-'+i+'-'+name}}}});actors[name]={id,storeId,staffId,role,employeeApp:role!=='admin'}}
  const channel=await native.teamCommunication(prisma).create(actors.owner,{requestId:randomUUID(),title:'Synthetic management actions',kind:'group',members:[actors.employee.staffId,actors.other.staffId]});
  const message=await native.teamCommunication(prisma).send(actors.employee,channel.id,{requestId:randomUUID(),text,files:[]});
  const c=await native.readTeam(prisma,storeId,'channel.'+channel.id),job={id:message.id,channelId:c.id,sourceSeq:message.seq,sourceAuthorId:actors.employee.staffId,operatorUserId:actors.owner.id,operatorStaffId:actors.owner.staffId};
  const proposal={title:'核实包材',nextStep:'补充现场数量和未到货状态',evidenceRequired:null,dueAt:null,deadlineSourceSeq:null};
  return{...actors,storeId,c,job,proposal,message};
 }
 async function ensure(f,proposal=f.proposal){return tx(t=>mod.ensureAction(t,f.owner,f.c,f.job,proposal))}
 async function send(f,a,text){const m=await native.teamCommunication(prisma).send(a,f.c.id,{requestId:randomUUID(),text,files:[]});f.c=await native.readTeam(prisma,f.storeId,'channel.'+f.c.id);return m}
 await check('missing deadline/evidence stays waiting_details, same source concurrency creates one durable action',async()=>{
  const f=await fixture(),[a,b]=await Promise.all([ensure(f),ensure(f)]);assert.equal(a.id,b.id);assert.equal(a.version,1);assert.equal(a.status,'waiting_details');assert.equal(a.dueAt,null);assert.equal(a.evidenceRequired,null);assert.equal((await mod.listActions(prisma,f.employee,f.c.id)).length,1);assert.equal(await prisma.config.count({where:{storeId:f.storeId,key:'team.communication.management.action.'+a.id}}),1);
 });
 await check('model-invented deadline is not an employee promise; explicit employee ISO commitment is retained',async()=>{
  const f=await fixture(),invented=await ensure(f,{...f.proposal,evidenceRequired:'数量和现场文字核对',dueAt:'2030-01-01T12:00:00Z'});assert.equal(invented.status,'waiting_details');assert.equal(invented.dueAt,null);
  const g=await fixture('我会在 2030-01-01T12:00:00Z 前核实包材数量。'),a=await ensure(g,{...g.proposal,evidenceRequired:'数量和现场文字核对',dueAt:'2030-01-01T12:00:00Z',deadlineSourceSeq:1});assert.equal(a.status,'open');assert.equal(a.dueAt,'2030-01-01T12:00:00Z');
 });
 await check('negated or questioned ISO mentions are not silently turned into deadline promises',async()=>{
  for(const text of ['不是 2030-01-01T12:00:00Z 完成，请别这样安排。','Saya tidak akan selesai pada 2030-01-01T12:00:00Z.','我会在 2030-01-01T12:00:00Z 前提交吗','I will submit it at 2030-01-01T12:00:00Z?' ]){const f=await fixture(text),a=await ensure(f,{...f.proposal,evidenceRequired:'现场文字',dueAt:'2030-01-01T12:00:00Z',deadlineSourceSeq:1});assert.equal(a.dueAt,null);assert.equal(a.status,'waiting_details')}
 });
 await check('store timezone normalizes explicit own relative commitments across midnight and rejects negative or invalid time',async()=>{
  for(const [text,due,expected] of [
   ['我会在明天 08:30 前提交数量。','2026-10-22T01:30:00Z','2026-10-22T01:30:00.000Z'],
   ['Saya akan selesai hari ini pukul 12:00.','2026-10-21T05:00:00Z','2026-10-21T05:00:00.000Z'],
   ['Saya tidak akan selesai besok jam 08:30.','2026-10-22T01:30:00Z',null],
   ['我会在明天 25:30 提交数量。','2026-10-22T01:30:00Z',null],
   ['我会在明天 08:30 前提交数量。','2026-10-23T01:30:00Z',null],
  ]){const f=await fixture(text);await prisma.store.update({where:{id:f.storeId},data:{timezone:'Asia/Jakarta'}});await native.writeTeam(prisma,f.storeId,'message.'+f.c.id+'.'+String(f.message.seq).padStart(12,'0'),{...f.message,createdAt:'2026-10-20T17:30:00Z'});const a=await ensure(f,{...f.proposal,evidenceRequired:'数量说明',dueAt:due,deadlineSourceSeq:1});assert.equal(a.dueAt,expected);assert.equal(a.status,expected?'open':'waiting_details')}
  const f=await fixture('Saya akan selesai besok jam 08:30.');await prisma.store.update({where:{id:f.storeId},data:{timezone:'invalid/no-fallback'}});const a=await ensure(f,{...f.proposal,evidenceRequired:'数量说明',dueAt:null,deadlineSourceSeq:1});assert.equal(a.dueAt,null);
 });
 await check('new employee message fills original action with expected version instead of creating duplicates',async()=>{
  const f=await fixture(),a=await ensure(f),m=await send(f,f.employee,'我会在 2030-01-01T12:00:00Z 前补充数量。');f.job={...f.job,id:m.id,sourceSeq:m.seq};const b=await ensure(f,{...f.proposal,actionId:a.id,expectedVersion:a.version,evidenceRequired:'数量说明',dueAt:'2030-01-01T12:00:00Z',deadlineSourceSeq:m.seq});assert.equal(a.id,b.id);assert.equal(b.status,'open');assert.equal(b.sourceJobs.length,2);assert.equal((await mod.listActions(prisma,f.owner,f.c.id)).length,1);assert.equal(b.version,2);
 });
 await check('model cannot reassign; another participant contributes without altering assignment or commitments',async()=>{
  const f=await fixture();await assert.rejects(()=>ensure(f,{...f.proposal,assignedStaffId:f.other.staffId}),/ASSIGNMENT_REQUIRED/);const a=await ensure(f),m=await send(f,f.other,'我来替代原负责人。');f.job={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.other.staffId};const b=await ensure(f,{...f.proposal,actionId:a.id,expectedVersion:a.version,title:'其他员工建议改名',nextStep:'其他员工建议换步骤',evidenceRequired:'不能覆盖原标准',dueAt:'2040-01-01T12:00:00Z'});assert.equal(b.id,a.id);assert.equal(b.title,a.title);assert.equal(b.nextStep,a.nextStep);assert.equal(b.evidenceRequired,a.evidenceRequired);assert.equal(b.dueAt,a.dueAt);assert.equal(b.assignedStaffId,f.employee.staffId);assert.equal(b.sourceJobs.length,2);assert.equal(b.events.at(-1).action,'contribution');
 });
 await check('saved owner decision can update a contributed action, fabricated owner decision cannot',async()=>{
  const f=await fixture(),a=await ensure(f),m=await send(f,f.other,'我补充现场还缺少杯盖。');f.job={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.other.staffId,ownerDecision:{requestId:randomUUID(),byStaffId:f.owner.staffId,at:new Date().toISOString(),text:'请在 2030-01-01T12:00:00Z 前核对数量。'}};
  const contribution=await ensure(f,{...f.proposal,actionId:a.id,expectedVersion:a.version,dueAt:'2030-01-01T12:00:00Z',evidenceRequired:'负责人要求数量说明'});assert.equal(contribution.dueAt,null);assert.equal(contribution.evidenceRequired,null);
  await native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(m.seq).padStart(12,'0'),{...f.job,ownerDecision:f.job.ownerDecision});
  const updated=await ensure(f,{...f.proposal,actionId:a.id,expectedVersion:contribution.version,dueAt:'2030-01-01T12:00:00Z',evidenceRequired:'负责人要求数量说明'});assert.equal(updated.id,a.id);assert.equal(updated.status,'open');assert.equal(updated.dueAt,'2030-01-01T12:00:00Z');assert.equal(updated.assignedStaffId,f.employee.staffId);assert.equal(updated.sourceJobs.length,2);
 });
 await check('owner directive binds an affirmative native owner source or saved decision to a unique current member',async()=>{
  for(const scenario of [
   {text:'请让 Rizky 负责现场杯盖数量核实。',ok:true},
   {text:'Tolong tugaskan Rizky untuk memeriksa jumlah gelas.',ok:true},
   {text:'不要让 Rizky 负责现场杯盖数量核实。',ok:false},
   {text:'是否让 Rizky 负责现场杯盖数量核实？',ok:false},
   {text:'老板说请让 Rizky 负责现场杯盖数量核实。',employee:true,ok:false},
   {text:'员工说请让 Rizky 负责现场杯盖数量核实。',ok:false},
   {text:'请让 Rizky 负责现场杯盖数量核实。',decision:true,ok:true},
   {text:'请先核实现场数量。',decision:true,ok:false},
   {text:'不要让 Rizky 负责现场杯盖数量核实。',decision:true,ok:false},
   {text:'请让 Rizky 负责现场杯盖数量核实。',collision:true,ok:false},
   {text:'请让 Rizky Ahmad 负责现场杯盖数量核实。',collision:true,ok:true},
   {text:'请让 Rizkyana 负责现场杯盖数量核实。',ok:false},
  ]){
   const f=await fixture();await prisma.staff.update({where:{id:f.employee.staffId},data:{name:'Rizky Ahmad'}});await prisma.staff.update({where:{id:f.other.staffId},data:{name:scenario.collision?'Rizky Putra':'Naila'}});
   const who=scenario.employee||scenario.decision?f.other:f.owner,m=await send(f,who,scenario.decision?'现场还有一项工作需要安排。':scenario.text);f.job={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:who.staffId};
   if(scenario.decision){f.job.ownerDecision={requestId:randomUUID(),byStaffId:f.owner.staffId,at:new Date().toISOString(),text:scenario.text};await native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(m.seq).padStart(12,'0'),{...f.job})}
   const proposal={...f.proposal,assignedStaffId:f.employee.staffId};if(scenario.ok){const a=await ensure(f,proposal);assert.equal(a.assignedStaffId,f.employee.staffId);assert.equal(a.sourceJobId,m.id);assert.equal(a.status,'waiting_details')}else await assert.rejects(()=>ensure(f,proposal),/ASSIGNMENT_REQUIRED/,JSON.stringify(scenario));
  }
 });
 await check('public and meeting conversations preserve current participant access',async()=>{
  for(const kind of ['public','meeting']){const f=await fixture();f.c.kind=kind;await native.writeTeam(prisma,f.storeId,'channel.'+f.c.id,f.c);const a=await ensure(f);assert.equal(a.channelId,f.c.id);assert.equal((await mod.listActions(prisma,f.employee,f.c.id)).length,1)}
 });
 await check('transaction rollback preserves no action/origin/audit side effect',async()=>{
  const f=await fixture(),before=await prisma.config.count({where:{storeId:f.storeId,key:{startsWith:'team.communication.management.action.'}}});await assert.rejects(()=>tx(async t=>{await mod.ensureAction(t,f.owner,f.c,f.job,f.proposal);throw Error('synthetic rollback')}),/synthetic rollback/);assert.equal(await prisma.config.count({where:{storeId:f.storeId,key:{startsWith:'team.communication.management.action.'}}}),before);assert.equal((await mod.listActions(prisma,f.owner,f.c.id)).length,0);
 });
 async function dueFixture(){const f=await fixture('将在 2030-01-01T12:00:00Z 提交包材数量。');f.action=await ensure(f,{...f.proposal,evidenceRequired:'数量和实物文字说明',dueAt:'2030-01-01T12:00:00Z',deadlineSourceSeq:1});f.now=Date.parse(f.action.dueAt)+1;await native.writeTeam(prisma,f.storeId,'workflow.policy.'+f.c.id,{enabled:true,paused:false,automaticSend:true,management:{ownerStaffId:f.owner.staffId},operatorUserId:f.owner.id,operatorStaffId:f.owner.staffId,employeeIds:[]});return f}
 await check('concurrent followup leases yield one candidate; undispatched lease can recover after expiration',async()=>{
  const f=await dueFixture(),calls=await Promise.all([tx(t=>mod.followupDue(t,f.storeId,()=>f.now,'w1')),tx(t=>mod.followupDue(t,f.storeId,()=>f.now,'w2'))]);assert.equal(calls.flat().length,1);const a=calls.flat()[0];assert.match(a.followup.requestId,/^[a-f0-9]{64}$/);const later=await tx(t=>mod.followupDue(t,f.storeId,()=>f.now+30001,'restarted-worker'));assert.equal(later.length,1);assert.equal(later[0].followup.requestId,a.followup.requestId);assert.notEqual(later[0].followup.leaseToken,a.followup.leaseToken);
 });
 await check('paused/disabled/exception-ineligible actions are not repeatedly claimed or versioned',async()=>{
  const f=await dueFixture();await native.writeTeam(prisma,f.storeId,'workflow.policy.'+f.c.id,{enabled:true,paused:true});for(let n=0;n<3;n++)assert.deepEqual(await tx(t=>mod.followupDue(t,f.storeId,()=>f.now+n*60000,'worker',async()=>true)),[]);let [r]=await mod.listActions(prisma,f.owner,f.c.id);assert.equal(r.version,f.action.version);assert(!r.followup);
  await native.writeTeam(prisma,f.storeId,'workflow.policy.'+f.c.id,{enabled:true,paused:false});assert.deepEqual(await tx(t=>mod.followupDue(t,f.storeId,()=>f.now,'worker',async()=>false)),[]);[r]=await mod.listActions(prisma,f.owner,f.c.id);assert.equal(r.version,f.action.version);assert(!r.followup);
 });
 await check('restart after dispatch retains unknown result and never blindly resends or blames employee',async()=>{
  const f=await dueFixture(),[a]=await tx(t=>mod.followupDue(t,f.storeId,()=>f.now));await tx(t=>mod.beginFollowup(t,f.storeId,a.id,a.followup.leaseToken,f.now));await prisma.$disconnect();const again=await tx(t=>mod.followupDue(t,f.storeId,()=>f.now+60000,'new-connection-after-restart'));assert.equal(again.length,0);const [stored]=await mod.listActions(prisma,f.owner,f.c.id);assert.equal(stored.followup.deliveryState,'unknown');assert.equal(stored.status,'open');assert(!stored.events.some(e=>/punish|violation/.test(e.action)));
 });
 await check('in_app needs a native reminder receipt, means saved only, not delivery/read/completion',async()=>{
  const f=await dueFixture(),[a]=await tx(t=>mod.followupDue(t,f.storeId,()=>f.now)),token=a.followup.leaseToken;await tx(t=>mod.beginFollowup(t,f.storeId,a.id,token,f.now));await assert.rejects(()=>tx(t=>mod.settleFollowup(t,f.storeId,a.id,token,{state:'in_app',reminderId:a.followup.requestId},f.now)),/RECEIPT_REQUIRED/);
  await work.writeWork(f.storeId,'reminder.'+f.employee.staffId+'.'+a.followup.requestId,{id:a.followup.requestId,staffId:f.employee.staffId,userId:f.employee.id,title:'Synthetic action followup',url:'/team?channel='+f.c.id},prisma);
  const r=await tx(t=>mod.settleFollowup(t,f.storeId,a.id,token,{state:'in_app',reminderId:a.followup.requestId},f.now));assert.equal(r.followup.deliveryState,'in_app');assert.equal(r.followup.state,'settled');assert.equal(r.status,'open');assert.deepEqual(await tx(t=>mod.followupDue(t,f.storeId,()=>f.now+60000)),[]);
 });
 await check('plain completion/evidence is unverified until authenticated owner checks criteria',async()=>{
  const f=await dueFixture();for(const text of ['好的','收到','ok','siap','baik','sudah selesai','好的，我已经完成了']){const claim=await send(f,f.employee,text);await assert.rejects(()=>tx(t=>mod.advanceAction(t,f.employee,f.c.id,f.action.id,f.action.version,{requestId:randomUUID(),action:'submit_evidence',note:'纯完成声称不算证据',sourceSeq:[claim.seq]})),/EVIDENCE_REQUIRED/)}const m=await send(f,f.employee,'现场杯盖50个，破损2个，已核实待到货采购单尚未收货。'),a=await tx(t=>mod.advanceAction(t,f.employee,f.c.id,f.action.id,f.action.version,{requestId:randomUUID(),action:'submit_evidence',note:'员工提交现场数量说明，仍待人工核实',sourceSeq:[m.seq]}));assert.equal(a.status,'awaiting_evidence');assert.notEqual(a.status,'verified');assert.deepEqual(a.evidence[0],{sourceSeq:m.seq,attachmentIds:[],attachmentReview:'not_performed'});
  await assert.rejects(()=>tx(t=>mod.advanceAction(t,f.employee,f.c.id,a.id,a.version,{requestId:randomUUID(),action:'verify',note:'我说已经完成',criteriaConfirmed:true})),/OWNER_REQUIRED/);
  await assert.rejects(()=>tx(t=>mod.advanceAction(t,f.owner,f.c.id,a.id,a.version,{requestId:randomUUID(),action:'verify',note:'尚未核实'})),/HUMAN_VERIFICATION_REQUIRED/);
  const v=await tx(t=>mod.advanceAction(t,f.owner,f.c.id,a.id,a.version,{requestId:randomUUID(),action:'verify',note:'负责人核对了数量文字与现场记录，符合既有标准',criteriaConfirmed:true}));assert.equal(v.status,'verified');
 });
 await check('HTTP export reports durable action closure, missing details and truthful operating boundaries',async()=>{
  const express=require(root+'/server/node_modules/express'),jwt=require(root+'/server/node_modules/jsonwebtoken'),{config}=require(root+'/server/dist/config/env');
  const {authenticateBeforeRouting}=require(root+'/server/dist/middlewares/auth'),{declareAccessRoutes}=require(root+'/server/dist/middlewares/staffAccessV2'),{teamCommunicationRouter}=require(root+'/server/dist/routes/teamCommunication');
  const {projectManagementOwnerTodos}=require(root+'/server/dist/services/NotificationInboxService');
  const app=express();app.use(express.json());app.use('/api/team',authenticateBeforeRouting,declareAccessRoutes('/api/team',teamCommunicationRouter));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const http=async(actor,method,target,data)=>{const token=jwt.sign({...actor,issuedAtMs:Date.now()},config.jwt.secret,{expiresIn:'1h'}),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/team'+target,{method,headers:{Authorization:'Bearer '+token,...(actor.employeeApp?{'X-Client-App':'employee'}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.data};
  try{for(const terminal of ['verify','cancel']){
   const f=await dueFixture();let current=f.action;const origins=[{...f.job}];
   for(let i=0;i<3;i++){const m=await send(f,f.other,'补充同一包材事项的现场情况 '+i),j={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.other.staffId};current=await tx(t=>mod.ensureAction(t,f.owner,f.c,j,{...f.proposal,actionId:current.id,expectedVersion:current.version}));origins.push(j)}
   const policy={enabled:true,paused:false,automaticSend:true,operatorUserId:f.owner.id,operatorStaffId:f.owner.staffId,audienceHash:crypto.createHash('sha256').update(JSON.stringify(f.c.members)).digest('hex'),employeeIds:[f.employee.staffId,f.other.staffId],management:{ownerStaffId:f.owner.staffId,sourceFloor:1,employees:[{staffId:f.employee.staffId,employeeName:'Synthetic employee'},{staffId:f.other.staffId,employeeName:'Synthetic other'}]}};
   await native.writeTeam(prisma,f.storeId,'workflow.policy.'+f.c.id,policy);
   const stored=[];
   for(let i=0;i<origins.length;i++){const j={...origins[i],version:4,status:i===2?'awaiting_owner':'pending_action',managementActionId:i===3?randomUUID():current.id,attempt:0,billingStatus:'not_started',billingAttempts:[],updatedAt:'2026-10-20T00:00:00.000Z',management:{kind:'pending_action',knownFacts:['系统库存快照；不代表现场实盘']},result:{summaryZh:'员工陈述未核实',replyText:'已记录待处理',suggestedTask:null,exceptions:[]},ownerDecision:{text:'保留真人决定',byStaffId:f.owner.staffId,at:'2026-10-20T00:00:00.000Z',requestId:randomUUID()}};await native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(j.sourceSeq).padStart(12,'0'),j);stored.push(j)}
   const before=await projectManagementOwnerTodos(prisma,f.owner);for(const j of stored.slice(0,2))assert(before.some(x=>x.objectId===j.id&&x.pending));
   if(terminal==='verify'){const evidence=await send(f,f.employee,'实盘杯盖50个，现场记录已核对2个破损。');current=await http(f.employee,'POST',`/channels/${f.c.id}/management/actions/${current.id}/actions`,{requestId:randomUUID(),expectedVersion:current.version,action:'submit_evidence',note:'提交实盘文字，等待真人核验',sourceSeq:[evidence.seq]})}
   const eventPrefix=native.TEAM_PREFIX+'workflow.event.'+f.c.id+'.',beforeEvents=await prisma.config.count({where:{storeId:f.storeId,key:{startsWith:eventPrefix}}});
   const input={requestId:randomUUID(),expectedVersion:current.version,action:terminal,note:terminal==='verify'?'真人负责人核对实盘文字与验收标准':'负责人取消重复工作事项',criteriaConfirmed:terminal==='verify'};
   const closed=await http(f.owner,'POST',`/channels/${f.c.id}/management/actions/${current.id}/actions`,input);assert.equal(closed.status,terminal==='verify'?'verified':'cancelled');
   const after=await projectManagementOwnerTodos(prisma,f.owner);for(const j of stored.slice(0,2)){assert(!after.some(x=>x.objectId===j.id&&x.pending));const live=await native.readTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(j.sourceSeq).padStart(12,'0'));assert.equal(live.status,'reviewed');assert.equal(live.version,j.version+1);assert.deepEqual(live.result,j.result);assert.deepEqual(live.ownerDecision,j.ownerDecision);assert.deepEqual(live.billingAttempts,j.billingAttempts)}
   for(const j of stored.slice(2)){const live=await native.readTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(j.sourceSeq).padStart(12,'0'));assert.deepEqual(live,j);assert(after.some(x=>x.objectId===j.id&&x.pending))}
   const eventCount=await prisma.config.count({where:{storeId:f.storeId,key:{startsWith:eventPrefix}}});assert.equal(eventCount,beforeEvents+2);assert.equal((await http(f.owner,'POST',`/channels/${f.c.id}/management/actions/${current.id}/actions`,input)).version,closed.version);assert.equal(await prisma.config.count({where:{storeId:f.storeId,key:{startsWith:eventPrefix}}}),eventCount);
   const missingMessage=await send(f,f.employee,'还有另一项物料情况需要核实。'),missingJob={...f.job,id:missingMessage.id,sourceSeq:missingMessage.seq};const missing=await tx(t=>mod.ensureAction(t,f.owner,f.c,missingJob,f.proposal));assert.equal(missing.status,'waiting_details');
   const exported=await http(f.owner,'GET',`/channels/${f.c.id}/workflow/export`),done=exported.actions.find(x=>x.id===closed.id),waiting=exported.actions.find(x=>x.id===missing.id);assert.equal(done.status,closed.status);assert.equal(done.assignedStaffId,f.employee.staffId);assert.equal(done.dueAt,f.action.dueAt);assert.equal(done.evidence.length,terminal==='verify'?1:0);assert.equal(done.followup,null);assert.equal(waiting.status,'waiting_details');assert.equal(waiting.dueAt,null);assert.equal(waiting.evidenceRequired,null);assert.deepEqual(waiting.evidence,[]);assert.match(exported.textZh,/期限 待明确/);assert.match(exported.textZh,/证据 待明确/);
   assert(exported.details.some(d=>d.knownSystemSnapshots.includes('系统库存快照；不代表现场实盘')));assert.deepEqual(exported.operatingBoundaries,{inventoryIsPhysicalCount:false,completionRequiresEvidenceAndHumanVerification:true,deviceDeliveryVerified:false,autonomousDotSupervisionVerified:false,profitCalculated:false});assert(!/利润已核算|设备已送达|ChatGPT已唤醒|已自动巡店/.test(exported.textZh));
  }}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
 });
 await check('own saved source handling is private, incremental and respects current membership/history floor',async()=>{
  const f=await fixture('本人保存的问题。'),other=await send(f,f.other,'同事保存的问题。'),last=await send(f,f.employee,'本人第二个问题。');
  const put=patch=>native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(f.message.seq).padStart(12,'0'),{...f.job,status:'uncertain',updatedAt:'2026-10-20T00:00:00Z',error:'PRIVATE_ERROR',result:{replyText:'PRIVATE_DRAFT'},billingAttempts:[{secret:'PRIVATE_COST'}],...patch});
  await put({});await native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(other.seq).padStart(12,'0'),{...f.job,id:other.id,sourceSeq:other.seq,sourceAuthorId:f.other.staffId,status:'blocked',updatedAt:'2026-10-20T00:00:00Z'});
  const initial=await native.teamCommunication(prisma).messages(f.employee,f.c.id,0);assert.deepEqual(initial.messages.find(m=>m.id===f.message.id).aiHandling,{state:'needs_review',updatedAt:'2026-10-20T00:00:00Z'});assert.equal(initial.messages.find(m=>m.id===other.id).aiHandling,undefined);assert(!JSON.stringify(initial).includes('PRIVATE_'));
  await put({status:'reviewed',management:{kind:'no_reply'}});const poll=await native.teamCommunication(prisma).messages(f.employee,f.c.id,last.seq);assert.deepEqual(poll.messages,[]);assert.equal(poll.cursor,last.seq);assert.equal(poll.aiHandlingUpdates.find(u=>u.messageId===f.message.id).aiHandling.state,'understood');assert(!poll.aiHandlingUpdates.some(u=>u.messageId===other.id));
  await put({status:'queued'});await native.writeTeam(prisma,f.storeId,'workflow.defaults',{enabled:false});assert.equal((await native.teamCommunication(prisma).messages(f.employee,f.c.id,last.seq)).aiHandlingUpdates.find(u=>u.messageId===f.message.id).aiHandling.state,'paused');
  await put({sourceAuthorId:f.other.staffId});assert.equal((await native.teamCommunication(prisma).messages(f.employee,f.c.id,last.seq)).aiHandlingUpdates.find(u=>u.messageId===f.message.id).aiHandling,null);
  f.c.members.find(m=>m.staffId===f.employee.staffId).fromSeq=2;await native.writeTeam(prisma,f.storeId,'channel.'+f.c.id,f.c);const moved=await native.teamCommunication(prisma).messages(f.employee,f.c.id,last.seq);assert(!moved.aiHandlingUpdates.some(u=>u.messageId===f.message.id));
  f.c.members=f.c.members.filter(m=>m.staffId!==f.employee.staffId);await native.writeTeam(prisma,f.storeId,'channel.'+f.c.id,f.c);await assert.rejects(()=>native.teamCommunication(prisma).messages(f.employee,f.c.id,last.seq),/MEMBERSHIP_REQUIRED/);const foreign=await fixture();await assert.rejects(()=>native.teamCommunication(prisma).messages(foreign.employee,f.c.id,0),/CHANNEL_NOT_FOUND/);
 });
 await check('preview action validation never writes an action, receipt, audit or contribution event',async()=>{
  const snapshot=async f=>JSON.stringify({config:await prisma.config.findMany({where:{storeId:f.storeId},orderBy:{key:'asc'}}),audit:await prisma.financeAuditLog.findMany({where:{storeId:f.storeId},orderBy:{id:'asc'}})});
  const f=await fixture(),before=await snapshot(f),preview=await tx(t=>mod.ensureAction(t,f.owner,f.c,f.job,{...f.proposal,dueAt:'2030-01-01T12:00:00Z',evidenceRequired:'现场文字'},Date.now(),{previewOnly:true}));assert.equal(preview.dueAt,null);assert.equal(preview.status,'waiting_details');assert.equal(await snapshot(f),before);
  const real=await ensure(f),m=await send(f,f.other,'同事项补充现场信息。'),job={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.other.staffId},withSource=await snapshot(f),contribution=await tx(t=>mod.ensureAction(t,f.owner,f.c,job,{...f.proposal,actionId:real.id,expectedVersion:real.version},Date.now(),{previewOnly:true}));assert.equal(contribution.version,real.version);assert.equal(contribution.sourceJobs.length,1);assert.equal(await snapshot(f),withSource);
 });
 await check('owner unavailable recovery remains visible and only an existing live administrator can explicitly cancel',async()=>{
  const express=require(root+'/server/node_modules/express'),jwt=require(root+'/server/node_modules/jsonwebtoken'),{config}=require(root+'/server/dist/config/env');const{authenticateBeforeRouting}=require(root+'/server/dist/middlewares/auth'),{declareAccessRoutes}=require(root+'/server/dist/middlewares/staffAccessV2'),{teamCommunicationRouter}=require(root+'/server/dist/routes/teamCommunication');
  const app=express();app.use(express.json());app.use('/api/team',authenticateBeforeRouting,declareAccessRoutes('/api/team',teamCommunicationRouter));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const http=async(actor,method,target,data)=>{const token=jwt.sign({...actor,issuedAtMs:Date.now()},config.jwt.secret,{expiresIn:'1h'}),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/team'+target,{method,headers:{Authorization:'Bearer '+token,...(actor.employeeApp?{'X-Client-App':'employee'}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:response.status,body:await response.json()}};
  try{
   const f=await fixture(),created=await ensure(f),m=await send(f,f.other,'补充原行动，仍然待明确。'),j={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.other.staffId},action=await tx(t=>mod.ensureAction(t,f.owner,f.c,j,{...f.proposal,actionId:created.id,expectedVersion:created.version}));
   const jobs=[f.job,j];for(const source of jobs)await native.writeTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(source.sourceSeq).padStart(12,'0'),{...source,version:3,status:'pending_action',managementActionId:action.id,result:{summaryZh:'保留原始草稿'},updatedAt:'2026-10-20T00:00:00Z'});
   await prisma.user.update({where:{id:f.owner.id},data:{role:'cashier'}});await prisma.user.update({where:{id:f.other.id},data:{role:'admin'}});const admin={...f.other,role:'admin',employeeApp:false},base=`/channels/${f.c.id}/management/actions`;
   const own=await http(f.employee,'GET',base);assert.equal(own.status,200,JSON.stringify(own));assert.equal(own.body.data.actions[0].blockedReason,'responsible_owner_unavailable');assert.equal(own.body.data.actions[0].canCancelBlocked,false);
   const peer=await http(admin,'GET',base);assert.equal(peer.status,200,JSON.stringify(peer));assert.equal(peer.body.data.actions[0].canCancelBlocked,true);assert.equal(peer.body.data.actions[0].assignedStaffId,f.employee.staffId);
   const input={requestId:randomUUID(),expectedVersion:action.version,action:'cancel',note:'原负责人已失效；同群管理员明确关闭，待另行确认新安排'};
   assert.equal((await http(f.employee,'POST',base+'/'+action.id+'/actions',input)).status,409);assert.equal((await http(f.owner,'POST',base+'/'+action.id+'/actions',input)).status>=400,true);assert.equal((await http(admin,'POST',base+'/'+action.id+'/actions',{...input,requestId:randomUUID(),expectedVersion:action.version+1})).status,409);
   const foreign=await fixture();assert.equal((await http(foreign.owner,'GET',base)).status,404);const foreignCancel=await http(foreign.owner,'POST',base+'/'+action.id+'/actions',input);assert.equal(foreignCancel.status,409);assert.equal(foreignCancel.body.message,'TEAM_MANAGEMENT_ACTION_NOT_FOUND');assert.equal((await native.readTeam(prisma,f.storeId,'management.action.'+action.id)).version,action.version);
   const blocked=await http(admin,'POST',base+'/'+action.id+'/actions',{...input,requestId:randomUUID(),action:'verify',criteriaConfirmed:true});assert.equal(blocked.status,409);assert(!['verified'].includes((await native.readTeam(prisma,f.storeId,'management.action.'+action.id)).status));
   const cancelled=await http(admin,'POST',base+'/'+action.id+'/actions',input);assert.equal(cancelled.status,200,JSON.stringify(cancelled));assert.equal(cancelled.body.data.status,'cancelled');assert.equal(cancelled.body.data.operatorUserId,f.owner.id);assert.equal(cancelled.body.data.operatorStaffId,f.owner.staffId);for(const source of jobs){const stored=await native.readTeam(prisma,f.storeId,'workflow.job.'+f.c.id+'.'+String(source.sourceSeq).padStart(12,'0'));assert.equal(stored.status,'reviewed');assert.equal(stored.version,4);assert.deepEqual(stored.result,{summaryZh:'保留原始草稿'})}
   const before=(await mod.listActions(prisma,admin,f.c.id))[0];assert.equal((await http(admin,'POST',base+'/'+action.id+'/actions',input)).body.data.version,before.version);
   // A genuinely new administrator cannot use a newly granted history floor to close an old audience-bound action.
   const g=await fixture(),old=await ensure(g);await prisma.user.update({where:{id:g.owner.id},data:{role:'cashier'}});await prisma.user.update({where:{id:g.other.id},data:{role:'admin'}});g.c.members.find(x=>x.staffId===g.other.staffId).fromSeq=2;await native.writeTeam(prisma,g.storeId,'channel.'+g.c.id,g.c);const newcomer={...g.other,role:'admin',employeeApp:false},scoped=`/channels/${g.c.id}/management/actions`;const hidden=await http(newcomer,'GET',scoped);assert.equal(hidden.status,200);assert.deepEqual(hidden.body.data.actions,[]);assert.equal((await http(newcomer,'POST',scoped+'/'+old.id+'/actions',{...input,requestId:randomUUID(),expectedVersion:old.version})).status,409);
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
 });
 await check('sebelum affirmative deadline remains valid while belum and negative assignment remain blocked',async()=>{
  for(const [text,expected]of[['Saya akan selesai sebelum 2030-01-01T12:00:00Z.','2030-01-01T12:00:00Z'],['Saya belum selesai pada 2030-01-01T12:00:00Z.',null],['Saya tidak akan selesai pada 2030-01-01T12:00:00Z.',null]]){const f=await fixture(text),a=await ensure(f,{...f.proposal,evidenceRequired:'现场数量说明',dueAt:'2030-01-01T12:00:00Z',deadlineSourceSeq:1});assert.equal(a.dueAt,expected);assert.equal(a.status,expected?'open':'waiting_details')}
  for(const [text,ok]of[['Tolong Rizky periksa sebelum tutup.',true],['Jangan tugaskan Rizky untuk pemeriksaan.',false]]){const f=await fixture();await prisma.staff.update({where:{id:f.employee.staffId},data:{name:'Rizky Ahmad'}});const m=await send(f,f.owner,text);f.job={...f.job,id:m.id,sourceSeq:m.seq,sourceAuthorId:f.owner.staffId};const proposal={...f.proposal,assignedStaffId:f.employee.staffId};if(ok)assert.equal((await ensure(f,proposal)).assignedStaffId,f.employee.staffId);else await assert.rejects(()=>ensure(f,proposal),/ASSIGNMENT_REQUIRED/)}
 });
 await check('member removal/history floor or employee account rebinding hides old action and followup',async()=>{
  const f=await dueFixture();f.c.members=f.c.members.filter(m=>m.staffId!==f.other.staffId);await native.writeTeam(prisma,f.storeId,'channel.'+f.c.id,f.c);assert.equal((await mod.listActions(prisma,f.owner,f.c.id)).length,0);assert.equal((await tx(t=>mod.followupDue(t,f.storeId,()=>f.now))).length,0);
 });
 const out=root+'/output/team-management-actions';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+(caseFilter?(process.env.CASE_FILTER.includes('owner unavailable')?'/owner-recovery-results.json':process.env.CASE_FILTER.includes('own saved source')?'/ai-handling-pg-results.json':process.env.CASE_FILTER.includes('HTTP export')?'/export-results.json':'/owner-directive-results.json'):'/pg-results.json'),JSON.stringify({passed,testRun:process.env.BT_TEST_RUN,realPostgres:true,modelCalls:0,productionWrites:0},null,2));
 }finally{await prisma.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
