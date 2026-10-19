// Invoked only by the labeled, synthetic PostgreSQL management fixture.
const assert=require('node:assert/strict'),fs=require('fs');
module.exports=async function reviewRegression({db,origin,token,pass,root,out}){
 assert.ok(process.env.BT_TEST_RUN?.startsWith('bt-test-'));
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'management_fixture');
 const results=[],failed=[];let loginClient=0;
 async function check(name,fn){try{const detail=await fn();results.push({name,passed:true,...detail});console.log('PASS review '+name)}catch(error){failed.push(name);results.push({name,passed:false,error:error.message});console.log('FAIL review '+name+': '+error.message)}}
 // Distinct synthetic clients exercise auth cases without exhausting the unchanged login rate limit.
 async function request(id,method,url,body,client,session){const response=await fetch(origin+'/api/'+url,{method,headers:{authorization:'Bearer '+(session||await token(id)),'content-type':'application/json',...(url==='auth/login'?{'x-forwarded-for':'192.0.2.'+(++loginClient)}:{}),...(client?{'x-client-app':client}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,data:await response.json()}}
 async function snapshot(){return{
  users:await db.user.findMany({orderBy:{id:'asc'},select:{id:true,role:true,updatedAt:true,storeId:true}}),
  staff:await db.staff.findMany({orderBy:{id:'asc'},select:{id:true,storeId:true,userId:true}}),
  stores:await db.store.findMany({orderBy:{id:'asc'},select:{id:true,updatedAt:true}}),
  areas:await db.hygieneArea.findMany({orderBy:{id:'asc'}}),templates:await db.hygieneTemplate.findMany({orderBy:{id:'asc'}}),
  tasks:await db.hygieneTask.findMany({orderBy:{id:'asc'}}),checklists:await db.hygieneChecklist.findMany({orderBy:{id:'asc'}}),
  audits:await db.financeAuditLog.count({where:{entityType:'staff_system_role'}})
 }}
 const area=await db.hygieneArea.create({data:{id:'review-area',storeId:'store',name:'Review area',code:'REVIEW'}});
 const template=await db.hygieneTemplate.create({data:{id:'review-template',storeId:'store',name:'Review template',areaCode:'bar',photoRequired:false,checklists:{create:{id:'review-own-check',item:'Own unchanged checklist',order:0}}}});
 const foreignTemplate=await db.hygieneTemplate.create({data:{id:'review-foreign-template',storeId:'foreign',name:'Foreign review template',areaCode:'bar',checklists:{create:{id:'review-foreign-check',item:'Foreign unchanged checklist',order:0}}}});
 const foreignTask=await db.hygieneTask.create({data:{id:'review-foreign-task',storeId:'foreign',templateId:foreignTemplate.id,staffId:'foreign-staff',name:'Foreign task',areaCode:'bar',date:'2026-10-20',time:'08:00'}});
 const escalation={store:{update:{users:{update:{where:{id:'manager'},data:{role:'admin'}}}}}};
 const payloads=[['nested user role',escalation],['scalar store operation',{storeId:{set:'foreign'}}],['store connect',{store:{connect:{id:'foreign'}}}],['resource id',{id:'review-moved-id'}],['scalar update expression',{name:{set:'Changed'}}],['foreign task connect',{tasks:{connect:{id:foreignTask.id}}}],['nested checklist write',{checklists:{create:{item:'Injected'}}}],['nested checklist field',{checklists:[{item:'Injected',order:{set:0}}]}]];
 for(const [kind,id]of [['areas',area.id],['templates',template.id]])for(const [name,payload]of payloads){
  await check(kind+' rejects '+name,async()=>{const before=await snapshot(),r=await request('manager','PUT','hygiene/'+kind+'/'+id,payload),after=await snapshot();assert.ok([400,403].includes(r.status),'expected rejection, received '+r.status);assert.deepEqual(after,before,'Rejected input changed database');return{status:r.status,databaseUnchanged:true}});
  // Baseline replay may have mutated these synthetic records. Reset only fixture identities.
  await db.user.update({where:{id:'manager'},data:{role:'cashier'}});
  if(await db.hygieneArea.findUnique({where:{id:'review-moved-id'}}))await db.hygieneArea.update({where:{id:'review-moved-id'},data:{id:area.id,storeId:'store',name:'Review area'}});
  await db.hygieneArea.update({where:{id:area.id},data:{storeId:'store',name:'Review area'}});
  if(await db.hygieneTemplate.findUnique({where:{id:'review-moved-id'}}))await db.hygieneTemplate.update({where:{id:'review-moved-id'},data:{id:template.id,storeId:'store',name:'Review template'}});
  await db.hygieneTemplate.update({where:{id:template.id},data:{storeId:'store',name:'Review template'}});
  await db.hygieneTask.update({where:{id:foreignTask.id},data:{templateId:foreignTemplate.id}});
 }
 await check('rejected template input preserves checklists before any write',async()=>{const before=await snapshot();const r=await request('manager','PUT','hygiene/templates/'+template.id,{checklists:[{item:'Would replace'}],name:{set:'Changed'}});assert.equal(r.status,400);assert.deepEqual(await snapshot(),before);return{status:r.status}});
 await check('HTTP creation rejects nested relation and database operator objects without writes',async()=>{
  for(const [kind,body]of [['areas',{code:'REJECT_CREATE',name:'Rejected',...escalation}],['templates',{name:'Rejected',areaCode:'bar',tasks:{connect:{id:foreignTask.id}}}],['templates',{name:'Rejected',areaCode:'bar',checklists:[{item:'Rejected',order:{set:0}}]}]]){const before=await snapshot(),r=await request('manager','POST','hygiene/'+kind,body);assert.equal(r.status,400);assert.deepEqual(await snapshot(),before)}return{status:400,databaseUnchanged:true};
 });
 await check('direct hygiene services reject raw database expressions',async()=>{const service=require(root+'/server/src/services/HygieneService.ts');for(const work of [()=>service.updateArea(area.id,escalation),()=>service.updateTemplate(template.id,{tasks:{connect:{id:foreignTask.id}}}),()=>service.createArea({storeId:'store',code:'RAW',name:'Raw',...escalation}),()=>service.createTemplate({storeId:'store',name:'Raw',areaCode:'bar',tasks:{connect:{id:foreignTask.id}}})]){const before=await snapshot();await assert.rejects(work);assert.deepEqual(await snapshot(),before)}return{databaseUnchanged:true}});
 await db.user.update({where:{id:'manager'},data:{role:'cashier'}});
 await check('normal area and template scalar updates remain usable',async()=>{const a=await request('manager','PUT','hygiene/areas/'+area.id,{code:'REVIEW',name:'Reviewed own area',priority:2,description:null});assert.equal(a.status,200);const t=await request('manager','PUT','hygiene/templates/'+template.id,{name:'Reviewed own template',standardBefore:'Before',standardDuring:'During',standardAfter:'After',toolsRequired:['cloth'],specificDays:[1,3],executionTimes:['09:00'],staffIds:['cashier-staff'],shift:null,areaManagerId:null,checklists:[{item:'Reviewed checklist',description:'Expected input',isRequired:true,order:0}]});assert.equal(t.status,200);const saved=await db.hygieneTemplate.findUnique({where:{id:template.id},include:{checklists:true}});assert.equal(saved.storeId,'store');assert.equal(saved.standardAfter,'After');assert.equal(saved.checklists.length,1);assert.equal(saved.checklists[0].item,'Reviewed checklist');return{areaStatus:a.status,templateStatus:t.status}});
 await check('normal full template creation, copying and preset initialization remain usable',async()=>{
  const payload={areaCode:'counter',name:'Full supported form',description:'Fixture',category:'daily',frequency:'specific_days',specificDays:[1,3],time:'10:00',executionTimes:['10:00','12:00'],priority:2,estimatedMinutes:10,standardBefore:'Before',standardDuring:'During',standardAfter:'After',toolsRequired:['cloth'],photoRequired:true,evidenceType:'photo',assignedType:'shift',shift:'morning',staffId:null,staffIds:null,areaManagerId:null,requiresApproval:false,alertMinutesBefore:15,autoGenerate:true,regulationCode:'',checklists:[{item:'Clean',description:'Expected',isRequired:true,order:0}]};
  const created=await request('manager','POST','hygiene/templates',payload);assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.data.id;
  const copied=await request('manager','POST','hygiene/templates/'+id+'/duplicate',{});assert.equal(copied.status,201,JSON.stringify(copied.data));assert.equal(copied.data.data.standardAfter,'After');assert.equal(copied.data.data.checklists.length,1);
  const seeded=await request('manager','POST','hygiene/templates/seed',{});assert.equal(seeded.status,201,JSON.stringify(seeded.data));assert.ok(seeded.data.data.list.length>0);return{createStatus:201,copyStatus:201,presetStatus:201};
 });
 await db.category.create({data:{id:'review-foreign-category',storeId:'foreign',name:'Foreign category',code:'RFOREIGN'}});await db.product.create({data:{id:'review-foreign-product',storeId:'foreign',categoryId:'review-foreign-category',name:'Foreign product',code:'RFOREIGN'}});await db.spec.create({data:{id:'review-foreign-spec',productId:'review-foreign-product',name:'Regular',price:10000}});
 await db.bOMItem.create({data:{productId:'product',inventoryId:'store-inventory',quantity:21,unit:'ml'}});await db.bOMItem.create({data:{productId:'review-foreign-product',inventoryId:'foreign-inventory',quantity:21,unit:'ml'}});
 const bomPaths=['bom/products','bom/products/product','bom/products/review-foreign-product','bom/materials/usage','bom/materials/low-stock-alert','bom/recipes/product/cost','bom/recipes/review-foreign-product/cost','bom/inventory/store-inventory/breakdown','bom/inventory/foreign-inventory/breakdown'];
 await check('V2 and legacy managers cannot read BOM while POS catalog still works',async()=>{for(const actor of ['manager','foreign']){for(const url of bomPaths)assert.equal((await request(actor,'GET',url)).status,403,actor+' '+url);assert.equal((await request(actor,'GET','products/pos',undefined,'pos')).status,200)}return{managerRequestsDenied:bomPaths.length*2,posReadPreserved:true}});
 await check('administrator BOM reads require a selected resource store',async()=>{for(const url of ['bom/products/review-foreign-product','bom/recipes/review-foreign-product/cost','bom/inventory/foreign-inventory/breakdown']){assert.equal((await request('owner','GET',url)).status,404,url);assert.equal((await request('owner','GET',url+'?storeId=foreign')).status,200,url+' selected foreign')}assert.equal((await request('owner','GET','bom/products/product')).status,200);return{foreignIdWithoutSelector:404,authorizedSelectedStore:200}});
 await check('BOM services reject mismatched product and inventory store scope',async()=>{const service=require(root+'/server/src/services/BomService.ts');assert.equal(await service.getProductBomDetail('review-foreign-product','store'),null);await assert.rejects(()=>service.calculateProductCost('review-foreign-product','store'));await assert.rejects(()=>service.getInventoryCostBreakdown('foreign-inventory',1,undefined,'store'));assert.ok(await service.getProductBomDetail('product','store'));return{directServiceScopeVerified:true}});
 await check('BOM rejects a corrupt cross-store ingredient link without exposing its data',async()=>{
  const link=await db.bOMItem.create({data:{productId:'product',inventoryId:'foreign-inventory',quantity:1,unit:'ml'}});
  try{for(const url of ['bom/products/product','bom/recipes/product/cost','bom/products'])assert.equal((await request('owner','GET',url)).status,404,url);const service=require(root+'/server/src/services/BomService.ts');await assert.rejects(()=>service.getProductBomDetail('product','store'));await assert.rejects(()=>service.calculateProductCost('product','store'))}finally{await db.bOMItem.delete({where:{id:link.id}})}return{crossStoreIngredient:404};
 });
 const row=await db.config.findUnique({where:{storeId_key:{storeId:'store',key:'staff.access.policy.v2'}}});
 await check('corrupt management policy cannot break employee login or profile',async()=>{try{for(const value of ['{invalid-policy',JSON.stringify({version:2})]){await db.config.update({where:{id:row.id},data:{value}});for(const id of ['basic','manager']){const login=await request(id,'POST','auth/login',{phone:'fixture-'+id,password:'SyntheticPassword2026'},'employee');assert.equal(login.status,200,id+' employee login');assert.equal(login.data.data.user.managementAccess,false);const me=await request(id,'GET','auth/me',undefined,'employee',login.data.data.token);assert.equal(me.status,200,id+' employee profile');assert.equal(me.data.data.managementAccess,false);assert.equal((await request(id,'GET','staff-work/my/dashboard',undefined,'employee',login.data.data.token)).status,200);for(const client of [undefined,'pos','admin'])assert.equal((await request(id,'GET','staff',undefined,client,login.data.data.token)).status,503,id+' management request');assert.equal((await request(id,'GET','staff',undefined,'employee',login.data.data.token)).status,403);assert.equal((await request(id,'POST','auth/login',{phone:'fixture-'+id,password:'SyntheticPassword2026'},'admin')).status,503)}assert.equal((await request('basic','POST','auth/login',{phone:'fixture-basic',password:'wrong-fixture-password'},'employee')).status,401)}}finally{await db.config.update({where:{id:row.id},data:{value:row.value}})}return{employeeLogin:200,employeeProfile:200,managementClosed:503,wrongPassword:401}});
 await check('actual Staff API login and profile work through real Axios when management policy is corrupt',async()=>{
  // Load the complete production Staff API module. Only browser storage/offline
  // dependencies are stubbed; Axios sends real requests to this PostgreSQL fixture.
  const ts=require('typescript'),vm=require('node:vm'),{createRequire}=require('node:module');
  const source=fs.readFileSync(root+'/client-staff/src/services/api.ts','utf8').replace('import.meta.env.VITE_API_BASE_URL',JSON.stringify(origin+'/api'));
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const state={token:null,user:null,offlineUntil:null,logout(){this.token=null;this.user=null}},exports={};
  const imports={axios:createRequire(root+'/client-staff/src/services/api.ts')('axios'),'../stores/auth':{useAuthStore:{getState:()=>state}},'../utils/offlineAttendance':{},'../utils/offlineAuth':{forgetOfflineLogin(){},loginBackend:value=>value},'../utils/privateUpload':{}};
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(Object.hasOwn(imports,name),'unexpected Staff API dependency '+name);return imports[name]},sessionStorage:{setItem(){}},console});
  const client=exports;client.http.defaults.proxy=false;
  // Separate synthetic client IP for the unchanged production rate limiter.
  client.http.defaults.headers.common['X-Forwarded-For']='192.0.2.240';
  const observed=[];client.http.interceptors.request.use(config=>{if(config.url.endsWith('/auth/login'))observed.push(config.headers.get('X-Client-App'));return config});
  try{
   for(const value of [row.value,'{invalid-policy',JSON.stringify({version:2})]){
    await db.config.update({where:{id:row.id},data:{value}});
    for(const id of ['basic','manager']){
     state.token=null;state.user=null;const login=await client.staffApi.login('fixture-'+id,'SyntheticPassword2026');assert.equal(login.code,200);assert.equal(login.data.user.managementAccess,false);state.token=login.data.token;state.user=login.data.user;
     const profile=await client.staffApi.getMyProfile();assert.equal(profile.code,200);assert.equal(profile.data.id,id);assert.equal(profile.data.managementAccess,false);await client.employeeApi.get('/my/dashboard');
     if(value!==row.value)await assert.rejects(client.staffPermissionClient.get('/staff'),error=>error.response?.status===503);
    }
    await assert.rejects(client.staffApi.login('fixture-basic','wrong-fixture-password'),error=>error.response?.status===401);
   }
   assert.ok(observed.length===9&&observed.every(value=>value==='employee'),'actual Staff login must declare employee client without a token');
  }finally{await db.config.update({where:{id:row.id},data:{value:row.value}})}
  return{actualStaffModule:true,realAxiosHttp:true,loginAndProfile:200,wrongPassword:401,corruptPolicyManagement:503};
 });
 fs.mkdirSync(out+'/review-closure',{recursive:true});fs.writeFileSync(out+'/review-closure/regressions.json',JSON.stringify({run:process.env.BT_TEST_RUN,productionWrites:false,results,failed},null,2)+'\n');
 assert.deepEqual(failed,[],'Independent review regressions remain');
 pass('Independent review closure: strict hygiene inputs, scoped BOM reads and employee auth policy-failure isolation');
};
