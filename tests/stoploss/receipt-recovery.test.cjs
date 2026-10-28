const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(){let row={key:'receipt-print:store:paid-order',value:{status:'failed',payload:{orderNum:'paid-order',total:9000,openCashDrawer:true,printCopies:2},attemptedAt:new Date(0)},updatedAt:new Date()},lock=Promise.resolve(),deadline,queueDeadline;
 const db={config:{get:async()=>structuredClone(row),put:async value=>{row=structuredClone(value)}},transaction:(_mode,_table,fn)=>{const result=lock.then(fn);lock=result.catch(()=>{});return result}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/src/utils/receiptRecovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:()=>({db}),Date,Promise,setTimeout:(fn,delay)=>{if(delay===30000)queueDeadline=fn;else deadline=fn;return 1},clearTimeout:()=>{}});return {...exports,row:()=>row,deadline:()=>deadline(),queueDeadline:()=>queueDeadline()}
}
test('recovery sends the saved paid receipt once, suppresses drawer and additional copies, and serializes competing requests',async()=>{
 const ctx=setup();let release,calls=0;const sent=new Promise(resolve=>release=resolve),audit=[];
 const first=ctx.submitSavedReceipt('key',async payload=>{calls++;assert.equal(payload.orderNum,'paid-order');assert.equal(payload.total,9000);assert.equal(payload.openCashDrawer,false);assert.equal(payload.printCopies,1);await sent;return {success:true}},status=>audit.push(status),true);
 await new Promise(resolve=>setImmediate(resolve));await assert.rejects(ctx.submitSavedReceipt('key',()=>{calls++;return {success:true}},()=>{},true),/STILL_PROCESSING/);release();await first;assert.equal(calls,1);assert.equal(ctx.row().value.status,'sent');assert.deepEqual(audit,['pending','sent']);
});
test('a late native success replaces uncertain UI timeout; timeout never resubmits',async()=>{
 const ctx=setup();let release,calls=0;const native=new Promise(resolve=>release=resolve);
 const pending=ctx.submitSavedReceipt('key',()=>{calls++;return native},()=>{},true);await new Promise(resolve=>setImmediate(resolve));ctx.deadline();const result=await pending;assert.equal(result.deliveryStatus,'unconfirmed');assert.equal(ctx.row().value.status,'unknown');release({success:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(ctx.row().value.status,'sent');assert.equal(calls,1)
});
test('partial or uncertain printer acceptance always requires paper verification, including old failed transport records',()=>{
 const ctx=setup();assert.equal(ctx.receiptResultStatus({success:false,copiesSubmitted:1}),'unknown');assert.equal(ctx.receiptResultStatus({success:false,deliveryStatus:'unconfirmed'}),'unknown');assert.equal(ctx.receiptNeedsPaperCheck({status:'failed',error:'Print delivery unconfirmed: timeout'}),true);assert.equal(ctx.receiptNeedsPaperCheck({status:'failed',error:'RECEIPT_PAINT_TIMEOUT'}),false);assert.equal(ctx.receiptNeedsPaperCheck({status:'pending'}),true);assert.equal(ctx.receiptNeedsPaperCheck({status:'failed',error:'RECEIPT_QUEUE_EXPIRED'}),false)
});

test('initial multi-copy printing has a deadline and records late success without resubmitting',async()=>{
 const ctx=setup();let release,calls=0;
 const pending=ctx.submitSavedReceipt('key',payload=>{calls++;assert.equal(payload.printCopies,2);return new Promise(resolve=>release=resolve)},()=>{});
 await new Promise(resolve=>setImmediate(resolve));ctx.deadline();
 assert.equal((await pending).deliveryStatus,'unconfirmed');assert.equal(calls,1);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(ctx.row().value.status,'unknown');
 release({success:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(ctx.row().value.status,'sent');assert.equal(calls,1);
});
test('a UI deadline does not allow a second send while the original native request is still active',async()=>{
 const ctx=setup();let release,calls=0;const pending=ctx.submitSavedReceipt('key',()=>{calls++;return new Promise(resolve=>release=resolve)},()=>{},true);
 await new Promise(resolve=>setImmediate(resolve));ctx.deadline();await pending;
 await assert.rejects(ctx.submitSavedReceipt('key',async()=>{calls++;return {success:true}},()=>{},true),/STILL_PROCESSING/);
 release({success:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
});
test('different receipt jobs wait for native completion instead of racing the Windows busy guard',async()=>{
 const ctx=setup();let release;const events=[];
 const first=ctx.submitSavedReceipt('first',()=>{events.push('first');return new Promise(resolve=>release=resolve)},()=>{});
 await new Promise(resolve=>setImmediate(resolve));const second=ctx.submitSavedReceipt('second',async()=>{events.push('second');return {success:true}},()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['first']);release({success:true});await Promise.all([first,second]);assert.deepEqual(events,['first','second']);
});

test('queued receipt expires without sending while a stalled native job retains its single active slot',async()=>{
 const ctx=setup();let release;const calls=[];
 const first=ctx.submitSavedReceipt('first',()=>{calls.push('first');return new Promise(resolve=>release=resolve)},()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 const expired=ctx.submitSavedReceipt('expired',async()=>{calls.push('expired');return {success:true}},()=>{});
 await new Promise(resolve=>setImmediate(resolve));ctx.queueDeadline();assert.equal((await expired).deliveryStatus,'not-sent');assert.deepEqual(calls,['first']);
 const next=ctx.submitSavedReceipt('next',async()=>{calls.push('next');return {success:true}},()=>{});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['first']);release({success:true});await Promise.all([first,next]);assert.deepEqual(calls,['first','next']);
});
