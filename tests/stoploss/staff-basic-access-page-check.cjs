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
      let employeeRequests=0;
      await context.route('**/api/**', async route => {
        if (new URL(route.request().url()).pathname === '/api/staff-permissions/me') {
          if(scenario==='pending')return;
          return route.fulfill({status:scenario==='failed'?503:200,json:scenario==='failed'?{code:503}:{code:200,data:{role:{version:2,modes:{'personal.profile':'deny','personal.attendance':'deny','personal.training':'deny','inventory.read':'deny'}}}}});
        }
        assert.equal(route.request().headers()['x-client-app'],'employee');
        employeeRequests++;
        return route.fulfill({status:503,json:{code:503,message:'Synthetic data unavailable'}});
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5179/');
      const nav = page.locator('nav.employee-bottom-nav');
      await nav.waitFor();
      assert.equal(await nav.locator('button').count(),6,scenario);
      for(const url of ['/attendance','/training','/profile']) {
        await page.goto('http://127.0.0.1:5179'+url);
        await nav.waitFor();
        assert.equal(await page.getByText('You do not have permission to access this feature. Contact the owner.',{exact:true}).count(),0);
      }
      await page.goto('http://127.0.0.1:5179/inventory');
      await nav.waitFor();
      await page.getByRole('heading').first().waitFor();
      assert.equal(await nav.locator('button').count(),6);
      assert.ok(employeeRequests>0,'employee data requests use the independent app channel');
      await context.close();
      console.log('PASS employee pages and basic navigation:',scenario);
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
