const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const {chromium,expect}=require('@playwright/test')
const root=path.resolve('client-staff/dist'),out=path.resolve(process.env.EMPLOYEE_OFFLINE_UI_OUTPUT||'output/employee-offline-attendance')
fs.mkdirSync(out,{recursive:true})
const start=Date.now(),storeId='local-test-store',actorId='local-test-user',staffId='local-test-staff',hashes={}
const codeFor=(at,store=storeId)=>{const t=Math.floor(at/300000)*300000;return Buffer.from(JSON.stringify({v:2,s:store,p:store,t,sig:crypto.createHmac('sha256','local-browser-fixture-only').update(store+':'+t).digest('hex').slice(0,32)})).toString('base64')}
for(let at=Math.floor(start/300000)*300000;at<start+30*86400000;at+=300000)hashes[at]=crypto.createHash('sha256').update(codeFor(at)).digest('base64')
const preparation={version:1,actorId,staffId,storeId,posId:storeId,issuedAt:start,expiresAt:start+30*86400000,windowMs:300000,hashes,authorization:'synthetic-attendance-authorization',attendance:[]}
let holdReplies=true,received=[];const receipts=new Map(),records=new Map()
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost')
 if(url.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let body='';for await(const chunk of req)body+=chunk
  if(url.pathname==='/api/auth/login')return res.end(JSON.stringify({code:200,data:{token:'local-test-token',user:{id:actorId,phone:'080000000001',role:'admin',storeId,staff:{id:staffId,name:'Offline attendance fixture',position:'cashier'}}}}))
  if(url.pathname==='/api/auth/employee-offline-attendance')return res.end(JSON.stringify({code:200,data:preparation}))
  if(url.pathname==='/api/auth/employee-offline-attendance/sync'){
   const input=JSON.parse(body);received.push(input)
   let result=receipts.get(input.id)
   if(!result){const id=input.type==='check_in'?'POSATT-'+input.id:input.attendanceId;const record=input.type==='check_in'?{id,staffId,checkInTime:input.occurredAt,checkOutTime:null}:{...records.get(id),checkOutTime:input.occurredAt};records.set(id,record);result={operationId:input.id,attendance:record};receipts.set(input.id,result)}
   if(holdReplies){req.socket.destroy();return}
   return res.end(JSON.stringify({code:200,data:result}))
  }
  res.statusCode=503;return res.end(JSON.stringify({code:503,message:'Fixture has no other business endpoints'}))
 }
 let file=path.join(root,decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.statusCode=400;return res.end()}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html')
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))
})
;(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),online=await context.newPage()
 await online.goto(origin+'/login');await online.getByPlaceholder('Contoh: 08xxxxxxxxxx').fill('080000000001');await online.getByPlaceholder('Masukkan kata sandi').fill('fixture-secret');await online.getByRole('button',{name:'Masuk',exact:true}).click();await online.waitForURL(origin+'/')
 await online.evaluate(async()=>{await navigator.serviceWorker.ready});await online.waitForFunction(()=>!!navigator.serviceWorker.controller)
 await context.setOffline(true);const page=await context.newPage(),at=start+29*86400000+60000
 await page.clock.setFixedTime(new Date(at));await page.goto(origin+'/login');await page.getByPlaceholder('Contoh: 08xxxxxxxxxx').fill('080000000001');await page.getByPlaceholder('Masukkan kata sandi').fill('fixture-secret');await page.getByRole('button',{name:'Masuk',exact:true}).click()
 const panel=page.getByTestId('offline-employee-attendance');await expect(panel.getByRole('button',{name:'Pindai untuk masuk',exact:true})).toBeEnabled()
 await panel.getByRole('button',{name:'Pindai untuk masuk',exact:true}).click();await page.getByRole('button',{name:'Input Manual',exact:true}).click()
 const textarea=page.locator('textarea');await textarea.fill(codeFor(at,'wrong-store'));await page.getByRole('button',{name:'Verifikasi & Absen',exact:true}).click();await expect(page.getByText('Kode tidak cocok dengan toko atau sudah kedaluwarsa. Pindai kode POS saat ini.',{exact:true}).first()).toBeVisible()
 await page.getByRole('button',{name:'Coba Lagi',exact:true}).click();await textarea.fill(codeFor(at-600000));await page.getByRole('button',{name:'Verifikasi & Absen',exact:true}).click();await expect(page.getByText('Kode tidak cocok dengan toko atau sudah kedaluwarsa. Pindai kode POS saat ini.',{exact:true}).first()).toBeVisible()
 await page.getByRole('button',{name:'Coba Lagi',exact:true}).click();await textarea.fill(codeFor(at));await page.getByRole('button',{name:'Verifikasi & Absen',exact:true}).click();await expect(panel.getByText('Catatan menunggu sinkronisasi: 1',{exact:true})).toBeVisible();await expect(panel.getByText('Sudah masuk',{exact:true})).toBeVisible()
 await page.clock.setFixedTime(new Date(at+8*3600000));await panel.getByRole('button',{name:'Pindai untuk pulang',exact:true}).click();if(await page.getByRole('button',{name:'Input Manual',exact:true}).count())await page.getByRole('button',{name:'Input Manual',exact:true}).click();await page.locator('textarea').fill(codeFor(at+8*3600000));await page.getByRole('button',{name:'Verifikasi & Absen',exact:true}).click()
 await expect(panel.getByText('Catatan menunggu sinkronisasi: 2',{exact:true})).toBeVisible();await expect(panel.getByText('Belum masuk',{exact:true})).toBeVisible()
 await page.reload();await expect(panel.getByText('Catatan menunggu sinkronisasi: 2',{exact:true})).toBeVisible();assert.equal(received.length,0)
 for(const [name,width,height]of [['desktop',1440,900],['tablet',768,1024],['phone',390,844]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'pending-'+name+'.png'),fullPage:true})}
 await context.setOffline(false);await panel.getByRole('button',{name:'Coba sinkronkan',exact:true}).click();await expect.poll(()=>receipts.size).toBe(1);await expect(panel.getByRole('button',{name:'Coba sinkronkan',exact:true})).toBeEnabled()
 holdReplies=false;await panel.getByRole('button',{name:'Coba sinkronkan',exact:true}).click();await expect(panel.getByText('Catatan menunggu sinkronisasi: 0',{exact:true})).toBeVisible()
 assert.equal(receipts.size,2);assert.equal(records.size,1);assert.ok(received.length>=3)
 const row=[...records.values()][0];assert.equal(Date.parse(row.checkInTime),at);assert.equal(Date.parse(row.checkOutTime),at+8*3600000)
 await page.screenshot({path:path.join(out,'reconnected-synced.png'),fullPage:true});await context.close()
 console.log(JSON.stringify({passed:true,syntheticOnly:true,day30:true,offlineQrClockInOut:true,reloadRetainsTwoEvents:true,wrongStoreAndExpiredQrRejected:true,lostReplyIdempotent:true,originalTimesPreserved:true,responsive:['desktop','tablet','phone'],screenshots:out}))
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1})
