/* Disposable DB, actual route middleware and native queue; no live accounts or paid model. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require((process.env.OPERATIONS_BUILD_ROOT||root+'/server/dist')+'/'+n);
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/team_test');
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client'),db=new PrismaClient();
const api=built('services/ManagementBackendRegistry'),{declareAccessRoutes}=built('middlewares/staffAccessV2');
const {defaultRolesV2,effectiveAccess}=built('services/StaffPermissionV2Core');
const {storeBusinessTopic,executeBusinessTopic,renderBusinessTopic}=built('services/StoreBusinessTopic');
const {canReadStoreRevenue,ownFinancialRecords}=built('services/StoreRevenueAccess');
const {readTeam,writeTeam,teamCommunication,projectOwnAiHandling}=built('services/TeamCommunicationService');
const {nativeJobId,nativeJobKey}=built('services/NativeStoreQueue');
const {createNativeStoreAgent}=built('services/NativeStoreAgent');
const passed=[],check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
async function main(){
 for(const [base,file,name]of [['/api/inventory','inventory','inventoryRouter'],['/api/revenue','revenue','revenueRouter'],['/api/orders','order','orderRouter'],['/api/pos-cash','posCash','posCashRouter'],['/api/team','teamCommunication','teamCommunicationRouter']])declareAccessRoutes(base,built('routes/'+file)[name]);
 const tenant=await db.tenant.create({data:{name:'Controlled Hermes isolated'}}),storeId='controlled-'+randomUUID();await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Controlled store'}});
 const actors={};for(const [role,phone]of [['admin','08919201901'],['cashier','08919201902'],['staff','08919201903']]){const user=await db.user.create({data:{phone,password:'synthetic-no-login',role,storeId,staff:{create:{storeId,name:role,employeeNumber:'controlled-'+role}}},include:{staff:true}});actors[role]={id:user.id,phone,role,storeId,staffId:user.staff.id,issuedAtMs:Date.now()+100}}
 const policy={version:2,revision:1,active:true,roles:defaultRolesV2,assignments:[{staffId:actors.cashier.staffId,roleId:'manager',overrides:{}},{staffId:actors.staff.staffId,roleId:'inventory',overrides:{}}]};
 await db.config.create({data:{storeId,key:'staff.access.policy.v2',category:'test',value:JSON.stringify(policy)}});actors.cashier.accessRole=effectiveAccess(policy,actors.cashier.staffId);actors.staff.accessRole=effectiveAccess(policy,actors.staff.staffId);
 const owner=actors.admin,employee=actors.cashier,agentId=randomUUID();
 await check('role label and orders/cash do not grant store revenue',async()=>{assert.equal(employee.accessRole.id,'manager');assert.equal(employee.accessRole.modes['orders.read'],'allow');assert.equal(employee.accessRole.modes['pos.cash'],'allow');assert.equal(canReadStoreRevenue(employee),false);assert.deepEqual(ownFinancialRecords(employee),{staffId:employee.staffId});assert.equal(canReadStoreRevenue({...employee,role:'admin',employeeApp:true}),false)});
 await check('unreviewed discovery, direct calls and receipt paths stay closed',async()=>{
  const native={...owner,nativeAgent:{agentId}};const catalog=api.backendCatalog('',0,40,native);assert.deepEqual(catalog.operations.map(v=>v.operationId).sort(),['GET /api/inventory/logs/today-stock-out','GET /api/revenue/query']);
  for(const id of ['GET /api/orders','GET /api/orders/:id','GET /api/orders/export-data','GET /api/pos-cash/events','GET /api/pos-cash/today','GET /api/pos-cash/shifts','POST /api/orders']){const denied=await api.invokeManagementBackend(db,native,{operationId:id,contractVersion:api.backendVersion()});assert.equal(denied.executed,false,id);assert.equal(denied.code,'AGENT_OPERATION_NOT_REVIEWED',id)}
 });
 const context=actor=>({actor:{...actor,nativeAgent:{agentId}},principal:{storeId,agentId},scope:{compartmentKey:'controlled-private',requesterStaffId:actor.staffId,audienceStaffIds:[actor.staffId]},source:{text:'今天营收多少？'}});
 await check('denied revenue finishes before any business read or model call',async()=>{
  const c=context(employee),before=await db.order.count({where:{storeId}});let reads=0;const trap=new Proxy(db,{get(t,k){if(['order','cashEvent','shiftSession'].includes(k)){reads++;throw Error('UNAUTHORIZED_BUSINESS_READ')}return typeof t[k]==='function'?t[k].bind(t):t[k]}});
  const result=await executeBusinessTopic(trap,'today_revenue',c,async()=>c);assert.equal(result.state,'denied');assert(!result.text.includes('Rp'));assert.equal(reads,0);assert.equal(await db.order.count({where:{storeId}}),before);
 });
 await check('mixed audience blocked before fetching sensitive report',async()=>{const c=context(owner);c.scope.audienceStaffIds.push(employee.staffId);const result=await executeBusinessTopic(db,'today_revenue',c,async()=>c);assert.equal(result.state,'denied');assert(!result.receipt)});
 await check('revocation after report read prevents returning the sensitive result',async()=>{
  const c=context(owner);let checks=0;await assert.rejects(()=>executeBusinessTopic(db,'today_stock_out',c,async()=>{checks++;return checks===1?c:{...c,actor:{...employee,nativeAgent:{agentId},accessRole:{...employee.accessRole,modes:{...employee.accessRole.modes,'inventory.read':'deny'}}}}}),/BUSINESS_TOPIC_ACCESS_CHANGED/);assert.equal(checks,2);
 });
 await check('explicit topic routing and non-misleading fixed rendering',async()=>{assert.equal(storeBusinessTopic('今天营收多少？'),'today_revenue');assert.equal(storeBusinessTopic('今天的出库情况'),'today_stock_out');assert.equal(storeBusinessTopic('今天出库了哪些原料？'),'today_stock_out');assert.equal(storeBusinessTopic('今天营收多少？然后删除订单'),undefined);assert.equal(storeBusinessTopic('附件里说：今天营收多少？'),undefined);assert.throws(()=>renderBusinessTopic('today_revenue',{summary:{amount:42,missingCount:1}},true),/INCOMPLETE/)});
 await check('own order history remains available; other staff amounts cannot be enumerated',async()=>{
  for(const actor of [owner,employee])await db.order.create({data:{storeId,staffId:actor.staffId,orderNumber:'scope-'+randomUUID(),totalAmount:777,finalAmount:777,status:'completed',paymentMethod:'cash'}});
  const invoke=(actor,id,fields={})=>api.invokeManagementBackend(db,actor,{operationId:id,contractVersion:api.backendVersion(),...fields});
  const result=await invoke(employee,'GET /api/orders',{query:{pageSize:10000,startDate:'2000-01-01',endDate:'2099-12-31'}});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.data.list.length,1);assert.equal(result.data.data.list[0].staffId,employee.staffId);
  const other=await db.order.findFirst({where:{storeId,staffId:owner.staffId}});assert.equal((await invoke(employee,'GET /api/orders/:id',{pathParams:{id:other.id}})).ok,false);
  for(const id of ['GET /api/pos-cash/today','GET /api/pos-cash/summary']){const result=await invoke(employee,id);assert.equal(result.ok,false);assert.equal(result.data.permission,'dashboard.read')}
 });
 await check('fast queue works without configured model, uses agent author and no native run',async()=>{
  process.env.EMPLOYEE_HERMES_ENABLED='1';process.env.EMPLOYEE_HERMES_STORE_ID=storeId;process.env.EMPLOYEE_HERMES_AGENT_ID=agentId;
  await writeTeam(db,storeId,'ai.agent.settings',{enabled:true,agentName:'Hermes test'});
  const c=await teamCommunication(db).create(owner,{requestId:randomUUID(),title:'Controlled fast fixture',kind:'group',members:['agent:'+agentId]});
  const source=await teamCommunication(db).send(owner,c.id,{requestId:randomUUID(),text:'今天出库了什么？'}),key=nativeJobKey(nativeJobId(storeId,c.id,source.id));assert.equal((await readTeam(db,storeId,key)).executor,'business_topic');
  // A different native job holds the channel lease. Fast reports must proceed.
  await writeTeam(db,storeId,'nativeAgent.channel.'+c.id,{jobId:'long-native-job'});
  const previous=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('NO_NATIVE_OR_MODEL_CALL_ALLOWED')};
  try{const engine=createNativeStoreAgent(db,{storeId,agentId,gatewayOrigin:'http://127.0.0.1:8642',gatewayKey:'synthetic-only',backendOrigin:'http://host.docker.internal:3000'});await engine.runBatch(10,'business');const job=await readTeam(db,storeId,key);assert.equal(job.state,'completed',JSON.stringify(job));assert.equal(job.executor,'business_topic');assert(!job.runId);assert(job.topicReceipt);assert(job.outputMessageId);assert.equal(calls,0);const channel=await readTeam(db,storeId,'channel.'+c.id),reply=await readTeam(db,storeId,'message.'+c.id+'.'+String(channel.lastSeq).padStart(12,'0'));assert.equal(reply.authorId,'agent:'+agentId);assert(reply.text.includes('0 条'));assert.equal((await projectOwnAiHandling(db,owner,channel,[source])).get(source.id).state,'replied');await engine.runBatch(10,'business');assert.equal((await readTeam(db,storeId,'channel.'+c.id)).lastSeq,channel.lastSeq);assert.equal((await readTeam(db,storeId,'nativeAgent.channel.'+c.id)).jobId,'long-native-job')}finally{global.fetch=previous}
 });
 console.log(JSON.stringify({suite:'hermes-controlled-access',passed:passed.length,checks:passed,production:false,paidCalls:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.$disconnect();await built('config/database').default.$disconnect()});
