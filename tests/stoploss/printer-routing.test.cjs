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
function bridge(name,fail=false,hooks={}){const calls=[];const targetCalls=[];const context={Buffer,Math,receiptPrintBusy:false,mainWindow:null,requestReceiptHandover:async()=>true,dialog:{showMessageBox:async()=>({response:0})},writeCrash:()=>{},resolvePrinterName:async n=>{targetCalls.push(n);return exactPrinterName(n,[{name:'Receipt'},{name:'Label'},{name:'Kitchen'}]);},renderTemplateReceipt:async()=>Buffer.from('synthetic raster'),shiftReceiptLayout:data=>data,buildReceiptEscPosBuffer:async()=>Buffer.from('synthetic'),generateReceiptText:()=>'',generateKitchenText:()=>'',generateShiftReportText:()=>'',generateCupStickerTspl:()=>'',generateCupStickerEscPos:()=>'',encodeEscPosText:x=>Buffer.from(x),printViaNetwork:async(...args)=>{calls.push(['network',...args]);if(fail)throw Error('offline');},printViaNetworkRaw:async(...args)=>{calls.push(['network',...args]);if(fail)throw Error('offline');},sendRawBytesToWindowsPrinter:async(n,bytes)=>{calls.push(['raw',n,bytes]);if(fail)throw Error('offline');},printViaComPort:async(n,bytes)=>{calls.push(['com',n,bytes]);if(fail)throw Error('accepted then error');},printViaWindowsRaw:async d=>{calls.push(['text',d.printerName]);if(fail===true)throw Error('offline');},PosPrinter:{sendRawCommand:async n=>{calls.push(['pos',n]);if(fail===true)throw Error('offline');},openCashDrawer:async n=>{calls.push(['drawer',n]);if(fail===true)throw Error('offline');}}};
 Object.assign(context,hooks);
 vm.runInNewContext(ts.transpileModule('globalThis.run='+handlers[name],{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);return {calls,targetCalls,run:data=>context.run({sender:{}},{orderNum:'synthetic',items:[],stickers:[{}],...data})};}
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
  const context={printerInventoryCache:null,printerInventoryPending:null,exactPrinterName,mainWindow:mode==='missing'?null:{isDestroyed:()=>false,webContents:{getPrintersAsync:()=>mode==='failure'?Promise.reject(Error('synthetic enumeration error')):new Promise(()=>{})}},setTimeout:fn=>setTimeout(fn,1),clearTimeout};
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

for (const target of [{printerName:'Receipt'},{printerName:'COM3'},{printerHost:'127.0.0.1',printerPort:9100}]) {
 test('two copies wait for tear-off confirmation on '+JSON.stringify(target),async()=>{
  let confirm,dialogOpened;
  const opened=new Promise(resolve=>{dialogOpened=resolve});
  const gate=new Promise(resolve=>{confirm=resolve});
  const b=bridge('print-receipt',false,{requestReceiptHandover:async (_sender,options)=>{assert.match(options.message,/撕下顾客联/);dialogOpened();return gate;}});
  const pending=b.run({...target,language:'zh',printCopies:2,openCashDrawer:true});
  await opened;
  assert.equal(b.calls.length,1,'operator copy not submitted while employee is tearing off paper');
  assert.equal((await b.run({...target,printCopies:2})).success,false,'another job cannot interleave the copies');
  const byteIndex=target.printerHost?1:2;const first=b.calls[0][byteIndex];assert.ok(first.includes(Buffer.from([0x1b,0x70,0])),'drawer opens with customer copy');
  confirm(true);const result=await pending;
  assert.equal(result.success,true);assert.equal(result.copiesSubmitted,2);assert.equal(b.calls.length,2);
  assert.ok(!b.calls[1][byteIndex].includes(Buffer.from([0x1b,0x70,0])),'operator copy never pulses drawer');
 });
}
test('first-copy transport failure never prompts or sends a second copy',async()=>{
 let prompts=0;const b=bridge('print-receipt',true,{requestReceiptHandover:async()=>{prompts++;return true}});
 const r=await b.run({printerName:'Receipt',printCopies:2});assert.equal(r.success,false);assert.equal(b.calls.length,1);assert.equal(prompts,0);
});
test('interrupted handover retains first submission and releases the printing lock',async()=>{
 const b=bridge('print-receipt',false,{requestReceiptHandover:async()=>false});
 const r=await b.run({printerName:'Receipt',printCopies:2});assert.equal(r.success,false);assert.equal(r.copiesSubmitted,1);assert.equal(b.calls.length,1);
 assert.equal((await b.run({printerName:'Receipt',printCopies:1})).success,true);
});

test('printer inventory cache saves repeated enumeration but still rejects unavailable or wrong targets',async()=>{
 const node=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='resolvePrinterName');let queries=0,now=0,devices=[{name:'Receipt'}];
 const context={Date:{now:()=>now},printerInventoryCache:null,printerInventoryPending:null,exactPrinterName,mainWindow:{isDestroyed:()=>false,webContents:{getPrintersAsync:async()=>{queries++;return devices}}},setTimeout,clearTimeout};
 vm.runInNewContext(ts.transpileModule(node.getText(ast)+';globalThis.resolve=resolvePrinterName',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 assert.equal(await context.resolve('Receipt'),'Receipt');assert.equal(await context.resolve('Receipt'),'Receipt');assert.equal(queries,1);await assert.rejects(context.resolve('Wrong'));now=10001;devices=[];await assert.rejects(context.resolve('Receipt'));assert.equal(queries,2);
});

test('configured templates use shared raster layout, inline images and preserve transport/drawer rules',async()=>{
 let rendered;
 const b=bridge('print-receipt',false,{loadLogoBuffer:async()=>Buffer.from('image'),renderTemplateReceipt:async data=>{rendered=data;return Buffer.from('shared-raster');},buildReceiptEscPosBuffer:async()=>{throw Error('legacy renderer invoked')}});
 const result=await b.run({printerName:'Receipt',paperSize:'80mm',printCopies:1,openCashDrawer:true,storeLogo:'https://example/logo.png',qrCodeUrl:'https://example/qr.png',blocks:[{type:'logo',config:{}},{type:'qrCode',config:{}},{type:'total',style:{bold:true,fontSize:'large'}}]});
 assert.equal(result.success,true);assert.equal(b.calls.length,1);assert.ok(b.calls[0][2].includes(Buffer.from('shared-raster')));assert.ok(b.calls[0][2].includes(Buffer.from([0x1b,0x70,0])));
 assert.match(rendered.blocks[0].config.url,/^data:image/);assert.match(rendered.blocks[1].config.url,/^data:image/);assert.equal(rendered.qrCodeUrl,'');assert.equal(rendered.blocks[2].style.fontSize,'large');
});
test('template render failure cannot silently print a differently formatted fallback',async()=>{
 const b=bridge('print-receipt',false,{renderTemplateReceipt:async()=>{throw Error('render failed')}});
 assert.equal((await b.run({printerName:'Receipt',blocks:[{type:'total'}]})).success,false);assert.equal(b.calls.length,0);
});

test('shift receipt renders once through the order engine for USB, COM and network without drawer pulse',async()=>{
 for(const target of [{printerName:'Receipt'},{printerName:'COM3'},{printerHost:'127.0.0.1',printerPort:9100}]){
  let renders=0;const b=bridge('print-shift-report',false,{shiftReceiptLayout:data=>({...data,blocks:[{type:'summaryRows'}]}),renderTemplateReceipt:async data=>{renders++;assert.equal(data.blocks[0].type,'summaryRows');return Buffer.from('shift-raster')}});
  assert.equal((await b.run({...target,openCashDrawer:true})).success,true);assert.equal(renders,1);assert.equal(b.calls.length,1);
  const bytes=b.calls[0][target.printerHost?1:2];assert.ok(bytes.includes(Buffer.from('shift-raster')));assert.ok(!bytes.includes(Buffer.from([27,112,0])));
 }
});
test('shift render failure sends nothing and cannot fall back to plain text',async()=>{
 const b=bridge('print-shift-report',false,{renderTemplateReceipt:async()=>{throw Error('render failed')},generateShiftReportText:()=>{throw Error('text fallback invoked')}});
 const result=await b.run({printerName:'Receipt'});assert.equal(result.success,false);assert.equal(result.error,'render failed');assert.equal(b.calls.length,0);
});
