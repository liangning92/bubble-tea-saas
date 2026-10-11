const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,requireFn=require){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:requireFn,Buffer,console});return m.exports;}
const layout=load('client-pos/electron/receiptLayout.ts');
const block=(type,config={},style={})=>({type,enabled:true,config,style});
const fixture={language:'id',orderNum:'MEQ24TP39A',pickupNumber:'A34',createdAt:'2026-10-09T13:05:25Z',items:[{productName:'Red Bean Matcha Sundae',specName:'Default',unitPrice:16000,quantity:1,sugarLevelName:'Gula Normal',iceLevelName:'Es Normal'}],subtotal:16000,total:16000,paidAmount:100000,change:84000,paymentMethod:'Tunai',blocks:[block('header',{text:'YOUME'},{fontSize:'large',bold:true}),block('divider'),block('orderInfo',{showDate:true,showTime:true}),block('divider'),block('items',{showSugarIce:true}),block('subtotal'),block('total',{}, {fontSize:'large',bold:true}),block('divider'),block('paymentInfo',{showMethod:true,showReceived:true,showChange:true}),block('footer',{footerText:'Thank you!'})]};
test('browser layout keeps long products beside right-aligned amounts on 58mm and 80mm',async()=>{
 const browser=await require('playwright').chromium.launch({headless:true});
 try{for(const paperSize of ['58mm','80mm']){
  const width=layout.receiptWidth(paperSize),page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
  await page.setContent(layout.receiptHtml({...fixture,paperSize}));await page.evaluate(()=>document.fonts.ready);
  const m=await page.evaluate(()=>{const amounts=[...document.querySelectorAll('.amount')];const r=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};return {overflow:document.body.scrollWidth>innerWidth,amounts:amounts.map(el=>({name:r(el.children[0]),value:r(el.children[1])})),height:document.body.getBoundingClientRect().height,totalFont:getComputedStyle(document.querySelector('[data-block=total]')).fontSize,totalBold:getComputedStyle(document.querySelector('[data-block=total]')).fontWeight,detailLeft:r(document.querySelector('.item-details')).left,detailFont:getComputedStyle(document.querySelector('.item-details')).fontSize}});
  assert.equal(m.overflow,false);assert.equal(m.totalFont,'32px');assert.equal(m.totalBold,'700');assert.equal(m.detailFont,'20px');
  for(const amount of m.amounts){assert.equal(amount.value.right,width-16);assert.ok(amount.name.right<=amount.value.left-11);assert.equal(amount.name.top,amount.value.top);}
  assert.ok(m.height<800,'no viewport-size blank space');
  await page.screenshot({path:'/tmp/youme-receipt-'+paperSize+'.png',clip:{x:0,y:0,width,height:Math.ceil(m.height)}});
  await page.setContent(layout.receiptHtml({...fixture,paperSize,blocks:[block('items',{showQtyPriceHeader:true})],items:[...fixture.items,{productName:'Tea',quantity:10,unitPrice:100000}]}));
  const columns=await page.locator('.item-grid').evaluateAll(rows=>rows.map(row=>[...row.children].map(el=>el.getBoundingClientRect().left)));
  assert.deepEqual(columns[0],columns[1]);assert.deepEqual(columns[1],columns[2]);await page.close();
 }}finally{await browser.close();}
});
