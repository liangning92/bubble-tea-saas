const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(n in imports)return imports[n];throw Error(n)},Date,Map,Set,console});return m.exports;}
const zod=require('../../server/node_modules/zod');
const cash=load('server/src/services/ShiftCashReconciliation.ts',{zod,'../utils/refundAllocation':load('server/src/utils/refundAllocation.ts')});
const manual=load('server/src/services/ShiftManualReceipts.ts',{zod});
const handover=load('server/src/services/ShiftHandoverFinancials.ts',{'./ShiftManualReceipts':manual});
const svc=load('server/src/services/ShiftCorrectionService.ts',{zod,'./ShiftCashReconciliation':cash,'./ShiftManualReceipts':manual,'./ShiftHandoverFinancials':handover});
const actor={id:'admin',storeId:'store',role:'admin'},updatedAt='2026-10-11T10:00:00.000Z';
function fixture(status='closed'){
 const session={id:'s',storeId:'store',status,openFloat:100,actualCash:200,expectedCash:200,updatedAt:new Date(updatedAt)};
 const original={cashReconciliation:{cashFromRevenue:100,expectedCash:200,openFloat:100,expenses:0,revenue:100,qris:0},manualReceipts:{cash:200,qris:0,shopeefood:0,gofood:0}};
 let report=original,audit,warning,deleted=false;
 const tx={store:{update:async()=>{}},shiftSession:{findFirst:async q=>{assert.equal(q.where.storeId,'store');return session},updateMany:async q=>{Object.assign(session,q.data);return {count:1}},findUniqueOrThrow:async()=>session},config:{findUnique:async q=>q.where.storeId_key.key.startsWith('pos.shift.report:')?{value:JSON.stringify(report)}:null,update:async q=>{report=JSON.parse(q.data.value)},upsert:async q=>{warning=JSON.parse(q.update.value)},deleteMany:async()=>{deleted=true}},financeAuditLog:{create:async q=>{audit=q.data}}};
 return {db:{$transaction:fn=>fn(tx)},session,read:()=>({report,audit,warning,deleted})};
}
test('closed shift correction updates totals, resets warning and retains original values with reason',async()=>{
 const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,manualReceipts:{cash:0,qris:0,shopeefood:0,gofood:0},reason:'wrong entry'});
 const r=f.read();assert.equal(f.session.cashDifference,-200);assert.equal(r.report.expectedCash,200);assert.equal(r.report.manualReceipts.cash,0);assert.equal(r.warning.status,'pending');assert.equal(r.audit.description,'wrong entry');assert.equal(JSON.parse(r.audit.oldValue).session.openFloat,100);assert.equal(JSON.parse(r.audit.newValue).changes.openFloat,undefined);assert.equal(f.session.openFloat,100);
});
test('matching correction removes obsolete discrepancy warning',async()=>{const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,manualReceipts:{cash:200,qris:0,shopeefood:0,gofood:0},reason:'counted again'});assert.equal(f.read().deleted,true);assert.equal(f.session.cashDifference,0)});
const valid={updatedAt,manualReceipts:{cash:200,qris:10,shopeefood:20,gofood:30},reason:'verified correction'};
test('open shift rejects handover correction and preserves opening float',async()=>{const f=fixture('open');await assert.rejects(()=>svc.correctShift(f.db,actor,'s',valid),e=>e.status===400);assert.equal(f.session.openFloat,100);assert.equal(f.read().audit,undefined)});
test('only four handover amounts can change; float, expected cash, order totals and metadata are rejected',async()=>{
 for(const extra of [{openFloat:0},{actualCash:10},{expectedCash:0},{revenue:0},{status:'open'}]){const f=fixture();await assert.rejects(()=>svc.correctShift(f.db,actor,'s',{...valid,...extra}));assert.equal(f.session.openFloat,100);assert.equal(f.read().audit,undefined)}
 const f=fixture();await svc.correctShift(f.db,actor,'s',valid);assert.deepEqual(f.read().report.manualReceipts,valid.manualReceipts);assert.equal(f.session.openFloat,100);assert.equal(f.read().report.cashReconciliation.revenue,100);
});
test('manager, stale revision, missing reason, missing and extra receipt fields are rejected',async()=>{
 await assert.rejects(()=>svc.correctShift(fixture().db,{...actor,role:'manager'},'s',valid),e=>e.status===403);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,updatedAt:'2026-10-10T10:00:00.000Z'}),e=>e.status===409);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,reason:' '}));
 for(const receipts of [{cash:0,qris:0,shopeefood:0},{...valid.manualReceipts,openFloat:0}])await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,manualReceipts:receipts}));
});
test('POS expenses require a nonblank name',()=>{const expense=load('server/src/services/PosExpenseService.ts',{'../config/database':{},crypto:require('node:crypto'),zod,'./ExpenseService':{}});const body={requestId:'123e4567-e89b-12d3-a456-426614174000',category:'supplies',amount:100,quantity:1};for(const description of [undefined,'','  '])assert.equal(expense.posExpenseSchema.safeParse({...body,description}).success,false);assert.equal(expense.posExpenseSchema.parse({...body,description:' Supplies '}).description,'Supplies');assert.equal(manual.manualReceiptsSchema.parse({cash:100,qris:0,shopeefood:0,gofood:0}).qris,0)});
