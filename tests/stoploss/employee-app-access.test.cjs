const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {EMPLOYEE_APP_WORK_ROUTES,isEmployeeAppRoute,employeeAppAccess}=require(root+'/server/src/services/EmployeeAppAccess.ts');
const {ACCESS_ROUTE_MANIFEST}=require(root+'/server/src/services/StaffPermissionRouteManifest.ts');
test('every employee work operation has a reviewed declaration',()=>{
 for(const key of EMPLOYEE_APP_WORK_ROUTES){const spec=ACCESS_ROUTE_MANIFEST[key];assert.ok(spec,key);assert.equal(isEmployeeAppRoute(key,spec),true,key)}
 for(const key of ['GET /api/staff/overview/monthly','GET /api/staff-work/my/dashboard','GET /api/staff/attendance/today','GET /api/staff/salary/my','GET /api/training/my','GET /api/deposit/staff/my'])assert.equal(isEmployeeAppRoute(key,ACCESS_ROUTE_MANIFEST[key]),true,key);
});
test('employee app selection cannot unlock management, POS or owner-only operations',()=>{
 for(const key of ['GET /api/staff','POST /api/shifts','PUT /api/inventory/:id/adjust','POST /api/inventory-counts/:id/complete','GET /api/orders/kds/list','POST /api/marketing/members/:id/balance/deduct'])assert.equal(isEmployeeAppRoute(key,ACCESS_ROUTE_MANIFEST[key]),false,key);
 assert.equal(isEmployeeAppRoute('GET /api/inventory',{ownerOnly:true,personal:true}),false);
});
test('employee access does not read custom modes and retains native sensitive-data boundaries',()=>{
 const access=employeeAppAccess('cashier');assert.equal(access.modes['personal.salary'],'allow');assert.equal(access.modes['orders.refund'],'deny');assert.equal(access.modes['approvals.approve'],'deny');assert.equal(access.modes['staff.write'],'deny');assert.equal(access.modes['cost.read'],'deny');assert.equal(employeeAppAccess('manager').modes['cost.read'],'allow');
});

test('batch count recording is an employee work route, while approval and cancellation remain management-only',()=>{
 assert.equal(isEmployeeAppRoute('PUT /api/inventory-counts/:id/items',ACCESS_ROUTE_MANIFEST['PUT /api/inventory-counts/:id/items']),true)
 for(const key of ['POST /api/inventory-counts/:id/complete','POST /api/inventory-counts/:id/cancel'])assert.equal(isEmployeeAppRoute(key,ACCESS_ROUTE_MANIFEST[key]),false)
})

test('today stock-outs pass the real employee guard with own-store scope and no cost grant',async()=>{
 const key='GET /api/inventory/logs/today-stock-out',spec=ACCESS_ROUTE_MANIFEST[key];assert.equal(spec.permission,'inventory.read');assert.equal(isEmployeeAppRoute(key,spec),true);
 const database=path.resolve(root,'server/src/config/database.ts');require.cache[database]={id:database,filename:database,loaded:true,exports:{__esModule:true,default:{}}};
 const {enforceAccessV2}=require(root+'/server/src/middlewares/staffAccessV2.ts'),{getStoreId}=require(root+'/server/src/utils/storeHelper.ts');
 const user={id:'actor',staffId:'employee',storeId:'own',role:'staff',employeeApp:true,accessRole:employeeAppAccess('staff')};
 const req={method:'GET',baseUrl:'/api/inventory',params:{},query:{storeId:'foreign'},body:{},user,accessDeclaration:{...spec,routeKey:key}};let status=200,output;
 const res={status(value){status=value;return this;},json(value){output=value;return this;}};
 assert.equal(await enforceAccessV2(req,res,user),null);assert.equal(status,200);assert.equal(getStoreId(req),'own');assert.equal(user.accessRole.modes['inventory.read'],'allow');assert.equal(user.accessRole.modes['cost.read'],'deny');
 res.json({code:200,data:{date:'2026-10-16',timezone:'Asia/Jakarta',groups:[{name:'Teh',quantity:3,unit:'g',entries:[{operator:{name:'Fixture'},quantity:3}]}]}});assert.equal(output.data.groups[0].quantity,3);assert.equal(output.data.groups[0].entries[0].operator.name,'Fixture');
});
