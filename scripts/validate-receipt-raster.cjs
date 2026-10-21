// Render using Electron and the exact packaged modules, without contacting a printer.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const index=process.argv.indexOf('--resources');
const modulePath=index>=0?path.resolve(process.argv[index+1],'app.asar/client-pos/dist-electron/electron/receiptRaster.js'):path.resolve('client-pos/dist-electron/electron/receiptRaster.js');
const timeout=setTimeout(()=>{console.error('Receipt renderer validation timed out');app.exit(1)},180000);
// Verify the exact installer also works with GPU acceleration disabled.
app.commandLine.appendSwitch('disable-gpu');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const {renderTemplateReceipt}=require(modulePath),{shiftReceiptLayout}=require(path.join(path.dirname(modulePath),'shiftReceiptLayout.js')),cases=[];
 const block=(type,config={},style={})=>({type,enabled:true,config,style});
 for(const paperSize of ['58mm','80mm'])for(const language of ['zh','id','en']){
  const data={paperSize,language,orderNum:'MEQ24TP39A',pickupNumber:'A34',createdAt:'2026-10-09T13:05:25Z',items:Array.from({length:30},(_,i)=>({productName:'Red Bean Matcha Sundae 商品 '+i,specName:'Default',quantity:1,unitPrice:16000,sugarLevelName:'Gula Normal',iceLevelName:'Es Normal'})),subtotal:480000,total:480000,paidAmount:500000,change:20000,paymentMethod:'Tunai',blocks:[block('header',{text:'YOUME'},{bold:true,fontSize:'large'}),block('orderInfo',{showDate:true,showTime:true}),block('divider'),block('items',{showSugarIce:true}),block('subtotal'),block('total',{}, {bold:true,fontSize:'large'}),block('paymentInfo',{showMethod:true,showReceived:true,showChange:true}),block('qrCode',{qrContent:'https://youme.example/A34',size:80}),block('barcode',{barcodeType:'code128'}),block('footer',{footerText:'Thank you!'})]};
  const bytes=await renderTemplateReceipt(data),byteWidth=paperSize==='58mm'?48:72;assert.deepEqual([...bytes.subarray(0,3)],[27,97,0]);
  let offset=3,strips=0,height=0,ink=0;
  while(offset<bytes.length){assert.deepEqual([...bytes.subarray(offset,offset+4)],[29,118,48,0]);assert.equal(bytes.readUInt16LE(offset+4),byteWidth);const rows=bytes.readUInt16LE(offset+6);assert.ok(rows>0&&rows<=800);const end=offset+8+rows*byteWidth;assert.ok(end<=bytes.length);for(const value of bytes.subarray(offset+8,end))if(value)ink++;offset=end;strips++;height+=rows;}
  assert.equal(offset,bytes.length);assert.ok(strips>=2);assert.ok(ink>1000);cases.push({paperSize,language,strips,height,bytes:bytes.length});
 }
 for(const paperSize of ['58mm','80mm'])for(const language of ['zh','id','en'])for(const allOff of [false,true]){
  const keys=['storeName','sessionId','cashierName','shiftType','openedAt','closedAt','printedAt','revenue','cashReceived','expenseAmount','openFloat','closeCash','cashReceipts','qrisReceipts','shopeefoodReceipts','gofoodReceipts','orderCount','cupCount','expenses','cashierSignature','supervisorSignature'];
  const data=shiftReceiptLayout({paperSize,language,storeName:'YOUME',cashierName:'rizky purnama arianti / 员工姓名',sessionId:'shift-raster-validation',shiftType:'evening',openedAt:'2026-10-20T11:30:33Z',closedAt:'2026-10-20T16:31:00Z',printedAt:'2026-10-20T16:31:00Z',handoverFinancials:{totalRevenue:773685,actualCashReceived:369000,expenses:0},openFloat:600000,actualCash:969000,manualReceipts:{cash:369000,qris:78000,shopeefood:144930,gofood:179755},summaryEvidence:{orderCount:21,cupCount:41},purchaseExpenses:{total:12000,items:[{category:'Supplies / 物料',quantity:2,amount:12000,description:'Long expense note / 费用说明 '.repeat(5)}]},receiptItems:Object.fromEntries(keys.map(key=>[key,!allOff]))});
  const bytes=await renderTemplateReceipt(data),byteWidth=paperSize==='58mm'?48:72;
  assert.deepEqual([...bytes.subarray(0,3)],[27,97,0]);let offset=3,strips=0,height=0,ink=0;
  while(offset<bytes.length){assert.deepEqual([...bytes.subarray(offset,offset+4)],[29,118,48,0]);assert.equal(bytes.readUInt16LE(offset+4),byteWidth);const rows=bytes.readUInt16LE(offset+6);assert.ok(rows>0&&rows<=800);const end=offset+8+rows*byteWidth;assert.ok(end<=bytes.length);for(const value of bytes.subarray(offset+8,end))if(value)ink++;offset=end;strips++;height+=rows;}
  assert.equal(offset,bytes.length);assert.ok(strips>=1);assert.ok(ink>100);cases.push({kind:'shift-handover',paperSize,language,allOff,strips,height,bytes:bytes.length});
 }
 fs.writeFileSync('receipt-raster-validation.json',JSON.stringify({passed:true,physicalPrinting:false,renderBackend:'chromium-pdf-cpu',gpuDisabled:true,modulePath,cases},null,2));console.log('PASS exact packaged receipt raster rendering: 58/80mm, three languages, long receipts, QR/barcode and configurable shift handover receipts');clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1)});
