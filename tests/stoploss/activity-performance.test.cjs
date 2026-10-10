const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleValue={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('server/src/utils/activityPerformance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(moduleValue,moduleValue.exports);
const {summarizeActivityPerformance}=moduleValue.exports;
test('actual activity report deduplicates shared orders and subtracts approved refunds only',()=>{
 const activities=[{id:'price',name:'Daily price'},{id:'gift',name:'Gift'}];
 const snapshots=[{orderId:'paid',applied:{id:'price',kind:'activity',discount:4000}},{orderId:'paid',applied:{id:'price',kind:'activity',discount:4000}},{orderId:'old-full',applied:{id:'price',kind:'activity',discount:2000}}];
 const orders=[{id:'paid',status:'completed',finalAmount:22000,refundRequests:[{status:'approved',amount:5500},{status:'pending',amount:1000}]},{id:'old-full',status:'refunded',finalAmount:18000,refundRequests:[]}];
 const grants=[{orderId:'paid',activityId:'gift',status:'ready'},{orderId:'foreign',activityId:'price',status:'fulfilled'}];
 const report=summarizeActivityPerformance(activities,snapshots,orders,grants);
 assert.deepEqual(report.summary,{orderCount:2,paidAmount:16500,refundedAmount:23500,discountAmount:6000});
 assert.equal(report.activities.find(row=>row.id==='gift').paidAmount,16500);
 assert.equal(report.activities.find(row=>row.id==='gift').discountAmount,0);
 assert.equal(report.activities.find(row=>row.id==='gift').pending,1);
 assert.equal(report.activities.find(row=>row.id==='price').rewardCount,0);
});
test('no transactions yield explicit zero metrics; refunds cannot produce negative receipts',()=>{
 const empty=summarizeActivityPerformance([{id:'a',name:'Draft'}],[],[],[]);
 assert.equal(empty.activities[0].paidAmount,0);assert.equal(empty.summary.orderCount,0);
 const report=summarizeActivityPerformance([],[{orderId:'o',applied:{id:'a',name:'Old activity',kind:'activity',discount:0}}],[{id:'o',status:'completed',finalAmount:100,refundRequests:[{status:'approved',amount:200}]}],[]);
 assert.equal(report.summary.paidAmount,0);assert.equal(report.summary.refundedAmount,100);assert.equal(report.activities[0].name,'Old activity');
});
