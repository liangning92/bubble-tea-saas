/* Disposable PG/native team services only. Communication proofs below are
 * synthetic fixture ports: this tests delegated direct identity, not real Hermes. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require(root+'/server/dist/services/'+n),{PrismaClient}=require(root+'/server/node_modules/@prisma/client');
const {teamCommunication,readTeam,writeTeam}=built('TeamCommunicationService'),{createTeamAgentBridge}=built('teamAgentBridge/service'),{readAuthorizedBridgeChannel,directDelegationAudienceHash}=built('teamAgentBridge/directDelegation');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const db=new PrismaClient(),storeId='direct-delegation-fixture',agentId=randomUUID(),task={taskId:randomUUID(),version:1},passed=[];
const owner={id:'direct-owner-user',staffId:'direct-owner-staff',storeId,role:'admin'},employee={id:'direct-employee-user',staffId:'direct-employee-staff',storeId,role:'cashier',employeeApp:true};
let channel,source,sent,sendInput,grant={agentId,displayName:'Hermes AI · synthetic test',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send'],staffIds:[owner.staffId,employee.staffId],channelIds:[]};
const bindingKey=id=>'externalAgent.teamBridge.v1.channel.'+id,put=async(k,v)=>db.config.upsert({where:{storeId_key:{storeId,key:k}},create:{storeId,key:k,category:'test',value:JSON.stringify(v)},update:{value:JSON.stringify(v)}}),saveGrant=()=>put('fixture.direct.grant',grant);
const deps={enabled:true,resolveGrant:async database=>JSON.parse((await database.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:'fixture.direct.grant'}}})).value),tasks:{assert:async(_db,g,t,c)=>{assert.equal(g.storeId,storeId);assert.deepEqual(t,task);if(c)assert.equal(c,channel.id)}},communication:{assertContext:async(_db,_g,s)=>({purpose:'employee_work',compartmentKey:s.compartmentKey,memoryNamespace:s.compartmentKey,executionId:'synthetic-direct-proof'}),admitOutput:async(_db,_g,s,input)=>({decision:'allow',executionId:s.executionId,compartmentKey:s.compartmentKey,audienceHash:s.audienceHash,textHash:input.textHash,requestId:input.requestId,dataClasses:['operational'],sources:[]}),authorizeSource:async()=>({dataClasses:['operational']})},readAttachment:async()=>{throw Error('UNAVAILABLE')}};
const bridge=()=>createTeamAgentBridge(db,deps),ctx=()=>({channelId:channel.id,task}),check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
let binding;
const setBinding=()=>put(bindingKey(channel.id),binding);
async function denyCurrentReadAndReceipt(){await assert.rejects(()=>bridge().messages({...ctx(),afterSeq:0}));if(sendInput)await assert.rejects(()=>bridge().send(sendInput));}
async function main(){
 const tenant=await db.tenant.create({data:{name:'Synthetic direct delegation'}});await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Synthetic only'}});
 for(const [a,p]of[[owner,'08891117001'],[employee,'08891117002']])await db.user.create({data:{id:a.id,phone:p,password:'not-a-real-login',role:a.role,storeId,staff:{create:{id:a.staffId,storeId,name:a.staffId,employeeNumber:a.staffId}}}});
 channel=await teamCommunication(db).create(owner,{requestId:randomUUID(),kind:'direct',title:'Synthetic existing direct',members:[employee.staffId]});
 await teamCommunication(db).send(employee,channel.id,{requestId:randomUUID(),text:'OLD_PRE_ACTIVATION_SENTINEL'});
 channel=await readTeam(db,storeId,'channel.'+channel.id);grant.channelIds=[channel.id];await saveGrant();
 binding={agentId,task,delegatedDirect:{sourceStaffId:employee.staffId,fromSeq:channel.lastSeq+1,audienceHash:directDelegationAudienceHash(channel),grantVersion:grant.version,clientRevision:grant.clientRevision,expiresAt:grant.expiresAt}};
 await check('no binding, no direct delegation or forged actor gives no access',async()=>{
  await denyCurrentReadAndReceipt();await put(bindingKey(channel.id),{agentId,task});await denyCurrentReadAndReceipt();
  await assert.rejects(()=>teamCommunication(db).messages({id:owner.id,staffId:'agent:'+agentId,storeId,role:'agent'},channel.id,0));await setBinding();
 });
 await check('exact delegation preserves the two real direct members and excludes all pre-activation history',async()=>{
  const before=await readTeam(db,storeId,'channel.'+channel.id),r=await bridge().messages({...ctx(),afterSeq:0});assert.equal(r.messages.length,0);assert.equal(r.cursor,1);assert.equal(before.kind,'direct');assert.equal(before.members.length,2);
  await assert.rejects(()=>bridge().send({...ctx(),requestId:randomUUID(),expectedLastSeq:1,text:'must not send before employee question'}));
  assert.deepEqual(await readTeam(db,storeId,'channel.'+channel.id),before);
 });
 await check('real employee new text is read and independent agent replies through native transaction',async()=>{
  source=await teamCommunication(db).send(employee,channel.id,{requestId:randomUUID(),text:'Tutup gelas mungkin kurang, bagaimana saya memeriksanya?'});
  const messages=(await bridge().messages({...ctx(),afterSeq:0})).messages;assert.deepEqual(messages.map(m=>m.id),[source.id]);assert(!JSON.stringify(messages).includes('OLD_PRE_ACTIVATION_SENTINEL'));
  const before=await readTeam(db,storeId,'channel.'+channel.id);sendInput={...ctx(),requestId:randomUUID(),expectedLastSeq:before.lastSeq,text:'Berapa jumlah tutup gelas yang benar-benar tersedia sekarang?',replyToSeq:source.seq};sent=await bridge().send(sendInput);
  assert.equal(sent.authorId,'agent:'+agentId);assert.equal(sent.authorName,grant.displayName);assert.equal(sent.agent.agentId,agentId);assert(!sent.ai);assert.notEqual(sent.authorId,owner.staffId);assert.notEqual(sent.authorId,employee.staffId);
  const after=await readTeam(db,storeId,'channel.'+channel.id);assert.equal(after.kind,'direct');assert.deepEqual(after.members,before.members);assert.equal(after.version,before.version);assert.equal(after.lastSeq,before.lastSeq+1);
  const audit=await db.financeAuditLog.findFirst({where:{storeId,entityId:channel.id,newValue:{contains:'agent_message'}}});assert.equal(JSON.parse(audit.newValue).agent.agentId,agentId);
  const reminders=await db.config.count({where:{storeId,key:{startsWith:'employee.workspace.reminder.'}}});assert(reminders>0);
 });
 await check('legitimate old request returns exact old message once; changed body and old source are rejected',async()=>{
  const before=await readTeam(db,storeId,'channel.'+channel.id);assert.equal((await bridge().send(sendInput)).id,sent.id);await assert.rejects(()=>bridge().send({...sendInput,text:'different'}));await assert.rejects(()=>bridge().send({...sendInput,requestId:randomUUID(),expectedLastSeq:before.lastSeq,replyToSeq:1}));assert.deepEqual(await readTeam(db,storeId,'channel.'+channel.id),before);
 });
 await check('revocation, missing channel grant, changed grant version/client and expiry reject reads and old receipts',async()=>{
  const original=structuredClone(grant);
  for(const change of [{revoked:true},{channelIds:[]},{version:2},{clientRevision:2},{expiresAt:new Date(Date.now()-1000).toISOString()}]){grant={...original,...change};await saveGrant();await denyCurrentReadAndReceipt()}
  grant=original;await saveGrant();
 });
 await check('direct binding task version, audience, source, cutoff and version mismatch all fail closed',async()=>{
  const original=structuredClone(binding);
  for(const change of [{task:{...task,version:2}},{delegatedDirect:{...original.delegatedDirect,audienceHash:'f'.repeat(64)}},{delegatedDirect:{...original.delegatedDirect,sourceStaffId:owner.staffId}},{delegatedDirect:{...original.delegatedDirect,expiresAt:new Date(Date.now()+7200000).toISOString()}},{delegatedDirect:{...original.delegatedDirect,grantVersion:2}},{delegatedDirect:{...original.delegatedDirect,clientRevision:2}}]){binding={...original,...change};await setBinding();await denyCurrentReadAndReceipt()}
  binding=original;await setBinding();
 });
 await check('current member/fromSeq/archive and actual sponsor/source identity are rechecked before old receipts',async()=>{
  const c=await readTeam(db,storeId,'channel.'+channel.id);
  for(const change of [{archived:true},{ownerId:employee.staffId},{members:c.members.map(m=>m.staffId===employee.staffId?{...m,fromSeq:2}:m)}]){await writeTeam(db,storeId,'channel.'+channel.id,{...c,...change});await denyCurrentReadAndReceipt()}
  await writeTeam(db,storeId,'channel.'+channel.id,c);await db.user.update({where:{id:owner.id},data:{role:'cashier'}});await denyCurrentReadAndReceipt();await db.user.update({where:{id:owner.id},data:{role:'admin'}});
  await db.user.update({where:{id:employee.id},data:{storeId:null}});await denyCurrentReadAndReceipt();await db.user.update({where:{id:employee.id},data:{storeId}});
  await db.staff.update({where:{id:employee.staffId},data:{status:'inactive'}});await denyCurrentReadAndReceipt();await db.staff.update({where:{id:employee.staffId},data:{status:'active'}});
 });
 await check('delegation never creates a generic native membership or conversation-creation capability',async()=>{
  grant.actions.push('receipts.read');await saveGrant();await assert.rejects(()=>bridge().receipts(ctx()));grant.actions=grant.actions.filter(a=>a!=='receipts.read');await saveGrant();
  const before=await db.config.count({where:{storeId,key:{startsWith:'team.communication.channel.'}}});
  await assert.rejects(()=>bridge().withActor('messages.read',task,channel.id,a=>teamCommunication(db).create(a,{requestId:randomUUID(),kind:'group',title:'Unauthorized new group',members:[employee.staffId]})));
  assert.equal(await db.config.count({where:{storeId,key:{startsWith:'team.communication.channel.'}}}),before);
 });
 await check('native audit failure rolls back direct message, sequence, reminder and request receipt',async()=>{
  const before=await readTeam(db,storeId,'channel.'+channel.id),count=await db.config.count({where:{storeId,key:{startsWith:'employee.workspace.reminder.'}}});
  const faulty={...db,$transaction:fn=>db.$transaction(tx=>fn({config:tx.config,staff:tx.staff,user:tx.user,financeAuditLog:{create:async()=>{throw Error('SYNTHETIC_AUDIT_FAILURE')}}}))};
  await assert.rejects(()=>createTeamAgentBridge(faulty,deps).send({...sendInput,requestId:randomUUID(),expectedLastSeq:before.lastSeq}));
  assert.deepEqual(await readTeam(db,storeId,'channel.'+channel.id),before);assert.equal(await db.config.count({where:{storeId,key:{startsWith:'employee.workspace.reminder.'}}}),count);
 });
 await check('existing physical agent group membership keeps its established read path',async()=>{
  const original=await readTeam(db,storeId,'channel.'+channel.id),originalBinding=structuredClone(binding);
  const group={...original,kind:'group',members:[...original.members,{staffId:'agent:'+agentId,fromSeq:2}]};
  await writeTeam(db,storeId,'channel.'+channel.id,group);binding={agentId,task};await setBinding();
  try{const access=await readAuthorizedBridgeChannel(db,grant,task,channel.id);assert.equal(access.delegatedDirect,false);assert.equal(access.fromSeq,2);assert.deepEqual((await bridge().messages({...ctx(),afterSeq:0})).messages.map(m=>m.id),[source.id,sent.id]);}
  finally{await writeTeam(db,storeId,'channel.'+channel.id,original);binding=originalBinding;await setBinding()}
 });
 const out=path.join(root,'output/lawrence-direct-identity');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/verification.json',JSON.stringify({tests:passed.length,passed,batch:process.env.BT_TEST_RUN,realPg:true,syntheticCommunicationProof:true,realHermes:false,modelCalls:0,productionWrites:0},null,2));
 console.log(JSON.stringify({passed,batch:process.env.BT_TEST_RUN}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
