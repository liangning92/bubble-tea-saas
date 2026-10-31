// Baseline endpoint reachability evidence: actual Express matching and terminal route handlers.
// Auth/data dependencies are synthetic; this does not certify server permissions or real data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const serverRequire=name=>require(require.resolve(name,{paths:[path.resolve('server')]}));
function inventoryRouter(){
 const exports={},calls=[],auth=(req,res,next)=>next(),validation={};
 const stockModule={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/services/TodayStockOutService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:stockModule,require:name=>name==='zod'?serverRequire('zod'):{},Date,Intl});
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/utils/validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:validation,require:serverRequire});
 const coverageModule={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/utils/inventoryReportCoverage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:coverageModule});
 const deps={'../utils/inventoryReportCoverage':coverageModule,'../utils/operationDate':{operationDateSchema:serverRequire('zod').z.string()},'../services/InventoryOperationRecordsService':{operationQuerySchema:serverRequire('zod').z.object({kind:serverRequire('zod').z.enum(['in','out','purchase','count'])}),operationRecords:async(store,query)=>{calls.push('records:'+store+':'+query.kind);return {list:[],summary:[],total:0,page:1,pageSize:20};}},'../services/MaterialRecipeUsageService':{materialRecipeUsage:async filter=>{assert.equal(filter.storeId,'synthetic-store');assert.equal(filter.inventoryId,'synthetic-material');calls.push('recipe-usage');return {readOnly:true};}},'../services/InventoryEvidenceHttp':{inventoryEvidenceHandler:()=>async()=>{throw Error('Unused evidence export route in dashboard routing fixture')}},'../services/teamAgentBridge/employeePhotos':{stockOutPhoto:async()=>{throw Error('Unused photo route in dashboard routing fixture')}},'../services/ManualStockCorrectionService':{},express:serverRequire('express'),zod:serverRequire('zod'),'../middlewares/auth':{authenticate:auth,authorize:()=>auth},'../utils/storeHelper':{getStoreId:()=> 'synthetic-store'},'../utils/validation':validation,'../config/database':{__esModule:true,default:{}},'../utils/publicProduct':{},'../middlewares/resourceStore':{requireResourceStore:()=>auth},'../services/TodayStockOutService':{...stockModule,registeredStockOutReport:async(store,query)=>{const parsed=stockModule.stockOutReportSchema.parse(query);calls.push('range:'+store+':'+parsed.period);return {groups:[],period:parsed.period};},todayStockOuts:async store=>{calls.push('today:'+store);return {groups:[]};}},'../services/InventoryAlertCenterService':{},'../services/InventoryBatchService':{},'../services/EmployeeConsumptionService':{},'../services/InventoryAlertConfigService':{getInventoryAlertConfig:async()=>({varianceWarningPercent:10,varianceCriticalPercent:20})},'../services/InventoryService':{getInventoryById:async id=>{calls.push(id);return null;},getConsumptionAnalysis:async()=>{calls.push('consumption-analysis');return [];},getAnomalySummary:async()=>{calls.push('anomaly-summary');return {};}}};
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

 test('inline operation records route is reachable before inventory ID and uncached',async()=>{
 const {router,calls}=inventoryRouter();const layer=router.stack.find(layer=>layer.route?.methods.get&&layer.match('/operation-records'));assert.equal(layer.route.path,'/operation-records');let status=200,body;const headers={};const response={set(key,value){headers[key]=value;return this;},status(code){status=code;return this;},json(value){body=value;return this;}};
 await layer.route.stack.at(-1).handle({user:{storeId:'synthetic-store'},query:{kind:'out'}},response);assert.equal(status,200);assert.equal(body.data.total,0);assert.equal(headers['Cache-Control'],'no-store');assert.deepEqual(calls,['records:synthetic-store:out']);
 });

test('date stock-out report is reachable, validates its real query schema and stays uncached',async()=>{
 const {router,calls}=inventoryRouter(),layer=router.stack.find(layer=>layer.route?.methods.get&&layer.match('/logs/stock-out-report'));assert.equal(layer.route.path,'/logs/stock-out-report');let status=200,body;const headers={},response={set(k,v){headers[k]=v;return this},status(c){status=c;return this},json(v){body=v;return this}};
 await layer.route.stack.at(-1).handle({user:{storeId:'synthetic-store'},query:{period:'yesterday',storeId:'synthetic-store'}},response);assert.equal(status,200);assert.equal(body.data.period,'yesterday');assert.equal(headers['Cache-Control'],'no-store');assert.deepEqual(calls,['range:synthetic-store:yesterday']);
 await layer.route.stack.at(-1).handle({user:{storeId:'synthetic-store'},query:{period:'invalid'}},response);assert.equal(status,400);
});
