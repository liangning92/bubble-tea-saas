const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8'),ast=ts.createSourceFile('POSPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
(function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='printReceipt')fn=node.initializer.getText(ast);ts.forEachChild(node,visit)})(ast);
function setup(){const saved=[],sent=[],toasts=[];const ctx={
 logPOSAction:()=>{},appVersion:'synthetic',user:{storeId:'store',staff:{name:'Cashier'}},electronAPI:{sendPrintReceipt:()=>{}},printerTarget:()=>({printerName:'synthetic'}),
 buildDiscountBreakdown:()=>({lines:[]}),currentQuote:null,pointsDiscount:0,manualDiscountAmount:0,getPrintBlocks:()=>[],receiptTemplate:null,posReceipt:{printCopies:2},storeInfo:{},getPrintLogo:()=>null,
 lang:'en',getChannelDisplayName:()=> 'Dine In',selectedChannel:{code:'DINE_IN'},tableNumber:'7',member:null,hardwareSettings:{},cart:[{productId:'tea',productName:'Tea',specName:'Regular',quantity:1,unitPrice:10000,addons:[]}],
 subtotal:10000,tax:0,discountAmount:0,appliedPromotion:null,isManualDiscount:false,total:10000,paymentMethods:[],paymentMethod:'cash',paidAmount:'20000',change:10000,pointsToRedeem:0,t:key=>key,
 db:{config:{put:async row=>saved.push(structuredClone(row))}},currentBackendIdentity:()=> 'https://synthetic.invalid/api',
 submitSavedReceipt:(key)=>{sent.push(key);return new Promise(()=>{})},showToast:(...args)=>toasts.push(args),console,Date,
 };vm.runInNewContext(ts.transpileModule('globalThis.print='+fn,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,ctx);return {ctx,saved,sent,toasts};}
test('checkout releases after saving exact receipt even when printer never responds',async()=>{
 const f=setup();assert.equal(await f.ctx.print('ORDER-1',{pickupNumber:'A001',openCashDrawer:true}),true);
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].value.payload.items[0].productName,'Tea');assert.equal(f.saved[0].value.payload.openCashDrawer,true);assert.equal(f.sent.length,1);
 f.ctx.cart=[];assert.equal(f.saved[0].value.payload.items.length,1);
});
test('two customers buying identical products keep independent receipt identities while printer is stalled',async()=>{
 const f=setup();await f.ctx.print('ORDER-1',{pickupNumber:'A001'});await f.ctx.print('ORDER-2',{pickupNumber:'A002'});
 assert.equal(f.sent.length,2);assert.equal(new Set(f.saved.map(row=>row.key)).size,2);assert.deepEqual(f.saved.map(row=>row.value.payload.pickupNumber),['A001','A002']);
});
test('receipt snapshot storage failure reports output failure without submitting to printer',async()=>{
 const f=setup();f.ctx.console={warn:()=>{}};f.ctx.db.config.put=async()=>{throw Error('quota')};assert.equal(await f.ctx.print('ORDER-1',{}),false);assert.equal(f.sent.length,0);
});
