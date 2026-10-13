const {chromium}=require('@playwright/test');
const fs=require('fs'),path=require('path'),assert=require('assert');
const fixturePath=process.env.INVENTORY_PAGE_FIXTURE;
if(!/^\/tmp\/bubble-inventory-flow-[A-Za-z0-9_-]+\/page-fixture.json$/.test(fixturePath||''))throw Error('Only disposable page fixture allowed');
const f=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const output=path.resolve(process.env.INVENTORY_PAGE_OUTPUT||'output/inventory-flow-page');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const errors=[];
 async function open(role,port,viewport,language='zh'){
  const context=await browser.newContext({viewport});
  await context.addInitScript(({role,credentials,language})=>{localStorage.setItem('bubble-tea-language',language);sessionStorage.setItem(role==='staff'?'staff-auth-storage':'auth-storage',JSON.stringify({state:{...credentials,isAuthenticated:true},version:0}))},{role,credentials:f[role],language});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  return {page,context,base:`http://127.0.0.1:${port}`};
 }
 try{
  const mobile=await open('staff',18085,{width:390,height:844}),p=mobile.page;
  await p.goto(mobile.base+'/inventory');await p.getByText('ONLINE-1001',{exact:true}).waitFor();
  for(const title of ['入库','出库','盘点','采购'])assert(await p.getByRole('heading',{name:title,exact:true}).count()>0,title);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile overflow');
  await p.screenshot({path:path.join(output,'staff-home.png'),fullPage:true});
  await p.goto(mobile.base+'/inventory?action=purchase');const form=p.locator('form');await form.getByRole('combobox').nth(1).selectOption(f.teaId);await form.getByRole('combobox').nth(2).selectOption('bag');await form.getByRole('spinbutton').nth(0).fill('1');await form.getByRole('spinbutton').nth(1).fill('20000');
  await p.screenshot({path:path.join(output,'staff-purchase.png'),fullPage:true});
  await p.getByRole('button',{name:'登记采购',exact:true}).click();await p.getByRole('status').filter({hasText:'采购已登记'}).waitFor();
  await p.getByRole('button').filter({hasText:'ONLINE-1001'}).click();await p.getByRole('dialog').waitFor();await p.getByRole('dialog').locator('input[type=date]').fill('2026-10-15');await p.getByRole('dialog').getByRole('button',{name:'确认整单入库',exact:true}).click();await p.getByRole('status').filter({hasText:'整单已入库'}).waitFor();
  await p.goto(mobile.base+`/inventory?action=out&material=${f.teaId}`);await p.locator('form').getByRole('spinbutton').nth(0).fill('1');await p.getByText('操作后库存: 13 kg').waitFor();await p.getByRole('button',{name:'确认',exact:true}).click();await p.getByRole('status').filter({hasText:'库存操作已完成'}).waitFor();
  await p.goto(mobile.base+'/inventory/count');await p.getByRole('button',{name:'发起盘点',exact:false}).click();await p.locator('form').getByRole('button',{name:'发起盘点',exact:true}).click();await p.getByText('已录入 0 / 2 项').waitFor();
  const rows=p.locator('section form');assert.equal(await rows.count(),2);
  for(let i=0;i<2;i++){const row=rows.nth(i);const text=await row.innerText();await row.getByRole('spinbutton').fill(text.includes('Jasmine')?'12':'1');if(text.includes('Jasmine'))await row.getByRole('textbox').fill('重新核对');await row.getByRole('button',{name:'保存',exact:true}).click();await row.getByText('已保存',{exact:true}).waitFor();}
  await p.getByRole('button',{name:'提交后台审核',exact:true}).click();await p.getByText('待审核',{exact:true}).waitFor();assert.equal(await p.getByRole('spinbutton').count(),0);
  await p.screenshot({path:path.join(output,'staff-count.png'),fullPage:true});
  const desktop=await open('admin',18083,{width:1440,height:1000}),a=desktop.page;
  await a.goto(desktop.base+'/inventory/count');await a.getByText('待审核',{exact:true}).waitFor();
  await a.getByRole('button').filter({hasText:'临时盘点'}).first().click();await a.getByRole('button',{name:'审核并调整库存',exact:true}).waitFor();a.once('dialog',d=>d.accept());await a.getByRole('button',{name:'审核并调整库存',exact:true}).click();await a.getByRole('button',{name:'审核并调整库存',exact:true}).waitFor({state:'hidden'});await a.getByText('已完成',{exact:true}).first().waitFor();
  await a.screenshot({path:path.join(output,'admin-count.png'),fullPage:true});
  await a.goto(desktop.base+'/inventory/consumption');await a.getByRole('heading',{name:'消耗对比',exact:true}).waitFor();await a.getByRole('link').filter({hasText:/库存预警 \(/}).waitFor();await a.locator('input[type=date]').nth(0).fill('2026-10-05');await a.locator('input[type=date]').nth(1).fill('2026-10-05');await a.getByRole('cell',{name:'50.0%',exact:true}).waitFor();
  await a.screenshot({path:path.join(output,'admin-consumption.png'),fullPage:true});
  await a.goto(desktop.base+'/inventory/purchase-orders');await a.getByText('ONLINE-1001',{exact:true}).waitFor();assert(await a.getByText('已入库',{exact:true}).count()>0);await a.screenshot({path:path.join(output,'admin-purchases.png'),fullPage:true});
  await a.goto(desktop.base+'/inventory/alerts');await a.getByRole('heading',{name:'库存预警',exact:true}).waitFor();await a.locator('article').filter({hasText:'临期或已过期'}).first().waitFor();await a.screenshot({path:path.join(output,'admin-alerts.png'),fullPage:true});
  await a.getByRole('button',{name:'标记已处理',exact:true}).first().click();await a.locator('textarea').fill('已安排补货及核对');await a.getByRole('button',{name:'保存',exact:true}).click();await a.locator('textarea').waitFor({state:'hidden'});
  await a.getByRole('button').filter({hasText:'已处理'}).first().click();await a.getByText('已安排补货及核对',{exact:false}).waitFor();
  await a.goto(desktop.base+'/inventory/alert-config');await a.getByRole('heading',{name:'预警设置'}).waitFor();assert.equal(await a.getByLabel('安全库存天数',{exact:true}).inputValue(),'15');await a.screenshot({path:path.join(output,'admin-alert-config.png'),fullPage:true});
  // Language changes must retain the same operational meaning.
  for(const [lang,title] of [['en','Consumption comparison'],['id','Perbandingan pemakaian']]){const translated=await open('admin',18083,{width:1440,height:1000},lang);await translated.page.goto(translated.base+'/inventory/consumption');await translated.page.getByRole('heading',{name:title,exact:true}).waitFor();await translated.context.close();}
  assert.deepEqual(errors,[]);console.log('PASS: mobile purchases, whole-order receipts, stock out, count submission, admin approval, alerts and three languages');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
