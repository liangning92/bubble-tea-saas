const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');const path=require('node:path');
function load(file){const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,require:(p)=>p==='./storeDateTime'?load(path.join(path.dirname(file),'storeDateTime.ts')):require(p),Intl,Date});return module.exports}
const {summarizePurchases}=load(path.resolve('client-admin/src/utils/purchaseSummary.ts'));
test('purchase summary counts unpaid order values at business midnight and month boundary, excludes cancellations',()=>{
 const order=(createdAt,totalAmount,status='awaiting_receipt')=>({createdAt,totalAmount,status});
 const rows=[order('2026-09-30T16:59:59Z',100),order('2026-09-30T17:00:00Z',200),order('2026-10-15T16:59:59Z',300,'received'),order('2026-10-15T17:00:00Z',400),order('2026-10-16T01:00:00Z',900,'cancelled')];
 const s=summarizePurchases(rows,'2026-10-16','Asia/Jakarta');assert.equal(s.awaiting,3);assert.equal(s.todayAmount,400);assert.equal(s.monthAmount,900);
});
test('empty purchase summary is zero',()=>{const s=summarizePurchases([],'2026-10-16','Asia/Jakarta');assert.equal(s.todayAmount,0);assert.equal(s.monthAmount,0);assert.equal(s.awaiting,0)});
