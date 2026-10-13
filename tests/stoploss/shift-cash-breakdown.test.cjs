const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-admin/src/utils/shiftCashBreakdown.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleObject,exports:moduleObject.exports});
const {shiftCashBreakdown}=moduleObject.exports;
const snapshot={revenue:347000,expenses:0,qris:121000,cashFromRevenue:226000,openFloat:420000,expectedCash:646000,windowStart:'2026-10-13T12:03:55.107Z',windowEnd:'2026-10-13T15:58:52.058Z'};
test('October 13 closing snapshot explains 6000 versus 9000 by the 3000 QRIS discrepancy',()=>{
  const b=shiftCashBreakdown(snapshot,652000,6000,124000);
  assert.equal(b.systemDifference,6000);assert.equal(b.manualDifference,9000);assert.equal(b.qrisDifference,3000);assert.equal(b.manualExpected,643000);assert.equal(b.inconsistent,false);
  assert.equal(b.manualDifference-b.calculatedDifference,b.qrisDifference);
});
test('missing QRIS is unknown, but a reported zero is valid',()=>{
  assert.equal(shiftCashBreakdown(snapshot,652000,6000,null).qrisDifference,null);
  const zero=shiftCashBreakdown(snapshot,652000,6000,0);assert.equal(zero.qrisDifference,-121000);assert.equal(zero.manualDifference,-115000);
  assert.equal(shiftCashBreakdown(snapshot,652000,6000,121000).qrisDifference,0);
});
test('shortages, expenses and fractional money retain their signs and precision',()=>{
  const b=shiftCashBreakdown({...snapshot,revenue:20,expenses:1.25,qris:10,openFloat:100,expectedCash:108.75},100,-8.75,8);
  assert.equal(b.systemDifference,-8.75);assert.equal(b.manualDifference,-10.75);assert.equal(b.qrisDifference,-2);assert.equal(b.inconsistent,false);
});
test('missing closing amounts never turn into zero and inconsistent saved results stay visible',()=>{
  assert.equal(shiftCashBreakdown(null,652000,6000,124000),null);assert.equal(shiftCashBreakdown(snapshot,null,6000,124000),null);
  assert.equal(shiftCashBreakdown({...snapshot,revenue:NaN},652000,6000,124000),null);
  const b=shiftCashBreakdown(snapshot,652000,9000,124000);assert.equal(b.systemDifference,9000);assert.equal(b.calculatedDifference,6000);assert.equal(b.inconsistent,true);
  assert.equal(shiftCashBreakdown({...snapshot,expectedCash:643000},652000,9000,124000).inconsistent,true);
});
