const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderer}=require('./receipt-renderer.test.cjs');
const width=text=>Array.from(text).reduce((sum,ch)=>sum+(ch.codePointAt(0)>255?2:1),0);
const report={reportKind:'handover',storeName:'YOUME',cashierName:'Store cashier',shiftType:'morning',shiftNames:{name:'Morning',nameId:'Pagi',nameZh:'早班'},openedAt:'2026-10-08T12:46:53Z',closedAt:'2026-10-08T16:19:58Z',openFloat:420000,actualCash:0,expectedCash:792000,summaryEvidence:{verified:false,cashSales:372000,qrisReceipts:0,cashIns:0,cashOuts:0,orderCount:19,cupCount:25},purchaseExpenses:{total:0,items:[]}};
test('58/80mm and all receipt languages fit physical columns without splitting timestamps or amounts',()=>{
 for(const paperSize of ['58mm','80mm'])for(const language of ['id','en','zh']){
  const text=renderer().shift({...report,paperSize,language});
  for(const line of text.split('\n'))assert.ok(width(line)<=(paperSize==='80mm'?48:32),line);
  assert.match(text,/08\/10\/2026\s+19:46:53/);assert.match(text,/08\/10\/2026\s+23:19:58/);
  assert.ok(text.includes('Rp 372.000'));assert.ok(text.includes('Rp 792.000'));assert.ok(!text.includes('Rp -792.000'));assert.ok(text.includes('25'));
 }
});
test('missing financial values never become zero or a staff shortage; deliberate zero count is retained',()=>{
 let text=renderer().shift({paperSize:'58mm',language:'en',actualCash:null,expectedCash:792000,totalCups:19});
 assert.ok(!text.includes('Rp 0'));assert.ok(!text.includes('792.000'));assert.ok(!text.includes('19'));assert.ok(text.includes('Unverified'));
 text=renderer().shift({...report,paperSize:'58mm',language:'en',summaryEvidence:{...report.summaryEvidence,verified:true}});
 assert.ok(text.includes('Rp -792.000'),'only a verified, complete, consistent balance permits a shortage');
 text=renderer().shift({...report,paperSize:'58mm',language:'en',expectedCash:900000,summaryEvidence:{...report.summaryEvidence,verified:true}});
 assert.ok(!text.includes('Rp -900.000'),'inconsistent balances are not reconciled');
});
