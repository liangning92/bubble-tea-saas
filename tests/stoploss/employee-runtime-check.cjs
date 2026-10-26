/* Real disposable PG + native message writes; synthetic captured provider turns.
 * This is NOT a real Hermes/model/OAuth/production test. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require(root+'/server/dist/services/'+n);
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client');
const {createEmployeeRuntime}=built('teamAgentBridge/employeeRuntime'),{employeeRuntimeDigest:hash}=built('teamAgentBridge/employeeRuntimeSources');
const {readCommunicationScope}=built('teamAgentBridge/confidentiality'),{teamCommunication,readTeam,writeTeam}=built('TeamCommunicationService');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const db=new PrismaClient(),storeId='employee-runtime-fixture',agentId=randomUUID(),task={taskId:randomUUID(),version:1},passed=[];
const owner={id:'runtime-owner',staffId:'runtime-owner-staff',storeId,role:'admin'},staff={id:'runtime-employee',staffId:'runtime-staff',storeId,role:'staff',employeeApp:true};
const grant={agentId,displayName:'Synthetic isolated Hermes',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send'],staffIds:[staff.staffId,owner.staffId],channelIds:[]};
const system=[{role:'system',content:'SYNTHETIC pinned isolated system assembly; no manager memory'}];
let channel,source,scope;
const deps={enabled:true,storeId,approvedSystemHashes:[hash(system)],resolveGrant:async()=>structuredClone(grant),tasks:{assert:async(_db,g,t,c)=>{assert.equal(g.storeId,storeId);assert.deepEqual(t,task);assert.equal(c,channel.id)}},readAttachment:async()=>{throw Error('UNAVAILABLE')}};
const make=()=>createEmployeeRuntime(db,deps),check=async(name,fn)=>{if(process.env.EMPLOYEE_RUNTIME_CASE&&!name.includes(process.env.EMPLOYEE_RUNTIME_CASE))return;await fn();passed.push(name);console.log('PASS '+name)};
async function begin(){scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));return make().host.begin(grant,scope,[source])}
const wire=t=>({model:t.model,messages:[...system,{role:'user',content:t.sealedUserContent}],tools:t.tools,stream:true});
async function input(runtime,t,p,version=t.traceVersion,turn=1){return runtime.host.recordInput({executionId:t.executionId,expectedTraceVersion:version,turn,inputHash:hash(p),toolSchemaHash:t.toolSchemaHash,isolation:t.isolation,providerRequest:p})}
async function response(runtime,t,version,message,turn=1){return runtime.host.recordResponse({executionId:t.executionId,expectedTraceVersion:version,turn,providerRequestId:'synthetic-provider-'+turn,finishReason:message.tool_calls?'tool_calls':'stop',providerMessage:message})}
async function photoMessage(){
 const fs=require('node:fs/promises'),crypto=require('node:crypto'),sharp=require(root+'/server/node_modules/sharp'),{writeWork}=built('EmployeeWorkspaceStore');
 const id=randomUUID(),bytes=await sharp({create:{width:160,height:120,channels:3,background:'#f5e0b0'}}).png().toBuffer();
 await fs.mkdir(path.join(process.env.UPLOADS_PATH,'.employee-private'),{recursive:true});await fs.writeFile(path.join(process.env.UPLOADS_PATH,'.employee-private',id),bytes);
 await writeWork(storeId,'file.'+id,{id,staffId:staff.staffId,purpose:'team',type:'image/png',sha256:crypto.createHash('sha256').update(bytes).digest('hex')},db);
 const m=await teamCommunication(db).send(staff,channel.id,{requestId:randomUUID(),text:'出库',files:[id]});return {id,bytes,m,ref:{kind:'conversation',channelId:channel.id,messageId:m.id,seq:m.seq}};
}
async function main(){
 const tenant=await db.tenant.create({data:{name:'Runtime synthetic isolated'}});await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic'}});
 for(const [a,phone]of[[owner,'08911117001'],[staff,'08911117002']])await db.user.create({data:{id:a.id,phone,password:'fixture-not-login',role:a.role,storeId,staff:{create:{id:a.staffId,storeId,name:a.staffId,employeeNumber:a.staffId}}}});
 channel=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Isolated operational channel',kind:'group',members:[staff.staffId]});
 channel.members.push({staffId:'agent:'+agentId,fromSeq:1});await writeTeam(db,storeId,'channel.'+channel.id,channel);
 await db.config.create({data:{storeId,key:'externalAgent.teamBridge.v1.channel.'+channel.id,category:'test',value:JSON.stringify({agentId,task})}});
 const m=await teamCommunication(db).send(staff,channel.id,{requestId:randomUUID(),text:'Mesin siap, siapa yang memeriksa penutup?'});source={kind:'conversation',channelId:channel.id,messageId:m.id,seq:m.seq};
 await check('default off and fabricated scope cannot create execution',async()=>{await assert.rejects(()=>createEmployeeRuntime(db,{...deps,enabled:false}).host.begin(grant,{},[source]));scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));await assert.rejects(()=>make().host.begin(grant,{...scope,audienceHash:'f'.repeat(64)},[source]));});
 await check('complete two-tool rounds persist sources and native reply atomically',async()=>{
  const runtime=make(),t=await begin(),p=wire(t);let v=(await input(runtime,t,p)).traceVersion;
  const read={role:'assistant',content:null,tool_calls:[{id:'read-message-1',type:'function',function:{name:'employee_read_message',arguments:JSON.stringify({seq:m.seq},null,2)}}]};v=(await response(runtime,t,v,read)).traceVersion;
  const r=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:'read-message-1',name:'employee_read_message',args:{seq:m.seq}});v=r.traceVersion;assert.equal(r.value.text,m.text);assert.equal(r.sources[0].source.messageId,m.id);
  p.messages.push({...read,content:'',tool_calls:read.tool_calls.map(c=>({...c,function:{...c.function,arguments:JSON.stringify(JSON.parse(c.function.arguments))}}))},{role:'tool',tool_call_id:'read-message-1',content:JSON.stringify(r.value)});v=(await input(runtime,t,p,v,2)).traceVersion;
  const send={role:'assistant',content:null,tool_calls:[{id:'send-message-1',type:'function',function:{name:'employee_send_message',arguments:JSON.stringify({text:'Siapa petugas yang dapat memeriksa penutup mesin hari ini?'})}}]};v=(await response(runtime,t,v,send,2)).traceVersion;
  const sent=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:2,callOrdinal:0,toolCallId:'send-message-1',name:'employee_send_message',args:JSON.parse(send.tool_calls[0].function.arguments)});v=sent.traceVersion;assert.equal(sent.value.delivery,'stored');assert.equal(sent.value.seq,2);
  p.messages.push({...send,content:''},{role:'tool',tool_call_id:'send-message-1',content:JSON.stringify(sent.value)});v=(await input(runtime,t,p,v,3)).traceVersion;
  const final={role:'assistant',content:'Pertanyaan operasional tersimpan; menunggu fakta lapangan.'};v=(await response(runtime,t,v,final,3)).traceVersion;
  await assert.rejects(()=>runtime.host.recordOutput({executionId:t.executionId,expectedTraceVersion:v,providerRequestId:'synthetic-provider-3',providerMessage:{role:'assistant',content:'tampered'}}));
  await runtime.host.recordOutput({executionId:t.executionId,expectedTraceVersion:v,providerRequestId:'synthetic-provider-3',providerMessage:final});assert.equal((await make().inspect(t.executionId)).phase,'complete');
  const saved=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId);assert.equal(saved.tools.length,2);assert.equal(saved.inputs.length,3);assert.equal(saved.responses.length,3);
  const reply=await readTeam(db,storeId,'message.'+channel.id+'.000000000002');assert.equal(reply.agent.agentId,agentId);assert.equal(reply.text,JSON.parse(send.tool_calls[0].function.arguments).text);
 });
 await check('concurrent input admits only one HTTP reservation; restart preserves unknown without resend',async()=>{
  const t=await begin(),p=wire(t),results=await Promise.allSettled([input(make(),t,p),input(make(),t,p)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await make().recover(t.executionId);assert.equal((await make().inspect(t.executionId)).phase,'unknown');await assert.rejects(()=>input(make(),t,p,3));const separate=await begin();assert.notEqual(separate.executionId,t.executionId);await make().recover(separate.executionId);
  // No recovery shortcut: fixture removes the compartment pointer solely to test independent executions.
  await writeTeam(db,storeId,'employeeRuntime.context.'+scope.compartmentKey,{executionId: t.executionId});
 });
 // Independent compartment versions are test-only task/version fixtures, never business recovery.
 const next=async()=>{task.version++;scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));return begin()};
 await check('unapproved system assembly, hidden memory and forged history fail before reservation',async()=>{
  const t=await next(),p=wire(t);p.messages[0]={role:'system',content:'MANAGER_SECRET_SENTINEL'};await assert.rejects(()=>input(make(),t,p));
  p.messages=[...system,{role:'user',content:t.sealedUserContent},{role:'assistant',content:'old stock private session'}];await assert.rejects(()=>input(make(),t,p));assert.equal((await make().inspect(t.executionId)).turn,0);await make().recover(t.executionId);
 });
 await check('model tool substitution and unknown sources fail closed',async()=>{
  const t=await next(),p=wire(t);let v=(await input(make(),t,p)).traceVersion;await response(make(),t,v,{role:'assistant',content:null,tool_calls:[{id:'sql',type:'function',function:{name:'sql',arguments:'{}'}}]});const blocked=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId);assert.equal(blocked.phase,'unknown');assert.equal(blocked.responses[0].providerRequestId,'synthetic-provider-1');
  await make().recover(t.executionId);await assert.rejects(()=>make().host.begin(grant,scope,[{kind:'public_sop',id:'guessed',version:1}]));
 });
 await check('reordered issued tool surface is the same surface; a changed surface is rejected',async()=>{
  // The 2026-10-21 pilot failure: the runtime emitted exactly the issued tools in
  // another order. The order is not part of the issued surface, but a different
  // surface still is.
  const t=await next(),p=wire(t);
  const reordered={...p,tools:[...p.tools].reverse().map(x=>({function:{...x.function,parameters:{...x.function.parameters}},type:x.type}))};
  await input(make(),t,reordered);
  assert.equal((await make().inspect(t.executionId)).turn,1);
  await make().recover(t.executionId);
  const t2=await next(),p2=wire(t2);
  const changed={...p2,tools:reordered.tools.map((x,i)=>i===0?{...x,function:{...x.function,description:x.function.description+' changed'}}:x)};
  await assert.rejects(()=>input(make(),t2,changed));
  assert.equal((await make().inspect(t2.executionId)).turn,0);
  await make().recover(t2.executionId);
 });
 await check('source mutation and current recipient change reject old execution',async()=>{
  const t=await next(),p=wire(t),original=await readTeam(db,storeId,'message.'+channel.id+'.000000000001');await writeTeam(db,storeId,'message.'+channel.id+'.000000000001',{...original,text:'profit confidential'});await assert.rejects(()=>input(make(),t,p));await writeTeam(db,storeId,'message.'+channel.id+'.000000000001',original);
  const c=await readTeam(db,storeId,'channel.'+channel.id);await writeTeam(db,storeId,'channel.'+channel.id,{...c,members:c.members.map(x=>x.staffId===staff.staffId?{...x,fromSeq:2}:x)});await assert.rejects(()=>input(make(),t,p));await writeTeam(db,storeId,'channel.'+channel.id,c);await make().recover(t.executionId);
 });
 await check('revocation prevents execution but interrupted state still records visible fault',async()=>{const t=await next();grant.revoked=true;await assert.rejects(()=>input(make(),t,wire(t)));await make().recover(t.executionId);grant.revoked=false;assert.equal((await make().inspect(t.executionId)).fault.code,'EMPLOYEE_RUNTIME_PROCESS_INTERRUPTED');});
 await check('tool audit failure rolls back native message and tool receipt; substituted args never execute',async()=>{
  const t=await next(),runtime=make(),p=wire(t);let v=(await input(runtime,t,p)).traceVersion;
  const call={id:'rollback-send',type:'function',function:{name:'employee_send_message',arguments:JSON.stringify({text:'Mohon periksa kondisi mesin.'})}};
  v=(await response(runtime,t,v,{role:'assistant',content:null,tool_calls:[call]})).traceVersion;
  const args={executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args:{text:'Mohon periksa kondisi mesin.'}};
  const before=await readTeam(db,storeId,'channel.'+channel.id);
  await assert.rejects(()=>runtime.host.executeTool({...args,args:{text:'different'}}));
  const faulty={...db,$transaction:fn=>db.$transaction(tx=>fn({config:tx.config,staff:tx.staff,user:tx.user,store:tx.store,financeAuditLog:{create:async()=>{throw Error('SYNTHETIC_AUDIT_UNAVAILABLE')}}}))};
  await assert.rejects(()=>createEmployeeRuntime(faulty,deps).host.executeTool(args));
  assert.deepEqual(await readTeam(db,storeId,'channel.'+channel.id),before);assert.equal((await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId)).tools.length,0);
  assert.equal((await runtime.inspect(t.executionId)).version,v);await runtime.recover(t.executionId);
 });
 await check('source facts require the corresponding read scope, not sponsor admin or send permission',async()=>{
  task.version++;scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));const original=[...grant.actions];grant.actions=['messages.send'];await assert.rejects(()=>make().host.begin(grant,scope,[source]));grant.actions=original;
 });
 await check('second outbound in a later model round records blocked receipt and creates no second native message',async()=>{
  const t=await next(),runtime=make(),p=wire(t),before=await readTeam(db,storeId,'channel.'+channel.id);let v=(await input(runtime,t,p)).traceVersion;
  const call={id:'single-allowed-send',type:'function',function:{name:'employee_send_message',arguments:JSON.stringify({text:'Mohon cek penutup mesin ketika aman.'})}},assistant={role:'assistant',content:null,tool_calls:[call]};
  v=(await response(runtime,t,v,assistant)).traceVersion;
  const sent=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args:JSON.parse(call.function.arguments)});v=sent.traceVersion;
  p.messages.push({...assistant,content:''},{role:'tool',content:JSON.stringify(sent.value),tool_call_id:call.id});v=(await input(runtime,t,p,v,2)).traceVersion;
  const blocked=await response(runtime,t,v,{role:'assistant',content:null,tool_calls:[{...call,id:'second-denied-send'}]},2);
  assert.equal((await runtime.inspect(t.executionId)).phase,'unknown');const saved=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId);assert.equal(saved.responses.length,2);assert.equal(saved.responses[1].providerRequestId,'synthetic-provider-2');assert.equal(saved.tools.length,1);assert.equal((await readTeam(db,storeId,'channel.'+channel.id)).lastSeq,before.lastSeq+1);
  await assert.rejects(()=>input(runtime,t,p,blocked.traceVersion,3));
 });
 await check('free-form questions remain intact without granting financial tools',async()=>{
  task.version++;const question=await teamCommunication(db).send(staff,channel.id,{requestId:randomUUID(),text:'今天营业额多少？'});
  const s={kind:'conversation',channelId:channel.id,messageId:question.id,seq:question.seq};scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));
  const t=await make().host.begin(grant,scope,[s]);assert(t.sealedUserContent.includes(question.text));assert(!t.sealedUserContent.includes('Restricted-data request'));assert(!t.tools.some(x=>/finance|revenue|salary|staff_create|leave_submit/.test(x.function.name)));await make().recover(t.executionId);
 });
 await check('denied business write is a tool receipt and the model can still answer allowed parts',async()=>{
  const original=[...grant.actions];grant.actions.push('marketing.read');
  const settings=built('AgentSettingsService').defaultAgentSettings();settings.enabled=true;settings.permissions.marketing={read:true,write:false};await writeTeam(db,storeId,'ai.agent.settings',settings);
  try{
   const t=await next(),runtime=make(),p=wire(t);assert(t.tools.some(x=>x.function.name==='employee_manage_marketing'));
   let v=(await input(runtime,t,p)).traceVersion;const call={id:'denied-marketing-write',type:'function',function:{name:'employee_manage_marketing',arguments:JSON.stringify({action:'create_campaign',name:'Must not be created'})}},assistant={role:'assistant',content:null,tool_calls:[call]};
   v=(await response(runtime,t,v,assistant)).traceVersion;const result=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args:JSON.parse(call.function.arguments)});v=result.traceVersion;
   assert.equal(result.value.ok,false);assert.equal((await runtime.inspect(t.executionId)).phase,'input');assert.equal(await db.campaign.count({where:{storeId,name:'Must not be created'}}),0);
   p.messages.push({...assistant,content:''},{role:'tool',content:JSON.stringify(result.value),tool_call_id:call.id});v=(await input(runtime,t,p,v,2)).traceVersion;
   const final={role:'assistant',content:'I can explain the promotion options. Creating a campaign requires the store operator to enable that action.'};v=(await response(runtime,t,v,final,2)).traceVersion;
   await runtime.host.recordOutput({executionId:t.executionId,expectedTraceVersion:v,providerRequestId:'synthetic-provider-2',providerMessage:final});assert.equal((await runtime.inspect(t.executionId)).phase,'complete');
   const saved=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId),send=saved.tools.find(x=>x.name==='employee_send_message');assert(send);const actual=await readTeam(db,storeId,'message.'+channel.id+'.'+String(send.value.seq).padStart(12,'0'));assert.equal(actual.text,final.content);
   const exchange=await built('teamAgentBridge/employeeRuntimeSources').readEmployeeRuntimeSource(db,grant,scope,{kind:'employee_exchange',executionId:t.executionId,questionMessageId:send.value.messageId});assert.equal(exchange.value.previousQuestion.text,final.content);assert(exchange.value.employeeFacts.length);
  }finally{grant.actions=original;await db.config.delete({where:{storeId_key:{storeId,key:'team.communication.ai.agent.settings'}}})}
 });
 await check('persistent memory survives new tasks and runtime instances, accepts correction, and honors operator deletion',async()=>{
  const original=[...grant.actions];grant.actions.push('memory.read','memory.write');const settings=built('AgentSettingsService').defaultAgentSettings();settings.enabled=true;await writeTeam(db,storeId,'ai.agent.settings',settings);
  const grantKey='externalAgent.teamBridge.v1.grant.'+agentId,previousGrant=await db.config.findUnique({where:{storeId_key:{storeId,key:grantKey}}});await db.config.upsert({where:{storeId_key:{storeId,key:grantKey}},create:{storeId,key:grantKey,category:'staff',value:JSON.stringify(grant)},update:{value:JSON.stringify(grant)}});
  const remember=async(t,runtime,text,supersedesId)=>{const p=wire(t);let v=(await input(runtime,t,p)).traceVersion;const args={kind:'preference',text,...(supersedesId?{supersedesId}:{})},call={id:'remember-'+t.executionId,type:'function',function:{name:'employee_store_memory',arguments:JSON.stringify(args)}},assistant={role:'assistant',content:null,tool_calls:[call]};v=(await response(runtime,t,v,assistant)).traceVersion;
   const stored=await runtime.host.executeTool({executionId:t.executionId,expectedTraceVersion:v,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args});assert.equal(stored.value.ok,true);v=stored.traceVersion;
   p.messages.push({...assistant,content:''},{role:'tool',tool_call_id:call.id,content:JSON.stringify(stored.value)});v=(await input(runtime,t,p,v,2)).traceVersion;const final={role:'assistant',content:'Preference saved for future conversations.'};v=(await response(runtime,t,v,final,2)).traceVersion;await runtime.host.recordOutput({executionId:t.executionId,expectedTraceVersion:v,providerRequestId:'synthetic-provider-2',providerMessage:final});return stored.value.memoryId};
  try{
   const first=await next(),id=await remember(first,make(),'MEMORY_SENTINEL_INITIAL');
   const rebuilt=make(),second=await next();assert(second.sealedUserContent.includes('MEMORY_SENTINEL_INITIAL'));const corrected=await remember(second,rebuilt,'MEMORY_SENTINEL_CORRECTED',id);
   const third=await next();assert(third.sealedUserContent.includes('MEMORY_SENTINEL_CORRECTED'));assert(!third.sealedUserContent.includes('MEMORY_SENTINEL_INITIAL'));await make().recover(third.executionId);
   const service=built('AgentMemoryService').agentMemoryService(db),list=await service.list(owner),memory=list.memories.find(m=>m.id===corrected);assert(memory);assert.equal(memory.confirmed,false);await service.update(owner,corrected,{expectedVersion:memory.version,status:'archived'});
   const fourth=await next();assert(!fourth.sealedUserContent.includes('MEMORY_SENTINEL_CORRECTED'));await make().recover(fourth.executionId);
   await assert.rejects(()=>built('AgentMemoryService').readAgentMemories(db,grant,{...scope,audienceStaffIds:[owner.staffId]}),/AGENT_MEMORY_SCOPE_DENIED/);
  }finally{grant.actions=original;await db.config.delete({where:{storeId_key:{storeId,key:'team.communication.ai.agent.settings'}}});if(previousGrant)await db.config.update({where:{storeId_key:{storeId,key:grantKey}},data:{value:previousGrant.value}});else await db.config.delete({where:{storeId_key:{storeId,key:grantKey}}})}
 });
 await check('authorized chat photos reach the model as image parts; substituted pixels and foreign files are rejected',async()=>{
  const f=await photoMessage();task.version++;scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));
  const runtime=make(),ticket=await runtime.host.begin(grant,scope,[f.ref]);assert(Array.isArray(ticket.sealedUserContent));assert.equal(ticket.sealedUserContent[1].type,'image_url');assert(ticket.sealedUserContent[1].image_url.url.startsWith('data:image/jpeg;base64,'));
  const p=wire(ticket),changed=structuredClone(p);changed.messages.at(-1).content[1].image_url.url='data:image/jpeg;base64,forged';await assert.rejects(()=>input(runtime,ticket,changed));
  await input(runtime,ticket,p);await runtime.recover(ticket.executionId);
  const {employeeMessagePhotos}=built('teamAgentBridge/employeePhotos');const photos=await employeeMessagePhotos(db,grant,scope,f.m);assert.equal(photos[0].fileId,f.id);assert.equal(photos[0].dataUrl,undefined);const {employeeStockPhotoEvidence}=built('teamAgentBridge/employeePhotos'),history=[{source:{kind:'employee_exchange'},value:{employeeFacts:[{messageId:f.m.id,seq:f.m.seq,photos}]}}];assert.equal((await employeeStockPhotoEvidence(db,grant,scope,history)).needsPhotoSelection,true);assert.equal((await employeeStockPhotoEvidence(db,grant,scope,history,f.m.id)).photos[0].fileId,f.id);assert.equal(await employeeStockPhotoEvidence(db,grant,scope,history,'none'),undefined);
  const original=await readTeam(db,storeId,'message.'+channel.id+'.'+String(f.m.seq).padStart(12,'0'));await writeTeam(db,storeId,'message.'+channel.id+'.'+String(f.m.seq).padStart(12,'0'),{...original,files:[randomUUID()]});await assert.rejects(()=>employeeMessagePhotos(db,grant,scope,f.m),/EMPLOYEE_PHOTO_NOT_AUTHORIZED/);await writeTeam(db,storeId,'message.'+channel.id+'.'+String(f.m.seq).padStart(12,'0'),original);
  const fs=require('node:fs/promises'),file=path.join(process.env.UPLOADS_PATH,'.employee-private',f.id);await fs.writeFile(file,'changed bytes');await assert.rejects(()=>employeeMessagePhotos(db,grant,scope,f.m),/EMPLOYEE_PHOTO_NOT_AUTHORIZED/);await fs.writeFile(file,f.bytes);
  await writeTeam(db,storeId,'ai.agent.settings',{enabled:true,employeeBridgeEnabled:true,photoRecognitionEnabled:false});assert.deepEqual(await employeeMessagePhotos(db,grant,scope,f.m),[]);await db.config.delete({where:{storeId_key:{storeId,key:'team.communication.ai.agent.settings'}}});
 });
 await check('private HTTP relay matches reserved SDK input, persists provider receipt and never resends duplicate',async()=>{
  const express=require(root+'/server/node_modules/express'),{createEmployeeRuntimeHttp}=built('teamAgentBridge/employeeRuntimeHttp');
  const t=await next(),runtime=make(),p=wire(t);await input(runtime,t,p);await writeTeam(db,storeId,'ai.settings',{version:7});let sends=0;
  const app=express();app.use(express.json({limit:'2mb'}));app.use(createEmployeeRuntimeHttp({enabled:true,resolve:async(token,kind)=>token==='synthetic-execution-provider-only'&&kind==='provider'?{executionId:t.executionId,expiresAt:new Date(Date.now()+60000).toISOString(),runtime}:null,transport:async(s,v,request,before)=>{assert.equal(s,storeId);assert.equal(v,7);assert(!('reasoning_effort'in request));assert.equal(request.stream,false);assert(!('max_tokens'in request));await before();sends++;return{id:'synthetic-http-provider-receipt',choices:[{finish_reason:'stop',message:{role:'assistant',content:'Fakta belum lengkap; belum ada perubahan data.'}}]}}}));
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x))});try{
   const url='http://127.0.0.1:'+server.address().port+'/v1/chat/completions',headers={authorization:'Bearer synthetic-execution-provider-only','content-type':'application/json'};
   assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...p,model:'unapproved'})})).status,409);assert.equal(sends,0);
   const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(p)});assert.equal(response.status,200);assert((await response.text()).includes('synthetic-http-provider-receipt'));assert.equal(sends,1);
   assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(p)})).status,409);assert.equal(sends,1);
   const receipt=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId+'.provider.1');assert.equal(receipt.state,'response');assert.equal(receipt.value.id,'synthetic-http-provider-receipt');
  }finally{await new Promise(r=>server.close(r));await runtime.recover(t.executionId)}
 });
 await check('source revocation after provider claim blocks transport before send and preserves unknown reservation',async()=>{
  const express=require(root+'/server/node_modules/express'),{createEmployeeRuntimeHttp}=built('teamAgentBridge/employeeRuntimeHttp');
  const t=await next(),runtime=make(),p=wire(t);await input(runtime,t,p);await writeTeam(db,storeId,'ai.settings',{version:7});let sends=0;
  const original=await readTeam(db,storeId,'message.'+channel.id+'.000000000001');
  const app=express();app.use(createEmployeeRuntimeHttp({enabled:true,resolve:async()=>({executionId:t.executionId,expiresAt:new Date(Date.now()+60000).toISOString(),runtime}),transport:async(_s,_v,_r,before)=>{
   await writeTeam(db,storeId,'message.'+channel.id+'.000000000001',{...original,text:'Changed source after claim, before provider'});
   try{await before();sends++;throw Error('SHOULD_NOT_SEND')}finally{await writeTeam(db,storeId,'message.'+channel.id+'.000000000001',original)}
  }}));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  try{assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer synthetic-scope-source-revocation','content-type':'application/json'},body:JSON.stringify(p)})).status,409);assert.equal(sends,0);assert.equal((await runtime.inspect(t.executionId)).phase,'unknown');assert.equal((await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId+'.provider.1')).state,'unknown')}
  finally{await new Promise(r=>server.close(r))}
 });
 if(process.env.EMPLOYEE_REAL_HERMES==='1')await check('actual pinned Hermes sends image parts, records one photo-backed stock-out and persists all SDK turns',async()=>{
  const fs=require('node:fs/promises'),http=require('node:http'),os=require('node:os');
  const {runEmployeeRuntimeChild}=built('teamAgentBridge/employeeRuntimeChild');
  const template=require('../fixtures/hermes-employee-system-template.json');
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'employee-real-child-')));let server,calls=0;
  try{
   const runtime=createEmployeeRuntime(db,{...deps,approvedSystemHashes:[],reviewedSystemTemplate:{hash:template.hash,isolatedRoot:root},maxExecutionMs:120000});
   const realItem=await db.inventory.create({data:{storeId,name:'Actual Hermes synthetic cups',category:'supplies',unit:'pcs',currentStock:10,avgCost:2}});grant.actions.push('inventory.write');
   const photo=await photoMessage();task.version++;scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+channel.id));const t=await runtime.host.begin(grant,scope,[photo.ref]);
   server=http.createServer((req,res)=>{if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({object:'list',data:[{id:t.model,object:'model'}]}));return}let body='';req.on('data',b=>body+=b);req.on('end',()=>{calls++;const p=JSON.parse(body);assert.equal(req.method,'POST');assert.equal(req.url,'/api/internal/employee-hermes/v1/chat/completions');assert.equal(p.model,t.model);assert(p.messages.find(m=>m.role==='user').content.some(part=>part.type==='image_url'&&part.image_url.url.startsWith('data:image/jpeg;base64,')));assert(!body.includes('MANAGER_SECRET_SENTINEL'));
    let delta,reason;
    if(calls===1){delta={role:'assistant',tool_calls:[{index:0,id:'real-read',type:'function',function:{name:'employee_manage_inventory',arguments:JSON.stringify({action:'stock_out',inventoryId:realItem.id,quantity:1,reason:'loss',note:'Synthetic Hermes native ledger test'})}}]};reason='tool_calls'}
    else if(calls===2){delta={role:'assistant',tool_calls:[{index:0,id:'real-send',type:'function',function:{name:'employee_send_message',arguments:JSON.stringify({text:'Mohon konfirmasi petugas pemeriksa penutup mesin.'})}}]};reason='tool_calls'}
    else{delta={role:'assistant',content:'Pertanyaan tersimpan. Menunggu jawaban staf, belum dianggap selesai.'};reason='stop'}
    const chunk={id:'synthetic-real-hermes-'+calls,object:'chat.completion.chunk',created:1,model:t.model,choices:[{index:0,delta,finish_reason:null}]};res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify(chunk)+'\n\ndata: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:reason}]})+'\n\ndata: [DONE]\n\n');
   })});await new Promise(r=>server.listen(0,'127.0.0.1',r));
   const config={python:process.env.EMPLOYEE_HERMES_PYTHON,hermesSource:process.env.EMPLOYEE_HERMES_SOURCE,hermesExpectedSha:template.hermesSha,repository:require('node:fs').realpathSync(path.resolve(__dirname,'../..')),isolatedRoot:root,providerBaseUrl:'http://127.0.0.1:'+server.address().port+'/api/internal/employee-hermes/v1',providerCredential:'synthetic-no-real-model-credential',deadlineAt:new Date(Date.now()+110000).toISOString()};
   const result=await runEmployeeRuntimeChild(t,runtime.host,config);const state=await runtime.inspect(t.executionId);
   assert.equal(result.state,'complete',JSON.stringify({result,state,calls}));assert.equal(calls,3);assert.equal(state.turn,3);assert.equal((await db.inventory.findUnique({where:{id:realItem.id}})).currentStock,9);assert.equal(await db.stockOutLog.count({where:{inventoryId:realItem.id}}),1);
   const saved=await readTeam(db,storeId,'employeeRuntime.execution.'+t.executionId);assert.equal(saved.phase,'complete');assert.equal(saved.tools.length,2);assert.equal(saved.inputs.length,3);assert.equal(saved.responses.length,3);const log=await db.stockOutLog.findFirst({where:{inventoryId:realItem.id}});assert.equal(JSON.parse(log.note).sourceEvidence.photos[0].fileId,photo.id);const image=await built('teamAgentBridge/employeePhotos').stockOutPhoto(db,storeId,log.id,photo.id);assert(image.bytes.equals(photo.bytes));await assert.rejects(()=>built('teamAgentBridge/employeePhotos').stockOutPhoto(db,'different-store',log.id,photo.id));
   const rebuilt=createEmployeeRuntime(db,{...deps,approvedSystemHashes:[],reviewedSystemTemplate:{hash:template.hash,isolatedRoot:root}});await rebuilt.recover(t.executionId);assert.equal((await rebuilt.inspect(t.executionId)).phase,'complete');assert.equal(calls,3);
  }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true})}
 });
 assert(passed.length>0,'Test filter selected no checks');
 console.log(JSON.stringify({passed,realPg:true,syntheticProvider:true,realHermes:process.env.EMPLOYEE_REAL_HERMES==='1',productionWrites:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
