/* Real disposable PG, native ACL and certified count records; no model or production. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),built=n=>require(root+'/server/dist/services/'+n),{PrismaClient}=require(root+'/server/node_modules/@prisma/client');
const {readEmployeeInventoryEvidence:read}=built('teamAgentBridge/employeeInventoryEvidence'),{teamCommunication,readTeam}=built('TeamCommunicationService'),{directDelegationAudienceHash}=built('teamAgentBridge/directDelegation');
assert(process.env.BT_TEST_RUN?.startsWith('bt-test-'));assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');assert.equal(new URL(process.env.DATABASE_URL).pathname,'/team_test');
const db=new PrismaClient(),storeId='employee-inventory-fixture',otherStore='other-inventory-fixture',passed=[];
const admin={id:'inventory-admin-u',staffId:'inventory-admin-s',storeId,role:'admin'},employee={id:'inventory-employee-u',staffId:'inventory-employee-s',storeId,role:'cashier',employeeApp:true};
let g,scope,binding,c,policy;
const put=(key,value)=>db.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,category:'test',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});
const savePolicy=()=>put('staff.access.policy.v2',policy),saveBinding=()=>put('externalAgent.teamBridge.v1.channel.'+c.id,binding),check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name)};
const query=(q='Cup')=>read(db,g,scope,{query:q});
async function item(id,name,currentStock=0,unit='pcs',store=storeId){return db.inventory.create({data:{id,storeId:store,name,category:'synthetic',unit,currentStock,avgCost:999777,ledgerEpoch:0n,ledgerSequence:5n,updatedAt:new Date('2026-01-02T00:00:00Z')}})}
async function count(inv,id,{proof=true,unit='pcs',sequence='4',book=10,physical=7,status='completed',store=storeId}={}){
 const observedAt='2026-01-01T00:00:00.000Z';await db.inventoryCount.create({data:{id:'count-'+id,storeId:store,period:'monthly',startDate:new Date(observedAt),endDate:new Date(observedAt),status}});
 await db.inventoryCountItem.create({data:{id,inventoryCountId:'count-'+id,inventoryId:inv,systemQty:book,countedQty:physical,countedAt:new Date(observedAt),variance:physical-book}});
 if(proof)await put('inventoryCountObservation.'+id,{version:4,countId:'count-'+id,systemQty:book,countedQty:physical,observedAt,ledgerUnit:unit,boundary:{inventoryId:inv,epoch:'0',sequence}});
}
async function main(){
 const tenant=await db.tenant.create({data:{name:'Inventory evidence synthetic'}});for(const id of [storeId,otherStore])await db.store.create({data:{id,tenantId:tenant.id,name:id}});
 for(const [a,p]of[[admin,'08892227001'],[employee,'08892227002']])await db.user.create({data:{id:a.id,phone:p,password:'no-real-login',role:a.role,storeId,staff:{create:{id:a.staffId,storeId,name:a.staffId,employeeNumber:a.staffId}}}});
 c=await teamCommunication(db).create(admin,{requestId:randomUUID(),kind:'direct',title:'Synthetic inventory evidence',members:[employee.staffId]});c=await readTeam(db,storeId,'channel.'+c.id);
 g={agentId:randomUUID(),displayName:'Synthetic Hermes',storeId,sponsorUserId:admin.id,version:1,clientRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),revoked:false,actions:['messages.read','inventory.read'],staffIds:[admin.staffId,employee.staffId],channelIds:[c.id]};
 const task={taskId:randomUUID(),version:1};binding={agentId:g.agentId,task,delegatedDirect:{sourceStaffId:employee.staffId,fromSeq:1,audienceHash:directDelegationAudienceHash(c),grantVersion:1,clientRevision:1,expiresAt:g.expiresAt}};await saveBinding();
 scope={task,channelId:c.id,audienceStaffIds:[admin.staffId,employee.staffId].sort(),audienceHash:directDelegationAudienceHash(c),requesterStaffId:employee.staffId,compartmentKey:'a'.repeat(64)};
 policy={version:2,revision:1,active:true,roles:[{id:'inventory-reader',name:'Inventory reader',description:'Synthetic only',permissions:{'inventory.read':'allow'}}],assignments:[{staffId:employee.staffId,roleId:'inventory-reader',overrides:{}}]};await savePolicy();
 await item('sugar','糖',2,'kg');await item('negative','Cup lid 700ml',-12);await item('zero','Cup lid 500ml',0);await item('historical','Tea leaves',37,'g');await count('historical','old-tea',{unit:'g'});await item('same','Syrup jam',4);await count('same','same-jam',{sequence:'5',book:4,physical:3});await item('bad-proof','Powder milk',8,'g');await count('bad-proof','milk-count',{unit:'kg'});await item('cross-store','Cup SECRET_OTHER_STORE',999,'pcs',otherStore);
 await check('every recipient/requester needs real inventory permission; sponsor admin never lends rights',async()=>{
  policy.assignments=[];await savePolicy();await assert.rejects(()=>query());policy.assignments=[{staffId:employee.staffId,roleId:'inventory-reader',overrides:{}}];await savePolicy();assert.equal((await query()).items.length,2);
  const original=structuredClone(g);g={...g,actions:['messages.read']};await assert.rejects(()=>query());g=original;
  await db.user.update({where:{id:admin.id},data:{role:'manager'}});await assert.rejects(()=>query());policy.assignments.push({staffId:admin.staffId,roleId:'inventory-reader',overrides:{}});await savePolicy();assert.equal((await query()).items.length,2);await db.user.update({where:{id:admin.id},data:{role:'admin'}});policy.assignments=policy.assignments.filter(a=>a.staffId!==admin.staffId);await savePolicy();
  const originalScope=structuredClone(scope);scope={...scope,requesterStaffId:undefined};await assert.rejects(()=>query());scope={...originalScope,requesterStaffId:'unrelated'};await assert.rejects(()=>query());scope=originalScope;
 });
 await check('bounded ambiguous search has no cross-store facts, costs, or inferred physical zero',async()=>{
  const r=await query();assert.equal(r.items.length,2);assert.equal(r.hasMoreMatches,false);assert(!JSON.stringify(r).includes('SECRET_OTHER_STORE'));assert(!JSON.stringify(r).includes('999777'));
  for(const i of r.items){assert.equal(i.physicalEvidence,null);assert(i.blockers.includes('completed_physical_count_missing'));assert.deepEqual(Object.keys(i).sort(),['id','name','unit','bookQuantity','bookUpdatedAt','physicalEvidence','blockers'].sort())}
  assert.equal(r.items.find(i=>i.id==='negative').bookQuantity,-12);assert.equal(r.items.find(i=>i.id==='zero').bookQuantity,0);assert.equal(r.fingerprint,(await query()).fingerprint);
 });
 await check('certified historical counts use their own ledger balance; current difference remains unknown',async()=>{
  const r=await query('Tea'),i=r.items[0];assert.equal(i.bookQuantity,37);assert.equal(i.physicalEvidence.physicalQuantity,7);assert.equal(i.physicalEvidence.bookQuantityAtObservation,10);assert.equal(i.physicalEvidence.historicalDifference,-3);assert.equal(i.physicalEvidence.historicalComparable,true);assert.equal(i.physicalEvidence.currentComparable,false);assert.equal(i.physicalEvidence.currentDifference,null);assert(i.blockers.includes('current_book_and_physical_not_same_verified_boundary'));assert(r.sourceRefs.includes('countObservation:old-tea'));
 });
 await check('same verified boundary may compare; mismatched units or uncertified observations may not',async()=>{
  const same=(await query('Syrup')).items[0];assert.equal(same.physicalEvidence.currentComparable,true);assert.equal(same.physicalEvidence.currentDifference,-1);
  const bad=(await query('Powder')).items[0];assert.equal(bad.physicalEvidence.historicalComparable,false);assert.equal(bad.physicalEvidence.historicalDifference,null);assert(bad.physicalEvidence.blockers.includes('observation_unit_mismatch'));
  await db.config.delete({where:{storeId_key:{storeId,key:'inventoryCountObservation.milk-count'}}});assert((await query('Powder')).items[0].physicalEvidence.blockers.includes('observation_evidence_mismatch'));
 });
 await check('query is bounded and ambiguous rather than a whole-store dump or arbitrary selection',async()=>{
  for(let n=0;n<12;n++)await item('ambiguous-'+String(n).padStart(2,'0'),'Bottle '+n,n,n%2?'pack':'pcs');
  const r=await query('Bottle');assert.equal(r.items.length,10);assert.equal(r.hasMoreMatches,true);assert.deepEqual(r.items.map(i=>i.id),Array.from({length:10},(_,n)=>'ambiguous-'+String(n).padStart(2,'0')));
  assert.deepEqual((await query('does-not-exist')).items,[]);await assert.rejects(()=>query(''));await assert.rejects(()=>query('%%'));await assert.rejects(()=>query('__'));await assert.rejects(()=>query('Cup\\')); await assert.rejects(()=>read(db,g,scope,{query:'Cup',where:{}}));
  assert.equal((await query('糖')).items[0].id,'sugar');const exact=await query('same');assert.equal(exact.items.length,1);assert.equal(exact.items[0].id,'same');
 });
 await check('fresh audience, user binding, permission and cutoff changes all fail closed',async()=>{
  const originalScope=structuredClone(scope);scope={...scope,audienceStaffIds:[admin.staffId]};await assert.rejects(()=>query());scope={...originalScope,audienceHash:'f'.repeat(64)};await assert.rejects(()=>query());scope=originalScope;
  await db.user.update({where:{id:employee.id},data:{storeId:otherStore}});await assert.rejects(()=>query());await db.user.update({where:{id:employee.id},data:{storeId}});
  await db.staff.update({where:{id:employee.staffId},data:{status:'inactive'}});await assert.rejects(()=>query());await db.staff.update({where:{id:employee.staffId},data:{status:'active'}});
  const original=structuredClone(g);g={...g,expiresAt:new Date(Date.now()-1).toISOString()};await assert.rejects(()=>query());g={...original,revoked:true};await assert.rejects(()=>query());g=original;
  const race={...db,$transaction:async(fn,options)=>{const r=await db.$transaction(fn,options);policy.assignments=[];await savePolicy();return r}};await assert.rejects(()=>read(race,g,scope,{query:'Cup'}));policy.assignments=[{staffId:employee.staffId,roleId:'inventory-reader',overrides:{}}];await savePolicy();
 });
 await check('unchanged snapshots are stable; ledger, proof, and permission scope changes alter the fingerprint',async()=>{
  const before=await query('Tea');assert.equal((await query('Tea')).fingerprint,before.fingerprint);
  await db.inventory.update({where:{id:'historical'},data:{ledgerSequence:6n}});assert.notEqual((await query('Tea')).fingerprint,before.fingerprint);await db.inventory.update({where:{id:'historical'},data:{ledgerSequence:5n,updatedAt:new Date('2026-01-02T00:00:00Z')}});assert.equal((await query('Tea')).fingerprint,before.fingerprint);
  const key='inventoryCountObservation.old-tea',proof=JSON.parse((await db.config.findUnique({where:{storeId_key:{storeId,key}}})).value);await put(key,{...proof,version:3});assert.notEqual((await query('Tea')).fingerprint,before.fingerprint);await put(key,proof);assert.equal((await query('Tea')).fingerprint,before.fingerprint);
  policy.revision++;await savePolicy();assert.notEqual((await query('Tea')).fingerprint,before.fingerprint);policy.revision--;await savePolicy();assert.equal((await query('Tea')).fingerprint,before.fingerprint);
  const compartment=scope.compartmentKey;scope.compartmentKey='b'.repeat(64);assert.notEqual((await query('Tea')).fingerprint,before.fingerprint);scope.compartmentKey=compartment;
 });
 await check('native reads remain financially minimal, matched and nonmutating',async()=>{
  const before=await db.inventory.findMany({orderBy:{id:'asc'}}),logs=await db.stockInLog.count();let seen=false;
  const observed={...db,$transaction:(fn,options)=>db.$transaction(tx=>fn({...tx,inventory:{findMany:args=>{seen=true;assert.equal(args.take,11);assert(args.where.storeId===storeId&&args.where.OR.length===2);assert(!Object.keys(args.select).some(k=>/cost|price|profit/i.test(k)));return tx.inventory.findMany(args)}}}),options)};
  await read(observed,g,scope,{query:'Cup'});assert(seen);assert.deepEqual(await db.inventory.findMany({orderBy:{id:'asc'}}),before);assert.equal(await db.stockInLog.count(),logs);
 });
 await check('daily outbound totals cover every row and Jakarta boundary, separate sales estimates and retain actual ACL',async()=>{
  const {startOfDay,formatDate}=require(root+'/server/dist/utils/dateUtils'),{employeeStockOutSummary:summary,stockOutPeriodFromQuery}=built('teamAgentBridge/employeeStockOutSummary'),{executeBusinessTool}=built('teamAgentBridge/employeeBusinessTools');
  const start=startOfDay(new Date()),day=formatDate(start,'YYYY-MM-DD'),end=new Date(start.getTime()+86400000);
  const rows=Array.from({length:30},(_,n)=>({inventoryId:'sugar',quantity:0.1,reason:'withdrawal',createdAt:new Date(start.getTime()+n*1000)}));
  rows.push({inventoryId:'sugar',quantity:0.5,reason:'loss',note:JSON.stringify({version:1,kind:'manual-out',note:'membuat ice cream',unitCost:999}),createdAt:new Date(end.getTime()-1)},{inventoryId:'sugar',quantity:4,reason:'sale_estimate',createdAt:new Date(start.getTime()+40000)},{inventoryId:'sugar',quantity:100,reason:'withdrawal',createdAt:new Date(start.getTime()-1)},{inventoryId:'sugar',quantity:200,reason:'withdrawal',createdAt:end},{inventoryId:'cross-store',quantity:999,reason:'withdrawal',createdAt:start});
  await db.stockOutLog.createMany({data:rows});
  const result=await executeBusinessTool(db,g,scope,'employee_manage_inventory',{action:'list_stock_out',startDate:day,endDate:day},'read-only-query');
  assert.equal(result.complete,true);assert.equal(result.totalRecords,32);assert.equal(result.timeZone,'Asia/Jakarta');assert.equal(result.startAt,start.toISOString());assert.equal(result.endExclusive,end.toISOString());
  const ordinary=result.items.find(i=>i.reason==='withdrawal');assert.equal(ordinary.records,30);assert(Math.abs(ordinary.quantity-3)<1e-9);assert.equal(ordinary.sourceKind,'recorded_stock_out');assert.equal(result.items.find(i=>i.reason==='sale_estimate').sourceKind,'recipe_sales_estimate');assert(!JSON.stringify(result).includes('SECRET_OTHER_STORE'));assert(!JSON.stringify(result).includes('avgCost'));
  const legacy=await query('今天出库了哪些原料？');assert.equal(legacy.stockOutSummary.totalRecords,32);assert.equal(legacy.recentStockOuts.length,25);assert.equal(legacy.hasMoreStockOuts,true);assert.equal(legacy.recentStockOuts.find(i=>i.reason==='loss').note,'membuat ice cream');assert.equal(legacy.fingerprint,(await query('今天出库了哪些原料？')).fingerprint);
  assert.equal((await summary(db,storeId,{startDate:day,reason:'withdrawal'})).totalRecords,30);assert.equal((await summary(db,storeId,{startDate:day,inventoryId:'negative'})).totalRecords,0);
  const yesterday=formatDate(new Date(start.getTime()-86400000),'YYYY-MM-DD');assert.equal(stockOutPeriodFromQuery('昨天出库',start).startDate,yesterday);assert.deepEqual(stockOutPeriodFromQuery('2026-01-01到2026-01-05'),{startDate:'2026-01-01',endDate:'2026-01-05'});
  await assert.rejects(()=>summary(db,storeId,{startDate:'2026-02-30'}));await assert.rejects(()=>summary(db,storeId,{startDate:'2026-02-05',endDate:'2026-02-01'}));
  policy.assignments=[];await savePolicy();assert.equal((await executeBusinessTool(db,g,scope,'employee_manage_inventory',{action:'list_stock_out'},'denied-read')).ok,false);policy.assignments=[{staffId:employee.staffId,roleId:'inventory-reader',overrides:{}}];await savePolicy();
 });
 const out=root+'/output/employee-inventory-evidence';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/verification.json',JSON.stringify({batch:process.env.BT_TEST_RUN,passed,realPg:true,modelCalls:0,productionWrites:0},null,2));console.log(JSON.stringify({passed,batch:process.env.BT_TEST_RUN}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
