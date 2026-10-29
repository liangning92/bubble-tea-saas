/* Real owned PostgreSQL/native queues and records; synthetic provider callbacks.
 * No model/network provider, production account, inventory mutation or payment. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),build=process.env.OPERATIONS_BUILD_ROOT||root+'/server/dist',built=n=>require(build+'/services/'+n);
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const {teamCommunication,readTeam,writeTeam}=built('TeamCommunicationService');
const {agentSettingsService,defaultAgentSettings}=built('AgentSettingsService');
const {createOperationsDelegation,submitOperationsTask,operationsTaskStatus}=built('StoreOperationsDelegationService');
const {createEmployeeRuntime}=built('teamAgentBridge/employeeRuntime'),{createEmployeeOrchestration}=built('teamAgentBridge/employeeOrchestration');
const {employeeRuntimeDigest:hash,readEmployeeRuntimeSource}=built('teamAgentBridge/employeeRuntimeSources'),{readCommunicationScope}=built('teamAgentBridge/confidentiality');
const {assertOperationRequester}=built('teamAgentBridge/employeeOperationAuthority');
const {getTrainingLibrary}=built('TrainingLibraryService'),{storeAgentMemory,readAgentMemories}=built('AgentMemoryService');
const db=new PrismaClient(),storeId='operations-native-fixture',agentId=randomUUID(),passed=[];
const owner={id:'ops-owner',staffId:'ops-owner-staff',storeId,role:'admin'},employee={id:'ops-employee',staffId:'ops-employee-staff',storeId,role:'staff',employeeApp:true};
const system=[{role:'system',content:'Synthetic isolated operational test assembly, no manager/private files'}],ports={gatewayHealth:async()=>({status:'ok',protocol:'employee_work_trace_v1',maxConcurrency:1,queued:0,running:0})};
const check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
async function main(){
 const {declareAccessRoutes}=require(build+'/middlewares/staffAccessV2');declareAccessRoutes('/api/team',require(build+'/routes/teamCommunication').teamCommunicationRouter);
 const backend=built('ManagementBackendRegistry');
 const tenant=await db.tenant.create({data:{name:'Owned operations fixture'}});await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic operations'}});
 for(const [a,phone]of[[owner,'08977110001'],[employee,'08977110002']])await db.user.create({data:{id:a.id,phone,password:'synthetic-never-login',role:a.role,storeId,staff:{create:{id:a.staffId,storeId,name:a.staffId,employeeNumber:a.staffId}}}});
 const installed={agentId,displayName:'Existing synthetic Hermes',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send','tasks.read'],staffIds:[owner.staffId,employee.staffId],channelIds:[]};
 await db.config.create({data:{storeId,key:'externalAgent.teamBridge.v1.grant.'+agentId,category:'test',value:JSON.stringify(installed)}});
 process.env.EMPLOYEE_HERMES_ENABLED='1';process.env.EMPLOYEE_HERMES_STORE_ID=storeId;process.env.EMPLOYEE_HERMES_AGENT_ID=agentId;
 await agentSettingsService(db).saveSettings(owner,{...defaultAgentSettings(),operationProfile:'store_operations',enabled:true,employeeBridgeEnabled:true,expiresAt:installed.expiresAt});
 const loadGrant=async(tx=db)=>JSON.parse((await tx.config.findUnique({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.grant.'+agentId}}})).value);
 let binding,submitted,captured;const capturedTickets=[];
 await check('normal full-role owner binding creates one native private owner/Hermes route and preserves employee accounts',async()=>{
  binding=await createOperationsDelegation(storeId,owner.id,{activityIds:[],expiresAt:installed.expiresAt,confirm:'full_store_operations_role'},db);
  assert.equal(binding.ownerTaskChannels.length,1);const c=await readTeam(db,storeId,'channel.'+binding.ownerTaskChannels[0].id);
  assert.deepEqual(c.members.map(m=>m.staffId).sort(),[owner.staffId,'agent:'+agentId].sort());assert.equal((await db.user.findUnique({where:{id:employee.id}})).role,'staff');
  const again=await createOperationsDelegation(storeId,owner.id,{activityIds:[],expiresAt:installed.expiresAt,confirm:'full_store_operations_role'},db);assert.equal(again.ownerTaskChannels[0].id,c.id);
 });
 const channelId=binding.ownerTaskChannels[0].id,taskId=binding.ownerTaskChannels[0].taskId;
 await db.hygieneArea.create({data:{storeId,name:'Bar',code:'bar'}});
 await check('owner delegation submit uses actual native intake exactly once and marks the source as delegated',async()=>{
  const request={requestId:randomUUID(),channelId,text:'Jadwalkan pembersihan area bar dan latihan dari SOP yang sudah diterbitkan untuk pegawai. Jangan tandai selesai.'};
  submitted=await submitOperationsTask(binding.credential,request,db,ports);assert.equal(submitted.agentId,agentId);assert.equal(submitted.businessCompleted,false);
  const again=await submitOperationsTask(binding.credential,request,db,ports);assert.equal(again.messageId,submitted.messageId);assert.equal(again.alreadySubmitted,true);
  const message=await readTeam(db,storeId,'message.'+channelId+'.'+String(submitted.sourceSeq).padStart(12,'0'));assert.equal(message.origin.kind,'owner_operations_delegation');assert.equal(message.authorName,'Operations Agent (owner delegation)');
  assert.equal(await db.config.count({where:{storeId,key:{startsWith:'externalAgent.teamBridge.v1.employeePending.'}}}),1);
 });
 const runtime=createEmployeeRuntime(db,{enabled:true,storeId,approvedSystemHashes:[hash(system)],resolveGrant:loadGrant,tasks:{assert:async(tx,g,t,c)=>{const binding=JSON.parse((await tx.config.findUnique({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.channel.'+c}}})).value);assert.equal(binding.agentId,g.agentId);assert.equal(binding.task.taskId,t.taskId);const task=await readTeam(tx,storeId,'task.'+c+'.'+t.taskId);assert.equal(t.version,task.version)}},readAttachment:async()=>{throw Error('No fixture attachments')}});
 const orchestration=createEmployeeOrchestration(db,{enabled:true,storeId,runtime,gateway:{start:async e=>{capturedTickets.push(e.ticket);if(e.ticket.requestSource?.channelId===channelId)captured=e.ticket;return{executionId:e.ticket.executionId,state:'running'}}},issueCredentials:async()=>({callbackCredential:'synthetic-not-used-callback-credential',providerCredential:'synthetic-not-used-provider-credential'})});
 await check('the existing orchestration worker starts the same Hermes runtime from the real intake',async()=>{await orchestration.drain(1);assert(captured);assert.equal(captured.isAdmin,true);assert(captured.tools.some(t=>t.function.name==='employee_backend'));assert(!captured.tools.some(t=>t.function.name.startsWith('employee_manage_')));});
 await check('private owner native execution cannot publish into a staff channel; target execution can reply normally',async()=>{
  const target=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Staff scoped native fixture',kind:'group',members:[employee.staffId,'agent:'+agentId]});
  const nativeMessage=async(rt,t,id,text,override={})=>{
   const request={model:t.model,messages:[...system,{role:'user',content:t.sealedUserContent}],tools:t.tools,stream:true};
   let v=(await rt.host.recordInput({executionId:t.executionId,expectedTraceVersion:t.traceVersion,turn:1,inputHash:hash(request),toolSchemaHash:t.toolSchemaHash,isolation:t.isolation,providerRequest:request})).traceVersion;
   const args={action:'execute',operationId:'POST /api/team/channels/:id/messages',contractVersion:backend.backendVersion(),pathParams:{id},body:{requestId:randomUUID(),text,files:[],expectedLastSeq:(await readTeam(db,storeId,'channel.'+id)).lastSeq},...override},call={id:'native-message-'+randomUUID(),type:'function',function:{name:'employee_backend',arguments:JSON.stringify(args)}},assistant={role:'assistant',content:null,tool_calls:[call]};
   v=(await rt.host.recordResponse({executionId:t.executionId,expectedTraceVersion:v,turn:1,providerRequestId:'native-privacy-'+t.executionId,finishReason:'tool_calls',providerMessage:assistant})).traceVersion;
   const result=await rt.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:'employee_backend',args});
   await rt.host.markUnknown(t.executionId,result.traceVersion,'ISOLATED_FIXTURE_FINISHED');
   return result.value;
  };
  const denied=await nativeMessage(runtime,captured,target.id,'Private owner financial sentinel 738194, never disclose.');
  assert.equal(denied.ok,false);assert(!JSON.stringify(await teamCommunication(db).messages(owner,target.id,0)).includes('738194'));
  // A new target-scoped execution loads ONLY an actual target-visible human
  // message, never the parent execution or its memory/tool results.
  const human=await teamCommunication(db).send(employee,target.id,{requestId:randomUUID(),text:'Boleh jelaskan tugas membersihkan bar?'});
  const g=await loadGrant(),bindingRow=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.channel.'+target.id}}})).value);
  const ownerSource=await submitOperationsTask(binding.credential,{requestId:randomUUID(),channelId,text:'Lanjutkan permintaan pegawai pada kanal sasaran tanpa menyalin konteks pribadi.'},db,ports);
  await orchestration.drain(5);const delegateTicket=capturedTickets.find(t=>t.requestSource?.messageId===ownerSource.messageId);assert(delegateTicket);
  const continued=await nativeMessage(runtime,delegateTicket,target.id,'',{operationId:'POST /api/team/channels/:id/agent-continuations',body:{requestId:randomUUID(),sourceSeq:human.seq}});
  assert.equal(continued.ok,true,JSON.stringify(continued));assert.equal(continued.data.data.parentContextTransferred,false);assert.equal(continued.data.data.alreadySubmitted,true);
  assert.equal((await readTeam(db,storeId,'channel.'+target.id)).lastSeq,human.seq);
  await assert.rejects(()=>teamCommunication(db).continueAgent(employee,target.id,{requestId:randomUUID(),sourceSeq:human.seq}),/TEAM_HOST_REQUIRED/);
  await assert.rejects(()=>teamCommunication(db).continueAgent(owner,target.id,{requestId:randomUUID(),sourceSeq:human.seq,history:'PRIVATE_PARENT_SENTINEL'}));
  const {employeeIntakeKey}=built('teamAgentBridge/employeeIntake'),pendingKey=employeeIntakeKey(continued.data.data.eventId),originalPending=await db.config.findUnique({where:{storeId_key:{storeId,key:pendingKey}}});
  for(const state of ['received','unknown','blocked']){
   const frozen=JSON.stringify({...JSON.parse(originalPending.value),state,reason:'ISOLATED_EXISTING_RECEIPT'});
   await db.config.update({where:{id:originalPending.id},data:{value:frozen}});
   const observed=await teamCommunication(db).continueAgent(owner,target.id,{requestId:randomUUID(),sourceSeq:human.seq});assert.equal(observed.state,state);assert.equal(observed.queued,false);
   assert.equal((await db.config.findUnique({where:{id:originalPending.id}})).value,frozen);
  }
  await db.config.update({where:{id:originalPending.id},data:{value:originalPending.value}});
  const replayId=randomUUID();await teamCommunication(db).continueAgent(owner,target.id,{requestId:replayId,sourceSeq:human.seq});
  await assert.rejects(()=>teamCommunication(db).continueAgent(owner,target.id,{requestId:replayId,sourceSeq:human.seq+1}),/TEAM_REQUEST_CONFLICT/);

  const expanded=await teamCommunication(db).continueAgent(owner,target.id,{requestId:randomUUID(),sourceSeq:human.seq});assert.equal(expanded.eventId,continued.data.data.eventId);
  const targetScope=await readCommunicationScope(db,g,bindingRow.task,target,employee.staffId);
  const childRuntime=createEmployeeRuntime(db,{enabled:true,storeId,approvedSystemHashes:[hash(system)],resolveGrant:loadGrant,tasks:{assert:async(tx,_g,t,c)=>{const task=await readTeam(tx,storeId,'task.'+c+'.'+t.taskId);assert.equal(task.version,t.version)}},readAttachment:async()=>{throw Error('NO_ATTACHMENTS')}});
  await orchestration.drain(5);const child=capturedTickets.find(t=>t.requestSource?.messageId===human.id);assert(child,'Existing target-channel worker must start the real clean execution');
  assert(!child.sealedUserContent.includes('738194'));assert(!child.sealedUserContent.includes(submitted.messageId));
  const sent=await nativeMessage(childRuntime,child,target.id,'Bersihkan bar sesuai SOP toko. Jika belum jelas, tanya di sini.');
  assert.equal(sent.ok,true,JSON.stringify(sent));assert.equal(sent.data.data.agent.agentId,agentId);
  const memberRequest=await submitOperationsTask(binding.credential,{requestId:randomUUID(),channelId,text:'Uji isolasi anggota kanal dalam fixture, jangan sebarkan konteks.'},db,ports);
  await orchestration.drain(5);const memberTicket=capturedTickets.find(t=>t.requestSource?.messageId===memberRequest.messageId);assert(memberTicket);
  const ownBefore=await readTeam(db,storeId,'channel.'+channelId);
  const changed=await nativeMessage(runtime,memberTicket,channelId,'',{operationId:'PUT /api/team/channels/:id/members',body:{expectedVersion:ownBefore.version,members:[...ownBefore.members.map(m=>m.staffId),employee.staffId],ownerId:owner.staffId,archived:false}});
  assert.equal(changed.ok,false);assert.deepEqual((await readTeam(db,storeId,'channel.'+channelId)).members,ownBefore.members);
  assert.equal((await readTeam(db,storeId,'channel.'+target.id)).lastSeq,human.seq+1,'Reconciliation must recognize the native reply and never publish a false failure or second answer');
  // Prepare a fresh real owner request for the following historical-upgrade
  // regressions, without reusing a completed/unknown source execution.
  submitted=await submitOperationsTask(binding.credential,{requestId:randomUUID(),channelId,text:'Jadwalkan pembersihan area bar dan latihan dari SOP yang sudah diterbitkan untuk pegawai. Jangan tandai selesai.'},db,ports);
  captured=null;await orchestration.drain(5);assert(captured);
 });
 const {saveActivity}=built('ActivityService'),{inspectDailyMembershipPolicy}=built('DailyMembershipOperationsService');
 const daily=await saveActivity(storeId,{name:'Synthetic daily special',type:'special_price',status:'published',weekdays:[0,1,2,3,4,5,6],rule:{price:8000}});
 const beforeMembership=await inspectDailyMembershipPolicy(storeId,db);
 await check('failed membership/activity business transactions leave neither partial configuration nor a false receipt',async()=>{
  const {applyDailyMembershipPolicy}=built('DailyMembershipOperationsService'),{saveActivityInTransaction,listActivities}=built('ActivityService');
  await assert.rejects(()=>db.$transaction(tx=>applyDailyMembershipPolicy(tx,{id:'rollback-fixture',storeId,ownerId:owner.id,activityIds:[daily.id]},{requestId:randomUUID(),expectedPolicyVersion:beforeMembership.policy.version,activities:[{id:daily.id,version:daily.version+1}],minimumPaidAmount:30000,memberOnly:true})),/ACTIVITY_VERSION_CHANGED/);
  assert.deepEqual(await inspectDailyMembershipPolicy(storeId,db),beforeMembership);
  const count=(await listActivities(storeId,db)).length;
  await assert.rejects(()=>db.$transaction(async tx=>{await saveActivityInTransaction(tx,storeId,{name:'Must roll back',type:'percent',status:'draft',rule:{percent:10}});throw Error('synthetic-trace-write-failure')}),/synthetic-trace-write-failure/);
  assert.equal((await listActivities(storeId,db)).length,count);
 });

 await db.store.create({data:{id:'foreign-fixture-store',tenantId:tenant.id,name:'Other synthetic store'}});const foreignCategory=await db.category.create({data:{storeId:'foreign-fixture-store',name:'Foreign category'}}),foreignProduct=await db.product.create({data:{storeId:'foreign-fixture-store',categoryId:foreignCategory.id,code:'FOREIGN-ONLY',name:'Must stay unchanged'}});
 // Upgrade fixture: resume an already-issued historical trace. Production never
 // upgrades its tool surface in place. New native execution coverage is in
 // management-backend-check; retain these legacy receipt/evidence regressions.
 const oldTools=['employee_manage_hygiene','employee_manage_training','employee_manage_membership','employee_manage_product'].map(name=>({type:'function',function:{name,description:'Historical persisted execution fixture',parameters:{type:'object',properties:{},additionalProperties:true}}}));
 const restoreHistoricalTicket=async t=>{
  const state=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId);
  t.tools=[...t.tools,...oldTools];
  const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!(k==='required'&&Array.isArray(v[k])&&!v[k].length)).map(k=>[k,normalize(v[k])])):v;
  t.toolSchemaHash=hash([...t.tools].map(normalize).sort((a,b)=>a.function.name<b.function.name?-1:a.function.name>b.function.name?1:0));
  state.ticket.tools=t.tools;state.ticket.toolSchemaHash=t.toolSchemaHash;
  await writeTeam(db,storeId,'employeeRuntime.execution.'+t.executionId,state);
 };
 await restoreHistoricalTicket(captured);
 const ticket=captured,p={model:ticket.model,messages:[...system,{role:'user',content:ticket.sealedUserContent}],tools:ticket.tools,stream:true};
 let version=(await runtime.host.recordInput({executionId:ticket.executionId,expectedTraceVersion:ticket.traceVersion,turn:1,inputHash:hash(p),toolSchemaHash:ticket.toolSchemaHash,isolation:ticket.isolation,providerRequest:p})).traceVersion;
 const course=getTrainingLibrary().modules[0],calls=[{id:'routine-cleaning',type:'function',function:{name:'employee_manage_hygiene',arguments:JSON.stringify({action:'assign_standard',staffId:employee.staffId,date:'2026-10-28',areaCode:'bar'})}},{id:'routine-training',type:'function',function:{name:'employee_manage_training',arguments:JSON.stringify({action:'assign_published_course',staffId:employee.staffId,date:'2026-10-28',courseKey:course.key})}}];
 calls.push({id:'membership-inspect',type:'function',function:{name:'employee_manage_membership',arguments:JSON.stringify({action:'inspect'})}},{id:'membership-apply',type:'function',function:{name:'employee_manage_membership',arguments:JSON.stringify({action:'apply',expectedPolicyVersion:beforeMembership.policy.version,activities:[{id:daily.id,version:daily.version}]})}});
 calls.push({id:'foreign-product',type:'function',function:{name:'employee_manage_product',arguments:JSON.stringify({action:'update_product',productId:foreignProduct.id,name:'Must never be saved'})}});
 const assistant={role:'assistant',content:null,tool_calls:calls};
 version=(await runtime.host.recordResponse({executionId:ticket.executionId,expectedTraceVersion:version,turn:1,providerRequestId:'synthetic-operation-turn-1',finishReason:'tool_calls',providerMessage:assistant})).traceVersion;
 const results=[];
 await check('standard routine callbacks create real pending cleaning and scheduled training from fixed/public sources',async()=>{
  for(let i=0;i<calls.length;i++){const c=calls[i],r=await runtime.host.executeTool({executionId:ticket.executionId,expectedTraceVersion:version,turn:1,callOrdinal:i,toolCallId:c.id,name:c.function.name,args:JSON.parse(c.function.arguments)});version=r.traceVersion;results.push(r);if(i<2)assert.equal(r.value.physicalCompletion,false)}
  assert.equal((await db.hygieneTask.findUnique({where:{id:results[0].value.taskId}})).status,'pending');assert.equal((await db.training.findUnique({where:{id:results[1].value.trainingId}})).status,'scheduled');assert.equal(results[1].value.source.kind,'published_training_module');
 });
 await check('the native Hermes membership tool commits the actual shared rule without altering prices or qualifying customers',async()=>{const current=await inspectDailyMembershipPolicy(storeId,db);assert.equal(current.policy.enabled,true);assert.equal(current.policy.minimumPaidAmount,30000);assert.equal(current.policy.qualifyOnce,true);assert.equal(current.activities[0].memberOnly,true);assert.equal(current.activities[0].hasMemberNotice,true);assert.equal(current.activities[0].rule.price,8000);assert.equal(results[3].value.operationRecorded,true);assert.equal(results[3].value.cashierVerified,false);assert.equal(results[3].value.membershipRecordsChanged,0)});
 await check('native callback rejects a foreign-store product before any write',async()=>{assert.equal(results[4].value.ok,false);assert.equal(results[4].value.code,'EMPLOYEE_OPERATION_REFERENCE_NOT_IN_STORE');assert.equal((await db.product.findUnique({where:{id:foreignProduct.id}})).name,'Must stay unchanged')});
 p.messages.push({...assistant,content:''},...calls.map((c,i)=>({role:'tool',tool_call_id:c.id,content:JSON.stringify(results[i].value)})));
 version=(await runtime.host.recordInput({executionId:ticket.executionId,expectedTraceVersion:version,turn:2,inputHash:hash(p),toolSchemaHash:ticket.toolSchemaHash,isolation:ticket.isolation,providerRequest:p})).traceVersion;
 const final={role:'assistant',content:'Tugas kebersihan dan latihan sudah dijadwalkan. Pelaksanaan belum selesai dan belum diterima penilai independen.'};
 version=(await runtime.host.recordResponse({executionId:ticket.executionId,expectedTraceVersion:version,turn:2,providerRequestId:'synthetic-operation-turn-2',finishReason:'stop',providerMessage:final})).traceVersion;
 await runtime.host.recordOutput({executionId:ticket.executionId,expectedTraceVersion:version,providerRequestId:'synthetic-operation-turn-2',providerMessage:final});
 await check('status links actual execution, native Hermes reply and tool receipts while independent acceptance remains open',async()=>{
  await orchestration.drain(1);const status=await operationsTaskStatus(binding.credential,submitted.requestId,db);
  assert.equal(status.execution.id,ticket.executionId);assert.equal(status.executionCompleted,true);assert.equal(status.businessCompleted,false);assert.equal(status.independentAcceptance,'not_reviewed');assert.equal(status.operationReceipts.length,3);assert.equal(status.outbound.length,1);assert.equal(status.outbound[0].text,final.content);
 });
 await check('actual human assessment evidence closes the matching training once; a fabricated result never overwrites it',async()=>{
  const trainingId=results[1].value.trainingId,training=await db.training.findUnique({where:{id:trainingId}});
  async function assess(text,score,passed){
   const intake=await submitOperationsTask(binding.credential,{requestId:randomUUID(),channelId,text},db,ports);
   captured=null;await orchestration.drain(1);assert(captured);await restoreHistoricalTicket(captured);const t=captured,request={model:t.model,messages:[...system,{role:'user',content:t.sealedUserContent}],tools:t.tools,stream:true};
   let v=(await runtime.host.recordInput({executionId:t.executionId,expectedTraceVersion:t.traceVersion,turn:1,inputHash:hash(request),toolSchemaHash:t.toolSchemaHash,isolation:t.isolation,providerRequest:request})).traceVersion;
   const call={id:'assessment-'+intake.messageId,type:'function',function:{name:'employee_manage_training',arguments:JSON.stringify({action:'record_result',trainingId,evidenceMessageSeq:intake.sourceSeq,score,passed,status:'completed'})}},assistant={role:'assistant',content:null,tool_calls:[call]};
   v=(await runtime.host.recordResponse({executionId:t.executionId,expectedTraceVersion:v,turn:1,providerRequestId:'assessment-1-'+intake.messageId,finishReason:'tool_calls',providerMessage:assistant})).traceVersion;
   const tool=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args:JSON.parse(call.function.arguments)});v=tool.traceVersion;
   request.messages.push({...assistant,content:''},{role:'tool',tool_call_id:call.id,content:JSON.stringify(tool.value)});
   v=(await runtime.host.recordInput({executionId:t.executionId,expectedTraceVersion:v,turn:2,inputHash:hash(request),toolSchemaHash:t.toolSchemaHash,isolation:t.isolation,providerRequest:request})).traceVersion;
   const reply={role:'assistant',content:tool.value.success?'Hasil penilaian dicatat berdasarkan pesan asli. Verifikasi independen belum selesai.':'Bukti penilaian belum sesuai. Hasil latihan tidak diubah.'};
   v=(await runtime.host.recordResponse({executionId:t.executionId,expectedTraceVersion:v,turn:2,providerRequestId:'assessment-2-'+intake.messageId,finishReason:'stop',providerMessage:reply})).traceVersion;
   await runtime.host.recordOutput({executionId:t.executionId,expectedTraceVersion:v,providerRequestId:'assessment-2-'+intake.messageId,providerMessage:reply});await orchestration.drain(1);return tool.value;
  }
  const positive=await assess(`${employee.staffId}, ${training.title}, 2026-10-28: nilai 85 lulus.`,85,true);
  assert.equal(positive.success,true);const confirmed=await db.training.findUnique({where:{id:trainingId}});assert.equal(confirmed.score,85);assert.equal(confirmed.passed,true);assert.equal(confirmed.status,'completed');
  const negative=await assess(`${employee.staffId}, ${training.title}, 2026-10-28: tolong periksa latihan.`,100,true);
  assert.equal(negative.ok,false);assert.match(negative.code,/ASSESSMENT/);const unchanged=await db.training.findUnique({where:{id:trainingId}});assert.equal(unchanged.score,85);assert.equal(unchanged.updatedAt.toISOString(),confirmed.updatedAt.toISOString());
 });
 await check('normal owner instructions in the employee channel remain readable but cannot import private owner sources/memory',async()=>{
  const group=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Routine employee work',kind:'group',members:[employee.staffId,'agent:'+agentId]});
  const message=await teamCommunication(db).send(owner,group.id,{requestId:randomUUID(),text:'Hari ini bersihkan bar dan gunakan SOP yang sudah diterbitkan untuk latihan.'});
  const route=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:'externalAgent.teamBridge.v1.employeeRoute.'+group.id}}})).value),g=await loadGrant();
  const employeeScope=await readCommunicationScope(db,g,route.task,group,owner.staffId);
  const fact=await readEmployeeRuntimeSource(db,g,employeeScope,{kind:'conversation',channelId:group.id,messageId:message.id,seq:message.seq});assert.equal(fact.value.text,message.text);assert.equal(fact.value.sourceAdmission.kind,'native_same_audience_human_message');
  await assert.rejects(()=>readEmployeeRuntimeSource(db,g,employeeScope,{kind:'conversation',channelId,messageId:submitted.messageId,seq:submitted.sourceSeq}));
  const ownChannel=await readTeam(db,storeId,'channel.'+channelId),privateScope=await readCommunicationScope(db,g,{taskId,version:1},ownChannel,owner.staffId),execution=await readTeam(db,storeId,'employeeRuntime.execution.'+ticket.executionId);
  await storeAgentMemory(db,g,privateScope,execution,{kind:'fact',text:'Private owner financial sentinel: never publish to employees.'});assert.equal((await readAgentMemories(db,g,employeeScope)).length,0);
  const requestScope={...employeeScope,requesterStaffId:employee.staffId};await assert.rejects(()=>assertOperationRequester(db,g,requestScope,'employee_manage_staff',{action:'set_schedule'}),/REQUESTER_DENIED/);
 });
 await check('no payments, inventory mutations, production-like completion or employee penalties were fabricated',async()=>{
  assert.equal(await db.order.count({where:{storeId}}),0);assert.equal(await db.expense.count({where:{storeId}}),0);assert.equal(await db.stockOutLog.count({where:{inventory:{storeId}}}),0);assert.equal((await db.hygieneTask.findFirst({where:{storeId}})).status,'pending');assert.equal((await db.training.findFirst({where:{storeId}})).status,'completed');
 });
 console.log(JSON.stringify({passed,realPg:true,actualNativeIntake:true,actualNativeRecords:true,syntheticProvider:true,syntheticGatewayHealth:true,realHermes:false,modelCalls:0,productionWrites:0,businessAccepted:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
