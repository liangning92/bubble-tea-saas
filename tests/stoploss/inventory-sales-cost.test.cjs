const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleUnderTest={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('client-admin/src/utils/inventorySalesCosts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleUnderTest.exports);
const {isSalesStockOut,stockLogCost}=moduleUnderTest.exports;
test('sales filter and KPI include legacy sales, estimates and signed reversals only',()=>{
 const rows=[{type:'stock_out',reason:'sold',quantity:2,unitCost:100},{type:'stock_out',reason:'sale_estimate',quantity:0.1085714285714286,totalAmount:9771,inventory:{avgCost:123456}},{type:'stock_out',reason:'sale_estimate_reversal',quantity:-1,totalAmount:-100},{type:'stock_out',reason:'withdrawal',quantity:1,totalAmount:999},{type:'stock_out',reason:'process',quantity:1,totalAmount:999},{type:'stock_out',reason:'loss',quantity:1,totalAmount:999},{type:'stock_in',reason:'sold',quantity:1,totalAmount:999}];
 assert.equal(rows.filter(isSalesStockOut).length,3);
 assert.equal(rows.filter(isSalesStockOut).reduce((sum,row)=>sum+stockLogCost(row),0),9871);
});
test('frozen amount wins over current averages, preserves free operations and fractional quantities',()=>{
 assert.equal(stockLogCost({quantity:0.1085714285714286,unitCost:90000,totalAmount:9771}),9771);
 assert.equal(stockLogCost({quantity:2,unitCost:100,totalAmount:0}),0);
 assert.equal(stockLogCost({quantity:2,unitCost:0,inventory:{avgCost:999}}),0);
 assert.equal(stockLogCost({quantity:-0.5,inventory:{avgCost:200}}),-100);
 assert.equal(stockLogCost({quantity:3,inventory:{avgCost:100}}),300);
});
