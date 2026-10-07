// Native App/React Router/React Query. Only read API boundaries are synthetic.
const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const origin='http://127.0.0.1:6301',stamp='2026-10-06T23:45:00.000Z',store='store-own';
const dashboard=()=>({timestamp:stamp,today:{orders:1,revenue:100000,averageOrder:100000,cost:20000,profit:80000},thisMonth:{orders:1,revenue:100000,cost:20000,profit:80000,goalProgress:10},member:{newMembers:0,ratio:0},staff:{checkedIn:0,total:0,pendingLeave:0},inventory:{lowStockCount:1,lowStockItems:[{id:'i',name:'Cup',unit:'pc',currentStock:1,safetyStock:2}]},topProducts:[],recentOrders:[{id:'old',orderNumber:'ORDER-old',finalAmount:100000,paymentMethod:'cash',status:'completed',createdAt:'2026-10-01T10:15:00.000Z'}]});
const cases=['midnight-auto','midnight-manual','fixed-history','rolling-week','pos-alerts-utc','pos-alerts', 'active-sessions', 'stock', 'analysis', 'orders', 'detail', 'dashboard-error', 'dashboard-malformed', 'dashboard-empty', 'stats-error', 'sessions-error', 'stock-error', 'stock-empty', 'orders-error', 'orders-empty', 'detail-error', 'foreign-pos', 'foreign-stock', 'foreign-analysis', 'foreign-orders', 'foreign-detail', 'invalid-date', 'context-reload', 'scope-cache', 'id-error', 'zh-error', 'stock-url-change', 'analysis-unavailable'];
(async()=>{const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);const tw=(await import(pathToFileURL(path.resolve('client-admin/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-admin/src/**/*.{js,ts,jsx,tsx}')];const server=await createServer({configFile:false,root:path.resolve('client-admin'),cacheDir:'/tmp/admin-dashboard-vite-cache',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port:6301,strictPort:true,proxy:{}},resolve:{alias:{'@':path.resolve('client-admin/src')}}});let browser;
try{await server.listen();browser=await chromium.launch({headless:true});fs.mkdirSync('/tmp/admin-dashboard-evidence',{recursive:true});
for(const scenario of (process.env.DASHBOARD_SCENARIOS||cases.join(',')).split(',')){
 const context=await browser.newContext({viewport:{width:1500,height:1200},timezoneId:scenario==='pos-alerts-utc'?'UTC':'Asia/Jakarta',serviceWorkers:'block'}),requests=[],errors=[];let fail=true;
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();requests.push({path:url.pathname,params:Object.fromEntries(url.searchParams),method:req.method()});assert.equal(req.method(),'GET','No mutations in dashboard/navigation checks');let status=200,data={};
 if(url.pathname==='/api/reports/dashboard'){data=dashboard();if(scenario==='dashboard-empty'){data.today={orders:0,revenue:0,averageOrder:0,cost:0,profit:0};data.recentOrders=[];data.inventory.lowStockItems=[];}if(scenario==='dashboard-malformed')data={};if(['dashboard-error','id-error','zh-error','analysis-url-change','stock-url-change','analysis-precision-change'].includes(scenario)&&fail)status=503;}
 if(url.pathname==='/api/pos-action-logs/stats'){data={warningCount:1,criticalCount:0,todayTotal:2};if(scenario==='stats-error')status=503;}
 if(url.pathname==='/api/orders/received-receipts')data=[];
 if(url.pathname==='/api/pos-action-logs/sessions'){data=[];if(scenario==='sessions-error')status=503;}
 if(url.pathname==='/api/pos-action-logs')data={logs:[],total:0,page:1,totalPages:0};
 if(url.pathname==='/api/bom/materials/low-stock-alert'){data=[];if(scenario==='stock-error')status=503;}
 if(url.pathname==='/api/inventory/consumption-analysis')assert.fail('Unreachable analysis must not be requested'); if(url.pathname==='/api/inventory/anomaly-summary')assert.fail('Unreachable analysis must not be requested'); if(url.pathname==='/api/orders'){data={list:[],total:0,page:1,pageSize:100};if(scenario==='orders-error')status=503;}
 if(url.pathname==='/api/orders/old'){data={id:'old',storeId:store,orderNumber:'ORDER-old',finalAmount:100000,paymentMethod:'cash',status:'completed',createdAt:'2026-10-01T10:15:00.000Z',items:[],subtotal:100000,tax:0,discountAmount:0};if(scenario==='detail-error'&&fail)status=503;}
 if(url.pathname==='/api/channels'||url.pathname==='/api/orders/refund-requests')data={list:[]};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,data,message:status===503?'Synthetic read failure':undefined})});});
 await context.addInitScript(({store,scenario})=>{localStorage.setItem('bubble-tea-language',scenario==='id-error'?'id':scenario==='zh-error'?'zh':'en');sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic-only',user:{id:'manager',role:'manager',storeId:store,staff:null}},version:0}));},{store,scenario});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const params=new URLSearchParams({storeId:store,asOf:stamp,startDate:'2026-10-07T00:00:00.000Z',endDate:'2026-10-07T23:59:59.999Z'});
 const target={stock:'/inventory/alerts',analysis:'/inventory/consumption-analysis',orders:'/finance/orders',detail:'/finance/orders/old',pos:'/pos-monitor'};
 if(['midnight-auto','midnight-manual','fixed-history','rolling-week'].includes(scenario)){
  await page.clock.install({time:new Date('2026-10-06T16:59:00.000Z')});
  await page.goto(origin+'/pos-monitor'+(scenario==='fixed-history'?'?'+params:''));await expect(page.getByTestId('dashboard-context')).toBeVisible();
  if(scenario==='midnight-manual')await page.getByRole('checkbox').uncheck();
  if(scenario==='rolling-week')await page.locator('select:has(option[value="week"])').selectOption('week');
  const logs=()=>requests.filter(r=>r.path==='/api/pos-action-logs');
  if(scenario!=='fixed-history'&&scenario!=='rolling-week')assert.equal(logs().at(-1).params.startDate,'2026-10-05T17:00:00.000Z');
  if(scenario==='rolling-week')await expect.poll(()=>logs().at(-1)?.params.startDate?.slice(0,16)).toBe('2026-09-29T16:59');
  const before=logs().at(-1).params.startDate;
  await page.clock.setSystemTime(new Date('2026-10-06T17:01:00.000Z'));
  if(scenario==='midnight-manual')await page.getByRole('button',{name:'Refresh',exact:true}).click();
  else await page.clock.runFor(16000);
  if(scenario==='fixed-history'){await page.getByRole('button',{name:'Refresh',exact:true}).click();assert.equal(logs().at(-1).params.startDate,before);assert.equal(logs().at(-1).params.endDate,params.get('endDate'));}
  else if(scenario==='rolling-week')await expect.poll(()=>logs().at(-1)?.params.startDate).not.toBe(before);
  else await expect.poll(()=>logs().at(-1)?.params.startDate).toBe('2026-10-06T17:00:00.000Z');
  await expect.poll(()=>requests.filter(r=>r.path==='/api/pos-action-logs/stats').some(r=>r.params.startDate===logs().at(-1).params.startDate)).toBe(true);
 }
 else if(scenario.startsWith('foreign-')){const name=scenario.slice(8);params.set('storeId','foreign');await page.goto(origin+target[name]+'?'+params);await expect(page.getByTestId('dashboard-read-failure')).toContainText('Store or date');assert.equal(requests.filter(r=>r.path==='/api/orders'||r.path==='/api/orders/old'||r.path.startsWith('/api/pos-action-logs')||r.path.startsWith('/api/bom/materials')||r.path.startsWith('/api/inventory/')).length,0);}
 else if(scenario==='analysis-unavailable'){await page.goto(origin+target.analysis+'?'+params);await expect(page.getByTestId('dashboard-feature-unavailable')).toContainText('currently unavailable');assert.equal(requests.filter(r=>r.path.startsWith('/api/inventory/')).length,0);}
 else if(scenario==='invalid-date'){params.set('startDate','broken');await page.goto(origin+'/pos-monitor?'+params);await expect(page.getByTestId('dashboard-read-failure')).toBeVisible();assert.equal(requests.filter(r=>r.path.startsWith('/api/pos-action-logs')).length,0);}
 else if(['stock-error','stock-empty','orders-error','orders-empty','detail-error','context-reload','stock-url-change'].includes(scenario)){
  const name=scenario.startsWith('stock')?'stock':scenario==='detail-error'?'detail':'orders';await page.goto(origin+target[name]+'?'+params);
  if(scenario.endsWith('error')){await expect(page.getByTestId('dashboard-read-failure')).toBeVisible();if(name==='detail'){fail=false;await page.getByRole('button',{name:'Reload',exact:true}).click();await expect(page.getByTestId('dashboard-context')).toBeVisible();}}
  else{if(name==='stock')await expect(page.getByText(/No.*alert/i)).toBeVisible();if(name==='orders')await expect(page.locator('main')).toContainText('No data');if(scenario==='context-reload'){await page.reload();await expect(page.getByTestId('dashboard-context')).toContainText(new Date('2026-10-07T00:00:00+07:00').toLocaleDateString('en',{timeZone:'Asia/Jakarta'}));const q=requests.filter(r=>r.path==='/api/orders').at(-1).params;assert.equal(q.storeId,store);assert.equal(q.startDate,params.get('startDate'));assert.equal(q.endDate,params.get('endDate'));}if(scenario==='stock-url-change'){await page.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('forecastDays','90');history.pushState({},'',u);window.dispatchEvent(new PopStateEvent('popstate'));});await expect.poll(()=>requests.filter(r=>r.path==='/api/bom/materials/low-stock-alert').at(-1)?.params.days).toBe('90');}}
 }
 else{
  await page.goto(origin+'/dashboard');
  if(['dashboard-error','dashboard-malformed','id-error','zh-error'].includes(scenario)){await expect(page.getByTestId('dashboard-read-failure')).toBeVisible();assert.equal(await page.getByText('ORDER-old',{exact:true}).count(),0);assert.equal(await page.getByText(/Rp\s*0/).count(),0);if(scenario==='dashboard-error'){fail=false;await page.getByRole('button',{name:'Reload',exact:true}).click();await expect(page.getByText('ORDER-old',{exact:true})).toBeVisible();}}
  else if(['stats-error','sessions-error'].includes(scenario)){await expect(page.getByTestId('dashboard-read-failure')).toBeVisible();assert.equal(await page.getByRole('button',{name:/View Details/}).count(),0);await expect(page.getByText('ORDER-old',{exact:true})).toBeVisible();}
  else if(scenario==='dashboard-empty'){await expect(page.getByText('No data',{exact:true}).first()).toBeVisible();assert.equal(await page.getByTestId('dashboard-read-failure').count(),0);await expect(page.getByText(/Rp\s*0/).first()).toBeVisible();}
  else{await expect(page.getByText('ORDER-old',{exact:true})).toBeVisible();await expect(page.getByText('This summary is unavailable from the data source.')).toBeVisible();
   if(['pos-alerts','pos-alerts-utc'].includes(scenario))await page.getByRole('button',{name:/View All/}).first().click();
   if(scenario==='active-sessions')await page.getByRole('button',{name:/View Details/}).click();
   if(scenario==='stock')await page.getByRole('button',{name:/View forecast stock alerts/}).click();
   if(scenario==='analysis')await expect(page.getByText('This summary is unavailable from the data source.').first()).toBeVisible();
   if(scenario==='orders')await page.getByRole('button',{name:/View All/}).last().click();
   if(scenario==='detail')await page.getByText('ORDER-old',{exact:true}).click();
   if(scenario==='scope-cache'){await page.evaluate(async()=>{const {useAuthStore}=await import('/src/stores/auth.ts');useAuthStore.getState().updateUser({storeId:'second'});});await expect.poll(()=>requests.filter(r=>r.path==='/api/reports/dashboard').at(-1)?.params.storeId).toBe('second');}
   else if(scenario==='analysis'){assert.equal(new URL(page.url()).pathname,'/dashboard');assert.equal(requests.filter(r=>r.path.startsWith('/api/inventory/')).length,0);}
   else{const url=new URL(page.url());assert.equal(url.searchParams.get('storeId'),store);assert.equal(url.searchParams.get('asOf'),stamp);const requestPath=scenario==='stock'?'/api/bom/materials/low-stock-alert':scenario==='orders'?'/api/orders':scenario==='detail'?'/api/orders/old':'/api/pos-action-logs';await expect.poll(()=>requests.some(r=>r.path===requestPath)).toBe(true);const q=requests.filter(r=>r.path===requestPath).at(-1);
    if(['pos-alerts','pos-alerts-utc','active-sessions'].includes(scenario)){assert.equal(url.pathname,'/pos-monitor');assert.equal(q.params.startDate,'2026-10-06T17:00:00.000Z');assert.equal(q.params.endDate,'2026-10-07T16:59:59.999Z');const card=requests.find(r=>r.path==='/api/pos-action-logs/stats');assert.equal(card.params.startDate,q.params.startDate);assert.equal(card.params.endDate,q.params.endDate);}
    if(scenario==='stock'){assert.equal(url.pathname,'/inventory/alerts');assert.equal(q.params.days,'7');}
    if(scenario==='orders'){assert.equal(q.params.storeId,store);assert.equal(q.params.startDate,undefined);assert.equal(q.params.endDate,undefined);}
    if(scenario==='detail'){assert.equal(url.pathname,'/finance/orders/old');}
   }
  }
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/admin-dashboard-evidence/'+scenario+'.png'});console.log('PASS actual admin dashboard '+scenario+': actual route, scoped context, read failure distinguished, zero mutations');await context.close();
}
}finally{if(browser)await browser.close();await server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
