// Baseline endpoint reachability evidence: actual Express matching and terminal route handlers.
// Auth/data dependencies are synthetic; this does not certify server permissions or real data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const serverRequire=name=>require(require.resolve(name,{paths:[path.resolve('server')]}));
function inventoryRouter(){
 const exports={},calls=[],auth=(req,res,next)=>next();
 const deps={express:serverRequire('express'),zod:serverRequire('zod'),'../middlewares/auth':{authenticate:auth,authorize:()=>auth},'../utils/storeHelper':{getStoreId:()=> 'synthetic-store'},'../utils/validation':{validateBody:()=>auth},'../services/InventoryAlertConfigService':{},'../services/InventoryService':{getInventoryById:async id=>{calls.push(id);return null;},getConsumptionAnalysis:()=>assert.fail('Unreachable named analysis handler'),getAnomalySummary:()=>assert.fail('Unreachable named summary handler')}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/routes/inventory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:name=>{if(!(name in deps))throw Error('Unexpected dependency '+name);return deps[name];},console,Date});
 return {router:exports.inventoryRouter,calls};
}
for(const endpoint of ['consumption-analysis','anomaly-summary'])test('actual existing inventory route shadows '+endpoint+'; dashboard must expose unavailable',async()=>{
 const {router,calls}=inventoryRouter();const layer=router.stack.find(layer=>layer.route?.methods.get&&layer.match('/'+endpoint));assert.equal(layer.route.path,'/:id');let status=200,body;
 const response={status(code){status=code;return this;},json(value){body=value;return this;}};
 await layer.route.stack.at(-1).handle({params:layer.params,user:{storeId:'synthetic-store'},query:{startDate:'2026-10-01',endDate:'2026-10-07'}},response);
 assert.deepEqual(calls,[endpoint]);assert.equal(status,404);assert.equal(body.message,'Inventory not found');
});
