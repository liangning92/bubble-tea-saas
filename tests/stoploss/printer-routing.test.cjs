const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});return m.exports;}
const {selectPrinter}=load('client-pos/src/utils/printerRouting.ts'),{exactPrinterName}=load('client-pos/electron/printerTarget.ts');
const p=(type,name,enabled=true)=>({type,printerName:name,enabled});
test('automatic same-purpose default skips disabled records, explicit selection never changes purpose or disabled state',()=>{
 const hw={printers:[p('receipt','Disabled',false),p('label','Label'),p('receipt','Receipt'),p('receipt','Backup')]};
 assert.equal(selectPrinter(hw,'receipt').target.printerName,'Receipt');
 assert.equal(selectPrinter(hw,'receipt','Backup').target.printerName,'Backup');
 for(const name of ['Disabled','Label','Unknown'])assert.equal(selectPrinter(hw,'receipt',name).ok,false);
});
test('authoritative all-off/empty/invalid list never resurrects a legacy name; missing list supports only explicit legacy receipt',()=>{
 for(const printers of [[],[p('receipt','Old',false)],null,[null]])assert.equal(selectPrinter({printers,printerName:'Old'},'receipt').ok,false);
 assert.equal(selectPrinter({printers:[p('receipt',42)]},'receipt').ok,false);assert.equal(selectPrinter({printerName:42},'receipt').ok,false);
 assert.equal(selectPrinter({},'receipt').ok,false);assert.equal(selectPrinter({printerName:'Old'},'receipt').target.printerName,'Old');
 assert.equal(selectPrinter({printerName:'Old'},'label').ok,false);
});
test('invalid first enabled target never falls through to backup; network resolves only its host/port',()=>{
 assert.equal(selectPrinter({printers:[p('receipt',''),p('receipt','Backup')]},'receipt').ok,false);
 const hw={printers:[{...p('receipt','Network'),connectionType:'network',printerIp:'127.0.0.1',printerPort:9101}]};
 const target=selectPrinter(hw,'receipt').target;assert.equal(target.printerName,undefined);assert.equal(target.printerHost,'127.0.0.1');assert.equal(target.printerPort,9101);
 for(const printerPort of [0,65536,1.5])assert.equal(selectPrinter({printers:[{...hw.printers[0],printerPort}]},'receipt').ok,false);
});
test('bridge name resolution is exact; no fuzzy/system default/first-device; direct COM/UNC names retained',()=>{
 const list=[{name:'Office',isDefault:true},{name:'POS-80 Series'}];
 for(const name of ['',undefined,'POS-80','Missing'])assert.throws(()=>exactPrinterName(name,list));
 assert.equal(exactPrinterName('pos-80 series',list),'POS-80 Series');assert.equal(exactPrinterName('COM3',[]),'COM3');assert.equal(exactPrinterName('\\\\server\\printer',[]),'\\\\server\\printer');
 assert.throws(()=>exactPrinterName('COM3-other',[]));
});
// Execute the actual IPC handlers with transport stand-ins, not the Electron application's startup.
const text=fs.readFileSync('client-pos/electron/main.ts','utf8'),ast=ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true);
const handlers={};for(const stmt of ast.statements){const call=stmt.expression;if(call&&ts.isCallExpression(call)&&call.expression.getText(ast)==='ipcMain.handle'&&ts.isStringLiteral(call.arguments[0]))handlers[call.arguments[0].text]=call.arguments[1].getText(ast);}
function bridge(name,fail=false){const calls=[];const targetCalls=[];const context={Buffer,Math,writeCrash:()=>{},resolvePrinterName:async n=>{targetCalls.push(n);return exactPrinterName(n,[{name:'Receipt'},{name:'Label'},{name:'Kitchen'}]);},buildReceiptEscPosBuffer:async()=>Buffer.from('synthetic'),generateReceiptText:()=>'',generateKitchenText:()=>'',generateShiftReportText:()=>'',generateCupStickerTspl:()=>'',generateCupStickerEscPos:()=>'',encodeEscPosText:x=>Buffer.from(x),printViaNetwork:async(...args)=>{calls.push(['network',...args]);if(fail)throw Error('offline');},printViaNetworkRaw:async(...args)=>{calls.push(['network',...args]);if(fail)throw Error('offline');},sendRawBytesToWindowsPrinter:async(n)=>{calls.push(['raw',n]);if(fail)throw Error('offline');},printViaComPort:async n=>{calls.push(['com',n]);if(fail)throw Error('accepted then error');},printViaWindowsRaw:async d=>{calls.push(['text',d.printerName]);if(fail===true)throw Error('offline');},PosPrinter:{sendRawCommand:async n=>{calls.push(['pos',n]);if(fail===true)throw Error('offline');},openCashDrawer:async n=>{calls.push(['drawer',n]);if(fail===true)throw Error('offline');}}};
 vm.runInNewContext(ts.transpileModule('globalThis.run='+handlers[name],{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);return {calls,targetCalls,run:data=>context.run(null,{orderNum:'synthetic',items:[],stickers:[{}],...data})};}
for(const name of ['print-receipt','open-cash-drawer','send-kitchen-order','print-shift-report','print-cup-stickers']){
 test(name+': missing named device rejected without transport; network failure never sends local',async()=>{
  const missing=bridge(name);assert.equal((await missing.run({printerName:'Missing'})).success,false);assert.equal(missing.calls.length,0);
  const net=bridge(name,true);assert.equal((await net.run({printerHost:'127.0.0.1',printerPort:9100,printerName:'Receipt'})).success,false);assert.equal(net.calls.length,1);assert.equal(net.calls[0][0],'network');assert.equal(net.targetCalls.length,0);
 });
}
test('local print failure does not automatically retry; deliberate retry keeps target and order number',async()=>{
 const b=bridge('print-receipt',true);const data={printerName:'Receipt',orderNum:'paid-synthetic'};assert.equal((await b.run(data)).success,false);assert.equal((await b.run(data)).success,false);assert.equal(b.calls.length,2);assert.ok(b.calls.every(c=>c[1]==='Receipt'));
});
test('actual bridge resolver fails closed on missing inventory, enumeration failure and timeout',async()=>{
 const node=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='resolvePrinterName');assert.ok(node);
 for(const mode of ['missing','failure','timeout']){
  const context={exactPrinterName,mainWindow:mode==='missing'?null:{isDestroyed:()=>false,webContents:{getPrintersAsync:()=>mode==='failure'?Promise.reject(Error('synthetic enumeration error')):new Promise(()=>{})}},setTimeout:fn=>setTimeout(fn,1),clearTimeout};
  vm.runInNewContext(ts.transpileModule(node.getText(ast)+';globalThis.resolve=resolvePrinterName',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
  await assert.rejects(context.resolve('Receipt'));
 }
});

// Full actual cache initializer -> selection: no mirrored receipt_printer_name.
const posSource=fs.readFileSync('client-pos/src/pages/POSPage.tsx','utf8'),posAst=ts.createSourceFile('POSPage.tsx',posSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let initializer;
function findInitializer(n){if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.name.elements[0]?.name?.getText(posAst)==='hardwareSettings')initializer=n.initializer.arguments[0].getText(posAst);ts.forEachChild(n,findInitializer);}findInitializer(posAst);assert.ok(initializer);
function initialized(settings){const context={window:{},localStorage:{getItem:k=>k==='hardware_settings'?JSON.stringify(settings):null},console};vm.runInNewContext(ts.transpileModule('globalThis.init='+initializer,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);return context.init();}
test('complete legacy initialization preserves explicit exact USB name without mirror; []/off/invalid remain refused',()=>{
 const legacy={printerName:'Exact Legacy Receipt',printerConnectionType:'usb'};const selected=selectPrinter(initialized(legacy),'receipt');assert.equal(selected.ok,true);assert.equal(selected.target.printerName,'Exact Legacy Receipt');
 for(const printers of [[],[p('receipt','Exact Legacy Receipt',false)],null,[null]])assert.equal(selectPrinter(initialized({...legacy,printers}),'receipt').ok,false);
 assert.equal(selectPrinter(initialized({}),'receipt').ok,false);
 const net=selectPrinter(initialized({...legacy,printerConnectionType:'network',printerIp:'127.0.0.1',printerPort:9101}),'receipt');assert.equal(net.target.printerHost,'127.0.0.1');assert.equal(net.target.printerName,undefined);
});
for(const name of ['print-receipt','open-cash-drawer','send-kitchen-order','print-shift-report','print-cup-stickers'])test(name+': accepted-then-error submits once, returns unconfirmed, never secondary protocol/pulse',async()=>{
 const b=bridge(name,'accepted');const result=await b.run({printerName:'Receipt',openCashDrawer:true,orderNum:'paid-synthetic'});
 assert.equal(result.success,false);assert.equal(result.deliveryStatus,'unconfirmed');assert.equal(b.calls.length,1);assert.equal(b.calls[0][0],'raw');
});
