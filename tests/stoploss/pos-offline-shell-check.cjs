// Real Chromium service worker against the production bundle, with the web server stopped.
const {chromium,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('client-pos/dist'),out=path.resolve('../output/pos-offline-20261015');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,name==='/'?'index.html':name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return}
  const ext=path.extname(file),type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream';
  res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{message:'Synthetic API outage'}}));
  await page.goto(origin+'/#/login');await page.locator('input[type=tel]').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/pos-sw.js');await navigator.serviceWorker.ready});
  await page.reload();await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  const caches=await page.evaluate(async()=>{const names=await window.caches.keys();const cache=await window.caches.open(names.find(n=>n.startsWith('youme-pos-shell-')));return (await cache.keys()).map(r=>new URL(r.url).pathname)});
  assert(caches.includes('/index.html'));assert(caches.some(p=>p.includes('POSPage')));assert(caches.some(p=>p.includes('LoginPage')));assert(!caches.some(p=>p.startsWith('/api/')));
  await new Promise(resolve=>server.close(resolve));await context.setOffline(true);
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
   await page.setViewportSize({width,height});await page.reload();await page.locator('input[type=tel]').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   await page.screenshot({path:path.join(out,'shell-offline-'+name+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS production app opens after server shutdown; lazy chunks cached, API excluded; desktop/tablet/phone no horizontal overflow');
 }finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
