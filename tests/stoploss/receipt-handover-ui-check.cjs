// Serve the exact POS build locally; hardware and API calls are mocked.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve('client-pos/dist');
 const server=http.createServer((req,res)=>{const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!name.startsWith(root+path.sep)&&name!==root){res.writeHead(403);return res.end()}const file=fs.existsSync(name)&&fs.statSync(name).isFile()?name:path.join(root,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(origin)||url.includes('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[],message:'test'})});return route.continue();});
  await page.addInitScript(()=>{
   window.__responses=[];window.__promptListener=null;
   window.electronAPI={getAppVersion:async()=> '2026.10.12.1',getApiUrl:async()=>({url:'http://127.0.0.1:6073/api'}),onUpdateStatus:()=>()=>{},onUpdateProgress:()=>()=>{},onUpdateError:()=>()=>{},onReceiptHandover:fn=>{window.__promptListener=fn;return()=>{window.__promptListener=null}},confirmReceiptHandover:(id,confirmed)=>window.__responses.push({id,confirmed})};
   localStorage.setItem('i18nextLng','zh');
  });
  await page.goto(origin+'/#/login');await page.waitForFunction(()=>!!window.__promptListener);
  const prompt={requestId:'first',title:'小票交接',message:'请等待出纸，撕下顾客联并交给顾客。',button:'已撕下，打印操作员联',orderNum:'MEQ24TP39A',copiesSubmitted:1,printCopies:2};
  await page.evaluate(p=>window.__promptListener(p),prompt);
  const dialog=page.getByRole('dialog',{name:prompt.title});await dialog.waitFor();
  assert.ok(await dialog.getByText('#MEQ24TP39A').isVisible());assert.ok(await dialog.getByText('1 / 2').isVisible());
  await page.mouse.click(10,10);assert.equal(await dialog.count(),1,'overlay does not cancel receipt printing');
  await dialog.locator('..').locator('..').screenshot({path:'/tmp/receipt-handover-dialog.png',animations:'disabled'});
  await page.evaluate(()=>{const button=document.querySelector('[role=dialog] button');button.click();button.click()});
  assert.deepEqual(await page.evaluate(()=>window.__responses),[{id:'first',confirmed:true}]);
  for(const [lang,message,button] of [['en','Wait for printing, tear off the customer copy and hand it to the customer.','Torn off — print operator copy'],['id','Tunggu struk keluar, sobek salinan pelanggan dan berikan kepada pelanggan.','Sudah disobek — cetak salinan operator']]){
   await page.setViewportSize({width:360,height:640});await page.evaluate(p=>window.__promptListener(p),{...prompt,requestId:lang,message,button});
   await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
   const rect=await page.getByRole('button',{name:button}).boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=360);assert.ok(rect.height>=48);
   await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:button}).evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
  }
  await page.evaluate(p=>window.__promptListener(p),{...prompt,requestId:'cancel'});await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
  const responses=await page.evaluate(()=>window.__responses);assert.equal(responses.length,4);assert.deepEqual(responses[3],{id:'cancel',confirmed:false});assert.deepEqual(errors,[]);
  console.log('PASS: styled POS modal, overlay protection, duplicate click, keyboard confirmation/cancel, narrow screens and all receipt languages');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
