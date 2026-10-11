const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const servers=[],entries=[];let browser;
 let draft=structuredClone(require('../../server/src/data/training-library.json')),published=structuredClone(draft),generation=null,publishedRevision=null,failSave=false,conflict=false,failRead=false;
 async function start(app,port,component,componentPath,user){
  const entry=path.resolve(app+'/.training-check.tsx');entries.push(entry);
  fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {createBrowserRouter,RouterProvider} from 'react-router-dom';import './src/i18n';import './src/index.css';import {useAuthStore} from './src/stores/auth';import {${component}} from '${componentPath}';import i18n from 'i18next';i18n.changeLanguage('zh');useAuthStore.setState({user:${JSON.stringify(user)},token:'synthetic',isAuthenticated:true});createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={createBrowserRouter([{path:'*',element:<${component}/> }])}/></React.StrictMode>);`);
  const tw=(await import(pathToFileURL(path.resolve(app+'/tailwind.config.js')).href)).default;tw.content=[path.resolve(app+'/src/**/*.{js,ts,jsx,tsx}')];
  const server=await createServer({css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},configFile:false,root:path.resolve(app),server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'check-html',configureServer(s){s.middlewares.use('/training-check',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/training-check','<html><div id="root"></div><script type="module" src="/.training-check.tsx"></script></html>'))})}}]});servers.push(server);await server.listen();
 }
 try{
 await start('client-admin',6230,'TrainingListPage','./src/pages/staff/TrainingListPage',{id:'test',phone:'test',role:'admin',storeId:'a',staff:null});
 await start('client-staff',6231,'TrainingPage','./src/pages/TrainingPage',{id:'staff',phone:'test',role:'staff',storeId:'a',staffId:'staff',name:'Test'});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900}});const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),method=route.request().method();let data=[];
  if(u.pathname==='/api/training/library/edit')data={catalogue:draft,generation,publishedRevision};
  else if(u.pathname==='/api/training/library/history')data={list:[],nextCursor:null};
  else if(u.pathname==='/api/training/library/draft'){
   if(failSave||conflict)return route.fulfill({status:conflict?409:500,json:{message:'TRAINING_VERSION_CONFLICT'}});
   const body=route.request().postDataJSON();draft=body.catalogue;generation=body.requestId;data={generation};
  }else if(u.pathname==='/api/training/library/publish'){const body=route.request().postDataJSON();published=structuredClone(draft);generation=body.requestId;publishedRevision=generation;data={generation}}
  else if(u.pathname==='/api/training/library'){
   if(failRead)return route.fulfill({status:500,json:{message:'READ_FAILED'}});data={...published,revision:publishedRevision};
  }
  return route.fulfill({json:{code:200,data}})
 });
 const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://127.0.0.1:6230/training-check?tab=courses');await expect(page.getByText('岗位责任与食品安全',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'添加课程',exact:true}).click();await expect(page.getByTestId('training-editor')).toBeVisible();
 const title=page.getByLabel('modules.12.title.zh',{exact:true});await title.fill('门店自定义课程');
 failSave=true;await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('操作失败');await expect(title).toHaveValue('门店自定义课程');failSave=false;
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');expect(published.modules).toHaveLength(12);
 await page.getByRole('button',{name:'审核并发布',exact:true}).click();await expect(page.getByRole('status')).toContainText('已发布');
 await page.getByRole('button',{name:'返回培训',exact:true}).click();await expect(page.getByText('门店自定义课程',{exact:true})).toBeVisible();
 const staff=await context.newPage();await staff.goto('http://127.0.0.1:6231/training-check');await expect(staff.getByText('门店自定义课程',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/开闭店规范标准/}).click();await page.getByRole('button',{name:'添加标准',exact:true}).click();await page.getByLabel('checklists.2.title.zh',{exact:true}).fill('门店自定义闭店标准');await page.getByLabel('checklists.2.items.0.zh',{exact:true}).fill('核对设备后交接');
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');await page.getByRole('button',{name:'审核并发布',exact:true}).click();await expect(page.getByRole('status')).toContainText('已发布');await page.getByRole('button',{name:'返回培训',exact:true}).click();await expect(page.getByText('门店自定义闭店标准',{exact:true})).toBeVisible();
 await staff.reload();await staff.getByRole('button',{name:/开闭店/}).click();await expect(staff.getByText('核对设备后交接',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'培训内容管理',exact:true}).click();await page.getByRole('button',{name:'门店自定义课程',exact:true}).click();await page.getByLabel('modules.12.title.zh',{exact:true}).fill('冲突保留内容');conflict=true;await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('另一位管理员');await expect(page.getByLabel('modules.12.title.zh',{exact:true})).toHaveValue('冲突保留内容');conflict=false;
 await page.getByRole('button',{name:'删除',exact:true}).first().click();await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByRole('status')).toContainText('草稿已保存');await page.getByRole('button',{name:'审核并发布',exact:true}).click();await expect(page.getByRole('status')).toContainText('已发布');await page.getByRole('button',{name:'返回培训',exact:true}).click();
 await staff.reload();await expect(staff.getByText('门店自定义课程',{exact:true})).toHaveCount(0);
 failRead=true;await staff.reload();await expect(staff.getByRole('alert')).toContainText('培训内容读取失败，请重试。');await expect(staff.getByText('岗位责任与食品安全',{exact:true})).toHaveCount(0);failRead=false;await staff.getByRole('button',{name:'重试',exact:true}).click();await expect(staff.getByText('岗位责任与食品安全',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'培训内容管理',exact:true}).click();await expect(page.getByTestId('training-editor')).toBeVisible();const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,40)})));if(overflow.length)console.log('Overflow',overflow);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS training: add/edit/delete, failed-save retention, conflict retention, draft/publication, shared staff content, standards, read retry, mobile layout');
 }finally{if(browser)await browser.close();for(const server of servers)await server.close();for(const entry of entries)fs.rmSync(entry,{force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
