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
