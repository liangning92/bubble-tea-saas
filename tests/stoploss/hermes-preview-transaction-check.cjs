/* Owned PG, real native preview route; expensive renderer is a gated fixture.
 * No browser/model/payment/production mutation. Tests historical ticket replay. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),build=process.env.OPERATIONS_BUILD_ROOT||root+'/server/dist',mod=n=>require(build+'/'+n);
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client'),db=new PrismaClient({transactionOptions:{timeout:5000,maxWait:2000}});
const {readTeam,writeTeam,lockTeam,teamCommunication}=mod('services/TeamCommunicationService');
const {createEmployeeRuntime}=mod('services/teamAgentBridge/employeeRuntime'),{readCommunicationScope}=mod('services/teamAgentBridge/confidentiality');
const {employeeRuntimeDigest:hash}=mod('services/teamAgentBridge/employeeRuntimeSources');
const renderer=mod('services/ActivityPosterPreviewService');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>!(k==='required'&&Array.isArray(v[k])&&!v[k].length)).map(k=>[k,normalize(v[k])])):v;
async function main(){
 mod('middlewares/staffAccessV2').declareAccessRoutes('/api/marketing/activities',mod('routes/activities').activitiesRouter);
 const tenant=await db.tenant.create({data:{name:'Legacy poster transaction fixture'}}),storeId='preview-tx-store',agentId=randomUUID(),task={taskId:randomUUID(),version:1};
 await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Owned synthetic fixture'}});
 const user=await db.user.create({data:{phone:'08999510001',password:'fixture-no-login',role:'admin',storeId,staff:{create:{storeId,name:'Owner fixture',employeeNumber:'preview-owner'}}},include:{staff:true}});
 const owner={id:user.id,staffId:user.staff.id,storeId,role:'admin'};
 const grant={agentId,displayName:'Hermes preview fixture',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send','marketing.read'],staffIds:[owner.staffId],channelIds:[]};
 const channel=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Private preview fixture',kind:'group',members:[owner.staffId]});
 const source=await teamCommunication(db).send(owner,channel.id,{requestId:randomUUID(),text:'Read only: show the poster. Keep this activity paused.'});
 channel.lastSeq=source.seq;channel.members.push({staffId:'agent:'+agentId,fromSeq:1});await writeTeam(db,storeId,'channel.'+channel.id,channel);
 await db.config.create({data:{storeId,key:'externalAgent.teamBridge.v1.channel.'+channel.id,category:'test',value:JSON.stringify({agentId,task})}});
 await writeTeam(db,storeId,'ai.agent.settings',{enabled:true,employeeBridgeEnabled:true,taskTimeoutMinutes:10,permissions:{marketing:{read:true,write:false}}});
 const category=await db.category.create({data:{storeId,name:'Fixture drinks'}}),product=await db.product.create({data:{storeId,categoryId:category.id,code:'PREVIEW',name:'Fixture milkshake',specs:{create:{name:'Default',price:16000,isDefault:true}}}});
 const {saveActivity}=mod('services/ActivityService'),activity=await saveActivity(storeId,{name:'Paused fixture special',status:'paused',type:'special_price',memberOnly:true,productIds:[product.id],rule:{price:12000}});
 const before=JSON.stringify((await mod('services/ActivityService').listActivities(storeId,db)).find(a=>a.id===activity.id)),system=[{role:'system',content:'Synthetic isolated provider, no private history'}];
 const runtime=createEmployeeRuntime(db,{enabled:true,storeId,approvedSystemHashes:[hash(system)],resolveGrant:async()=>structuredClone(grant),tasks:{assert:async()=>{}},readAttachment:async()=>{throw Error('NO_ATTACHMENTS')}});
 const scope=await readCommunicationScope(db,grant,task,channel,owner.staffId),ticket=await runtime.host.begin(grant,scope,[{kind:'conversation',channelId:channel.id,messageId:source.id,seq:source.seq}]);
 // An already issued older execution keeps its old name/schema. New execution
 // advertisements remain the unified employee_backend surface.
 assert(!ticket.tools.some(t=>t.function.name==='employee_manage_marketing'));
 ticket.tools.push({type:'function',function:{name:'employee_manage_marketing',description:'Historical issued poster preview',parameters:{type:'object',properties:{action:{type:'string',enum:['render_daily_poster']},activityId:{type:'string'},expectedVersion:{type:'integer'},format:{type:'string',enum:['portrait','landscape']}},required:['action'],additionalProperties:false}}});
 ticket.toolSchemaHash=hash(ticket.tools.map(normalize).sort((a,b)=>a.function.name<b.function.name?-1:a.function.name>b.function.name?1:0));
 const persisted=await readTeam(db,storeId,'employeeRuntime.execution.'+ticket.executionId);persisted.ticket.tools=ticket.tools;persisted.ticket.toolSchemaHash=ticket.toolSchemaHash;await writeTeam(db,storeId,'employeeRuntime.execution.'+ticket.executionId,persisted);
 const request={model:ticket.model,messages:[...system,{role:'user',content:ticket.sealedUserContent}],tools:ticket.tools,stream:true};
 let version=(await runtime.host.recordInput({executionId:ticket.executionId,expectedTraceVersion:ticket.traceVersion,turn:1,inputHash:hash(request),toolSchemaHash:ticket.toolSchemaHash,isolation:ticket.isolation,providerRequest:request})).traceVersion;
 const args={action:'render_daily_poster',activityId:activity.id,expectedVersion:activity.version,format:'portrait'},call={id:'historical-preview',type:'function',function:{name:'employee_manage_marketing',arguments:JSON.stringify(args)}},assistant={role:'assistant',content:null,tool_calls:[call]};
 version=(await runtime.host.recordResponse({executionId:ticket.executionId,expectedTraceVersion:version,turn:1,providerRequestId:'synthetic-preview-response',finishReason:'tool_calls',providerMessage:assistant})).traceVersion;
 const entered=deferred(),release=deferred(),oldRender=renderer.renderDailyPoster;let renders=0;
 renderer.renderDailyPoster=async()=>{renders++;entered.resolve();await release.promise;return {synthetic:true,visualReviewCompleted:false,imageSha256:'a'.repeat(64)}};
 const pending=runtime.host.executeTool({executionId:ticket.executionId,expectedTraceVersion:version,turn:1,callOrdinal:0,toolCallId:call.id,name:call.function.name,args});
 try{
  await Promise.race([entered.promise,pending.then(r=>{throw Error('RENDERER_NOT_REACHED:'+JSON.stringify(r.value))}),delay(15000).then(()=>{throw Error('RENDERER_START_TIMEOUT')})]);
  // Same trace row lock must be available while rendering is still gated.
  await db.$transaction(tx=>lockTeam(tx,storeId,'employeeRuntime.execution.'+ticket.executionId),{timeout:2000,maxWait:2000});
  await delay(6500);release.resolve();
  const result=await pending;assert.equal(result.value.ok,true,JSON.stringify(result.value));assert.equal(result.value.state,'complete');assert.equal(result.value.data.data.poster.synthetic,true);assert.equal(renders,1);
  const current=(await mod('services/ActivityService').listActivities(storeId,db)).find(a=>a.id===activity.id);assert.equal(JSON.stringify(current),before);assert.equal(current.status,'paused');
  const receipt=await mod('services/teamAgentBridge/employeeBackendTool').executeBackendTool(db,grant,scope,source.id,{action:'status',receiptId:result.value.receiptId});assert.equal(receipt.state,'complete');assert.equal(renders,1);
  assert.equal(await db.order.count({where:{storeId}}),0);
  console.log(JSON.stringify({passed:true,realNativeRoute:true,historicalTicket:true,traceLockAvailableDuringRender:true,rendererDelayMs:6500,traceTransactionTimeoutMs:5000,readOnlyMarketingSettings:true,activityUnchanged:true,ordersCreated:0,renderer:'synthetic gated fixture',modelCalls:0,productionWrites:0}));
 }finally{release.resolve();renderer.renderDailyPoster=oldRender;await pending.catch(()=>{})}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.$disconnect();await mod('config/database').default.$disconnect()});
