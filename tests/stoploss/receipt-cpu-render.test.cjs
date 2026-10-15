const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
function compile(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>imports[name]??require(name),Buffer,setTimeout,clearTimeout});return exports}
test('receipts render without paint events; fresh renderer retries only a pre-transport failure and recovers next sale',async()=>{
 let fail=true,created=0,destroyed=0,pdfCalls=0;
 class Window{constructor(options){assert.equal(options.webPreferences.offscreen,undefined);created++;this.webContents={executeJavaScript:async()=>200,printToPDF:async options=>{pdfCalls++;assert.equal(options.margins.top,0);assert.equal(options.pageSize.width,4);if(fail){fail=false;throw Error('Renderer exited')}return Buffer.from('pdf')}}}async loadURL(url){assert.ok(url.startsWith('data:'))}isDestroyed(){return false}destroy(){destroyed++}}
 const {renderTemplateReceipt}=compile('client-pos/electron/receiptRaster.ts',{'electron':{BrowserWindow:Window,session:{fromPartition:()=>({webRequest:{onBeforeRequest:()=>{}}})}},'./receiptLayout':{receiptWidth:()=>384,receiptHtml:()=>'<html>real template</html>'},'./receiptPdf':{receiptPdfRaster:async(pdf,width,height)=>{assert.equal(pdf.toString(),'pdf');assert.equal(height,200);return Buffer.from('raster')}}});
 assert.equal((await renderTemplateReceipt({})).toString(),'raster');assert.equal(created,2);assert.equal(destroyed,2);
 await renderTemplateReceipt({});assert.equal(created,3);assert.equal(pdfCalls,3);assert.equal(destroyed,3);
});
test('real PDF.js/native canvas converts PDF to dot-width ESC/POS with RGBA channels and safe strips',async()=>{
 const file=path.resolve('client-pos/electron/receiptPdf.ts');const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
 const PDF=require('pdfkit'),document=new PDF({size:[288,1266],margin:0}),chunks=[];document.on('data',chunk=>chunks.push(chunk));const completed=new Promise(resolve=>document.on('end',resolve));document.rect(0,0,8,8).fill('black');document.rect(20,0,8,8).fill('white');document.fontSize(20).fillColor('black').text('Rp 9,000 QRIS',10,40);document.end();await completed;
 for(let attempt=0;attempt<3;attempt++){
  const raster=await mod.exports.receiptPdfRaster(Buffer.concat(chunks),384,1684);assert.deepEqual([...raster.subarray(0,3)],[27,97,0]);let offset=3,rows=0;
  while(offset<raster.length){assert.deepEqual([...raster.subarray(offset,offset+4)],[29,118,48,0]);assert.equal(raster.readUInt16LE(offset+4),48);const strip=raster.readUInt16LE(offset+6);assert.ok(strip<=800);if(offset===3){assert.equal(raster[offset+8],255);assert.equal(raster[offset+8+4],0)}rows+=strip;offset+=8+strip*48}assert.equal(rows,1684);assert.equal(offset,raster.length)
 }
 await assert.rejects(mod.exports.receiptPdfRaster(Buffer.from('bad'),384,1684));
});
