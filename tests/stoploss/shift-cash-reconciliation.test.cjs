const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(n in imports)return imports[n];throw Error(n)},Date,Map,Set,console});return m.exports;}
const service=load('server/src/services/ShiftCashReconciliation.ts',{zod:require('../../server/node_modules/zod'),'../utils/offlinePolicy':{POS_MANUAL_PAYMENT_METHODS:['cash','qris','gopay','ovo','dana','shopeepay','debit','card']},'../utils/refundAllocation':load('server/src/utils/refundAllocation.ts')});
test('cash drawer formula scopes cash/QRIS revenue and cents-based expenses to one shift',async()=>{const start=new Date('2026-10-10T01:00Z'),end=new Date('2026-10-10T09:00Z');const db={order:{findMany:async q=>{assert.equal(q.where.storeId,'owned');assert.equal(q.where.createdAt.gte,start);assert.equal(q.where.createdAt.lt,end);assert.deepEqual(Array.from(q.where.paymentMethod.in),['cash','qris','gopay','ovo','dana','shopeepay','debit','card']);return [{paymentMethod:'cash',status:'completed',finalAmount:200000,refundRequests:[{status:'paid',amount:10000}]},{paymentMethod:'qris',status:'paid',finalAmount:80000,refundRequests:[]}]}},expense:{findMany:async q=>{assert.equal(q.where.storeId,'owned');return [{amount:3500000}]}}};const r=await service.calculateShiftCash(db,'owned',{openedAt:start,openFloat:100000},end);assert.equal(r.revenue,270000);assert.equal(r.expenses,35000);assert.equal(r.qris,80000);assert.equal(r.cashFromRevenue,155000);assert.equal(r.expectedCash,255000);assert.equal(service.cashWarningFor('s',255000,r,end),null);const warning=service.cashWarningFor('s',250000,r,end);assert.equal(warning.difference,-5000);assert.equal(warning.status,'pending');});
test('signed differences and exact zero, including decimal expenses, do not become enforced thresholds',async()=>{const db={order:{findMany:async()=>[]},expense:{findMany:async()=>[{amount:125}]}};const r=await service.calculateShiftCash(db,'owned',{openedAt:new Date(0),openFloat:100},new Date());assert.equal(r.expectedCash,98.75);assert.equal(service.cashWarningFor('s',100,r,new Date()).difference,1.25);});
test('cash warning reviews reject managers independently of route authorization',async()=>{await assert.rejects(()=>service.reviewCashWarning({$transaction:()=>{throw Error('Must not enter transaction')}},{id:'m',role:'manager',storeId:'owned'},'s','review'),e=>e.status===403);});
test('warning and immutable report settings cannot be overwritten through generic config',()=>{const access=load('server/src/utils/configAccess.ts');for(const key of ['pos.shift.cash-warning:s','pos.shift.report:s','pos.shift.float-event:s'])assert.equal(access.isInternalConfig(key),true);assert.equal(access.isInternalConfig('shiftSettings'),false);});

test('card and wallets contribute revenue without increasing drawer cash; manual cash movements are scoped and order-bound refunds are excluded from that adjustment',async()=>{
 const db={order:{findMany:async()=>[{paymentMethod:'cash',status:'completed',finalAmount:10000,refundRequests:[]},{paymentMethod:'card',status:'completed',finalAmount:50000,refundRequests:[]},{paymentMethod:'qris',status:'completed',finalAmount:20000,refundRequests:[]}]},expense:{findMany:async()=>[{amount:300000}]},cashEvent:{findMany:async q=>{assert.equal(q.where.orderId,null);return [{type:'cash_in',amount:5000},{type:'cash_out',amount:2000}]}}};
 const result=await service.calculateShiftCash(db,'owned',{openedAt:new Date(0),openFloat:100000},new Date());
 assert.equal(result.revenue,80000);assert.equal(result.otherNonCash,50000);assert.equal(result.qris,20000);assert.equal(result.expenses,3000);assert.equal(result.expectedCash,110000);
});

test('manual QRIS replaces recorded QRIS once and preserves the recorded source across corrections',()=>{
 const recorded={revenue:313000,expenses:0,qris:0,cashFromRevenue:313000,openFloat:600000,expectedCash:913000};
 const manual=service.applyHandoverQris(recorded,26000);
 assert.equal(manual.expectedCash,887000);assert.equal(manual.cashFromRevenue,287000);assert.equal(manual.recordedQris,0);assert.equal(manual.qrisSource,'manual_handover');
 const correctedFloat=service.applyHandoverQris({...manual,openFloat:420000},26000);assert.equal(correctedFloat.expectedCash,707000);
 const mixed=service.applyHandoverQris({...recorded,qris:10000},26000);assert.equal(mixed.expectedCash,887000);assert.equal(mixed.recordedQris,10000);
 const edited=service.applyHandoverQris(mixed,30000);assert.equal(edited.expectedCash,883000);assert.equal(edited.recordedQris,10000);
 assert.equal(service.applyHandoverQris(edited).qris,10000);assert.equal(service.applyHandoverQris(mixed,0).expectedCash,913000);
 assert.equal(recorded.expectedCash,913000);
});

test('manual QRIS preserves occurrence-based payouts and noncash receipts through repeated correction',()=>{
 const recorded={version:1,source:'occurrence_cash_ledger',revenue:20000,expenses:1000,qris:10000,otherNonCash:10000,cashFromRevenue:9000,openFloat:100000,cashIns:5000,cashOuts:12000,expectedCash:102000};
 const manual=service.applyHandoverQris(recorded,15000);assert.equal(manual.expectedCash,97000);assert.equal(manual.cashFromRevenue,4000);
 const corrected=service.applyHandoverQris({...manual,openFloat:80000},12000);assert.equal(corrected.expectedCash,80000);assert.equal(corrected.recordedQris,10000);assert.equal(service.applyHandoverQris(corrected).expectedCash,82000);
});

const pendingWarning={version:1,status:'pending',sessionId:'s',expectedCash:941000,actualCash:857000,difference:-84000,createdAt:'2026-10-16T16:14:02.639Z'};
test('pre-handover approved refunds reconcile original shortage without editing evidence',()=>{
 const original=JSON.stringify(pendingWarning),refunds=[{id:'r1',amount:44000},{id:'r2',amount:40000}];
 const result=service.reconcileCashWarningRefunds(pendingWarning,refunds);
 assert.equal(result.status,'resolved');assert.equal(result.difference,0);assert.equal(result.expectedCash,857000);assert.equal(result.originalDifference,-84000);assert.equal(result.approvedRefundAmount,84000);assert.equal(result.refundRequestIds.length,2);assert.equal(JSON.stringify(pendingWarning),original);
});
test('partial approval retains outstanding amount; excess refunds, surplus and prior reviews never auto-clear',()=>{
 const result=service.reconcileCashWarningRefunds(pendingWarning,[{id:'r',amount:44000}]);assert.equal(result.status,'pending');assert.equal(result.difference,-40000);
 for(const warning of [pendingWarning,{...pendingWarning,status:'reviewed'},{...pendingWarning,difference:84000}]){
  assert.equal(service.reconcileCashWarningRefunds(warning,[{id:'r',amount:90000}]),warning);
 }
 assert.equal(service.reconcileCashWarningRefunds(pendingWarning,[]),pendingWarning);
});
test('cash review loader admits only approved cash refunds requested within the original shift and after its snapshot',async()=>{
 const start=new Date('2026-10-16T11:28:59.461Z'),end=new Date('2026-10-16T16:11:03.372Z');
 const row=(id,createdAt,approvedAt,amount=40000)=>({id,createdAt:new Date(createdAt),approvedAt:new Date(approvedAt),amount,order:{createdAt:new Date('2026-10-16T12:00Z')}});
 const db={config:{findMany:async()=>[{key:'pos.shift.cash-warning:s',value:JSON.stringify(pendingWarning)}]},shiftSession:{findMany:async q=>{assert.equal(q.where.storeId,'owned');return [{id:'s',openedAt:start,closedAt:end}]}},refundRequest:{findMany:async q=>{
  assert.equal(q.where.order.storeId,'owned');assert.equal(q.where.order.paymentMethod,'cash');assert.deepEqual(Array.from(q.where.status.in),['approved','paid']);assert.equal(q.where.OR[0].createdAt.lt,end);assert.equal(q.where.OR[0].approvedAt.gt.toISOString(),pendingWarning.createdAt);
  return [row('r1','2026-10-16T12:30Z','2026-10-16T20:25Z',44000),row('r2','2026-10-16T12:28Z','2026-10-16T20:26Z'),row('late','2026-10-16T17:00Z','2026-10-16T20:25Z'),row('old','2026-10-16T12:00Z','2026-10-16T15:00Z')];
 }}};
 const result=await service.loadShiftCashReviews(db,'owned',['s']);assert.equal(result.get('s').cashWarning.status,'resolved');assert.equal(result.get('s').cashWarning.approvedRefundAmount,84000);
});
test('overlapping sessions and refunds from other order windows never clear a warning',async()=>{
 const session={id:'s',openedAt:new Date('2026-10-16T11:28Z'),closedAt:new Date('2026-10-16T16:11Z')};
 const db={config:{findMany:async()=>[{key:'pos.shift.cash-warning:s',value:JSON.stringify(pendingWarning)}]},shiftSession:{findMany:async q=>q.where.id ? [session] : [session,{...session,id:'overlap'}]},refundRequest:{findMany:async()=>[{id:'r',amount:84000,createdAt:new Date('2026-10-16T12:00Z'),approvedAt:new Date('2026-10-16T20:25Z'),order:{createdAt:new Date('2026-10-16T12:00Z')}}]}};
 assert.equal((await service.loadShiftCashReviews(db,'owned',['s'])).get('s').cashWarning.status,'pending');
 db.shiftSession.findMany=async()=>[session];db.refundRequest.findMany=async()=>[{id:'r',amount:84000,createdAt:new Date('2026-10-16T12:00Z'),approvedAt:new Date('2026-10-16T20:25Z'),order:{createdAt:new Date('2026-10-15T12:00Z')}}];
 assert.equal((await service.loadShiftCashReviews(db,'owned',['s'])).get('s').cashWarning.status,'pending');
});
