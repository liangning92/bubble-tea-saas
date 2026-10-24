const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require,Buffer,Date});return m.exports;}
const {shiftReceiptLayout}=load('client-pos/electron/shiftReceiptLayout.ts'),{receiptHtml}=load('client-pos/electron/receiptLayout.ts');
const {handoverReceiptFields:fields}=load('shared/utils/handoverReceipt.ts');
const fixture={language:'en',paperSize:'58mm',storeName:'Store Test',sessionId:'session-test',cashierName:'Cashier Test',shiftType:'evening',openedAt:'2026-10-20T11:30:33Z',closedAt:'2026-10-20T16:31:00Z',printedAt:'2026-10-20T16:31:01Z',handoverFinancials:{totalRevenue:773685,actualCashReceived:369000,expenses:0},openFloat:600000,actualCash:969000,manualReceipts:{cash:369000,qris:78000,shopeefood:144930,gofood:179755},summaryEvidence:{orderCount:21,cupCount:41,activityDiscountAmount:2000,totalDiscountAmount:3000,activityOrders:[{orderNumber:'ORD-1',pickupNumber:'A01',activityName:'Happy Hour',totalDiscountAmount:2000}]},purchaseExpenses:{items:[{category:'Supplies',quantity:1,amount:12000,description:'Expense note'}],total:12000}};
const off=Object.fromEntries(fields.map(k=>[k,false]));
test('every configurable field independently produces content, all-off leaves only the report title',()=>{
 const empty=shiftReceiptLayout({...fixture,receiptItems:off});assert.equal(empty.blocks.length,1);assert.equal(empty.blocks[0].config.text,'SHIFT HANDOVER');
 for(const field of fields){const result=shiftReceiptLayout({...fixture,receiptItems:{...off,[field]:true}});assert.ok(result.blocks.length>1,field);assert.ok(!result.blocks.some((b,i)=>b.type==='divider'&&(!result.blocks[i+1]||result.blocks[i+1].type==='divider')),field);}
});
test('selected values retain exact amounts, explicit zero, unknown evidence, Jakarta time and legacy precedence',()=>{
 const html=receiptHtml(shiftReceiptLayout(fixture));
 for(const text of ['Rp 773.685','Rp 369.000','Rp 600.000','Rp 969.000','Rp 0','Rp 78.000','Rp 144.930','Rp 179.755','20/10/2026 18:30:33'])assert.ok(html.includes(text),text);
 const unknown=receiptHtml(shiftReceiptLayout({...fixture,handoverFinancials:{},summaryEvidence:{},openedAt:'invalid'}));assert.ok(unknown.includes('Unverified'));assert.ok(!unknown.includes('NaN'));
 const hidden=receiptHtml(shiftReceiptLayout({...fixture,summaryItems:{revenue:false},receiptItems:{cashReceived:false}}));assert.ok(!hidden.includes('773.685'));assert.ok(!hidden.includes('>Cash</span>'));
 assert.ok(receiptHtml(shiftReceiptLayout({...fixture,summaryItems:{revenue:false},receiptItems:{revenue:true}})).includes('773.685'));
});
test('drawer-total receipts never duplicate cash and hidden groups do not leak values',()=>{
 const html=receiptHtml(shiftReceiptLayout({...fixture,manualReceiptsCashBasis:'drawer_total'}));assert.ok(!html.includes('Cash receipts'));
 const hidden=receiptHtml(shiftReceiptLayout({...fixture,receiptItems:off}));for(const value of ['773.685','Cashier Test','session-test','969.000','Expense note','Cashier sign','Supervisor sign'])assert.ok(!hidden.includes(value));
});
test('order renderer safely wraps shift metadata, expenses and signatures for both widths and all languages',()=>{
 for(const paperSize of ['58mm','80mm'])for(const language of ['zh','id','en']){
  const html=receiptHtml(shiftReceiptLayout({...fixture,paperSize,language,cashierName:'<script>bad</script>',purchaseExpenses:{total:0,items:[{category:'<b>supplies</b>',quantity:2,amount:0,description:'<img onerror=bad> & long note'}]}}));
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('signature-grid'));assert.ok(html.includes('summary-row metadata'));assert.ok(html.includes('summary-note'));assert.ok(html.includes('Rp 0'));
 }
});
