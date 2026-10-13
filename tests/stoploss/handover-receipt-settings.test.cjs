const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const text = fs.readFileSync('client-pos/electron/main.ts','utf8');
const tree = ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true);
const functions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && ['generateShiftReportText','getVisualWidth','padStartVisual','repeatChar','formatRp'].includes(n.name?.text)).map(n => n.getText(tree)).join('\n');
const scope = {};
vm.runInNewContext(ts.transpileModule(functions+'\nglobalThis.print=generateShiftReportText',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/utils/handoverReceipt.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject});
const {handoverReceiptFields:fields, resolveHandoverReceiptItems:resolve} = exportsObject;
const labels = ['Store name marker','Session reference','Cashier','Shift','Opened','Closed','Printed','Opening float','Recorded cash sales','Recorded QRIS','Recorded cash in','Recorded cash out','Recorded cash balance','Counted cash','Expected cash','Variance','Completed orders','Item quantity','SHIFT PURCHASE EXPENSES','Cashier sign:','Supervisor sign:'];
const data = {language:'en',paperSize:'80mm',storeName:'Store name marker',sessionId:'REF',cashierName:'Staff',shiftType:'morning',openFloat:100,actualCash:150,expectedCash:150,summaryEvidence:{verified:true,cashSales:50,cashIns:0,cashOuts:0,qrisReceipts:90,orderCount:3,cupCount:4},purchaseExpenses:{total:30,items:[{category:'Cups',quantity:2,amount:30}]}};
test('each receipt field can independently show/hide without changing financial calculations',()=>{
  fields.forEach((field,index)=>{
    const items = Object.fromEntries(fields.map(k=>[k,false]));items[field]=true;
    const shown=scope.print({...data,receiptItems:items});assert.ok(shown.includes(labels[index]),field);
    items[field]=false;assert.ok(!scope.print({...data,receiptItems:items}).includes(labels[index]),field);
  });
  const out=scope.print({...data,receiptItems:{openFloat:false,cashSales:false}});
  assert.match(out,/Recorded cash balance\s+Rp 150/);assert.match(out,/Expected cash\s+Rp 150/);
});
test('legacy defaults and explicit current print settings override saved old summary switches',()=>{
  assert.equal(resolve({summaryItems:{cashSales:false}}).cashSales,false);
  assert.equal(resolve({summaryItems:{cashSales:false},receiptItems:{cashSales:true}}).cashSales,true);
  assert.ok(scope.print({...data,summaryItems:{cashSales:false},receiptItems:resolve({receiptItems:{cashSales:true}})}).includes('Recorded cash sales'));
  assert.ok(!scope.print({...data,summaryItems:{cashSales:true},receiptItems:resolve({receiptItems:{cashSales:false}})}).includes('Recorded cash sales'));
});
test('all languages and both paper sizes remain within printable width and retain uncertainty notices',()=>{
  for(const language of ['zh','en','id'])for(const paperSize of ['58mm','80mm']) {
    const out=scope.print({...data,language,paperSize,summaryEvidence:{verified:false},receiptItems:Object.fromEntries(fields.map(k=>[k,false]))});
    assert.ok(out.replace(/\n/g,'').includes(language==='zh'?'待核对':language==='en'?'unverified':'perlu diperiksa'));
    out.split('\n').forEach(line=>assert.ok([...line].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?2:1),0)<=(paperSize==='80mm'?48:32)));
  }
});
