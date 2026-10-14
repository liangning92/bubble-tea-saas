const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('exports','module',code)(module.exports,module);return module.exports}
const names=load('client-admin/src/utils/itemDisplayName.ts'),costs=load('client-admin/src/utils/recipeCost.ts');
test('legacy names shorten only a clear Chinese segment and retain size',()=>{
 assert.equal(names.itemDisplayName('Bubuk Vanilla / Vanilla Powder (香草粉)','zh'),'香草粉');
 assert.equal(names.itemDisplayName('Cup 500ml / Gelas 500ml (500ml塑料杯)','zh'),'500ml塑料杯');
 assert.equal(names.itemDisplayName('Cup 500ml / Gelas 500ml (塑料杯)','zh'),'Cup 500ml / Gelas 500ml (塑料杯)');
 assert.equal(names.itemDisplayName('Milk / Tea','zh'),'Milk / Tea');
 assert.equal(names.itemDisplayName('Cup / Gelas (杯)','en'),'Cup / Gelas (杯)');
 assert.equal(names.itemDisplayName({name:'Original',nameEn:'Cup'},'en-US'),'Cup');
 assert.equal(names.itemDisplayName({name:'Cup 500ml',nameZh:'杯'},'zh'),'杯 500ml');
});
test('display rounding leaves source precision unchanged',()=>{const value=85.71428571428572;assert.equal(names.formatDisplayQuantity(value),'85.71');assert.equal(names.formatDisplayQuantity(2),'2');assert.equal(names.formatDisplayQuantity(NaN),'—');assert.equal(value,85.71428571428572)});
test('initialized processed rows without costBreakdown.cost use costPerUnit safely',()=>{
 const row={inventoryId:'processed',quantityStr:'120',cost:2057/120,costBreakdown:{breakdown:[]}};
 assert.ok(Math.abs(costs.recipeRowCost(row)-2057)<1e-8);
 assert.equal(costs.recipeTotalCost([row,{inventoryId:'raw',quantityStr:'1',cost:500}]),2557);
});
test('loaded recursive cost, quantity edits and converted units retain exact arithmetic',()=>{
 assert.equal(costs.recipeRowCost({inventoryId:'processed',quantityStr:'120',cost:17,costBreakdown:{cost:2057}}),2057);
 assert.equal(costs.recipeRowCost({inventoryId:'raw',quantityStr:'0.125',cost:16000}),2000);
 assert.equal(costs.recipeRowCost({inventoryId:'raw',quantityStr:'125',cost:16}),2000);
});
test('missing, invalid, pending and failed costs are never treated as zero',()=>{
 for(const row of [{cost:null},{cost:NaN},{cost:Infinity},{cost:1,costPending:true},{cost:1,costFailed:true},{cost:1,quantityStr:''}])assert.equal(costs.recipeRowCost({inventoryId:'x',quantityStr:'2',...row}),null);
 assert.equal(costs.recipeTotalCost([{inventoryId:'x',quantityStr:'2',cost:null}]),null);
 assert.equal(costs.recipeRowCost({inventoryId:'free',quantityStr:'2',cost:0}),0);
 assert.equal(costs.finiteCost(''),null);assert.equal(costs.finiteCost('0'),0);
});
test('refund policy awaits confirmation and blocks invalid legacy or partial requests',async()=>{
 const module={exports:{}};let confirmations=0,notices=0;
 const code=ts.transpileModule(fs.readFileSync('client-admin/src/components/RefundPolicyReview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const stub=id=>id.endsWith('AdminFeedback')?{confirmAdmin:async()=>{confirmations++;return false},notifyAdmin:()=>notices++}:{};
 new Function('exports','module','require',code)(module.exports,module,stub);
 assert.equal(await module.exports.confirmPreparedRefund({reasonCode:'legacy'},key=>key),false);
 assert.equal(await module.exports.confirmPreparedRefund({reasonCode:'paid_unprepared',selectedItemIds:'[]',order:{items:[]}},key=>key),false);
 assert.equal(confirmations,0);assert.equal(notices,2);
 const request={reasonCode:'paid_unprepared',selectedItemIds:JSON.stringify({version:2,items:[{itemId:'a',quantity:1}]}),order:{items:[{id:'a',quantity:1}]}};
 assert.equal(await module.exports.confirmPreparedRefund(request,key=>key),false);assert.equal(confirmations,1);
 for(const file of ['OrderListPage.tsx','RefundRequestListPage.tsx'])assert.match(fs.readFileSync('client-admin/src/pages/orders/'+file,'utf8'),/await confirmPreparedRefund\(/);
});
