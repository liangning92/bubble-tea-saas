const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleFile='server/src/services/ShiftSummaryEvidence.ts';const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(moduleFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleObject,exports:moduleObject.exports,Date,require:()=>{throw Error('Runtime DB dependency prohibited');}});
const load=moduleObject.exports.loadShiftSummaryEvidence;
const at=value=>new Date(value);
function fixture({sessions,events=[],orders=[]}){
 const queries=[];
 const match=(row,w)=>row.storeId===w.storeId&&row.createdAt>=w.createdAt.gte&&row.createdAt<w.createdAt.lt;
 const db={shiftSession:{findMany:async q=>{queries.push(q);return sessions.filter(s=>s.storeId===q.where.storeId&&s.status==='open');}},cashEvent:{findMany:async q=>{queries.push(q);return events.filter(e=>match(e,q.where));}},order:{findMany:async q=>{queries.push(q);return orders.filter(o=>match(o,q.where));}}};
 return {db,queries};
}
const session=(id,shift,openedAt,status='open',storeId='store-a')=>({id,shift,openedAt:at(openedAt),status,storeId,openFloat:500});
const event=(type,amount,time,shift,storeId='store-a')=>({type,amount,createdAt:at(time),shift,storeId});
const order=(finalAmount,time,status='completed',paymentMethod='qris',storeId='store-a')=>({finalAmount,totalAmount:999999,createdAt:at(time),status,paymentMethod,storeId});
test('same-day/same-key reopen uses one captured session interval and authenticated store, never day/key',async()=>{
 const f=fixture({sessions:[session('old','morning','2026-10-07T00:00Z','closed'),session('new','morning','2026-10-07T06:00Z')],events:[event('cash_sale',900,'2026-10-07T01:00Z','morning'),event('cash_sale',200,'2026-10-07T07:00Z','morning'),event('cash_sale',800,'2026-10-07T07:00Z','morning','store-b'),event('cash_sale',100,'2026-10-07T08:00Z','morning')]});
 const r=await load(f.db,'store-a',at('2026-10-07T08:00Z'));assert.equal(r.summaryEvidence.cashSales,200);assert.equal(r.openFloat,500);assert.equal(r.expectedCash,null);assert.equal(r.summaryEvidence.verified,false);assert.equal(r.summaryEvidence.status,'provisional');
 for(const q of f.queries.slice(1)){assert.equal(q.where.storeId,'store-a');assert.equal(q.where.shift,undefined);assert.equal(q.where.createdAt.gte.toISOString(),'2026-10-07T06:00:00.000Z');assert.equal(q.where.createdAt.lt.toISOString(),'2026-10-07T08:00:00.000Z');}
});
test('session spanning Jakarta midnight keeps both sides of the actual opening boundary',async()=>{
 const f=fixture({sessions:[session('overnight','evening','2026-10-06T16:00Z')],events:[event('cash_in',10,'2026-10-06T16:30Z','evening'),event('cash_in',20,'2026-10-06T17:30Z','evening')]});
 const r=await load(f.db,'store-a',at('2026-10-06T18:00Z'));assert.equal(r.summaryEvidence.cashIns,30);assert.equal(r.currentBalance,null);
});
test('unassigned/foreign-shift events hide only affected evidence, without guessing or zero fallback',async()=>{
 const f=fixture({sessions:[session('s','morning','2026-10-07T00:00Z')],events:[event('cash_sale',100,'2026-10-07T01:00Z'),event('cash_out',50,'2026-10-07T01:10Z','evening'),event('cash_in',10,'2026-10-07T01:20Z','morning')]});
 const r=await load(f.db,'store-a',at('2026-10-07T03:00Z'));assert.equal(r.todayCashSales,null);assert.equal(r.todayCashOuts,null);assert.equal(r.todayCashIns,10);assert.equal(r.summaryEvidence.status,'unverifiable');assert.equal(r.expectedCash,null);
});
test('QRIS receipt evidence uses untouched finalAmount; refunded/unknown execution never becomes certified net',async()=>{
 const sessions=[session('s','morning','2026-10-07T00:00Z')];
 let f=fixture({sessions,orders:[order(110,'2026-10-07T01:00Z'),order(90,'2026-10-07T02:00Z'),order(400,'2026-10-06T23:00Z'),order(500,'2026-10-07T01:00Z','completed','qris','store-b')]});
 let r=await load(f.db,'store-a',at('2026-10-07T03:00Z'));assert.equal(r.summaryEvidence.qrisReceipts,200);assert.equal(r.qrisSales,null);assert.equal(r.summaryEvidence.verified,false);assert.ok(r.summaryEvidence.reasonCodes.includes('OFFLINE_ORIGIN_NOT_PERSISTED'));
 f=fixture({sessions,orders:[order(110,'2026-10-07T01:00Z'),order(90,'2026-10-07T02:00Z','refunded')]});r=await load(f.db,'store-a',at('2026-10-07T03:00Z'));assert.equal(r.summaryEvidence.qrisReceipts,null);assert.equal(r.todayOrderAmount,null);assert.equal(r.summaryEvidence.status,'unverifiable');
});
test('no session/overlapping sessions never fall back to whole-day trusted zeros',async()=>{
 for(const sessions of [[],[session('a','morning','2026-10-07T00:00Z'),session('b','evening','2026-10-07T01:00Z')]]){
  const f=fixture({sessions});const r=await load(f.db,'store-a',at('2026-10-07T03:00Z'));assert.equal(r.expectedCash,null);assert.equal(r.todayCashSales,null);assert.equal(r.summaryEvidence.orderCount,null);assert.equal(f.queries.length,1);
 }
});
test('empty healthy session remains open and exposes provisional recorded zero, with unknown expected/net',async()=>{
 const f=fixture({sessions:[session('s','morning','2026-10-07T00:00Z')]});const r=await load(f.db,'store-a',at('2026-10-07T01:00Z'));assert.equal(r.hasOpenShift,true);assert.equal(r.openFloat,500);assert.equal(r.summaryEvidence.cashSales,0);assert.equal(r.summaryEvidence.status,'provisional');assert.equal(r.expectedCash,null);assert.equal(r.qrisSales,null);
});
test('main POS explicit manual count is preserved, empty count never defaults to expected cash and provisional evidence prints only an explicitly labeled handover',async()=>{
 const source=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8'),ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
 function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onClick'&&n.initializer?.expression?.getText(ast).includes('sendPrintShiftReport'))handler=n.initializer.expression.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(handler);
 let writes=[],prints=[];const state={manualReceipts:{cash:'0',qris:'0',shopeefood:'0',gofood:'0'},shiftClosing:false,setShiftClosing:()=>{},setManualReceipts:()=>{},shiftActualCash:'',shiftSettings:{requireSupervisorConfirm:false},shiftData:{expectedCash:999999,summaryEvidence:{verified:false}},t:k=>k,showToast:()=>{},posApi:{closeShift:async x=>{writes.push(x);return {data:{data:{purchaseExpenses:{total:35000,items:[{category:'Supplies',quantity:3,amount:35000}]}}}}}},electronAPI:{sendPrintShiftReport:async data=>{prints.push(data);return {success:true}}},printerTarget:()=>({printerName:'Synthetic'}),posReceipt:{paperSize:'80mm'},lang:'zh',storeInfo:{storeName:'Synthetic'},user:{staff:{name:'Synthetic'}},clearCart:()=>{},setSuspendedOrders:()=>{},localStorage:{removeItem:()=>{}},setShowShiftModal:()=>{},setShiftActualCash:()=>{},setShiftSupervisorPin:()=>{},logout:()=>{}};
 vm.runInNewContext(ts.transpileModule('globalThis.close='+handler,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,state);
 await state.close();assert.equal(writes.length,0);state.shiftActualCash='0';await state.close();assert.equal(writes[0].actualCash,0);assert.equal(prints.length,1);assert.equal(prints[0].reportKind,'handover');assert.equal(prints[0].purchaseExpenses.total,35000);state.shiftActualCash='125';await state.close();assert.equal(writes[1].actualCash,125);assert.equal(prints.length,2);assert.ok(prints.every(p=>p.reportKind==='handover'));
});
