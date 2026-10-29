/* Disposable PostgreSQL only. No production credentials, employee messages or model calls. */
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require(root+'/server/dist/services/'+n);
const {PrismaClient}=require(root+'/server/node_modules/@prisma/client');
const {agentSettingsService,defaultAgentSettings}=built('AgentSettingsService');
const {executeBusinessTool}=built('teamAgentBridge/employeeBusinessTools');
const {visibleBusinessData,assertEmployeeSettings,assertToolSettings,visibleScheduleStaff}=built('teamAgentBridge/employeeAccess');
const {readTeam,writeTeam}=built('TeamCommunicationService');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/team_test');
const db=new PrismaClient(),storeId='hermes-background-fixture',agentId=randomUUID(),channelId=randomUUID(),taskId=randomUUID();
const owner={id:'hermes-bg-owner',staffId:'hermes-bg-admin',storeId,role:'admin'},employee={id:'hermes-bg-user',staffId:'hermes-bg-staff',storeId,role:'staff'};
const scope={channelId,audienceStaffIds:[employee.staffId],requesterStaffId:employee.staffId,task:{taskId,version:1}};
const passed=[],check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
let grant,settings;
async function main(){
 const tenant=await db.tenant.create({data:{name:'Hermes background synthetic'}});
 await db.store.create({data:{id:storeId,tenantId:tenant.id,name:'Hermes background synthetic'}});
 for(const [a,phone]of[[owner,'08911118001'],[employee,'08911118002']])await db.user.create({data:{id:a.id,storeId,phone,password:'synthetic-not-login',role:a.role,staff:{create:{id:a.staffId,storeId,name:a.staffId,employeeNumber:a.staffId}}}});
 grant={agentId,displayName:'Hermes',storeId,sponsorUserId:owner.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','messages.send','tasks.read','inventory.read'],staffIds:[owner.staffId,employee.staffId],channelIds:[channelId]};
 const put=async(key,value)=>db.config.create({data:{storeId,key,category:'staff',value:JSON.stringify(value)}});
 const grantKey='externalAgent.teamBridge.v1.grant.'+agentId,routeKey='externalAgent.teamBridge.v1.employeeRoute.'+channelId,bindingKey='externalAgent.teamBridge.v1.channel.'+channelId;
 await put(grantKey,grant);await put(routeKey,{version:1,agentId,task:scope.task,sourceStaffId:employee.staffId,fromSeq:1,enabled:true,paused:false,expiresAt:grant.expiresAt});
 await put(bindingKey,{agentId,task:scope.task,delegatedDirect:{grantVersion:1,clientRevision:1,expiresAt:grant.expiresAt}});
 await writeTeam(db,storeId,'task.'+channelId+'.'+taskId,{id:taskId,deadlineAt:grant.expiresAt});
 await check('saved module permissions and expiry update executor, route and binding atomically',async()=>{
  const service=agentSettingsService(db);settings={...defaultAgentSettings(),enabled:true,expiresAt:new Date(Date.now()+86400000).toISOString()};
  for(const key of ['inventory','hygiene','marketing','staff','channels'])settings.permissions[key]={read:true,write:true};
  settings=await service.saveSettings(owner,settings);
  grant=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:grantKey}}})).value);
  for(const permission of ['inventory.write','hygiene.write','marketing.write','staff.write'])assert(grant.actions.includes(permission));
  assert.equal(grant.expiresAt,settings.expiresAt);assert.equal(grant.version,2);
  const route=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:routeKey}}})).value),binding=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:bindingKey}}})).value);
  assert.equal(route.expiresAt,grant.expiresAt);assert.equal(binding.delegatedDirect.grantVersion,grant.version);
  await assert.rejects(()=>service.saveSettings(owner,{...settings,version:settings.version-1}),/TEAM_VERSION_CONFLICT/);
 });
 await check('same-settings resync waits for active execution without changing grants, routes or task versions',async()=>{
  const service=agentSettingsService(db),executionKey='employeeRuntime.execution.'+randomUUID();
  await writeTeam(db,storeId,executionKey,{phase:'response',expiresAt:new Date(Date.now()+60000).toISOString(),grant});
  const snapshot=async()=>JSON.stringify(await db.config.findMany({where:{storeId},orderBy:{key:'asc'},select:{key:true,value:true}}));
  const before=await snapshot();await assert.rejects(()=>service.saveSettings(owner,settings),/TEAM_AGENT_RESYNC_BUSY/);assert.equal(await snapshot(),before);
  await writeTeam(db,storeId,executionKey,{phase:'unknown',expiresAt:new Date(Date.now()+60000).toISOString(),grant});
  const previous=structuredClone(grant),priorSettings=structuredClone(settings);settings=await service.saveSettings(owner,settings);
  grant=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:grantKey}}})).value);
  assert.deepEqual({...settings,version:priorSettings.version},priorSettings);assert.deepEqual(grant.actions,previous.actions);assert.equal(grant.expiresAt,previous.expiresAt);assert.equal(grant.revoked,previous.revoked);
 });
 const item=await db.inventory.create({data:{storeId,name:'Synthetic cups',category:'supplies',unit:'pcs',currentStock:10,avgCost:2}});
 await check('broad inventory questions have a real paginated list tool, without a keyword router',async()=>{
  const result=await executeBusinessTool(db,grant,scope,'employee_manage_inventory',{action:'list'},'synthetic-inventory-list');assert(result.items.some(x=>x.id===item.id));assert.equal(result.items[0].avgCost,undefined);
 });
 await check('native stock issue records exact quantity, actor and idempotent ledger operation',async()=>{
  const op='synthetic-stock-issue';const run=()=>db.$transaction(tx=>executeBusinessTool({...tx,$transaction:fn=>fn(tx)},grant,scope,'employee_manage_inventory',{action:'stock_out',inventoryId:item.id,quantity:3,reason:'loss',note:'Synthetic damaged cups'},op));
  await run();await run();assert.equal((await db.inventory.findUnique({where:{id:item.id}})).currentStock,7);
  assert.equal(await db.stockOutLog.count({where:{operationId:op}}),1);
  assert.equal((await db.stockOutLog.findUnique({where:{operationId:op}})).staffId,'agent:'+agentId);
 });
 await check('stock receipt preserves native batch and carrying cost, with one idempotent operation',async()=>{
  const received=await db.inventory.create({data:{storeId,name:'Synthetic receipt cups',category:'supplies',unit:'pcs',currentStock:4,avgCost:2}});
  const op='synthetic-stock-receipt';const args={action:'stock_in',inventoryId:received.id,quantity:2,unitCost:5};
  for(let n=0;n<2;n++)await db.$transaction(tx=>executeBusinessTool({...tx,$transaction:fn=>fn(tx)},grant,scope,'employee_manage_inventory',args,op));
  const saved=await db.inventory.findUnique({where:{id:received.id}});assert.equal(saved.currentStock,6);assert.equal(saved.avgCost,3);assert.equal(await db.stockInLog.count({where:{operationId:op}}),1);assert.equal(await db.batch.count({where:{inventoryId:received.id,batchNumber:'IN-'+op}}),1);
 });
 await check('business mutation rolls back when its outer receipt transaction fails',async()=>{
  await assert.rejects(()=>db.$transaction(async tx=>{await executeBusinessTool({...tx,$transaction:fn=>fn(tx)},grant,scope,'employee_manage_inventory',{action:'stock_out',inventoryId:item.id,quantity:2,reason:'loss'},'synthetic-rollback');throw Error('SYNTHETIC_RECEIPT_FAILURE')}));
  assert.equal((await db.inventory.findUnique({where:{id:item.id}})).currentStock,7);assert.equal(await db.stockOutLog.count({where:{operationId:'synthetic-rollback'}}),0);
 });
 await check('missing business parameters return a clarification result without mutation',async()=>{
  const result=await executeBusinessTool(db,grant,scope,'employee_manage_inventory',{action:'stock_out',inventoryId:item.id},'synthetic-missing');assert.equal(result.ok,false);assert.equal(result.code,'EMPLOYEE_STOCK_DETAILS_REQUIRED');
 });
 await db.hygieneArea.create({data:{storeId,name:'Synthetic counter',code:'counter'}});
 await check('hygiene assignment creates pending task and audit; never fabricates completion',async()=>{
  const task=await db.$transaction(tx=>executeBusinessTool(tx,grant,scope,'employee_manage_hygiene',{action:'create_task',name:'Clean counter',areaCode:'counter',staffId:employee.staffId,date:'2026-10-27'},'synthetic-hygiene'));
  const savedTask=await db.hygieneTask.findFirst({where:{storeId,name:'Clean counter'}});assert.equal(task.operationRecorded,true);Object.assign(task,savedTask);assert.equal(task.status,'pending');assert.equal(task.completedAt,null);assert.equal(task.staffId,employee.staffId);assert.equal(await db.hygieneTaskLog.count({where:{taskId:task.id,performedBy:'agent:'+agentId}}),1);
  const own=await executeBusinessTool(db,grant,scope,'employee_manage_hygiene',{action:'list_tasks'},'synthetic-hygiene-read');assert.equal(own.length,1);
 });
 const shift=await db.shift.create({data:{storeId,key:'hermes-bg-shift',name:'Synthetic morning',startTime:'09:00',endTime:'17:00',color:'#888888'}});
 await check('staff scheduling changes one real daily schedule and rejects unknown staff',async()=>{
  const args={action:'set_schedule',staffId:employee.staffId,date:'2026-10-27',shift:shift.key};
  for(let n=0;n<2;n++)await db.$transaction(tx=>executeBusinessTool(tx,grant,scope,'employee_manage_staff',args,'synthetic-shift-'+n));
  assert.equal(await db.schedule.count({where:{staffId:employee.staffId,date:new Date(args.date)}}),1);
  await assert.rejects(()=>executeBusinessTool(db,grant,scope,'employee_manage_staff',{...args,staffId:'another-store-staff'},'synthetic-denied'),/EMPLOYEE_BUSINESS_STAFF_NOT_FOUND/);
 });
 await check('self schedule visibility is projected before model access',async()=>{
  const allowed=await visibleScheduleStaff(db,grant,scope);assert.deepEqual(allowed,[employee.staffId]);
  const {readEmployeeScheduleEvidence}=built('teamAgentBridge/employeeRuntimeSources');const evidence=await readEmployeeScheduleEvidence(db,storeId,'today',allowed);assert(evidence.schedules.every(x=>x.staffName===employee.staffId));
 });
 await check('recipient permissions filter protected fields recursively; admin context does not authorize employees',async()=>{
  const value={name:'Cup',avgCost:22,grossMargin:99,salary:1000,password:'never-visible',nested:[{phone:'private',currentStock:7}]};
  assert.deepEqual(await visibleBusinessData(db,grant,scope,value),{name:'Cup',nested:[{currentStock:7}]});
  const admin=await visibleBusinessData(db,grant,{...scope,audienceStaffIds:[owner.staffId],requesterStaffId:owner.staffId},value);assert.equal(admin.avgCost,22);assert.equal(admin.salary,1000);assert.equal(admin.password,undefined);
 });
 await check('authorized stock mutation hides its balance from an audience without inventory visibility',async()=>{
  const denied=await db.user.create({data:{id:'no-inventory-user',storeId,phone:'08911118003',password:'synthetic',role:'staff',staff:{create:{id:'no-inventory-staff',storeId,name:'No inventory',employeeNumber:'no-inventory'}}}});
  await db.config.create({data:{storeId,key:'staff.access.policy',category:'staff',value:JSON.stringify({roles:[{id:'limited',permissions:['personal.messages']}],assignments:[{staffId:'no-inventory-staff',roleId:'limited'}]})}});
  const result=await db.$transaction(tx=>executeBusinessTool({...tx,$transaction:fn=>fn(tx)},grant,{...scope,audienceStaffIds:['no-inventory-staff'],requesterStaffId:'no-inventory-staff'},'employee_manage_inventory',{action:'stock_out',inventoryId:item.id,quantity:1,reason:'loss'},'synthetic-hidden-balance'));
  assert.equal(result.ok,true);assert.equal(result.operationRecorded,true);assert.equal(result.currentStock,undefined);assert.equal((await db.inventory.findUnique({where:{id:item.id}})).currentStock,6);
  await db.config.delete({where:{storeId_key:{storeId,key:'staff.access.policy'}}});
 });
 await check('disable, permission change and no-expiry authorization are controlled by saved settings',async()=>{
  const service=agentSettingsService(db);settings=await service.saveSettings(owner,{...settings,expiresAt:null,permissions:{...settings.permissions,inventory:{read:true,write:false}}});
  await assert.rejects(()=>assertToolSettings(db,storeId,'employee_manage_inventory',{action:'stock_out'}),/EMPLOYEE_TOOL_DISABLED_BY_SETTINGS/);
  const current=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:grantKey}}})).value);assert.equal(current.expiresAt,'9999-12-31T23:59:59.999Z');assert(!current.actions.includes('inventory.write'));
  settings=await service.saveSettings(owner,{...settings,enabled:false});await assert.rejects(()=>assertEmployeeSettings(db,storeId),/EMPLOYEE_RUNTIME_DISABLED_BY_SETTINGS/);
  assert(JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key:grantKey}}})).value).revoked);
 });
 console.log(JSON.stringify({passed,realPg:true,syntheticProvider:true,productionWrites:0}));
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1});
