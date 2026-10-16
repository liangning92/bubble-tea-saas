const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http')
const { chromium } = require('playwright')
const root = path.resolve('client-staff/dist'), out = path.resolve(process.env.STAFF_OFFLINE_TEST_OUTPUT || 'output/staff-offline-login')
fs.mkdirSync(out, { recursive: true })
let loginStatus = 200, authCalls = 0, missingStaff = false, upgradeShell = false
const shell = JSON.parse(fs.readFileSync(path.join(root,'employee-shell.json'),'utf8')), upgradedVersion='bbbbbbbbbbbbbbbb'
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/api/auth/login') {
      authCalls++; let body = ''; for await(const chunk of req) body += chunk
      const input = JSON.parse(body)
      const status = loginStatus === 200 && input.password !== 'fixture-secret' ? 401 : loginStatus
      res.statusCode = status
      return res.end(JSON.stringify(status === 200 ? { code:200, data:{ token:'fixture-local-only', user:{ id:'local-test-user',phone:'080000000001',role:'admin',storeId:'local-test-store',store:{name:'Local fixture store'},staff:missingStaff?null:{id:'local-test-staff',name:'Offline acceptance fixture',position:'cashier'} } } } : {code:status,message:status===401?'Invalid phone or password':'Server unavailable'}))
    }
    res.statusCode = 503; return res.end(JSON.stringify({code:503,message:'No fixture business endpoint'}))
  }
  if(upgradeShell && url.pathname==='/employee-shell.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify({...shell,version:upgradedVersion}))}
  if(upgradeShell && url.pathname==='/employee-sw.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');return res.end(fs.readFileSync(path.join(root,'employee-sw.js'),'utf8').replace(/self\.__EMPLOYEE_SHELL_VERSION = "[a-f0-9]{16}";/,'self.__EMPLOYEE_SHELL_VERSION = "'+upgradedVersion+'";'))}
  let filename = path.join(root, decodeURIComponent(url.pathname))
  if (!filename.startsWith(root + path.sep) && filename !== root) { res.statusCode=400; return res.end() }
  if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename=path.join(root,'index.html')
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}
  res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream')
  const body=fs.readFileSync(filename)
  res.end(upgradeShell && path.extname(filename)==='.html'?body.toString().replace('<head>','<head><meta name="fixture-shell-version" content="upgraded">'):body)
})
;(async()=>{
  let browser
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port
    browser=await chromium.launch({headless:true})
    const context=await browser.newContext({viewport:{width:1440,height:900}})
    async function signIn(page,password='fixture-secret') {
      await page.getByPlaceholder('Contoh: 08xxxxxxxxxx').fill('080000000001')
      await page.getByPlaceholder('Masukkan kata sandi').fill(password)
      await page.getByRole('button',{name:'Masuk',exact:true}).click()
    }
    const page=await context.newPage()
    await page.goto(origin+'/login')
    await page.screenshot({path:path.join(out,'login-desktop.png'),fullPage:true})
    await signIn(page)
    await page.waitForURL(origin+'/')
    await page.evaluate(async()=>{await navigator.serviceWorker.ready})
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
    const prepared=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('employee-offline-login.v1:')).length)
    assert.equal(prepared,1)
    upgradeShell=true
    await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()})
    await page.waitForFunction(async version=>{const registration=await navigator.serviceWorker.getRegistration(),cache=await caches.open('employee-shell-v1:'+version);return !!(await cache.match('/'))&&registration.active&&!registration.installing&&!registration.waiting},upgradedVersion)
    assert.ok(await page.evaluate(version=>caches.has('employee-shell-v1:'+version),shell.version),'old tabs retain their previous public chunks')
    loginStatus=502
    const gateway=await context.newPage()
    await gateway.goto(origin+'/login')
    await signIn(gateway)
    await gateway.getByRole('heading',{name:'Masuk dalam mode offline'}).waitFor()
    assert.equal(await gateway.getByRole('button',{name:'Stok',exact:true}).count(),1)
    for (const [name,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844]]) {
      await gateway.setViewportSize({width,height})
      assert.ok(await gateway.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow: '+name)
      await gateway.screenshot({path:path.join(out,'offline-'+name+'.png'),fullPage:true})
    }
    const denied=await context.newPage()
    await denied.goto(origin+'/login'); loginStatus=401; await signIn(denied)
    await denied.getByText('Invalid phone or password',{exact:true}).waitFor()
    assert.ok((await denied.url()).endsWith('/login'))
    await denied.screenshot({path:path.join(out,'online-denied.png'),fullPage:true})
    loginStatus=200; await signIn(denied); await denied.waitForURL(origin+'/')
    missingStaff=true
    await denied.goto(origin+'/login'); await signIn(denied)
    await denied.getByText('Akun belum terhubung ke profil karyawan. Hubungi pengelola.',{exact:true}).waitFor()
    assert.equal(await denied.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('employee-offline-login.v1:')).length),0)
    missingStaff=false; await signIn(denied); await denied.waitForURL(origin+'/')
    await context.setOffline(true)
    const disconnected=await context.newPage()
    await disconnected.goto(origin+'/login')
    assert.equal(await disconnected.locator('meta[name=fixture-shell-version]').getAttribute('content'),'upgraded','offline reload must use the updated app shell')
    await signIn(disconnected,'wrong-password')
    await disconnected.getByText('Kredensial tidak valid',{exact:true}).waitFor()
    await signIn(disconnected)
    await disconnected.getByRole('heading',{name:'Masuk dalam mode offline'}).waitFor()
    await disconnected.reload()
    await disconnected.getByRole('heading',{name:'Masuk dalam mode offline'}).waitFor()
    await disconnected.screenshot({path:path.join(out,'network-offline-reload.png'),fullPage:true})
    assert.ok(authCalls>=4)
    await context.close()
    console.log(JSON.stringify({passed:true, gateway502:true, realBrowserOffline:true, reloadOffline:true, wrongPasswordRejected:true, online401Rejected:true, responsive:['desktop','tablet','mobile'], screenshotDirectory:out, syntheticFixtureOnly:true}))
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)) }
})().catch(error=>{console.error(error);process.exitCode=1})
