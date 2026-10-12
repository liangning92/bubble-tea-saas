const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const scenario of ['denied','failed','pending']) {
      const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(() => {
        localStorage.setItem('i18nextLng','en');
        sessionStorage.setItem('staff-auth-storage',JSON.stringify({state:{token:'synthetic',user:{id:'employee',staffId:'employee',name:'Synthetic',storeId:'store',role:'staff'},isAuthenticated:true},version:0}));
      });
      let reads = 0;
      await context.route('**/api/**', async route => {
        if (new URL(route.request().url()).pathname === '/api/staff-permissions/me') {
          reads++;
          if(scenario==='pending')return;
          return route.fulfill({status:scenario==='failed'?503:200,json:scenario==='failed'?{code:503}:{code:200,data:{role:{version:2,modes:{'personal.profile':'deny','personal.attendance':'deny','personal.training':'deny','inventory.read':'deny'}}}}});
        }
        return route.fulfill({status:503,json:{code:503,message:'Synthetic data unavailable'}});
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5179/');
      const nav = page.locator('nav.employee-bottom-nav');
      await nav.waitFor();
      assert.equal(await nav.locator('button').count(),5,scenario);
      for(const url of ['/attendance','/training','/profile']) {
        await page.goto('http://127.0.0.1:5179'+url);
        await nav.waitFor();
        assert.equal(await page.getByText('You do not have permission to access this feature. Contact the owner.',{exact:true}).count(),0);
      }
      if(scenario!=='pending') {
        await page.goto('http://127.0.0.1:5179/inventory');
        await page.locator('[role="alert"]').waitFor();
        await nav.waitFor();
        const before=reads;
        await page.locator('[role="alert"] button').click();
        await page.waitForFunction(() => true);
        await new Promise(resolve => setTimeout(resolve,300));
        assert.ok(reads>before,'refresh retries permissions');
        await page.locator('[role="alert"] a[href="/"]').click();
        await nav.waitFor();
        assert.equal(new URL(page.url()).pathname,'/');
      }
      await context.close();
      console.log('PASS employee pages and basic navigation:',scenario);
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
