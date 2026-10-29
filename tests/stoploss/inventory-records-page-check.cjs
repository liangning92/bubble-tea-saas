// Built staff app; synthetic API only. Never uses a production account or stock.
const {chromium,expect}=require('@playwright/test'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('client-staff/dist'),output=path.resolve('output/inventory-records/synthetic');fs.mkdirSync(output,{recursive:true});
const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
const tea={id:'tea',name:'Black Tea / Teh Hitam (红茶)',unit:'g',currentStock:1000,safetyStock:20,category:'tea',type:'raw_material'},milk={...tea,id:'milk',name:'Milk / Susu (牛奶)',unit:'ml'};
const actor={name:'Fixture operator'},line={id:'line',inventoryId:'tea',name:tea.name,unit:'g',quantity:50,reason:'withdrawal',operator:actor,note:'Morning shift',receivedQty:0,systemQty:55};
let server,browser,issued=50,failed=false,empty=false,writes=[],queries=[];
(async()=>{try{
 server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://fixture').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file))});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{sessionStorage.setItem('staff-auth-storage',JSON.stringify({state:{token:'synthetic-token',isAuthenticated:true,user:{id:'fixture',staffId:'fixture',storeId:'own',name:'Fixture',role:'staff'}},version:0}));if(!localStorage.getItem('bubble-tea-language'))localStorage.setItem('bubble-tea-language','zh')});
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());let value={code:200,data:{list:[]}};
  if(url.pathname.includes('shift-swap'))value.data=[];
  if(url.pathname==='/api/inventory')value.data.list=[tea,milk];
  if(url.pathname==='/api/inventory/operation-records'){
   queries.push(Object.fromEntries(url.searchParams));if(failed){await route.fulfill({status:503,json:{message:'Fixture failure'}});return}
   const kind=url.searchParams.get('kind'),p=Number(url.searchParams.get('page')||1),date=url.searchParams.get('startDate');
   const row={id:'record-'+p,businessDate:date,createdAt:today+'T08:00:00Z',status:kind==='count'?'completed':kind==='purchase'?'awaiting_receipt':null,orderNumber:kind==='purchase'?'PO-EXAMPLE':null,supplierName:kind==='purchase'?'Fixture supplier':null,operator:actor,items:[{...line,quantity:issued,reason:kind==='in'?'receipt':'withdrawal'}]};
   if(kind==='count')row.countDetails={reviewHistory:[],items:[{id:'ci',inventoryId:'tea',systemQty:55,countedQty:50,variance:-5,countedAt:today+'T08:00:00Z',countedByActor:actor,inventory:{...tea}}]};
   value.data={list:empty?[]:[row],summary:empty?[]:[{inventoryId:'tea',name:tea.name,unit:'g',quantity:issued,recordCount:21,recordedCount:21}],total:empty?0:21,page:p,pageSize:20};
  }
  if(['/api/inventory/stock-in','/api/inventory/stock-out','/api/purchase-orders'].includes(url.pathname)&&req.method()==='POST'){const data=req.postDataJSON();writes.push(data);issued+=data.quantity||0;value.data={};}
  await route.fulfill({status:200,json:value});
 });
 await page.goto(base+'/inventory?action=out');const section=page.getByTestId('inventory-records-out'),form=page.locator('main > form');await expect(section.getByRole('heading',{name:'出库核对记录'})).toBeVisible();
 // StockForm is a direct main child. The record filter form is inside section.
 await form.getByRole('combobox').first().selectOption('tea');await form.getByRole('combobox').nth(1).selectOption('g');await form.getByRole('spinbutton').fill('5');
 await section.getByRole('button',{name:'刷新',exact:true}).click();await expect(form.getByRole('spinbutton')).toHaveValue('5');await expect(section.getByText('原料汇总（全部查询结果）')).toBeVisible();
 const boxes=await Promise.all([form.boundingBox(),section.boundingBox()]);assert.ok(boxes[1].y>=boxes[0].y+boxes[0].height);
 await form.getByRole('button',{name:'确认',exact:true}).click();await expect(form.getByRole('spinbutton')).toHaveValue('');await expect(section.getByText('55 g',{exact:true}).first()).toBeVisible();assert.equal(writes.length,1);assert.equal(writes[0].occurredOn,today);assert.ok(page.url().includes('action=out'));
 await section.getByRole('button',{name:'下一页',exact:true}).click();await expect(section.getByText('第 2 / 2 页')).toBeVisible();
 await section.getByRole('button',{name:'补录此原料',exact:true}).last().click();await expect(form.getByRole('combobox').first()).toHaveValue('tea');await expect(form.getByRole('spinbutton')).toHaveValue('');
 await form.getByRole('spinbutton').fill('7');failed=true;await section.getByRole('button',{name:'刷新',exact:true}).click();await expect(section.getByRole('alert')).toBeVisible();await expect(form.getByRole('spinbutton')).toHaveValue('7');
 failed=false;await section.getByRole('button',{name:'重试',exact:true}).click();await expect(section.getByText('原料汇总（全部查询结果）')).toBeVisible();empty=true;await section.getByRole('button',{name:'刷新',exact:true}).click();await expect(section.getByText('暂无记录')).toBeVisible();empty=false;
 for(const [action,testid] of [['in','in'],['out','out'],['purchase','purchase'],['count','count']])for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+(action==='count'?'/inventory/count':'/inventory?action='+action));const block=page.getByTestId('inventory-records-'+testid);await expect(block.getByText('原料汇总（全部查询结果）')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),action+' overflow '+width);await page.screenshot({path:path.join(output,action+'-'+width+'.png'),fullPage:true});
 }
 for(const lang of ['en','id'])for(const kind of ['in','out','purchase','count']){await page.evaluate(l=>localStorage.setItem('bubble-tea-language',l),lang);await page.goto(base+(kind==='count'?'/inventory/count':'/inventory?action='+kind));const block=page.getByTestId('inventory-records-'+kind);await expect(block.getByRole('heading').first()).toHaveText(({en:{in:'Stock-in records',out:'Stock-out records',purchase:'Purchase records',count:'Historical counts'},id:{in:'Catatan barang masuk',out:'Catatan barang keluar',purchase:'Catatan pembelian',count:'Riwayat penghitungan stok'}})[lang][kind]);await page.screenshot({path:path.join(output,kind+'-'+lang+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);assert.ok(queries.every(q=>q.startDate&&q.endDate));console.log('PASS built staff UI: four records panels, below-form layout, save and refresh, retained unsaved draft, supplement selection, pagination, failure/retry, empty state, three widths, translations. Screenshots: '+output);
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
