// Production bundles in Chromium, synthetic sessions and API failures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const {chromium, expect} = require('@playwright/test');
const apps = ['admin', 'pos', 'staff'];
const servers = [];
let browser;
function start(kind) {
  const root = path.resolve(`client-${kind}/dist`);
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (relative.startsWith('/api/')) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({code:404, message:'Synthetic unavailable API'}));
    }
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep) && file !== root) {res.writeHead(403); return res.end();}
    const found = fs.existsSync(file) && fs.statSync(file).isFile() ? file : relative.startsWith('/assets/') ? null : path.join(root, 'index.html');
    if (!found) {res.writeHead(404); return res.end();}
    res.setHeader('Content-Type', found.endsWith('.js') ? 'text/javascript' : found.endsWith('.css') ? 'text/css' : found.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    fs.createReadStream(found).pipe(res);
  });
  servers.push(server);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
async function setup(kind, authenticated = false) {
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(({kind, authenticated}) => {
    localStorage.setItem('bubble-tea-language', 'en'); localStorage.setItem('pos_language', 'en');
    if (authenticated) {
      const key = kind === 'admin' ? 'auth-storage' : kind === 'pos' ? 'pos-auth' : 'staff-auth-storage';
      sessionStorage.setItem(key, JSON.stringify({state:{isAuthenticated:true, token:'synthetic-only', user:{id:'synthetic-user',role:kind==='admin'?'admin':kind==='pos'?'cashier':'staff',storeId:'synthetic-store',staffId:'synthetic-staff',staff:{id:'synthetic-staff',name:'Synthetic'},name:'Synthetic'}},version:0}));
    }
  }, {kind, authenticated});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'file:' || (url.hostname === '127.0.0.1' && url.pathname !== '/api/health')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage(); const requests = [], errors = [];
  page.on('request', req => {if (/\/assets\/.*\.js/.test(req.url())) requests.push(req.url());});
  page.on('pageerror', error => errors.push(error.message));
  return {context, page, requests, errors};
}
async function navigate(page, kind, route) {
  await page.evaluate(({kind,route}) => {
    if (kind === 'pos') window.location.hash = route;
    else {history.pushState({}, '', route); window.dispatchEvent(new PopStateEvent('popstate'));}
  }, {kind,route});
}
(async () => {
  browser = await chromium.launch({headless:true, args:['--allow-file-access-from-files']});
  for (const kind of apps) {
    const origin = await start(kind);
    const url = route => origin + (kind === 'pos' ? '/#' : '') + route;
    const fixture = await setup(kind);
    try {
      let releaseLogin;
      const loginDelay = new Promise(resolve => {releaseLogin = resolve;});
      await fixture.page.route('**/LoginPage-*.js', async route => {await loginDelay; await route.continue();});
      await fixture.page.goto(url('/login'));
      await expect(fixture.page.getByRole('status').filter({hasText:'Loading...'})).toBeVisible();
      releaseLogin();
      await expect(fixture.page.locator('input[type="password"]')).toBeVisible();
      assert(fixture.requests.some(u => /LoginPage-/.test(u)), `${kind}: login loaded dynamically`);
      assert(!fixture.requests.some(u => /(?:POSPage|DashboardPage|HomePage|ExpenseListPage|TrainingLibraryPage|xlsx|BarChart)-/.test(u)), `${kind}: unrelated business pages are absent from login requests`);
      const privateRoute = kind === 'admin' ? '/finance/expenses' : kind === 'pos' ? '/cash' : '/salary';
      await navigate(fixture.page, kind, privateRoute);
      await expect(fixture.page.locator('input[type="password"]')).toBeVisible();
      await expect(fixture.page).toHaveURL(/login/);
      assert(!fixture.requests.some(u => /(?:ExpenseListPage|CashManagementPage|SalaryPage)-/.test(u)), `${kind}: authentication blocks protected chunk loading`);
      assert.deepEqual(fixture.errors, []);
    } finally {await fixture.context.close();}
    const auth = await setup(kind, true);
    try {
      const first = kind === 'admin' ? '/inventory/consumption-analysis' : kind === 'pos' ? '/diagnostics' : '/profile';
      await auth.page.goto(url(first));
      if (kind === 'admin') await expect(auth.page.getByTestId('dashboard-feature-unavailable')).toBeVisible();
      else if (kind === 'staff') await expect(auth.page.getByRole('navigation')).toBeVisible();
      else await expect(auth.page.locator('h1')).toContainText(/Diagnostic/);
      const next = kind === 'admin' ? '/finance/expenses' : kind === 'pos' ? '/register-member' : '/deposit/rules';
      const chunk = kind === 'admin' ? 'ExpenseListPage' : kind === 'pos' ? 'RegisterMemberPage' : 'DepositRulesPage';
      assert(!auth.requests.some(u => u.includes(chunk + '-')), `${kind}: next route not preloaded`);
      let release;
      const delayed = new Promise(resolve => {release = resolve;});
      await auth.page.route(`**/${chunk}-*.js`, async route => {await delayed; await route.continue();});
      await navigate(auth.page, kind, next);
      await expect.poll(() => auth.requests.some(u => u.includes(chunk + '-'))).toBe(true);
      await expect(auth.page.locator('#root')).not.toBeEmpty();
      if (kind === 'admin') await expect(auth.page.locator('aside')).toBeVisible();
      if (kind === 'staff') await expect(auth.page.getByRole('navigation')).toBeVisible();
      const received = auth.page.waitForResponse(response => response.url().includes(chunk + '-'));
      release();
      await received;
      await expect(auth.page.getByRole('status').filter({hasText:'Loading...'})).toHaveCount(0);
      assert(auth.requests.some(u => u.includes(chunk + '-')), `${kind}: navigation loads its own chunk`);
      if (kind === 'admin') await expect(auth.page.getByTestId('dashboard-feature-unavailable')).toHaveCount(0);
      await auth.page.reload();
      await expect(auth.page.getByRole('status').filter({hasText:'Loading...'})).toHaveCount(0);
      await expect(auth.page.locator('#root')).not.toBeEmpty();
      assert.deepEqual(auth.errors, []);
      console.log(`PASS ${kind}: login isolation, auth redirect, delayed route and navigation, direct refresh`);
    } finally {await auth.context.close();}
    if (kind === 'admin') {
      const failure = await setup(kind);
      try {
        await failure.page.goto(url('/login'));
        await expect(failure.page.locator('input[type="password"]')).toBeVisible();
        await failure.page.route('**/RegisterPage-*.js', route => route.abort());
        await navigate(failure.page, kind, '/register');
        await expect(failure.page.getByRole('heading', {name:'Something went wrong'})).toBeVisible();
        await expect(failure.page.getByRole('button', {name:/Reload/})).toBeVisible();
        console.log('PASS failed route chunk displays existing recovery controls without automatic reload');
      } finally {await failure.context.close();}
    }
  }
  const desktop = await setup('pos', true);
  try {
    await desktop.context.setOffline(true);
    const local = pathToFileURL(path.resolve('client-pos/dist/index.html')).href;
    await desktop.page.goto(local+'#/diagnostics');
    await expect(desktop.page.locator('h1')).toContainText(/Diagnostic/);
    await navigate(desktop.page, 'pos', '/register-member');
    await expect(desktop.page.locator('input').first()).toBeVisible();
    assert(desktop.requests.some(u=>u.includes('RegisterMemberPage-')));
    assert.deepEqual(desktop.errors, []);
    console.log('PASS POS packaged file:// assets: offline cold load and route navigation');
  } finally {await desktop.context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser) await browser.close();
  for(const server of servers) await new Promise(resolve=>server.close(resolve));
});
