const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
module.exports = async ({ prisma, good, request, create, send, test, dropResponse }) => {
 const fixture = async () => {
  const c = await create('owner','group',['s-alice','s-bob'],'Synthetic task follow-up');
  await send('owner',c.id,'Inspect the machine and report the result.');
  const m = await good('owner','POST',`/team/channels/${c.id}/rounds/close`,{expectedVersion:1});
  const confirmed = await good('owner','PUT',`/team/channels/${c.id}/minutes/${m.id}`,{
   requestId:randomUUID(),expectedVersion:1,title:m.title,decisions:['Inspect machine'],pending:[],
   actions:[{text:'Inspect machine',ownerId:'s-bob',dueDate:'2026-10-22',sourceSeq:[1]}],sourceSeq:[1],status:'confirmed'});
  return {c,m:confirmed};
 };
 const promote = (c,m,who='owner',requestId=randomUUID()) => good(who,'POST',`/team/channels/${c.id}/tasks`,{requestId,roundId:m.id,minuteVersion:m.version,actionIndex:0});
 const action = (who,c,t,verb,extra={}) => good(who,'POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:verb,...extra});
 await test('follow-up tasks require confirmed minutes, preserve snapshots and deduplicate retries',async()=>{
  const {c,m}=await fixture(); const payload={requestId:randomUUID(),roundId:m.id,minuteVersion:m.version,actionIndex:0};
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks`,payload,true)).status,403);
  const t=await good('owner','POST',`/team/channels/${c.id}/tasks`,payload);
  assert.equal((await good('owner','POST',`/team/channels/${c.id}/tasks`,payload)).id,t.id);
  assert.equal((await promote(c,m)).id,t.id);
  await good('owner','PUT',`/team/channels/${c.id}/minutes/${m.id}`,{requestId:randomUUID(),expectedVersion:m.version,title:m.title,decisions:[],pending:[],actions:[],sourceSeq:[1],status:'draft'});
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0].text,'Inspect machine');
  assert.equal((await request('outsider','GET',`/team/channels/${c.id}/tasks`)).status,404);
 });
 await test('assignee acceptance and evidence submission are distinct from read; human review supports return and approval',async()=>{
  const {c,m}=await fixture(); let t=await promote(c,m);
  await good('bob','PUT',`/team/channels/${c.id}/read`,{seq:1},true);
  assert.equal((await good('bob','GET',`/team/channels/${c.id}/tasks`,undefined,true))[0].status,'assigned');
  t=await action('bob',c,t,'accept');
  assert.equal((await request('alice','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:'submit',note:'Claim',sourceSeq:[1]},true)).status,403);
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:t.version,action:'submit',note:'Claim',sourceSeq:[1]},true)).status,400);
  const evidence=await send('bob',c.id,'The inspection is complete. No issue found.');
  t=await action('bob',c,t,'submit',{note:'Inspection submitted',sourceSeq:[evidence.seq]});
  t=await action('owner',c,t,'return',{note:'Please clarify the pressure reading.'});
  assert.equal(t.status,'changes_requested');
  t=await action('bob',c,t,'submit',{note:'Pressure reading clarified',sourceSeq:[evidence.seq]});
  const payload={requestId:randomUUID(),expectedVersion:t.version,action:'complete',note:'Reviewed'};
  dropResponse(); await assert.rejects(request('owner','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,payload));
  t=await good('owner','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,payload);
  assert.equal(t.status,'completed');assert.equal(t.events.length,6);
 });
 await test('task history follows membership floors, revocation and explicit audited reads',async()=>{
  const {c,m}=await fixture(), t=await promote(c,m);
  const changed=await good('owner','PUT',`/team/channels/${c.id}/members`,{expectedVersion:2,ownerId:'s-owner',members:['s-owner','s-alice','s-bob','s-carol'],archived:false});
  assert.deepEqual(await good('carol','GET',`/team/channels/${c.id}/tasks`,undefined,true),[]);
  assert.equal((await request('auditor','GET',`/team/channels/${c.id}/tasks`)).status,403);
  assert.equal((await good('auditor','GET',`/team/channels/${c.id}/tasks?auditReason=synthetic-review`)).length,1);
  await good('owner','PUT',`/team/channels/${c.id}/members`,{expectedVersion:changed.version,ownerId:'s-owner',members:['s-owner','s-alice','s-carol'],archived:false});
  assert.equal((await request('bob','POST',`/team/channels/${c.id}/tasks/${t.id}/actions`,{requestId:randomUUID(),expectedVersion:1,action:'accept'},true)).status,403);
  const cancelled=await action('owner',c,t,'cancel',{note:'Assignee removed'});assert.equal(cancelled.status,'cancelled');
 });
 const {teamAi}=require(path.resolve('server/dist/services/TeamAiService'));
 const owner={id:'u-owner',storeId:'team-store-a',staffId:'s-owner',role:'admin'};
 const ai=teamAi(prisma,async(key,model,system,input)=>{
  assert.equal(key,'synthetic-minimax-key-only');assert.equal(model,'MiniMax-M3');assert(!input.includes('files'));
  return {text:'Tolong periksa mesin. #1',inputTokens:120,outputTokens:30,providerRequestId:'synthetic-request'};
 });
 const configure=async(extra={})=>{
  const current=await ai.settings(owner);
  return ai.saveSettings(owner,{expectedVersion:current.version,provider:'minimax',model:'MiniMax-M3',enabled:true,monthlyBudgetUsd:null,
   inputPerMillionUsd:0.3,outputPerMillionUsd:1.2,...extra});
 };
 const resetRate=async()=>{
  const key=`team.communication.aiBudget.${new Date().toISOString().slice(0,7)}`;
  const row=await prisma.config.findUnique({where:{storeId_key:{storeId:owner.storeId,key}}});
  if(row)await prisma.config.update({where:{id:row.id},data:{value:JSON.stringify({...JSON.parse(row.value),calls:[]})}});
 };
 await test('MiniMax settings default to no cap and no key; credentials are write-only and private',async()=>{
  const initial=await good('owner','GET','/team/ai/settings');assert.equal(initial.monthlyBudgetUsd,null);assert.equal(initial.enabled,false);assert.equal(initial.keyConfigured,false);
  assert.equal((await request('alice','GET','/team/ai/settings',undefined,true)).status,403);
  const saved=await configure({apiKey:'synthetic-minimax-key-only'});assert(saved.keyConfigured);assert(!('secret' in saved));
  const row=await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:owner.storeId,key:'team.communication.ai.settings'}}});
  assert(!row.value.includes('synthetic-minimax-key-only'));
  assert.equal((await request('owner','GET','/config/team-store-a/team.communication.ai.settings')).status,403);
 });
 let aiChannel,draft;
 await test('MiniMax text drafts send only selected text, replay once, stay private and publish only with human approval',async()=>{
  aiChannel=await create('owner','group',['s-bob'],'Synthetic MiniMax channel');await send('owner',aiChannel.id,'Inspect only the machine.');
  const input={requestId:randomUUID(),kind:'draft',instruction:'请员工检查设备',sourceSeq:[1],consent:true};
  let calls=0;const counted=teamAi(prisma,async(...args)=>{calls++;return {text:'Tolong periksa mesin. #1',inputTokens:120,outputTokens:30,providerRequestId:'counted'};});
  draft=await counted.generate(owner,aiChannel.id,input);assert.equal(draft.status,'ready');await counted.generate(owner,aiChannel.id,input);assert.equal(calls,1);
  assert.equal((await request('bob','GET',`/team/channels/${aiChannel.id}/ai/drafts/${draft.id}`,undefined,true)).status,403);
  const before=(await good('bob','GET',`/team/channels/${aiChannel.id}/messages`)).messages.length;assert.equal(before,1);
  const sent=await good('owner','POST',`/team/channels/${aiChannel.id}/ai/drafts/${draft.id}/publish`,{text:draft.text});
  assert.equal(sent.ai.provider,'minimax');assert.equal(sent.ai.approvedBy,'s-owner');
  assert.equal((await good('owner','POST',`/team/channels/${aiChannel.id}/ai/drafts/${draft.id}/publish`,{text:draft.text})).id,sent.id);
  assert.equal((await good('bob','GET',`/team/channels/${aiChannel.id}/messages`)).messages.length,2);
 });
 await test('AI context and publication recheck membership, audience and policy changes',async()=>{
  const next=await ai.generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'draft',instruction:'追问设备',sourceSeq:[1],consent:true});
  const c=(await good('owner','GET','/team/channels')).find(c=>c.id===aiChannel.id);
  await good('owner','PUT',`/team/channels/${c.id}/members`,{expectedVersion:c.version,ownerId:'s-owner',members:['s-owner','s-bob','s-carol'],archived:false});
  assert.equal((await request('owner','POST',`/team/channels/${c.id}/ai/drafts/${next.id}/publish`,{text:next.text})).status,403);
  await configure({enabled:false});
  assert.equal((await request('owner','POST',`/team/channels/${c.id}/ai/drafts/${next.id}/publish`,{text:next.text})).status,409);
  await configure();await resetRate();
 });
 await test('optional monthly cap blocks before transmission; no cap remains configurable',async()=>{
  await configure({monthlyBudgetUsd:0.000001});let calls=0;
  const limited=teamAi(prisma,async()=>{calls++;throw Error('should not transmit')});
  await assert.rejects(limited.generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'report',sourceSeq:[1],consent:true}),e=>e.message==='TEAM_AI_BUDGET_LIMIT');
  assert.equal(calls,0);await configure({monthlyBudgetUsd:null});
 });
 await test('uncertain AI outcomes retain reservations and never automatically retry or invent source references',async()=>{
  await resetRate();let calls=0;
  const failed=teamAi(prisma,async()=>{calls++;throw Error('provider timeout')});
  const input={requestId:randomUUID(),kind:'report',sourceSeq:[1],consent:true};
  await assert.rejects(failed.generate(owner,aiChannel.id,input),e=>e.message==='TEAM_AI_PROVIDER_UNAVAILABLE');
  const d=await failed.draft(owner,aiChannel.id,input.requestId);assert.equal(d.status,'uncertain');assert.equal(d.text,'');
  await assert.rejects(failed.generate(owner,aiChannel.id,input),e=>e.message==='TEAM_AI_NEW_REQUEST_REQUIRED');assert.equal(calls,1);
  assert((await ai.settings(owner)).estimatedMonthUsd>0);
  const fabricated=teamAi(prisma,async()=>({text:'Invented #999',inputTokens:20,outputTokens:10,providerRequestId:'invalid'}));
  await assert.rejects(fabricated.generate(owner,aiChannel.id,{...input,requestId:randomUUID()}),e=>e.message==='TEAM_AI_INVALID_SOURCE');
 });
 await test('concurrent AI requests reserve budget atomically and a pending request is never transmitted twice',async()=>{
  const monthKey=`team.communication.aiBudget.${new Date().toISOString().slice(0,7)}`;
  const row=await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:owner.storeId,key:monthKey}}});
  await prisma.config.update({where:{id:row.id},data:{value:JSON.stringify({spentMicros:0,reservedMicros:0,calls:[]})}});
  await configure({monthlyBudgetUsd:0.006});
  let started,release,calls=0;const ready=new Promise(r=>{started=r}), gate=new Promise(r=>{release=r});
  const slow=teamAi(prisma,async()=>{calls++;started();await gate;return {text:'合成结果 #1',inputTokens:50,outputTokens:10,providerRequestId:'concurrent'};});
  const input={requestId:randomUUID(),kind:'report',sourceSeq:[1],consent:true};
  const first=slow.generate(owner,aiChannel.id,input);await ready;
  try {
   await assert.rejects(slow.generate(owner,aiChannel.id,input),e=>e.message==='TEAM_AI_PENDING');
   await assert.rejects(slow.generate(owner,aiChannel.id,{...input,requestId:randomUUID()}),e=>e.message==='TEAM_AI_BUDGET_LIMIT');
   assert.equal(calls,1);
  } finally {release();await first;}
  await configure({monthlyBudgetUsd:null});await resetRate();
 });
 await test('disabling AI during generation withholds the output while retaining recorded usage',async()=>{
  const stopped=teamAi(prisma,async()=>{await configure({enabled:false});return {text:'Do not publish #1',inputTokens:50,outputTokens:10,providerRequestId:'disabled'};});
  const d=await stopped.generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'report',sourceSeq:[1],consent:true});
  assert.equal(d.status,'blocked');assert.equal(d.text,'');assert(d.usage);await configure();await resetRate();
 });
 await test('MiniMax adapter pins the official endpoint, keeps reasoning separate and supplies no tools',async()=>{
  await resetRate();const original=global.fetch;let calls=0;
  global.fetch=async(url,options)=>{
   calls++;assert.equal(url,'https://api.minimax.io/v1/chat/completions');assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,'Bearer synthetic-minimax-key-only');
   const body=JSON.parse(options.body);assert.equal(body.model,'MiniMax-M3');assert.equal(body.reasoning_split,true);assert.equal(body.max_completion_tokens,4096);assert(!body.tools);
   return new Response(JSON.stringify({id:'synthetic-adapter',choices:[{finish_reason:'stop',message:{content:'合成报告 #1',reasoning_content:'not retained'}}],usage:{prompt_tokens:50,completion_tokens:12},base_resp:{status_code:0}}));
  };
  try {
   const normal=teamAi(prisma), d=await normal.generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'report',sourceSeq:[1],consent:true});
   assert.equal(calls,1);assert.equal(d.text,'合成报告 #1');assert(!JSON.stringify(d).includes('not retained'));
   // Reports cannot be published through the staff-message approval endpoint.
   await assert.rejects(require(path.resolve('server/dist/services/TeamCommunicationService')).teamCommunication(prisma).send(owner,aiChannel.id,{requestId:d.id,text:d.text},d.id),e=>e.message==='TEAM_AI_DRAFT_NOT_READY');
  } finally {global.fetch=original;}
  await configure({enabled:false,removeKey:true});
 });
};
