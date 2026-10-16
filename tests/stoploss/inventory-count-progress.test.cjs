const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleBox={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/inventoryCountProgress.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleBox,exports:moduleBox.exports});
const {isCounted,countProgress,matchesCountFilter}=moduleBox.exports;
test('persisted zero counts; blank, absent, invalid and negative observations remain uncounted',()=>{
 for(const countedQty of [null,undefined,NaN,Infinity,-1])assert.equal(isCounted({systemQty:3,countedQty}),false);
 assert.equal(isCounted({systemQty:3,countedQty:0}),true);
 const p=countProgress([{systemQty:3,countedQty:0},{systemQty:2,countedQty:2},{systemQty:5,countedQty:null},{systemQty:8}]);
 assert.equal(p.total,4);assert.equal(p.counted,2);assert.equal(p.pending,2);assert.equal(p.difference,1);assert.equal(p.percent,50);
});
test('variance is a subset of persisted observations; another batch never inherits progress',()=>{
 const zero={systemQty:3,countedQty:0},same={systemQty:2,countedQty:2},blank={systemQty:3,countedQty:null};
 assert.equal(matchesCountFilter(zero,'counted'),true);assert.equal(matchesCountFilter(zero,'difference'),true);assert.equal(matchesCountFilter(blank,'difference'),false);assert.equal(matchesCountFilter(same,'difference'),false);
 const next=countProgress([{systemQty:3},{systemQty:2}]);assert.equal(next.counted,0);assert.equal(next.pending,2);assert.equal(countProgress([]).percent,0);
});
