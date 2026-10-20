/* Synthetic API interception drives the real employee TrainingPage; never calls a live backend. */
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),entry=path.join(root,'client-staff/.training-notices-check.tsx');
const output=path.join(root,'output/training-update-notices');fs.mkdirSync(output,{recursive:true});
require(require.resolve('tsx/cjs',{paths:[path.join(root,'server')]}));
const {trainingContentFingerprint}=require(path.join(root,'server/src/services/TrainingLibraryStore.ts'));
const text=value=>({zh:value,id:value,en:value});
const fixtureModule=(key,title)=>({key,reviewed:true,title:text(title),subtitle:text('Synthetic summary'),minutes:4,sections:[{title:text('Synthetic chapter'),points:[text('Synthetic instruction')]}],quiz:[],practical:[],sources:[]});
let catalogue={version:1,revision:'synthetic-r1',modules:[fixtureModule('first','测试课程甲'),fixtureModule('second','测试课程乙')],checklists:[{key:'opening',title:text('测试开店标准'),items:[text('测试检查项')]}]};
const notice=(id,kind,key)=>{const item=catalogue[kind==='module'?'modules':'checklists'].find(item=>item.key===key),fingerprint=trainingContentFingerprint(kind,item);return{id,event:'training-content:'+fingerprint,read:false,trainingUpdate:{kind,moduleKey:key,...(kind==='checklist'?{itemKey:key}:{}),fingerprint,revision:catalogue.revision,generation:catalogue.revision}}};
let notices=[notice('first-event','module','first'),notice('second-event','module','second'),notice('check-event','checklist','opening')],failRead=false,failCatalogue=false,readRequests=[],progressWrites=[],catalogueReads=0;
let server,browser;
(async()=>{
 try{
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import './src/i18n';import './src/index.css';import i18n from 'i18next';import {useAuthStore} from './src/stores/auth';import {TrainingPage} from './src/pages/TrainingPage';i18n.changeLanguage('zh');useAuthStore.setState({user:{id:'synthetic-user',staffId:'synthetic-staff',storeId:'synthetic-store',name:'Synthetic',role:'staff'},token:'synthetic',isAuthenticated:true});window.trainingChangeAccount=()=>useAuthStore.setState({user:{id:'other-user',staffId:'other-staff',storeId:'other-store',name:'Other',role:'staff'},token:'other'});createRoot(document.getElementById('root')!).render(<BrowserRouter><TrainingPage/></BrowserRouter>);`);
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const tw=(await import(pathToFileURL(path.join(root,'client-staff/tailwind.config.js')).href)).default;tw.content=[path.join(root,'client-staff/src/**/*.{js,ts,jsx,tsx}')];
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 server=await createServer({cacheDir:path.join(output,'vite-cache'),configFile:false,esbuild:{jsx:'automatic'},root:path.join(root,'client-staff'),css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'synthetic-training-notices',configureServer(s){s.middlewares.use('/training',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/training','<html><div id="root"></div><script type="module" src="/.training-notices-check.tsx"></script></html>'))})}}]});await server.listen();
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900}});const errors=[];context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
 await context.route('**/api/**',async route=>{
   const request=route.request(),u=new URL(request.url()),method=request.method();let data=[];
   if(u.pathname==='/api/training/library'){catalogueReads++;if(failCatalogue)return route.fulfill({status:503,json:{message:'SYNTHETIC_FAILURE'}});data=catalogue}
   else if(u.pathname==='/api/staff-work/my/inbox')data={items:request.headers().authorization==='Bearer other'?[]:notices,counts:{trainingUnread:notices.filter(n=>!n.read).length}};
   else if(u.pathname.endsWith('/read')){const id=u.pathname.split('/').at(-2);readRequests.push(id);if(failRead)return route.fulfill({status:503,json:{message:'SYNTHETIC_READ_FAILURE'}});notices=notices.map(n=>n.id===id?{...n,read:true}:n);data={read:true}}
   else if(['/api/staff-work/my/learning','/api/staff-work/my/checklist'].includes(u.pathname)){if(method!=='GET')progressWrites.push(u.pathname);data=u.pathname.endsWith('checklist')?{}:[]}
   return route.fulfill({json:{code:200,data}})
 });
 const page=await context.newPage(),base='http://127.0.0.1:'+port;
 await page.goto(base+'/training');await expect(page.locator('[data-training-module="first"]').getByText('新内容',{exact:true})).toBeVisible();await expect(page.locator('[data-training-module="second"]').getByText('新内容',{exact:true})).toBeVisible();expect(readRequests).toEqual([]);
 await page.screenshot({path:path.join(output,'desktop-new-content.png'),fullPage:true});
 await page.locator('[data-training-module="first"]').click();await expect(page.getByRole('dialog',{name:'测试课程甲'})).toBeVisible();await expect.poll(()=>notices.find(n=>n.id==='first-event').read).toBe(true);expect(notices.find(n=>n.id==='second-event').read).toBe(false);expect(notices.find(n=>n.id==='check-event').read).toBe(false);expect(progressWrites).toEqual([]);await page.keyboard.press('Escape');
 console.log('PASS list view preserves unread; opening one module reads only its event without completing learning');
 failRead=true;await page.goto(base+'/training?tab=courses&module=second&notice=second-event');await expect(page.getByRole('dialog',{name:'测试课程乙'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('status')).toContainText('阅读状态未保存，请重试。');expect(notices.find(n=>n.id==='second-event').read).toBe(false);failRead=false;await page.getByRole('dialog').getByRole('button',{name:'重试',exact:true}).click();await expect.poll(()=>notices.find(n=>n.id==='second-event').read).toBe(true);await page.keyboard.press('Escape');
 console.log('PASS deep module link displays the item; failed read stays unread and accessible retry succeeds');
 await page.goto(base+'/training?tab=checklists&item=opening&notice=check-event');await expect(page.locator('#training-checklist-opening')).toBeVisible();await expect.poll(()=>notices.find(n=>n.id==='check-event').read).toBe(true);expect(progressWrites).toEqual([]);
 console.log('PASS checklist deep link targets only the published checklist and does not tick completion');
 notices=[notice('new-second','module','second')];await page.goto(base+'/training');await expect(page.locator('[data-training-module="second"]').getByText('新内容',{exact:true})).toBeVisible();
 notices=notices.map(n=>({...n,read:true}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('[data-training-module="second"]').getByText('新内容',{exact:true})).toHaveCount(0);
 console.log('PASS focus resume synchronizes a second device read receipt');
 catalogue={...catalogue,revision:'synthetic-r2',modules:[...catalogue.modules,fixtureModule('third','自动出现的新课程')]};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('[data-training-module="third"]')).toBeVisible();expect(catalogueReads).toBeGreaterThan(1);
 failCatalogue=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('alert')).toContainText('培训内容读取失败');await expect(page.locator('[data-training-module="first"]')).toHaveCount(0);failCatalogue=false;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('[data-training-module="third"]')).toBeVisible();
 console.log('PASS published catalogue refreshes without reload; failed read hides stale content and retries');
 await page.goto(base+'/training?module=withdrawn&notice=old');await expect(page.getByText('这项培训资料已更新或撤回，请查看当前资料。',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 console.log('PASS withdrawn material link stays on current catalogue and cannot acknowledge nonexistent content');
 notices=[notice('mobile-event','module','first')];await page.goto(base+'/training');await expect(page.locator('[data-training-module="first"]').getByText('新内容',{exact:true})).toBeVisible();
 for(const width of [768,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:path.join(output,`width-${width}-new-content.png`),fullPage:true})}
 await page.evaluate(()=>window.trainingChangeAccount());await expect(page.locator('[data-training-module="first"]').getByText('新内容',{exact:true})).toHaveCount(0);expect(progressWrites).toEqual([]);
 console.log('PASS account switch hides earlier personal updates; desktop/tablet/mobile retain modules and no overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS real TrainingPage synthetic notification browser checks');
 }finally{if(browser)await browser.close();if(server)await server.close();fs.rmSync(entry,{force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
