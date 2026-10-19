// Runs only inside the labeled, synthetic PostgreSQL connection fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
module.exports=async function outcomes({prisma,request,settings,save,check,clearRate,test,setMode,waitStarted,resume,calls,root}){
 assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert.equal(new URL(process.env.DATABASE_URL).pathname,'/team_test');
 const observations=[],storeId='ai-store-a',prefix='team.communication.';
 const read=async key=>JSON.parse((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId,key:prefix+key}}})).value);
 const budget=()=>read('aiBudget.'+new Date().toISOString().slice(0,7));
 const configure=async(extra={})=>{await clearRate();const s=await settings();return save(s.version,{region:'global',apiKey:'synthetic-outcomes-key',targetConfirmed:true,...extra})};
 const cases=[['500','uncertain'],['502','uncertain'],['503','uncertain'],['504','uncertain'],['400','uncertain'],['403','uncertain'],['408','uncertain'],['302','uncertain'],['timeout','uncertain'],['reset','uncertain'],['abort','uncertain'],['invalid-json','uncertain'],['incomplete','uncertain'],['missing-usage','uncertain'],['401','failed'],['429','failed']];
 for(const [mode,wanted]of cases)await test('connection outcome '+mode+': '+wanted+' with idempotency and conservative billing',async()=>{
  const config=await configure(),id=randomUUID(),beforeCalls=calls(),beforeBudget=await budget();setMode(mode);
  const first=await check(config.version,id),afterFirst=await budget();assert.equal(first.status,wanted,mode);assert.equal(first.configVersion,config.version);
  assert.equal(first.providerHttpStatus,/^\d{3}$/.test(mode)?Number(mode):undefined);assert(afterFirst.reservedMicros>beforeBudget.reservedMicros);
  assert.equal((await check(config.version,id)).status,wanted);assert.equal(calls(),beforeCalls+1);
  await check(config.version,randomUUID(),wanted==='uncertain'?409:200);
  const afterSecond=await budget();assert.equal(calls()-beforeCalls,wanted==='uncertain'?1:2);
  if(wanted==='uncertain')assert.deepEqual(afterSecond,afterFirst,'unknown request must not add a call or a reservation');
  else assert(afterSecond.reservedMicros>afterFirst.reservedMicros,'a definite rejection does not imply the old reservation was cleared');
  observations.push({mode,status:first.status,providerHttpStatus:first.providerHttpStatus,configVersion:config.version,newRequestTransportCount:calls()-beforeCalls,sameIdReplayTransportCount:0,reservedAfterFirst:afterFirst.reservedMicros,reservedAfterSecond:afterSecond.reservedMicros});
 });
 await test('strict request/version/consent input rejects before transport or reservation',async()=>{
  const config=await configure(),before=calls(),funds=await budget();
  for(const body of [{expectedVersion:config.version,requestId:randomUUID()},{expectedVersion:config.version,requestId:randomUUID(),consent:false},{expectedVersion:config.version,requestId:'not-uuid',consent:true},{expectedVersion:config.version,requestId:randomUUID(),consent:true,storeId:'ai-store-b'}])await request('owner','POST','team/ai/connection-check',body,400);
  await check(config.version-1,randomUUID(),409);assert.equal(calls(),before);assert.deepEqual(await budget(),funds);
 });
 await test('legacy failed records without rejection evidence remain unknown and cannot bypass either guard',async()=>{
  const config=await configure(),id=randomUUID(),key='aiConnectionRequest.s-ai-owner.'+id;
  const legacy={requestId:id,configVersion:config.version,region:config.region,model:config.model,checkedAt:new Date().toISOString(),status:'failed',error:'TEAM_AI_PROVIDER_FAILED'};
  for(const suffix of [key,'ai.connection'])await prisma.config.upsert({where:{storeId_key:{storeId,key:prefix+suffix}},create:{storeId,key:prefix+suffix,value:JSON.stringify(legacy),category:'staff'},update:{value:JSON.stringify(legacy)}});
  const before=calls(),funds=await budget();assert.equal((await settings()).connection.status,'uncertain');assert.equal((await check(config.version,id)).status,'uncertain');await check(config.version,randomUUID(),409);assert.equal(calls(),before);assert.deepEqual(await budget(),funds);
 });
 for(const collide of [false,true])await test('late V1 HTTP500 cannot replace V2 success or clear V1 reservation'+(collide?' with another admin reusing its UUID':''),async()=>{
  const v1=await configure(),id=randomUUID(),before=await budget(),ready=waitStarted();setMode('pause500');const pending=check(v1.version,id,409);await ready;
  try{
   assert.equal((await check(v1.version,id)).status,'checking');await check(v1.version,randomUUID(),409);
   const v2=await save(v1.version,{region:'global'});setMode('ok');
   const result=collide?await request('backup','POST','team/ai/connection-check',{expectedVersion:v2.version,requestId:id,consent:true}):await check(v2.version);
   assert.equal(result.status,'ready');assert.equal(result.configVersion,v2.version);
   const during=await budget();assert(during.reservedMicros>before.reservedMicros);
   resume();await pending;const current=await settings(),after=await budget();
   assert.equal(current.connection.status,'ready');assert.equal(current.connection.configVersion,v2.version);assert.equal(after.reservedMicros,during.reservedMicros);
   const old=await read('aiConnectionRequest.s-ai-owner.'+id);assert.equal(old.status,'uncertain');assert.equal(old.providerHttpStatus,500);assert.equal(old.configVersion,v1.version);
   const callCount=calls();await check(v1.version,id,409);await check(v2.version,id,409);assert.equal(calls(),callCount);
  }finally{resume();await pending}
 });
 await test('changing region, replacing/removing key and newer success retain old unknown request and cost',async()=>{
  let config=await configure();setMode('timeout');const id=randomUUID(),result=await check(config.version,id);assert.equal(result.status,'uncertain');
  const key='aiConnectionRequest.s-ai-owner.'+id,old=await read(key),funds=await budget();
  for(const change of [{region:'cn',apiKey:'synthetic-cn-replacement',targetConfirmed:true},{region:'cn',apiKey:'synthetic-next-key'},{region:'cn',removeKey:true}]){
   config=await save(config.version,change);assert.equal(config.connection,null);assert.equal((await budget()).reservedMicros,funds.reservedMicros);assert.deepEqual(await read(key),old);
  }
  config=await save(config.version,{region:'cn',apiKey:'synthetic-final-key'});setMode('ok');await clearRate();assert.equal((await check(config.version)).status,'ready');
  assert.equal((await budget()).reservedMicros,funds.reservedMicros);assert.deepEqual(await read(key),old);
 });
 fs.mkdirSync(root+'/output/ai-settings/p2/after',{recursive:true});fs.writeFileSync(root+'/output/ai-settings/p2/after/outcome-matrix.json',JSON.stringify({run:process.env.BT_TEST_RUN,observations,allProviderRequestsMocked:true,productionWrites:false},null,2)+'\n');
};
