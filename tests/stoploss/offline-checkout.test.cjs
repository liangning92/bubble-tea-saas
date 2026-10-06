// Exercise the actual POSPage checkout function, extracted with TypeScript's AST.
// No copied implementation, real API, real IndexedDB, printer or device access.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const source = fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8');
const ast = ts.createSourceFile('POSPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let checkout;
function visit(node) {
 if (ts.isVariableDeclaration(node) && node.name.getText(ast)==='handleCheckout') checkout=node.initializer.getText(ast);
 ts.forEachChild(node,visit);
}
visit(ast);assert.ok(checkout);
const code = ts.transpileModule('globalThis.checkout = '+checkout,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture(save) {
 const events=[];const state={busy:false,failed:false,modal:true};
 const cart=[{productId:'synthetic',productName:'Tea',quantity:1,unitPrice:10000,addons:[]}];
 const context={
  cart,isCheckingOut:false,useOrderStore:{getState:()=>({isCheckingOut:state.busy})},
  paymentMethod:'cash',paidAmount:'20000',paymentSettings:{maxCashAmount:0},qrisData:{status:'idle'},
  selectedChannel:{id:'dine_in',code:'DINE_IN',nameKey:'pos.dineIn'},posChannels:[],dineInCount:1,
  customerCount:1,tableNumber:'7',platformOrderId:'',user:{storeId:'synthetic-store',staff:{id:'synthetic-staff'}},
  total:10000,subtotal:10000,tax:0,discountAmount:0,member:{id:'synthetic-member'},pointsToRedeem:0,
  taxSettings:{enabled:false},paymentModalOrderNum:'T001',appliedPromotion:null,isManualDiscount:false,orderNote:'test',
  hardwareSettings:{autoOpenCashDrawer:false},posReceipt:{autoPrint:true},soundSettings:{error:true},
  t:key=>key,formatCurrency:String,logPOSAction:()=>{},playSoundWithSettings:()=>{},
  showToast:(message,kind)=>events.push(['toast',message,kind]),
  setIsCheckingOut:value=>{state.busy=value;},setOfflineSaveFailed:value=>{state.failed=value;},
  posApi:{createOrder:async()=>{events.push(['api']);throw new Error('synthetic server failure');}},
  db:{orders:{add:async row=>{events.push(['add',row]);return save(row);}}},
  printReceipt:()=>events.push(['receipt']),printKitchenOrder:()=>events.push(['kitchen']),printCupStickers:()=>events.push(['cups']),
  electronAPI:{sendOrderComplete:()=>events.push(['display'])},
  clearCart:()=>{events.push(['clear']);context.cart=[];},
  setShowPaymentModal:value=>{state.modal=value;events.push(['modal',value]);},
  console:{error:()=>{}},
 };
 vm.runInNewContext(code,context);
 return {context,state,events,run:()=>context.checkout()};
}
const completions=events=>events.filter(x=>['receipt','kitchen','cups','display','clear','modal'].includes(x[0]));
const count=(f,name)=>f.events.filter(x=>x[0]===name).length;
test('server failure waits for local commit before saved toast, printing, completion and clearing',async()=>{
 const pending=deferred();const f=fixture(()=>pending.promise);const run=f.run();
 await new Promise(setImmediate);
 assert.equal(f.state.busy,true);assert.equal(count(f,'add'),1);
 assert.equal(completions(f.events).length,0);assert.equal(count(f,'toast'),0);
 pending.resolve(1);await run;
 assert.equal(f.state.busy,false);assert.equal(f.state.failed,false);assert.equal(f.state.modal,false);
 assert.equal(f.events.find(x=>x[0]==='toast')[1].includes('pos.orderSavedOffline'),true);
 for(const name of ['receipt','kitchen','cups','display','clear']) assert.equal(count(f,name),1);
 assert.equal(f.events.find(x=>x[0]==='add')[1].status,'pending');
});
test('both saves fail: no completion, keep all payment/cart context, release busy and show failure',async()=>{
 const f=fixture(()=>Promise.reject(new Error('synthetic quota failure')));
 const snapshot=JSON.stringify({cart:f.context.cart,paid:f.context.paidAmount,member:f.context.member,table:f.context.tableNumber});
 await f.run();
 assert.equal(f.state.busy,false);assert.equal(f.state.failed,true);assert.equal(f.state.modal,true);
 assert.equal(completions(f.events).length,0);
 assert.equal(JSON.stringify({cart:f.context.cart,paid:f.context.paidAmount,member:f.context.member,table:f.context.tableNumber}),snapshot);
 assert.deepEqual(f.events.filter(x=>x[0]==='toast'),[['toast','pos.offlineSaveFailed','error']]);
});
test('same-render repeated clicks and clicks during local save issue one request/save',async()=>{
 const pending=deferred();const f=fixture(()=>pending.promise);
 const first=f.run();const second=f.run();await new Promise(setImmediate);await f.run();
 assert.equal(count(f,'api'),1);assert.equal(count(f,'add'),1);
 pending.resolve(1);await Promise.all([first,second]);
 assert.equal(count(f,'receipt'),1);assert.equal(count(f,'clear'),1);
 await f.run();assert.equal(count(f,'api'),1); // empty cart after completion
});
test('restored storage does not retry automatically; explicit retry can save and clears failure',async()=>{
 let restored=false;const f=fixture(()=>restored?Promise.resolve(1):Promise.reject(new Error('synthetic unavailable')));
 await f.run();assert.equal(f.state.failed,true);
 restored=true;await new Promise(setImmediate);
 assert.equal(count(f,'api'),1);assert.equal(count(f,'add'),1);assert.equal(f.state.modal,true);
 // Manual handler invocation only; this does NOT certify server idempotency/replay safety.
 await f.run();assert.equal(count(f,'api'),2);assert.equal(count(f,'add'),2);
 assert.equal(f.state.failed,false);assert.equal(f.state.busy,false);assert.equal(f.state.modal,false);
 assert.equal(count(f,'receipt'),1);assert.equal(count(f,'clear'),1);
});
test('all three languages include explicit payment caution; persistent alert is wired',()=>{
 const translations=fs.readFileSync('client-pos/src/i18n/index.ts','utf8');
 assert.equal((translations.match(/"offlineSaveFailed":/g)||[]).length,3);
 for(const caution of ['jangan menagih pelanggan lagi','do not charge the customer again','勿向顾客重复收款'])assert.ok(translations.includes(caution));
 assert.match(source,/offlineSaveFailed && \([\s\S]*?role="alert"[\s\S]*?t\('pos.offlineSaveFailed'\)/);
});
