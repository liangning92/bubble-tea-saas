/* Real isolated PostgreSQL + normal team messages and runtime ports.
 * Approved synthetic provider observations only: no model, production or native prototype. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),build=process.env.CONVERSATION_BUILD_ROOT||root+'/server/dist',modules=process.env.CONVERSATION_SERVER_NODE_MODULES||root+'/server/node_modules',built=name=>require(build+'/services/'+name);
const {PrismaClient}=require(modules+'/@prisma/client');
const {createEmployeeRuntime}=built('teamAgentBridge/employeeRuntime');
const {employeeRuntimeDigest:hash}=built('teamAgentBridge/employeeRuntimeSources');
const {readCommunicationScope}=built('teamAgentBridge/confidentiality');
const {teamCommunication,readTeam,writeTeam}=built('TeamCommunicationService');
const {storeAgentMemory,readAgentMemories,agentMemoryService}=built('AgentMemoryService');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const db=new PrismaClient(),storeId='conversation-isolation-fixture',agentId=randomUUID(),task={taskId:randomUUID(),version:1},channels=new Set(),passed=[];
const owner={id:'conversation-owner',staffId:'conversation-owner-staff',storeId,role:'admin'},staff={id:'conversation-employee',staffId:'conversation-employee-staff',storeId,role:'staff',employeeApp:true};
const grant={agentId,displayName:'Synthetic existing Hermes',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send','memory.read','memory.write'],staffIds:[staff.staffId,owner.staffId],channelIds:[]};
const system=[{role:'system',content:'SYNTHETIC approved legacy runtime assembly. Answer only the current conversation; no external private context.'}];
const runtime=createEmployeeRuntime(db,{enabled:true,storeId,approvedSystemHashes:[hash(system)],resolveGrant:async()=>structuredClone(grant),tasks:{assert:async(_db,g,t,channelId)=>{assert.equal(g.storeId,storeId);assert.deepEqual(t,task);assert(channels.has(channelId));}},readAttachment:async()=>{throw Error('No fixture attachment')}});
const versions=new Map(),wire=ticket=>({model:ticket.model,messages:[...system,{role:'user',content:ticket.sealedUserContent}],tools:ticket.tools,stream:false}),state=ticket=>({executionId:ticket.executionId,expectedTraceVersion:versions.get(ticket.executionId)});
const save=(ticket,receipt)=>{versions.set(ticket.executionId,receipt.traceVersion);return receipt;};
const ref=(channelId,message)=>({kind:'conversation',channelId,messageId:message.id,seq:message.seq});
const check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name);};
async function createChannel(label,privateOwner=false){
 const speaker=privateOwner?owner:staff,c=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:label,kind:'group',members:[speaker.staffId]});channels.add(c.id);c.members.push({staffId:'agent:'+agentId,fromSeq:1});await writeTeam(db,storeId,'channel.'+c.id,c);
 await db.config.create({data:{storeId,key:'externalAgent.teamBridge.v1.channel.'+c.id,category:'test',value:JSON.stringify({agentId,task})}});
 const message=await teamCommunication(db).send(speaker,c.id,{requestId:randomUUID(),text:label+' current human question'}),scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+c.id),speaker.staffId);
 return {c,message,scope,speaker,source:ref(c.id,message)};
}
async function begin(entry,sources=[entry.source]){const ticket=await runtime.host.begin(grant,entry.scope,sources);versions.set(ticket.executionId,ticket.traceVersion);return ticket;}
async function input(ticket,payload=wire(ticket)){return save(ticket,await runtime.host.recordInput({...state(ticket),turn:1,inputHash:hash(payload),toolSchemaHash:ticket.toolSchemaHash,isolation:ticket.isolation,providerRequest:payload}));}
const providerId=ticket=>'synthetic-provider-'+ticket.executionId;
async function response(ticket,text){return save(ticket,await runtime.host.recordResponse({...state(ticket),turn:1,providerRequestId:providerId(ticket),finishReason:'stop',providerMessage:{role:'assistant',content:text}}));}
async function output(ticket,text){return save(ticket,await runtime.host.recordOutput({...state(ticket),providerRequestId:providerId(ticket),providerMessage:{role:'assistant',content:text}}));}
async function lastMessage(channelId){const channel=await readTeam(db,storeId,'channel.'+channelId);return readTeam(db,storeId,'message.'+channelId+'.'+String(channel.lastSeq).padStart(12,'0'));}
async function main(){
 const tenant=await db.tenant.create({data:{name:'Owned conversation isolation fixture'}});await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic conversations'}});
 for(const [person,phone] of [[owner,'08977119001'],[staff,'08977119002']])await db.user.create({data:{id:person.id,phone,password:'synthetic-no-login',role:person.role,storeId,staff:{create:{id:person.staffId,storeId,name:person.staffId,employeeNumber:person.staffId}}}});
 await db.config.create({data:{storeId,key:'externalAgent.teamBridge.v1.grant.'+agentId,category:'test',value:JSON.stringify(grant)}});
 const a=await createChannel('Conversation A'),b=await createChannel('Conversation B'),ta=await begin(a),tb=await begin(b);
 await check('each legacy execution binds the actual current human message and its own sealed context',async()=>{
  for(const [entry,ticket] of [[a,ta],[b,tb]]){assert.equal(ticket.isolation.profile,'employee_work');assert.equal(ticket.native,undefined);assert.equal(ticket.requestSource.channelId,entry.c.id);assert.equal(ticket.requestSource.messageId,entry.message.id);assert.equal(ticket.requestSource.seq,entry.message.seq);assert.equal(JSON.parse(ticket.sealedUserContent).currentRequest.messageId,entry.message.id);}
  assert.notEqual(ta.requestId,tb.requestId);assert.notEqual(ta.executionId,tb.executionId);assert.notEqual(ta.compartmentKey,tb.compartmentKey);
 });
 await check('a provider request cannot substitute another conversation user context',async()=>{
  await assert.rejects(()=>input(ta,{...wire(ta),messages:[...system,{role:'user',content:tb.sealedUserContent}]}));assert.equal((await runtime.inspect(ta.executionId)).turn,0);
 });
 await Promise.all([input(ta),input(tb)]);const answerA='A-only: pertanyaan pertama di percakapan A sudah diperiksa.',answerB='B-only: pertanyaan percakapan B sudah diperiksa.';
 await Promise.all([response(ta,answerA),response(tb,answerB)]);
 const late=await teamCommunication(db).send(staff,a.c.id,{requestId:randomUUID(),text:'A newer human question arrived before the old answer'});
 await check('wrong provider request or answer cannot be written into another execution',async()=>{
  const beforeA=(await readTeam(db,storeId,'channel.'+a.c.id)).lastSeq,beforeB=(await readTeam(db,storeId,'channel.'+b.c.id)).lastSeq;
  await assert.rejects(()=>runtime.host.recordOutput({...state(ta),providerRequestId:providerId(tb),providerMessage:{role:'assistant',content:answerB}}));
  await assert.rejects(()=>runtime.host.recordOutput({...state(tb),providerRequestId:providerId(ta),providerMessage:{role:'assistant',content:answerA}}));
  assert.equal((await readTeam(db,storeId,'channel.'+a.c.id)).lastSeq,beforeA);assert.equal((await readTeam(db,storeId,'channel.'+b.c.id)).lastSeq,beforeB);
 });
 await check('two concurrent final replies store in their own channels with real original replyTo metadata',async()=>{
  await Promise.all([output(ta,answerA),output(tb,answerB)]);
  for(const [entry,ticket,text] of [[a,ta,answerA],[b,tb,answerB]]){const message=await lastMessage(entry.c.id);assert.equal(message.channelId,entry.c.id);assert.equal(message.requestId,ticket.requestId);assert.equal(message.text,text);assert.equal(message.agent.agentId,agentId);assert.equal(message.agent.replyToSeq,entry.message.seq);assert.equal((await runtime.inspect(ticket.executionId)).phase,'complete');}
  assert(!JSON.stringify(await lastMessage(a.c.id)).includes(answerB));assert(!JSON.stringify(await lastMessage(b.c.id)).includes(answerA));
 });
 await check('a later assistant answer remains history while the pending human question is the next current request',async()=>{
  const previousAnswer=await lastMessage(a.c.id);assert(previousAnswer.seq>late.seq);
  const scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+a.c.id),staff.staffId),entry={...a,scope,message:late,source:ref(a.c.id,late)},next=await begin(entry,[a.source,ref(a.c.id,late),ref(a.c.id,previousAnswer)]);
  assert.equal(next.requestSource.messageId,late.id);assert.equal(next.requestSource.seq,late.seq);assert.equal(JSON.parse(next.sealedUserContent).currentRequest.text,late.text);assert.notEqual(next.requestId,ta.requestId);
  await input(next);const answer='A-next-only: saya menjawab pertanyaan manusia yang terbaru.';await response(next,answer);await output(next,answer);assert.equal((await lastMessage(a.c.id)).agent.replyToSeq,late.seq);
 });
 await check('foreign source messages and an actor/source mismatch cannot create an execution',async()=>{
  const entry=await createChannel('Source binding checks');await assert.rejects(()=>begin(entry,[b.source]));
  const wrongScope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+entry.c.id),owner.staffId);
  await assert.rejects(()=>runtime.host.begin(grant,wrongScope,[entry.source]),/CURRENT_REQUEST_CHANGED/);
  const valid=await begin(entry);assert.equal(valid.requestSource.messageId,entry.message.id);await runtime.recover(valid.executionId);
 });
 await check('a current account permission change blocks an old response before any message is written',async()=>{
  const entry=await createChannel('Permission revocation checks'),ticket=await begin(entry);await input(ticket);await response(ticket,'This old answer must not be delivered after account policy changes.');const before=(await readTeam(db,storeId,'channel.'+entry.c.id)).lastSeq;
  await db.user.update({where:{id:staff.id},data:{role:'manager'}});
  try{await assert.rejects(()=>output(ticket,'This old answer must not be delivered after account policy changes.'),/AUDIENCE_CHANGED/);assert.equal((await readTeam(db,storeId,'channel.'+entry.c.id)).lastSeq,before);}
  finally{await db.user.update({where:{id:staff.id},data:{role:'staff'}});await runtime.recover(ticket.executionId);}
 });
 await check('a changed membership history boundary blocks the old output',async()=>{
  const entry=await createChannel('Membership boundary checks'),ticket=await begin(entry);await input(ticket);const answer='This response predates the new membership boundary.';await response(ticket,answer);const current=await readTeam(db,storeId,'channel.'+entry.c.id);
  await writeTeam(db,storeId,'channel.'+entry.c.id,{...current,members:current.members.map(m=>m.staffId===staff.staffId?{...m,fromSeq:current.lastSeq+1}:m)});
  try{await assert.rejects(()=>output(ticket,answer));assert.equal((await readTeam(db,storeId,'channel.'+entry.c.id)).lastSeq,current.lastSeq);}
  finally{await writeTeam(db,storeId,'channel.'+entry.c.id,current);await runtime.recover(ticket.executionId);}
 });
 await check('personal memories in two private channels have separate IDs and cannot enter the other model facts',async()=>{
  const one=await createChannel('Owner private A',true),two=await createChannel('Owner private B',true);assert.equal(one.scope.audienceStaffIds.length,1);assert.equal(two.scope.audienceStaffIds.length,1);
  const execution=entry=>({ticket:{executionId:randomUUID()},sources:[{source:entry.source}],tools:[]}),remember=(entry,text)=>db.$transaction(tx=>storeAgentMemory(tx,grant,entry.scope,execution(entry),{kind:'lesson',text}));
  const same='Same wording in independently owned conversations.',memA=await remember(one,same),memB=await remember(two,same),secret=await remember(one,'PRIVATE-CHANNEL-A-ONLY');assert(memA.ok&&memB.ok&&secret.ok);assert.notEqual(memA.memoryId,memB.memoryId);assert.notEqual(memB.duplicate,true);
  const original=await readTeam(db,storeId,'agentMemory.'+agentId+'.entry.'+secret.memoryId),legacyText='Historical personal note retained in its original channel.',legacyId=hash(['personal:'+owner.staffId,[owner.staffId],hash({kind:'lesson',text:legacyText})]),legacy={...original,id:legacyId,text:legacyText};await writeTeam(db,storeId,'agentMemory.'+agentId+'.entry.'+legacyId,legacy);
  const notesA=await readAgentMemories(db,grant,one.scope),notesB=await readAgentMemories(db,grant,two.scope);assert(notesA.some(m=>m.id===legacyId));assert(!notesA.some(m=>m.id===memB.memoryId));assert(notesB.some(m=>m.id===memB.memoryId));assert(!notesB.some(m=>[memA.memoryId,secret.memoryId,legacyId].includes(m.id)));assert.deepEqual(await readTeam(db,storeId,'agentMemory.'+agentId+'.entry.'+legacyId),legacy);
  const publicDraft=await remember(one,'SOP PUBLIK: cuci tangan sebelum menyiapkan minuman.');await agentMemoryService(db).update(owner,publicDraft.memoryId,{expectedVersion:1,scope:'store',confirmed:true});
  assert((await readAgentMemories(db,grant,one.scope)).some(m=>m.id===publicDraft.memoryId&&m.confirmed&&m.scope==='store'));assert((await readAgentMemories(db,grant,two.scope)).some(m=>m.id===publicDraft.memoryId&&m.confirmed&&m.scope==='store'));
  const scope=await readCommunicationScope(db,grant,task,await readTeam(db,storeId,'channel.'+two.c.id),owner.staffId),ticket=await begin({...two,scope}),facts=JSON.parse(ticket.sealedUserContent).facts;assert(facts.some(f=>f.id===memB.memoryId));assert(facts.some(f=>f.id===publicDraft.memoryId));assert(!facts.some(f=>[memA.memoryId,secret.memoryId,legacyId].includes(f.id)));assert(!JSON.stringify(facts).includes('PRIVATE-CHANNEL-A-ONLY'));await runtime.recover(ticket.executionId);
 });
 console.log(JSON.stringify({passed,realPostgreSQL:true,syntheticProvider:true,realHermes:false,nativePrototypeIncluded:false,modelCalls:0,productionWrites:0,businessAccepted:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
