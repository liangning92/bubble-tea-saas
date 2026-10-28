const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{EventEmitter}=require('node:events');
function setup(){
 const ipcMain=new EventEmitter(),m={exports:{}};let expire;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('client-pos/electron/receiptHandover.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,setTimeout:fn=>{expire=fn;return 1},clearTimeout:()=>{},require:name=>name==='electron'?{ipcMain}:require(name)});
 class Sender extends EventEmitter{isDestroyed(){return false}send(channel,prompt){this.channel=channel;this.prompt=prompt}}
 return {ipcMain,Sender,request:m.exports.requestReceiptHandover,expire:()=>expire()};
}
test('only matching job and sender can release next copy; duplicate responses cannot release future jobs',async()=>{
 const {ipcMain,Sender,request}=setup(),sender=new Sender(),other=new Sender();let finished=false;
 const p=request(sender,{orderNum:'A01'}).then(result=>{finished=true;return result}),id=sender.prompt.requestId;
 assert.equal(sender.channel,'receipt-handover-request');ipcMain.emit('receipt-handover-response',{sender:other},{requestId:id,confirmed:true});ipcMain.emit('receipt-handover-response',{sender},{requestId:'old',confirmed:true});ipcMain.emit('receipt-handover-response',{sender},{requestId:id,confirmed:'true'});await Promise.resolve();assert.equal(finished,false);
 ipcMain.emit('receipt-handover-response',{sender},{requestId:id,confirmed:true});assert.equal(await p,true);assert.equal(sender.listenerCount('destroyed'),0);
 const second=request(sender,{orderNum:'A02'});ipcMain.emit('receipt-handover-response',{sender},{requestId:id,confirmed:true});assert.notEqual(sender.prompt.requestId,id);ipcMain.emit('receipt-handover-response',{sender},{requestId:sender.prompt.requestId,confirmed:false});assert.equal(await second,false);
});
for(const event of ['destroyed','render-process-gone','did-navigate'])test(event+' cancels remaining copies and cleans up pending listeners',async()=>{
 const {Sender,request}=setup(),sender=new Sender(),p=request(sender,{orderNum:'A01'});sender.emit(event);assert.equal(await p,false);for(const name of ['destroyed','render-process-gone','did-navigate'])assert.equal(sender.listenerCount(name),0);
});
test('unavailable renderer returns cancellation without sending',async()=>{
 const {request}=setup();assert.equal(await request(null,{}),false);assert.equal(await request({isDestroyed:()=>true},{}),false);assert.equal(await request(Object.assign(new (setup().Sender)(),{send(){throw Error('closed')}}),{}),false);
});

test('unanswered handover releases native receipt busy state by cancelling remaining copies',async()=>{const ctx=setup(),sender=new ctx.Sender(),pending=ctx.request(sender,{orderNum:'A01'});ctx.expire();assert.equal(await pending,false);assert.equal(sender.listenerCount('destroyed'),0)});
