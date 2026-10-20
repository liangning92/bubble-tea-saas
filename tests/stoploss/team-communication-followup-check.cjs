const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
  let fabricatedCalls=0;const fabricated=teamAi(prisma,async()=>{fabricatedCalls++;return {text:'Invented #999',inputTokens:20,outputTokens:10,providerRequestId:'invalid'}}),fabricatedInput={...input,requestId:randomUUID()};
  await assert.rejects(fabricated.generate(owner,aiChannel.id,fabricatedInput),e=>e.message==='TEAM_AI_RESULT_SCHEMA_INVALID');
  const rejected=await fabricated.draft(owner,aiChannel.id,fabricatedInput.requestId);assert.equal(rejected.status,'blocked');assert.equal(rejected.providerRequestId,'invalid');assert.deepEqual([rejected.usage.inputTokens,rejected.usage.outputTokens],[20,10]);
  await assert.rejects(fabricated.generate(owner,aiChannel.id,fabricatedInput),e=>e.message==='TEAM_AI_NEW_REQUEST_REQUIRED');assert.equal(fabricatedCalls,1);
 });
 await test('concurrent AI requests reserve budget atomically and a pending request is never transmitted twice',async()=>{
  const monthKey=`team.communication.aiBudget.${new Date().toISOString().slice(0,7)}`;
  const row=await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:owner.storeId,key:monthKey}}});
  await prisma.config.update({where:{id:row.id},data:{value:JSON.stringify({spentMicros:0,reservedMicros:0,calls:[]})}});
  // One uncapped request reserves the supplier ceiling (~$0.63), two exceed $0.80.
  await configure({monthlyBudgetUsd:0.8});
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
   const body=JSON.parse(options.body);assert.equal(body.model,'MiniMax-M3');assert.equal(body.reasoning_split,true);assert(!Object.hasOwn(body,'max_completion_tokens'));assert(!Object.hasOwn(body,'max_tokens'));assert(!body.tools);
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
 await test('regional settings normalize legacy records read-only and keep legacy credentials on the international endpoint',async()=>{
  const crypto=require('node:crypto');assert(process.env.UPLOADS_PATH.includes(process.env.BT_TEST_RUN));
  const master=fs.readFileSync(path.join(process.env.UPLOADS_PATH,'.employee-private','.team-ai-master.key'));
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',master,iv);cipher.setAAD(Buffer.from(owner.storeId));
  const encrypted=Buffer.concat([cipher.update('synthetic-minimax-key-only','utf8'),cipher.final()]);
  const legacy=[iv,cipher.getAuthTag(),encrypted].map(v=>v.toString('base64')).join('.');
  const where={storeId_key:{storeId:owner.storeId,key:'team.communication.ai.settings'}};
  const row=await prisma.config.findUniqueOrThrow({where});const old=JSON.parse(row.value);delete old.region;
  await prisma.config.update({where,data:{value:JSON.stringify({...old,enabled:true,secret:legacy})}});
  const before=(await prisma.config.findUniqueOrThrow({where})).value;
  const value=await good('owner','GET','/team/ai/settings');assert.equal(value.region,'global');assert.equal(value.endpoint,'https://api.minimax.io/v1/chat/completions');assert.equal(value.protocol,'openai');
  assert.equal((await prisma.config.findUniqueOrThrow({where})).value,before,'read must not migrate ciphertext or settings');
  await resetRate();let calls=0;const original=global.fetch;
  global.fetch=async(url,options)=>{calls++;assert.equal(url,value.endpoint);assert.equal(options.headers.Authorization,'Bearer synthetic-minimax-key-only');return new Response(JSON.stringify({id:'legacy',choices:[{finish_reason:'stop',message:{content:'合成兼容测试'}}],usage:{prompt_tokens:1,completion_tokens:1}}))};
  try{await teamAi(prisma).generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'draft',instruction:'纯合成',sourceSeq:[],consent:true});assert.equal(calls,1)}finally{global.fetch=original}
 });
 await test('region changes cannot reuse saved credentials or bypass destination confirmation; arbitrary hosts are rejected locally',async()=>{
  const before=await ai.settings(owner),where={storeId_key:{storeId:owner.storeId,key:'team.communication.ai.settings'}};
  const stored=(await prisma.config.findUniqueOrThrow({where})).value;
  const input={expectedVersion:before.version,provider:'minimax',model:'MiniMax-M3',enabled:true,monthlyBudgetUsd:null,inputPerMillionUsd:0.3,outputPerMillionUsd:1.2};
  let calls=0;const original=global.fetch;global.fetch=async(url,...args)=>{if(String(url).startsWith('http://127.0.0.1:'))return original(url,...args);calls++;throw Error('Configuration must not call a provider')};
  try{
   const response=await request('owner','PUT','/team/ai/settings',{...input,region:'cn'});assert.equal(response.status,409);assert.equal(response.body.message,'TEAM_AI_REGION_KEY_REQUIRED');
   const confirmation=await request('owner','PUT','/team/ai/settings',{...input,region:'cn',apiKey:'synthetic-minimax-cn-key-only'});assert.equal(confirmation.status,409);assert.equal(confirmation.body.message,'TEAM_AI_REGION_CONFIRM_REQUIRED');
   for(const extra of [{region:'custom'},{region:'constructor'},{region:'cn',endpoint:'https://example.invalid'},{region:'cn',baseUrl:'http://127.0.0.1'}])assert.equal((await request('owner','PUT','/team/ai/settings',{...input,...extra})).status,400);
   assert.equal((await prisma.config.findUniqueOrThrow({where})).value,stored);assert.equal(calls,0);
  }finally{global.fetch=original}
 });
 await test('China uses only the fixed official endpoint and region-bound ciphertext; omitted region retains China without moving the key',async()=>{
  const saved=await configure({region:'cn',targetConfirmed:true,apiKey:'synthetic-minimax-cn-key-only'});assert.equal(saved.endpoint,'https://api.minimax.cn/v1/chat/completions');assert.equal(saved.region,'cn');
  assert.equal((await configure({model:'MiniMax-M3'})).region,'cn');
  const stored=await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:owner.storeId,key:'team.communication.ai.settings'}}});assert(!stored.value.includes('synthetic-minimax-cn-key-only'));assert(JSON.parse(stored.value).secret.startsWith('v2.cn.'));
  await resetRate();let calls=0;const original=global.fetch;
  global.fetch=async(url,options)=>{calls++;assert.equal(url,saved.endpoint);assert.equal(options.headers.Authorization,'Bearer synthetic-minimax-cn-key-only');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.model,'MiniMax-M3');assert.equal(body.thinking.type,'disabled');assert.equal(body.stream,false);assert(!body.tools);return new Response(JSON.stringify({id:'cn',choices:[{finish_reason:'stop',message:{content:'合成中国区草稿'}}],usage:{prompt_tokens:1,completion_tokens:1}}))};
  try{const d=await teamAi(prisma).generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'draft',instruction:'纯合成',sourceSeq:[],consent:true});assert.equal(d.region,'cn');assert.equal(d.status,'ready');assert.equal(calls,1)}finally{global.fetch=original}
 });
 await test('changing ciphertext region metadata is rejected before budget reservation or provider transmission',async()=>{
  const where={storeId_key:{storeId:owner.storeId,key:'team.communication.ai.settings'}};const row=await prisma.config.findUniqueOrThrow({where});const value=JSON.parse(row.value);
  const budgetKey={storeId_key:{storeId:owner.storeId,key:`team.communication.aiBudget.${new Date().toISOString().slice(0,7)}`}};
  const before=(await prisma.config.findUniqueOrThrow({where:budgetKey})).value;let calls=0;const original=global.fetch;global.fetch=async()=>{calls++;throw Error('No cross-region request allowed')};
  try{
   await prisma.config.update({where,data:{value:JSON.stringify({...value,region:'global'})}});
   await assert.rejects(teamAi(prisma).generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'draft',instruction:'纯合成',sourceSeq:[],consent:true}),e=>e.message==='TEAM_AI_CREDENTIAL_REGION_MISMATCH');
   assert.equal(calls,0);assert.equal((await prisma.config.findUniqueOrThrow({where:budgetKey})).value,before);
  }finally{global.fetch=original;await prisma.config.update({where,data:{value:row.value}})}
 });
 await test('upstream China 401 is stored as uncertain and querying or replaying the same request never transmits again',async()=>{
  await resetRate();let calls=0;const original=global.fetch;global.fetch=async(url,...args)=>{if(String(url).startsWith('http://127.0.0.1:'))return original(url,...args);calls++;assert.equal(url,'https://api.minimax.cn/v1/chat/completions');return new Response('',{status:401})};
  const input={requestId:randomUUID(),kind:'draft',instruction:'纯合成',sourceSeq:[],consent:true};
  try{
   const failed=await request('owner','POST',`/team/channels/${aiChannel.id}/ai/drafts`,input);assert.equal(failed.status,502);assert.equal(failed.body.message,'TEAM_AI_CREDENTIAL_REJECTED');
   const queried=await good('owner','GET',`/team/channels/${aiChannel.id}/ai/drafts/${input.requestId}`);assert.equal(queried.status,'uncertain');assert.equal(queried.error,'TEAM_AI_CREDENTIAL_REJECTED');assert.equal(queried.text,'');
   assert.equal((await request('owner','POST',`/team/channels/${aiChannel.id}/ai/drafts`,input)).status,409);assert.equal(calls,1);
  }finally{global.fetch=original}
 });
 await test('region changes while a model is in flight withhold the old-region result',async()=>{
  await resetRate();const scoped=teamAi(prisma,async(_key,_model,_system,_input,region)=>{assert.equal(region,'cn');await configure({region:'global',apiKey:'synthetic-minimax-key-only',targetConfirmed:true});return {text:'Must be withheld',inputTokens:1,outputTokens:1,providerRequestId:'region-change'}});
  const d=await scoped.generate(owner,aiChannel.id,{requestId:randomUUID(),kind:'draft',instruction:'纯合成',sourceSeq:[],consent:true});assert.equal(d.status,'blocked');assert.equal(d.text,'');await configure({enabled:false,removeKey:true});
 });
};
