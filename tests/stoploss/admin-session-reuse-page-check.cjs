// Owned browser context + owned API; no real credentials or business writes.
const {chromium, expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.env.ADMIN_UI_BUILD||'client-admin/dist');
const user=id=>({id,phone:'fixture',role:'admin',storeId:'fixture-store',staff:null});
const token=(id,exp=Math.floor(Date.now()/1000)+600)=>`fixture.${Buffer.from(JSON.stringify({...user(id),exp})).toString('base64url')}.fixture`;
(async()=>{
 const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch();
  async function scenario({ids=['owner'],expired=false,revoked=false,logout=false,existing=false,loginUrl=false}={}){
   const context=await browser.newContext({serviceWorkers:'block'});let loginCalls=0,checks=0;
   await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();if(url.pathname==='/api/auth/login')loginCalls++;if(url.pathname==='/api/auth/me'){checks++;if(revoked)return route.fulfill({status:401,json:{message:'Revoked fixture'}});const jwt=req.headers().authorization?.slice(7);const payload=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));return route.fulfill({json:{code:200,data:user(payload.id)}})}return route.fulfill({json:{code:200,data:{list:[],total:0}}})});
   async function seeded(id){const page=await context.newPage();await page.addInitScript(({u,t})=>{localStorage.setItem('bubble-tea-language','en');sessionStorage.setItem('auth-storage',JSON.stringify({state:{user:u,token:t,isAuthenticated:true},version:0}))},{u:user(id),t:token(id,expired?Math.floor(Date.now()/1000)-60:undefined)});await page.goto(origin+'/channels');await expect(page.locator('aside')).toBeVisible();return page}
   const sources=[];for(const id of ids)sources.push(await seeded(id));
   const target=existing?await seeded('separate'):await context.newPage();
   if(!existing)await target.goto(origin+(loginUrl?'/login':'/channels'));
   if(ids.length===1&&!expired&&!revoked){await expect(target.locator('aside')).toBeVisible();await expect(target).toHaveURL(new RegExp(existing?'/channels':loginUrl?'/dashboard':'/channels'));if(!existing&&checks!==1)throw Error('Shared session must be checked by API');if(existing){const current=await target.evaluate(()=>JSON.parse(sessionStorage.getItem('auth-storage')).state.user.id);if(current!=='separate')throw Error('Existing account overwritten')}
    if(logout){await sources[0].getByRole('button',{name:'Logout',exact:true}).click();await expect(target).toHaveURL(/\/login$/);await expect(sources[0]).toHaveURL(/\/login$/)}
   }else{await expect(target).toHaveURL(/\/login$/);await expect(target.locator('input[type="password"]')).toBeVisible();if((expired||ids.length>1)&&checks!==0)throw Error('Ambiguous/expired session must not be reused')}
   if(loginCalls!==0)throw Error('Session reuse attempted password login');
   await context.close();
  }
  await scenario({ids:[]});await scenario({logout:true});await scenario({loginUrl:true});await scenario({expired:true});await scenario({revoked:true});await scenario({ids:['owner','other']});await scenario({existing:true});
  console.log('PASS: same-origin valid session reuse, deep route, login redirect, API revocation, expiry, account isolation and logout');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
