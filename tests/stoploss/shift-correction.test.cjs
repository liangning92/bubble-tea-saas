const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(n in imports)return imports[n];if(n==='./ExpensePaymentService')return load('server/src/services/ExpensePaymentService.ts',{zod:require('../../server/node_modules/zod'),'../utils/storeDateSettings':load('server/src/utils/storeDateSettings.ts'),'../utils/revenueDateRange':load('server/src/utils/revenueDateRange.ts',{'./storeDateSettings':load('server/src/utils/storeDateSettings.ts')})});if(n.endsWith('/storeDateSettings'))return load('server/src/utils/storeDateSettings.ts');throw Error(n)},Date,Map,Set,console});return m.exports;}
const zod=require('../../server/node_modules/zod');
const cash=load('server/src/services/ShiftCashReconciliation.ts',{zod,'../utils/offlinePolicy':{POS_MANUAL_PAYMENT_METHODS:['cash','qris','gopay','ovo','dana','shopeepay','debit','card']},'../utils/refundAllocation':load('server/src/utils/refundAllocation.ts')});
const manual=load('server/src/services/ShiftManualReceipts.ts',{zod,'../utils/dailyOnlineRevenue':load('server/src/utils/dailyOnlineRevenue.ts',{'./revenueDateRange':load('server/src/utils/revenueDateRange.ts')}),'../utils/revenueDateRange':load('server/src/utils/revenueDateRange.ts')});
const handover=load('server/src/services/ShiftHandoverFinancials.ts',{'./ShiftManualReceipts':manual});
const svc=load('server/src/services/ShiftCorrectionService.ts',{zod,'./ShiftCashReconciliation':cash,'./ShiftManualReceipts':manual,'./ShiftHandoverFinancials':handover});
const actor={id:'admin',storeId:'store',role:'admin'},updatedAt='2026-10-11T10:00:00.000Z';
function fixture(status='closed'){
 const session={id:'s',storeId:'store',staffId:'staff',shift:'day',openedAt:new Date('2026-10-11T01:00:00Z'),status,openFloat:100,actualCash:200,expectedCash:200,updatedAt:new Date(updatedAt)};
 const original={cashReconciliation:{cashFromRevenue:100,expectedCash:200,openFloat:100,expenses:0,revenue:100,qris:0},manualReceipts:{cash:200,qris:0,shopeefood:0,gofood:0}};
 let report=original,audit,warning,deleted=false;
 const tx={cashEvent:{findMany:async()=>[]},store:{update:async()=>{}},shiftSession:{findFirst:async q=>{assert.equal(q.where.storeId,'store');return session},updateMany:async q=>{Object.assign(session,q.data);return {count:1}},findUniqueOrThrow:async()=>session},config:{findMany:async()=>[],findUnique:async q=>q.where.storeId_key.key.startsWith('pos.shift.report:')?{value:JSON.stringify(report)}:null,update:async q=>{report=JSON.parse(q.data.value)},upsert:async q=>{warning=JSON.parse(q.update.value)},deleteMany:async()=>{deleted=true}},financeAuditLog:{create:async q=>{audit=q.data}}};
 return {db:{$transaction:fn=>fn(tx)},tx,session,read:()=>({report,audit,warning,deleted})};
}
test('closed shift correction updates totals, resets warning and retains original values with reason',async()=>{
 const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:100,manualReceipts:{cash:0,qris:0,shopeefood:0,gofood:0},reason:'wrong entry'});
 const r=f.read();assert.equal(f.session.cashDifference,-200);assert.equal(r.report.expectedCash,200);assert.equal(r.report.manualReceipts.cash,0);assert.equal(r.warning.status,'pending');assert.equal(r.audit.description,'wrong entry');assert.equal(JSON.parse(r.audit.oldValue).session.openFloat,100);assert.equal(JSON.parse(r.audit.newValue).changes.openFloat,100);assert.equal(f.session.openFloat,100);
});
test('matching correction removes obsolete discrepancy warning',async()=>{const f=fixture();await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:100,manualReceipts:{cash:200,qris:0,shopeefood:0,gofood:0},reason:'counted again'});assert.equal(f.read().deleted,true);assert.equal(f.session.cashDifference,0)});
const valid={updatedAt,openFloat:100,manualReceipts:{cash:200,qris:10,shopeefood:20,gofood:30},reason:'verified correction'};
test('open shift corrects float, adjusts expected cash and preserves open status with audit',async()=>{const f=fixture('open');await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:0,reason:'verified opening count'});assert.equal(f.session.openFloat,0);assert.equal(f.session.expectedCash,100);assert.equal(f.session.status,'open');assert.equal(JSON.parse(f.read().audit.oldValue).session.openFloat,100);assert.equal(f.read().audit.description,'verified opening count')});
test('closed shift corrects float and recomputes discrepancy without altering orders',async()=>{const f=fixture();await svc.correctShift(f.db,actor,'s',{...valid,openFloat:50});assert.equal(f.session.openFloat,50);assert.equal(f.session.expectedCash,140);assert.equal(f.session.cashDifference,60);assert.equal(f.read().report.handoverFinancials.openFloat,50);assert.equal(f.read().report.cashReconciliation.revenue,100)});
test('only staff-entered amounts can change; expected cash, order totals and metadata are rejected',async()=>{
 for(const extra of [{actualCash:10},{expectedCash:0},{revenue:0},{status:'open'}]){const f=fixture();await assert.rejects(()=>svc.correctShift(f.db,actor,'s',{...valid,...extra}));assert.equal(f.session.openFloat,100);assert.equal(f.read().audit,undefined)}
 const f=fixture();await svc.correctShift(f.db,actor,'s',valid);assert.deepEqual(f.read().report.manualReceipts,valid.manualReceipts);assert.equal(f.session.openFloat,100);assert.equal(f.read().report.cashReconciliation.revenue,100);
});
test('manager, stale revision, missing reason, missing and extra receipt fields are rejected',async()=>{
 await assert.rejects(()=>svc.correctShift(fixture().db,{...actor,role:'manager'},'s',valid),e=>e.status===403);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,updatedAt:'2026-10-10T10:00:00.000Z'}),e=>e.status===409);
 await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,reason:' '}));
 for(const receipts of [{cash:0,qris:0,shopeefood:0},{...valid.manualReceipts,openFloat:0}])await assert.rejects(()=>svc.correctShift(fixture().db,actor,'s',{...valid,manualReceipts:receipts}));
});
test('POS expenses require a nonblank name',()=>{const expense=load('server/src/services/PosExpenseService.ts',{'../config/database':{},crypto:require('node:crypto'),zod,'./ExpenseService':{}});const body={requestId:'123e4567-e89b-12d3-a456-426614174000',category:'supplies',amount:100,quantity:1};for(const description of [undefined,'','  '])assert.equal(expense.posExpenseSchema.safeParse({...body,description}).success,false);assert.equal(expense.posExpenseSchema.parse({...body,description:' Supplies '}).description,'Supplies');assert.equal(manual.manualReceiptsSchema.parse({cash:100,qris:0,shopeefood:0,gofood:0}).qris,0)});

test('editing only manual QRIS recalculates closed cash, preserves order totals, and is repeatable without double deduction',async()=>{
 const f=fixture();await svc.correctShift(f.db,actor,'s',{...valid,manualReceipts:{...valid.manualReceipts,cash:174,qris:26}});
 assert.equal(f.session.expectedCash,174);assert.equal(f.session.cashDifference,0);assert.equal(f.read().report.cashReconciliation.recordedQris,0);assert.equal(f.read().report.cashReconciliation.revenue,100);
 await svc.correctShift(f.db,actor,'s',{...valid,manualReceipts:{...valid.manualReceipts,cash:170,qris:30}});
 assert.equal(f.session.expectedCash,170);assert.equal(f.session.cashDifference,0);assert.equal(f.read().report.cashReconciliation.recordedQris,0);
});

test('reserve correction updates the bound opening ledger without manufacturing cash or changing another shift',async()=>{
 const f=fixture('open'),event={id:'opening',storeId:'store',type:'float',amount:100,staffId:'staff',shift:'day'};
 f.tx.cashEvent.findMany=async q=>{assert.equal(q.where.storeId,'store');return [event]};
 let updates=0;f.tx.cashEvent.updateMany=async q=>{assert.equal(q.where.id,'opening');assert.equal(q.where.amount,event.amount);updates++;event.amount=q.data.amount;return {count:1}};
 await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:40,reason:'Correct reserve allocation, no cash movement'});
 assert.equal(event.amount,40);assert.equal(updates,1);assert.equal(f.session.actualCash,200);
 const audit=JSON.parse(f.read().audit.newValue).openingFloatCorrection;assert.equal(audit.returnedReserve,60);assert.equal(audit.cashMovement,0);assert.equal(audit.originalLedgerReserve,100);
});
test('legacy stale float is repaired only with the matching audit chain and never returned twice',async()=>{
 const f=fixture('open');f.session.openFloat=420;const event={id:'opening',amount:600};
 f.tx.cashEvent.findMany=async()=>[event];f.tx.cashEvent.updateMany=async q=>{event.amount=q.data.amount;return {count:1}};
 f.tx.financeAuditLog.findMany=async()=>[{oldValue:JSON.stringify({session:{openFloat:600}}),newValue:JSON.stringify({changes:{openFloat:420}})}];
 await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:420,reason:'Repair previous reserve correction ledger'});
 assert.equal(event.amount,420);assert.equal(JSON.parse(f.read().audit.newValue).openingFloatCorrection.returnedReserve,180);
 await svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:420,reason:'Verify unchanged reserve'});
 assert.equal(JSON.parse(f.read().audit.newValue).openingFloatCorrection.returnedReserve,0);
});
test('ambiguous creation events and unmatched stale ledger amounts cannot be guessed',async()=>{
 for(const candidates of [[{id:'a',amount:100},{id:'b',amount:100}],[{id:'a',amount:600}]]){
  const f=fixture('open');f.tx.cashEvent.findMany=async()=>candidates;f.tx.financeAuditLog.findMany=async()=>[];
  await assert.rejects(()=>svc.correctShift(f.db,actor,'s',{updatedAt,openFloat:40,reason:'Verify reserve'}),e=>e.status===409);
  assert.equal(f.session.openFloat,100);
 }
});
