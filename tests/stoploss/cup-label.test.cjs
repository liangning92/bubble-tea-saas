const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});return m.exports;}
const {parsePrinterNames}=load('client-pos/electron/printerInventory.ts');
const {discoverPrinters}=load('client-pos/src/utils/printerDiscovery.ts');
const {cupStickerTspl}=load('client-pos/electron/cupSticker.ts');
test('single Windows queue JSON retains exact name without surrounding quotes',()=>{
 assert.deepEqual(Array.from(parsePrinterNames('"Label Printer(4inch)"')),['Label Printer(4inch)']);
 assert.deepEqual(Array.from(parsePrinterNames('\uFEFF["POS-58","杯贴机"]')),['POS-58','杯贴机']);
 assert.deepEqual(Array.from(parsePrinterNames('')),[]);assert.throws(()=>parsePrinterNames('broken json'));
});
test('startup uses real preload listPrinters and supports legitimate empty/unavailable inventories',async()=>{
 let calls=0;const api={listPrinters:async()=>{calls++;return {printers:['Label Printer(4inch)','POS-58','POS-58']};}};
 assert.deepEqual(Array.from(await discoverPrinters(api)),['Label Printer(4inch)','POS-58']);assert.equal(calls,1);
 assert.deepEqual(Array.from(await discoverPrinters({listPrinters:async()=>({printers:[]})})),[]);
 await assert.rejects(discoverPrinters({listPrinters:async()=>({printers:[],error:'spooler unavailable'})}),/spooler/);
 await assert.rejects(discoverPrinters({}),/unavailable/);
});
test('actual Windows discovery waits for late queue/COM results and includes Electron inventory',async()=>{
 const source=fs.readFileSync('client-pos/electron/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const stmt=ast.statements.find(s=>s.expression&&ts.isCallExpression(s.expression)&&s.expression.arguments[0]?.text==='list-printers');assert.ok(stmt);
 let run,completed=0;
 const context={ipcMain:{handle:(_name,handler)=>{run=handler;}},process:{platform:'win32'},mainWindow:{isDestroyed:()=>false,webContents:{getPrintersAsync:async()=>[{name:'Electron Queue'}]}},setTimeout,clearTimeout,parsePrinterNames,writeCrash:()=>{},require:()=>({execFile:(_exe,args,options,callback)=>{
  assert.equal(options.timeout,10000);assert.equal(options.windowsHide,true);
  const script=args.at(-1);const serial=script.includes('Win32_SerialPort');const label=script.includes('Win32_Printer');
  setTimeout(()=>{completed++;callback(null,JSON.stringify(serial?'COM5':label?'Label Printer(4inch)':'POS-58'));},label?35:1);
 }})};
 vm.runInNewContext(ts.transpileModule(stmt.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 const result=await run();assert.equal(completed,3);assert.equal(result.error,null);
 assert.deepEqual(Array.from(result.printers),['COM5','Electron Queue','Label Printer(4inch)','POS-58']);
});
test('40x30 cup label separates name, cup size, sweetness and ice within paper height',()=>{
 const output=cupStickerTspl({productName:'Milk Tea',specName:'Large 700ml',sugarLevelName:'50%',iceLevelName:'Less Ice',pickupNumber:'A007',cupIndex:2,totalCups:3,addons:[{name:'Boba'}]},'12:34:56');
 for(const field of ['Milk Tea','Large 700ml','Sugar: 50%','Ice: Less Ice','#A007 [2/3]'])assert.ok(output.includes('"'+field+'"'));
 const rows=output.split('\r\n').filter(s=>s.startsWith('TEXT'));
 assert.equal(rows.length,7);for(const row of rows)assert.ok(Number(row.split(',')[1])+24<=240);
 assert.equal(output.split('PRINT 1,1').length,2);
});
test('label gap zero is preserved; quoted/control data cannot inject printer commands',()=>{
 const output=cupStickerTspl({productName:'Tea"\r\nPRINT 999,999',stickerGap:0},'12:34:56');
 assert.ok(output.includes('GAP 0 mm, 0 mm'));assert.equal(output.split('\r\n').filter(s=>s.startsWith('PRINT')).length,1);
 for(const dimensions of [{stickerWidth:10},{stickerHeight:10},{stickerGap:-1}])assert.throws(()=>cupStickerTspl(dimensions,'12:34:56'),/dimensions/);
});
