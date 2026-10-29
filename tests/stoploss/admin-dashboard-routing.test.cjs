// Baseline endpoint reachability evidence: actual Express matching and terminal route handlers.
// Auth/data dependencies are synthetic; this does not certify server permissions or real data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const serverRequire=name=>require(require.resolve(name,{paths:[path.resolve('server')]}));
function inventoryRouter(){
 const exports={},calls=[],auth=(req,res,next)=>next();
 const deps={'../services/MaterialRecipeUsageService':{materialRecipeUsage:async filter=>{assert.equal(filter.storeId,'synthetic-store');assert.equal(filter.inventoryId,'synthetic-material');calls.push('recipe-usage');return {readOnly:true};}},'../services/InventoryEvidenceHttp':{inventoryEvidenceHandler:()=>async()=>{throw Error('Unused evidence export route in dashboard routing fixture')}},'../services/teamAgentBridge/employeePhotos':{stockOutPhoto:async()=>{throw Error('Unused photo route in dashboard routing fixture')}},'../services/ManualStockCorrectionService':{},express:serverRequire('express'),zod:serverRequire('zod'),'../middlewares/auth':{authenticate:auth,authorize:()=>auth},'../utils/storeHelper':{getStoreId:()=> 'synthetic-store'},'../utils/validation':{validateBody:()=>auth},'../config/database':{__esModule:true,default:{}},'../utils/publicProduct':{},'../middlewares/resourceStore':{requireResourceStore:()=>auth},'../services/TodayStockOutService':{todayStockOuts:async store=>{calls.push('today:'+store);return {groups:[]};}},'../services/InventoryAlertCenterService':{},'../services/InventoryBatchService':{},'../services/EmployeeConsumptionService':{},'../services/InventoryAlertConfigService':{getInventoryAlertConfig:async()=>({varianceWarningPercent:10,varianceCriticalPercent:20})},'../services/InventoryService':{getInventoryById:async id=>{calls.push(id);return null;},getConsumptionAnalysis:async()=>{calls.push('consumption-analysis');return [];},getAnomalySummary:async()=>{calls.push('anomaly-summary');return {};}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/routes/inventory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:name=>{if(!(name in deps))throw Error('Unexpected dependency '+name);return deps[name];},console,Date});
 return {router:exports.inventoryRouter,calls};
}
for(const endpoint of ['consumption-analysis','anomaly-summary','recipe-usage'])test('named inventory '+endpoint+' handler is reachable before the ID route',async()=>{
 const {router,calls}=inventoryRouter();const layer=router.stack.find(layer=>layer.route?.methods.get&&layer.match('/'+endpoint));assert.equal(layer.route.path,'/'+endpoint);let status=200,body;
 const response={status(code){status=code;return this;},json(value){body=value;return this;}};
 await layer.route.stack.at(-1).handle({params:layer.params,user:{storeId:'synthetic-store'},query:{inventoryId:'synthetic-material',startDate:'2026-10-01',endDate:'2026-10-07'}},response);
 assert.deepEqual(calls,[endpoint]);assert.equal(status,200);assert.equal(body.code,200);
});

test('today stock-out route is reachable, store-scoped and explicitly uncached',async()=>{
 const {router,calls}=inventoryRouter();const layer=router.stack.find(layer=>layer.route?.methods.get&&layer.match('/logs/today-stock-out'));assert.equal(layer.route.path,'/logs/today-stock-out');let status=200,body;const headers={};
 const response={set(key,value){headers[key]=value;return this;},status(code){status=code;return this;},json(value){body=value;return this;}};
 await layer.route.stack.at(-1).handle({user:{storeId:'synthetic-store'},query:{}},response);
 assert.deepEqual(calls,['today:synthetic-store']);assert.equal(status,200);assert.equal(body.code,200);assert.equal(headers['Cache-Control'],'no-store');assert.deepEqual(Array.from(body.data.groups),[]);
});
