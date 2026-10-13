// Uses only the disposable synthetic page fixture created by audit-flow-tests/page-server.ts.
const {chromium}=require('@playwright/test'),fs=require('fs'),path=require('path'),assert=require('assert');
const fixturePath=process.env.INVENTORY_PAGE_FIXTURE;
if(!/^\/tmp\/bubble-inventory-flow-[A-Za-z0-9_-]+\/page-fixture.json$/.test(fixturePath||''))throw Error('Disposable fixture required');
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
(async()=>{const browser=await chromium.launch({headless:true}),errors=[];
try{for(const [language,title,settings,safety] of [['zh','库存预警','预警设置','安全库存天数'],['en','Inventory alerts','Alert settings','Safety days'],['id','Peringatan inventaris','Pengaturan peringatan','Hari stok aman']]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(({credentials,language})=>{localStorage.setItem('bubble-tea-language',language);sessionStorage.setItem('auth-storage',JSON.stringify({state:{...credentials,isAuthenticated:true},version:0}));},{credentials:fixture.admin,language});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18083/inventory/alerts');await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.locator('article').first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'alert page overflow');
 if(language==='zh'){const dir=path.resolve('output/inventory-flow-page');await page.screenshot({path:path.join(dir,'admin-alerts.png'),fullPage:true});}
 await page.goto('http://127.0.0.1:18083/inventory/alert-config');await page.getByRole('heading',{name:settings,exact:true}).waitFor();assert.equal(await page.getByLabel(safety,{exact:true}).inputValue(),'15');assert.equal(await page.getByRole('checkbox').count(),8);
 await context.close();
}assert.deepEqual(errors,[]);console.log('PASS: inventory alert center, 15-day settings, eight alert groups and Chinese/English/Indonesian pages');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
