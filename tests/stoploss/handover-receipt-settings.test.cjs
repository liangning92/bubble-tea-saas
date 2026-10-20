const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const text = fs.readFileSync('client-pos/electron/main.ts','utf8');
const tree = ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true);
const functions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && ['generateShiftReportText','getVisualWidth','padStartVisual','repeatChar','formatRp'].includes(n.name?.text)).map(n => n.getText(tree)).join('\n');
const scope = {};
vm.runInNewContext(ts.transpileModule(functions+'\nglobalThis.print=generateShiftReportText',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/utils/handoverReceipt.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject});
const {handoverReceiptFields:fields, resolveHandoverReceiptItems:resolve} = exportsObject;
const labels = ['Store name marker','Session reference','Cashier','Shift','Opened','Closed','Printed','Revenue','Cash','Drawer expenses','Opening float','Drawer total','Cash receipts','QRIS receipts','ShopeeFood receipts','GoFood receipts','Completed orders','Item quantity','SHIFT DRAWER EXPENSES','Cashier sign:','Supervisor sign:'];
const data = {language:'en',paperSize:'80mm',storeName:'Store name marker',sessionId:'REF',cashierName:'Staff',shiftType:'morning',openFloat:100,actualCash:150,handoverFinancials:{totalRevenue:200,actualCashReceived:50,expenses:30},manualReceipts:{cash:50,qris:70,shopeefood:40,gofood:40},summaryEvidence:{orderCount:3,cupCount:4},purchaseExpenses:{total:30,items:[{category:'Cups',quantity:2,amount:30}]}};
test('each receipt field can independently show/hide without changing financial calculations',()=>{
  fields.forEach((field,index)=>{
    const items = Object.fromEntries(fields.map(k=>[k,false]));items[field]=true;
    const shown=scope.print({...data,receiptItems:items});assert.ok(shown.includes(labels[index]),field);
    items[field]=false;assert.ok(!scope.print({...data,receiptItems:items}).includes(labels[index]),field);
  });
  const out=scope.print({...data,receiptItems:{openFloat:false,cashReceipts:false}});
  assert.match(out,/Revenue\s+Rp 200/);assert.match(out,/Drawer total\s+Rp 150/);
});
test('legacy defaults and explicit current print settings override saved old summary switches',()=>{
  assert.equal(resolve({summaryItems:{cashReceipts:false}}).cashReceipts,false);
  assert.equal(resolve({summaryItems:{cashReceipts:false},receiptItems:{cashReceipts:true}}).cashReceipts,true);
  assert.ok(scope.print({...data,summaryItems:{cashReceipts:false},receiptItems:resolve({receiptItems:{cashReceipts:true}})}).includes('Cash receipts'));
  assert.ok(!scope.print({...data,summaryItems:{cashReceipts:true},receiptItems:resolve({receiptItems:{cashReceipts:false}})}).includes('Cash receipts'));
});
test('all languages and both paper sizes remain within printable width and retain the handover title',()=>{
  for(const language of ['zh','en','id'])for(const paperSize of ['58mm','80mm']) {
    const out=scope.print({...data,language,paperSize,summaryEvidence:{verified:false},receiptItems:Object.fromEntries(fields.map(k=>[k,false]))});
    assert.ok(out.replace(/\n/g,'').includes(language==='zh'?'交接班记录':language==='en'?'SHIFT HANDOVER':'SERAH TERIMA SHIFT'));
    out.split('\n').forEach(line=>assert.ok([...line].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?2:1),0)<=(paperSize==='80mm'?48:32)));
  }
});

test('selected drawer expense amount and details describe the actual cash deduction',()=>{const out=scope.print({...data,receiptItems:{expenseAmount:true,expenses:true}});assert.match(out,/Drawer expenses\s+Rp 30/);assert.ok(out.includes('Cups x2'));assert.ok(out.replace(/\s+/g,'').includes('deductedfromhandovercash'));assert.ok(!out.includes('cash payout separate'));});

const component = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/src/components/ShiftHandoverPreview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:component.exports,module:component,require:id=>id==='react-i18next'?{useTranslation:()=>({t:key=>key,i18n:{language:'en'}})}:id.endsWith('/handoverReceipt')?exportsObject:id.endsWith('/shiftCashReconciliation')?{formatShiftCash:amount=>'Rp '+amount}:require(id)
});
const renderPreview = settings => require('react-dom/server').renderToStaticMarkup(require('react').createElement(component.exports.ShiftHandoverPreview,{settings,data:{shift:{openedAt:'2026-10-20T11:30:00Z',openFloat:600000},cashReconciliation:{revenue:449000,expenses:35000},summaryEvidence:{orderCount:38,cupCount:41},purchaseExpenses:{total:35000,items:[{category:'Cups',amount:35000}]}},actualCash:969000,receipts:{qris:78000,shopeefood:144930,gofood:179755},cashierName:'Staff marker',shiftName:'Evening marker'}));
test('confirmation respects the same saved field switches as the receipt, including revenue off',()=>{
 const mapping={revenue:'revenue',cashReceived:'cash',openFloat:'openFloat',closeCash:'drawerTotal',expenseAmount:'expenses',qrisReceipts:'qris',shopeefoodReceipts:'shopeefood',gofoodReceipts:'gofood',orderCount:'orderCount',cupCount:'cupCount'};
 for(const [field,key] of Object.entries(mapping)){
   const items=Object.fromEntries(fields.map(k=>[k,false]));items[field]=true;
   assert.ok(renderPreview({receiptItems:items}).includes('data-testid="handover-'+key+'"'),field);
   items[field]=false;
   assert.ok(!renderPreview({receiptItems:items}).includes('data-testid="handover-'+key+'"'),field);
 }
 const html=renderPreview({receiptItems:{revenue:false,sessionId:false,orderCount:false,expenses:false}});
 assert.ok(!html.includes('handover-revenue'));assert.ok(html.includes('Rp 369000'));assert.ok(html.includes('Rp 969000'));assert.ok(html.includes('handover-cupCount'));assert.ok(!html.includes('handover-expense-details'));
 assert.equal(resolve({receiptItems:{revenue:false}}).revenue,false);
});
test('confirmation metadata and expense details respect switches and selected amounts retain print formulas',()=>{
 const hidden=renderPreview({receiptItems:{cashierName:false,openedAt:false,shiftType:false,expenses:false}});
 assert.ok(!hidden.includes('Staff marker'));assert.ok(!hidden.includes('Evening marker'));assert.ok(!hidden.includes('handover-expense-details'));
 const shown=renderPreview({receiptItems:{expenses:true}});
 assert.ok(shown.includes('Cups'));assert.ok(shown.includes('Rp 773685'));assert.ok(shown.includes('Rp 35000'));
});
