const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const bridge=path.join(root,'server/src/services/teamAgentBridge');
const retired=['employeeDailySpecials','employeeMembershipTools','employeeBusinessTools','employeeStandardRoutine','employeeOperationAuthority','employeeExpenseEvidence'];
test('retired business implementations are deleted, not bypassed by a feature flag',()=>{
 for(const name of retired)assert.equal(fs.existsSync(path.join(bridge,name+'.ts')),false,name);
 for(const filename of fs.readdirSync(bridge).filter(n=>n.endsWith('.ts'))){
  const source=fs.readFileSync(path.join(bridge,filename),'utf8');
  for(const name of retired)assert(!new RegExp(`from ['"]\\./${name}['"]`).test(source),filename+' imports '+name);
 }
});
test('the old Agent loop and capture gateway are removed, with one native production entry',()=>{
 for(const name of ['employeeDeployment','employeeRuntime','employeeRuntimeChild','employeeRuntimeContract','employeeRuntimeHttp','employeeRuntimeSystem','employeeRuntimeSources','employeeGatewayClient','employeeOrchestration','employeeContinuation','employeeFailureReply'])assert(!fs.existsSync(path.join(bridge,name+'.ts')),name);
 for(const name of ['host_stdio','private_gateway','runtime_capture','serve_gateway'])assert(!fs.existsSync(path.join(root,'scripts/hermes_employee',name+'.py')),name);
 const configured=fs.readFileSync(path.join(bridge,'employeeConfigured.ts'),'utf8');assert(configured.includes('createNativeStoreAgent'));assert(!configured.includes('createEmployeeDeployment'));
 const native=fs.readFileSync(path.join(root,'scripts/hermes_employee/native_api_service.py'),'utf8');
 for(const marker of ['APIServerAdapter','fallback_model=None',"registry.register(name='store_backend'"])assert(native.includes(marker),marker);
 assert(native.includes("toolsets=['store_backend']"));assert(!native.includes('get_all_toolsets'));
 for(const marker of ['capture_send','memory_enabled=False','max_iterations=20','employee_manage_'])assert(!native.includes(marker),marker);
});
test('extra per-module permissions are not evaluated by the native backend bridge',()=>{
 const access=fs.readFileSync(path.join(bridge,'employeeAccess.ts'),'utf8');
 assert(!access.includes('export async function assertToolSettings'));
 const source=fs.readFileSync(path.join(bridge,'employeeBackendTool.ts'),'utf8');
 assert(source.includes('await assertEmployeeSettings(db,g.storeId)'));
 assert(source.includes('actor.accessRole=await userAccessV2'));
 assert(source.includes('invokeManagementBackend(db,actor'));
});

test('workbench connection cannot execute the retired per-activity business proxy',()=>{
 const service=fs.readFileSync(path.join(root,'server/src/services/StoreOperationsDelegationService.ts'),'utf8');
 for(const marker of ['applyOperationsPolicy','quoteOperationsSpecials','applyDailyMembershipPolicy','settings.operationProfile','settings.employeeBridgeEnabled','settings.expiresAt'])assert(!service.includes(marker),marker);
 const router=fs.readFileSync(path.join(root,'server/src/routes/storeOperations.ts'),'utf8');
 assert(router.includes('status(410)'));assert(router.includes('OPERATIONS_LEGACY_BUSINESS_ENDPOINT_RETIRED'));
 const ui=fs.readFileSync(path.join(root,'client-admin/src/pages/settings/StoreOperationsDelegation.tsx'),'utf8');
 assert(!ui.includes('selected.includes'));assert(!ui.includes('state.activities.map'));assert(!ui.includes('daily_member_specials_and_single_paid_order_30000'));
});
