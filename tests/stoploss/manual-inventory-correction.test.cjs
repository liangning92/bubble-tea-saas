const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);return exports}
const {inventoryLogDisplay}=load('client-admin/src/utils/inventoryCountFlow.ts'),{stockLogCost}=load('client-admin/src/utils/inventorySalesCosts.ts'),{isCostMutation,costQueryKeys}=load('client-admin/src/utils/costSync.ts');
test('signed correction pairs retain root, reason and actor with a net effective amount',()=>{
 const marker={type:'stock_in',rootId:'source',eventId:'event',actorId:'admin-id',actorName:'Store Administrator',reason:'Verified supplier evidence',role:'reversal'};
 const rows=[{id:'source',type:'stock_in',quantity:20,totalAmount:200,note:'Original'}, {id:'reverse',type:'stock_in',quantity:-20,totalAmount:-200,note:JSON.stringify({kind:'receipt',note:'Original',manualCorrection:marker})}, {id:'replace',type:'stock_in',quantity:15,totalAmount:300,note:JSON.stringify({kind:'receipt',note:'Corrected',manualCorrection:{...marker,role:'replacement'}})}].map(inventoryLogDisplay);
 assert.equal(rows.reduce((sum,row)=>sum+row.stockDelta,0),15);assert.equal(rows.reduce((sum,row)=>sum+stockLogCost(row),0),300);assert.equal(rows[1].manualCorrection.rootId,'source');assert.equal(rows[1].operator.name,'Store Administrator');assert.equal(rows[2].note,'Corrected');
});
test('successful correction transport broadcasts derived inventory and recipe cost refresh',()=>{assert.equal(isCostMutation('post','/inventory/manual-logs/stock_in/entry/corrections'),true);assert.equal(isCostMutation('POST','/inventory/manual-logs/stock_out/entry/corrections'),true);assert.equal(isCostMutation('get','/inventory/manual-logs/stock_out/entry/corrections'),false);assert.equal(isCostMutation('post','/inventory/other'),false)});

test('cost corrections refresh derived financial reports as well as inventory',()=>{assert.equal(costQueryKeys.has('finance'),true)});
