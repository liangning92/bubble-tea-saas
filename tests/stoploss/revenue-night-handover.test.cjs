const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(n in imports)return imports[n];throw Error(n)},Date,Map,Set,console});return m.exports;}
const dates=load('server/src/utils/revenueDateRange.ts'),night=load('server/src/utils/dailyOnlineRevenue.ts',{'./revenueDateRange':dates});
const receipts=load('server/src/services/ShiftManualReceipts.ts',{zod:require('../../server/node_modules/zod'),'../utils/dailyOnlineRevenue':night,'../utils/revenueDateRange':dates});
const handover=load('server/src/services/ShiftHandoverFinancials.ts',{'./ShiftManualReceipts':receipts});
const definitions=[{key:'morning',nameZh:'早班',startTime:'08:00'},{key:'evening',nameZh:'晚班',startTime:'16:00'}];
const amounts={cash:670000,qris:16000,shopeefood:100000,gofood:50000};
function row(id,shift,day,extra={}){return {id,shift,openedAt:new Date(`2026-10-${day}T01:00Z`),closedAt:new Date(`2026-10-${day}T12:00Z`),actualCash:670000,openFloat:420000,...extra};}
function db(rows,records={}){return {shift:{findMany:async q=>{assert.equal(q.where.storeId,'owned');return definitions}},shiftSession:{findMany:async q=>{assert.equal(q.where.storeId,'owned');return rows.filter(r=>r.closedAt>=q.where.closedAt.gte&&r.closedAt<=q.where.closedAt.lte)}},config:{findMany:async q=>{assert.equal(q.where.storeId,'owned');return rows.filter(r=>q.where.key.in.includes('pos.shift.report:'+r.id)).map(r=>({key:'pos.shift.report:'+r.id,value:JSON.stringify({manualReceipts:records[r.id]===undefined?amounts:records[r.id],manualReceiptsCashBasis:'drawer_total'})}));}}};}
const start=new Date('2026-10-10T17:00Z'),end=new Date('2026-10-13T16:59:59.999Z');
test('three days sum all shift deposits and QRIS but online receipts only once per day from night',async()=>{
 const rows=['11','12','13'].flatMap(d=>[row('day-'+d,'morning',d),row('night-'+d,'evening',d)]);const result=await receipts.getHandoverReceipts(db(rows),'owned',start,end);
 assert.equal(result.actualCashReceived,1500000);assert.equal(result.totals.qris,96000);assert.equal(result.totals.shopeefood,300000);assert.equal(result.totals.gofood,150000);assert.equal(result.list.filter(r=>r.onlineRevenueCounted).length,3);assert.equal(result.range.startDate,'2026-10-11');assert.equal(result.range.endDate,'2026-10-13');
 const one=await receipts.getHandoverReceipts(db(rows),'owned',new Date('2026-10-12T17:00Z'),end);assert.equal(one.list.length,2);assert.equal(one.actualCashReceived,500000);assert.equal(one.totals.shopeefood,100000);
});
test('missing night never falls back to morning and missing cash count is not silently zero',async()=>{
 const result=await receipts.getHandoverReceipts(db([row('day','morning','11',{actualCash:null})]),'owned',start,end);assert.equal(result.totals.shopeefood,0);assert.equal(result.actualCashReceived,null);assert.equal(result.incompleteCashShifts,1);
});
test('later night report replaces earlier daily report including explicit zero',async()=>{
 const rows=[row('a','evening','11'),row('b','evening','11',{closedAt:new Date('2026-10-11T13:00Z')})];const result=await receipts.getHandoverReceipts(db(rows,{b:{...amounts,shopeefood:0,gofood:0}}),'owned',start,end);assert.equal(result.totals.shopeefood,0);assert.equal(result.list.find(r=>r.id==='a').onlineRevenueCounted,false);
});
test('night detection supports configured shift keys and only a morning definition does not qualify',()=>{
 const rows=[row('day','custom-early','11'),row('night','custom-late','11')];assert.deepEqual([...night.dailyNightHandoverIds(rows,[{key:'custom-early',startTime:'08:00'},{key:'custom-late',startTime:'16:00'}])],['night']);assert.equal(night.dailyNightHandoverIds([row('day','morning','11')],[definitions[0]]).size,0);
});
test('summary, channel and daily revenue share the same night-only online source',async()=>{
 const database=db([row('day','morning','11'),row('night','evening','11')]);database.order={findMany:async()=>[{status:'paid',paymentMethod:'cash',finalAmount:110000,refundRequests:[{status:'paid',amount:10000}],createdAt:new Date('2026-10-11T02:00Z'),channelId:'pos',channel:{name:'POS'}}]};
 const revenue=load('server/src/services/RevenueService.ts',{'./ShiftHandoverFinancials':handover,'../utils/refundAllocation':load('server/src/utils/refundAllocation.ts'),'./ReceiptFinancialEvidenceService':{requireVerifiedReceiptIncome:async()=>{}},'../config/database':{default:database,__esModule:true},'./ReceivedReceiptService':{},'./OrderReplayService':{},'../utils/revenueDateRange':dates});
 const summary=await revenue.getRevenueSummary('owned',start,end),channels=await revenue.getRevenueByChannel('owned',start,end),daily=await revenue.getDailyRevenue('owned',start,end);
 assert.equal(summary.orderRevenue,100000);assert.equal(summary.revenue,250000);assert.equal(channels.reduce((sum,r)=>sum+r.revenue,0),250000);assert.equal(daily.reduce((sum,r)=>sum+r.revenue,0),250000);
});
