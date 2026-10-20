// Actual authenticated routes, service and disposable PostgreSQL; provider is mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
module.exports=async function diagnostics({prisma,request,settings,save,check,clearRate,test,root,modelCalls,setResponseFactory}){
 assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
 const prefix='team.communication.',storeId='ai-store-a',secret='synthetic-diagnostics-key',trace='00112233445566778899aabbccddeeff',forbidden='SYNTHETIC_PRIVATE_BODY';
 const row=(suffix,store=storeId)=>prisma.config.findUnique({where:{storeId_key:{storeId:store,key:prefix+suffix}}});
 const budget=async(store=storeId)=>{const r=await row('aiBudget.'+new Date().toISOString().slice(0,7),store);return r?JSON.parse(r.value):null;};
 const configure=async(extra={})=>{await clearRate();const s=await settings();return save(s.version,{region:'global',apiKey:secret,targetConfirmed:true,maxOutputTokens:null,...extra});};
 const success=(tokens=1)=>new Response(JSON.stringify({id:'synthetic-provider',choices:[{finish_reason:'stop',message:{content:'OK'}}],usage:{prompt_tokens:20,completion_tokens:tokens}}));
 const observations=[];
 try{
  for(const [http,code,wanted]of [[529,1033,'uncertain'],[500,1024,'uncertain'],[401,1004,'failed'],[429,1002,'failed']])await test('sanitized HTTP'+http+' diagnostics persist with same-ID replay and unchanged billing protection',async()=>{
   const s=await configure(),id=randomUUID(),calls=modelCalls.length,funds=await budget();
   setResponseFactory(()=>new Response(JSON.stringify({base_resp:{status_code:code,status_msg:forbidden+secret},error:{message:forbidden,metadata:{api_key:secret}},request:{token:secret},trace_id:'ffeeddccbbaa99887766554433221100'}),{status:http,headers:{trace_id:trace,'x-private-secret':secret}}));
   const first=await check(s.version,id),after=await budget();assert.equal(first.status,wanted);assert.equal(first.providerHttpStatus,http);assert.equal(first.providerDiagnostics.businessCode,code);assert.equal(first.providerDiagnostics.traceId,trace);
   assert(after.reservedMicros>funds.reservedMicros);assert.equal(after.spentMicros,funds.spentMicros);assert.equal(modelCalls.length,calls+1);
   const persisted=JSON.parse((await row('aiConnectionRequest.s-ai-owner.'+id)).value);assert.deepEqual(persisted.providerDiagnostics,first.providerDiagnostics);
   assert.deepEqual((await check(s.version,id)).providerDiagnostics,first.providerDiagnostics);assert.equal(modelCalls.length,calls+1);assert.deepEqual(await budget(),after);
   if(wanted==='uncertain'){await check(s.version,randomUUID(),409);assert.equal(modelCalls.length,calls+1);assert.deepEqual(await budget(),after);}
   const exposed=JSON.stringify([first,await settings(),persisted,await prisma.financeAuditLog.findMany({where:{storeId},select:{newValue:true}})]);assert(!exposed.includes(secret));assert(!exposed.includes(forbidden));assert(!exposed.includes('x-private-secret'));
   observations.push({http,status:first.status,providerDiagnostics:first.providerDiagnostics,extraCallsFromReplay:0,reservationRetained:true});
  });
  await test('old receipt without diagnostics replays without new metadata, calls or charges',async()=>{
   const s=await configure(),id=randomUUID();setResponseFactory(()=>new Response('legacy plain failure',{status:529}));await check(s.version,id);
   for(const suffix of ['ai.connection','aiConnectionRequest.s-ai-owner.'+id]){const r=await row(suffix),v=JSON.parse(r.value);delete v.providerDiagnostics;await prisma.config.update({where:{id:r.id},data:{value:JSON.stringify(v)}});}
   const before=modelCalls.length,funds=await budget();assert.equal((await settings()).connection.providerDiagnostics,undefined);assert.equal((await check(s.version,id)).providerDiagnostics,undefined);assert.equal(modelCalls.length,before);assert.deepEqual(await budget(),funds);
  });
  await test('no chosen output limit is omitted and valid usage above previous 32/4096 is accepted',async()=>{
   const s=await configure();setResponseFactory(()=>success(8192));const result=await check(s.version);assert.equal(result.status,'ready');assert(!Object.hasOwn(modelCalls.at(-1).body,'max_completion_tokens'));assert(!Object.hasOwn(modelCalls.at(-1).body,'max_tokens'));assert.equal((await settings()).maxOutputTokens,null);
  });
  await test('explicit user output limit survives an older-client save; null clears it without migrating old constants',async()=>{
   let s=await configure({maxOutputTokens:128});setResponseFactory(()=>success());await check(s.version);assert.equal(modelCalls.at(-1).body.max_completion_tokens,128);
   s=await save(s.version,{region:'global'});assert.equal(s.maxOutputTokens,128);s=await save(s.version,{region:'global',maxOutputTokens:null});await check(s.version);assert(!Object.hasOwn(modelCalls.at(-1).body,'max_completion_tokens'));
   const r=await row('ai.settings'),old=JSON.parse(r.value);delete old.maxOutputTokens;await prisma.config.update({where:{id:r.id},data:{value:JSON.stringify(old)}});const before=(await row('ai.settings')).value;assert.equal((await settings()).maxOutputTokens,null);assert.equal((await row('ai.settings')).value,before);
  });
  await test('unknown model without a reliable bound and malformed legacy prices fail before admission',async()=>{
   let s=await configure({model:'MiniMax-Future'});const before=modelCalls.length,funds=await budget(),revision=s.checkRevision;let result=await check(s.version,randomUUID(),409);assert.equal(result.message,'TEAM_AI_COST_ESTIMATE_REQUIRED');assert.equal(modelCalls.length,before);assert.deepEqual(await budget(),funds);assert.equal((await settings()).checkRevision,revision);
   s=await configure();const r=await row('ai.settings'),original=JSON.parse(r.value);await prisma.config.update({where:{id:r.id},data:{value:JSON.stringify({...original,outputPerMillionUsd:0})}});result=await check(s.version,randomUUID(),409);assert.equal(result.message,'TEAM_AI_COST_ESTIMATE_REQUIRED');assert.equal(modelCalls.length,before);await prisma.config.update({where:{id:r.id},data:{value:JSON.stringify(original)}});
  });
  await test('supplier ceiling is a nonzero reservation only; low monthly budget stops before any provider request',async()=>{
   const body={provider:'minimax',model:'MiniMax-M3',enabled:false,region:'cn',monthlyBudgetUsd:.1,inputPerMillionUsd:.3,outputPerMillionUsd:1.2,maxOutputTokens:null,apiKey:'synthetic-budget-only',targetConfirmed:true};
   let s=await request('budget','PUT','team/ai/settings',{...body,expectedVersion:0});const before=modelCalls.length,id=randomUUID();const blocked=await request('budget','POST','team/ai/connection-check',{expectedVersion:s.version,expectedCheckRevision:s.checkRevision,requestId:id,consent:true},409);assert.equal(blocked.message,'TEAM_AI_BUDGET_LIMIT');assert.equal(modelCalls.length,before);assert.equal(await budget('ai-store-c'),null);
   s=await request('budget','PUT','team/ai/settings',{...body,expectedVersion:s.version,monthlyBudgetUsd:1});let reserved;
   setResponseFactory(async()=>{reserved=(await budget('ai-store-c')).reservedMicros;return success();});const accepted=await request('budget','POST','team/ai/connection-check',{expectedVersion:s.version,expectedCheckRevision:s.checkRevision,requestId:randomUUID(),consent:true});assert.equal(accepted.status,'ready');assert(reserved>=Math.ceil(524288*1.2));assert(!Object.hasOwn(modelCalls.at(-1).body,'max_completion_tokens'));assert((await budget('ai-store-c')).spentMicros>0);
   observations.push({supplierOutputCeilingUsedOnlyForReservation:524288,reservedMicros:reserved,requestOutputLimitSent:false,zeroBudgetBypass:false});
  });
  await test('malformed or overflowing budget counters fail before admission without changing the receipt or ledger',async()=>{
   const s=await configure(),r=await row('aiBudget.'+new Date().toISOString().slice(0,7)),before=modelCalls.length,original=r.value;
   try{for(const state of [{spentMicros:-1,reservedMicros:0,calls:[]},{spentMicros:0,reservedMicros:0,calls:{}},{spentMicros:Number.MAX_SAFE_INTEGER,reservedMicros:0,calls:[]}]){
    const value=JSON.stringify(state);await prisma.config.update({where:{id:r.id},data:{value}});const result=await check(s.version,randomUUID(),409);assert.equal(result.message,'TEAM_AI_BUDGET_STATE_INVALID');assert.equal(modelCalls.length,before);assert.equal((await row('aiBudget.'+new Date().toISOString().slice(0,7))).value,value);assert.equal((await settings()).checkRevision,s.checkRevision);
   }}finally{await prisma.config.update({where:{id:r.id},data:{value:original}});}
  });
  await test('normal draft generation omits unchosen cap and saves sanitized non-success diagnostics',async()=>{
   let s=await configure({enabled:true});const c=await request('owner','POST','team/channels',{requestId:randomUUID(),title:'Synthetic diagnostics channel',kind:'direct',members:['s-ai-cashier']});
   setResponseFactory(()=>success(8192));const ready=await request('owner','POST','team/channels/'+c.id+'/ai/drafts',{requestId:randomUUID(),kind:'draft',sourceSeq:[],instruction:'Synthetic plain draft',consent:true});assert.equal(ready.status,'ready');assert(!Object.hasOwn(modelCalls.at(-1).body,'max_completion_tokens'));
   setResponseFactory(()=>new Response(JSON.stringify({base_resp:{status_code:1033,status_msg:secret+forbidden}}),{status:529,headers:{trace_id:trace}}));const id=randomUUID(),calls=modelCalls.length,funds=await budget();await request('owner','POST','team/channels/'+c.id+'/ai/drafts',{requestId:id,kind:'draft',sourceSeq:[],instruction:'Synthetic plain draft',consent:true},502);const saved=JSON.parse((await row('aiDraft.s-ai-owner.'+id)).value);assert.equal(saved.status,'uncertain');assert.equal(saved.providerHttpStatus,529);assert.equal(saved.providerDiagnostics.businessCode,1033);assert.equal(saved.providerDiagnostics.traceId,trace);assert(!JSON.stringify(saved).includes(secret));assert(!JSON.stringify(saved).includes(forbidden));const after=await budget();assert(after.reservedMicros>funds.reservedMicros);await request('owner','POST','team/channels/'+c.id+'/ai/drafts',{requestId:id,kind:'draft',sourceSeq:[],instruction:'Synthetic plain draft',consent:true},409);assert.equal(modelCalls.length,calls+1);assert.deepEqual(await budget(),after);
  });
 }finally{setResponseFactory(null);}
 fs.mkdirSync(root+'/output/ai-diagnostics',{recursive:true});fs.writeFileSync(root+'/output/ai-diagnostics/http-diagnostics.json',JSON.stringify({run:process.env.BT_TEST_RUN,observations,allProviderRequestsMocked:true,productionWrites:false},null,2)+'\n');
};
