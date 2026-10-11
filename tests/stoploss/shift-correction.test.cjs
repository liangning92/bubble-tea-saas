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
 const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:50,actualCash:0,manualReceipts:{cash:0,qris:0,shopeefood:0,gofood:0},reason:'wrong entry'});
 const r=f.read();assert.equal(f.session.cashDifference,-150);assert.equal(r.report.expectedCash,150);assert.equal(r.report.manualReceipts.cash,0);assert.equal(r.warning.status,'pending');assert.equal(r.audit.description,'wrong entry');assert.equal(JSON.parse(r.audit.oldValue).session.openFloat,100);assert.equal(JSON.parse(r.audit.newValue).changes.openFloat,50);
});
test('matching correction removes obsolete discrepancy warning',async()=>{const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:0,actualCash:100,manualReceipts:{cash:100,qris:0,shopeefood:0,gofood:0},reason:'counted again'});assert.equal(f.read().deleted,true);assert.equal(f.session.cashDifference,0)});
test('open shift permits float correction without closing or requiring receipts',async()=>{const f=fixture('open');await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:0,reason:'wrong float'});assert.equal(f.session.status,'open');assert.equal(f.session.openFloat,0);assert.equal(f.read().audit.entityType,'shift_correction')});
test('manager, stale revision, missing reason and mismatched drawer amounts are rejected',async()=>{
 await assert.rejects(()=>svc.correctShift(fixture().db,{...actor,role:'manager'},'s',{}),e=>e.status===403);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{updatedAt:'2026-10-10T10:00:00.000Z',openFloat:0,reason:'wrong'}),e=>e.status===409);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{updatedAt,openFloat:0,reason:' '}));
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{updatedAt,openFloat:0,actualCash:10,manualReceipts:{cash:0,qris:0,shopeefood:0,gofood:0},reason:'wrong'}),e=>e.status===400);
});
test('POS expenses require a nonblank name',()=>{const expense=load('server/src/services/PosExpenseService.ts',{'../config/database':{},crypto:require('node:crypto'),zod,'./ExpenseService':{}});const body={requestId:'123e4567-e89b-12d3-a456-426614174000',category:'supplies',amount:100,quantity:1};for(const description of [undefined,'','  '])assert.equal(expense.posExpenseSchema.safeParse({...body,description}).success,false);assert.equal(expense.posExpenseSchema.parse({...body,description:' Supplies '}).description,'Supplies');assert.equal(manual.manualReceiptsSchema.parse({cash:100,qris:0,shopeefood:0,gofood:0}).qris,0)});
