const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
 const entry=path.resolve('client-admin/.pos-risk-check.tsx');
 fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import './src/i18n';import './src/index.css';import {useAuthStore} from './src/stores/auth';import {POSMonitorPage} from './src/pages/POSMonitorPage';import i18n from 'i18next';i18n.changeLanguage('zh');useAuthStore.setState({user:{id:'test',phone:'test',role:'admin',storeId:'test',staff:null},token:'synthetic',isAuthenticated:true});createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={new QueryClient()}><POSMonitorPage/></QueryClientProvider></BrowserRouter>);`);
 const tw=(await import(pathToFileURL(path.resolve('client-admin/tailwind.config.js')).href)).default;tw.content=[path.resolve('client-admin/src/**/*.{js,ts,jsx,tsx}')];
 const server=await createServer({css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},configFile:false,esbuild:{jsx:'automatic'},root:path.resolve('client-admin'),server:{host:'127.0.0.1',port:6217,strictPort:true},plugins:[{name:'check-html',configureServer(s){s.middlewares.use('/audit-check',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/audit-check','<html><div id="root"></div><script type="module" src="/.pos-risk-check.tsx"></script></html>'))})}}]});
 let browser;
 try{
 await server.listen();browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];let fail=false;
 await page.route('**/api/**',route=>{const url=new URL(route.request().url());requests.push(url);let data=[],status=200;
 if(url.pathname.endsWith('/risks')){data={staff:[{staffId:'cashier',staffName:'Test Cashier',manualDrawer:3,clearedCarts:4,removedItems:2}]};if(fail)status=503;}
 else if(url.pathname.endsWith('/stats'))data={warningCount:4,criticalCount:1,todayTotal:20};
 else if(url.pathname==='/api/pos-action-logs')data={totalPages:1,logs:[{id:'drawer',staffName:'Test Cashier',action:'cash_drawer',severity:'warning',createdAt:'2026-10-19T07:00:00Z',metadata:JSON.stringify({source:'manual',status:'requested',reason:'Exchange change',physicalState:'unknown'})}]};
 return route.fulfill({status,json:{code:status,data}})});
 await page.goto('http://127.0.0.1:6217/audit-check');const summary=page.getByTestId('pos-risk-summary');await expect(summary).toContainText('收银风险核查');await expect(summary).toContainText('旧版 POS');
 await summary.getByRole('button',{name:'人工／测试开箱: 3'}).click();
 await expect.poll(()=>requests.some(u=>u.searchParams.get('staffId')==='cashier'&&u.searchParams.get('action')==='cash_drawer')).toBe(true);
 await expect(page.getByText('开箱原因: Exchange change',{exact:true})).toBeVisible();await expect(page.getByText('实际钱箱开关状态未知；员工为当时登录账号。')).toBeVisible();
 await page.getByRole('button',{name:'清除筛选'}).click();await expect.poll(()=>requests.filter(u=>u.pathname==='/api/pos-action-logs').at(-1).searchParams.has('staffId')).toBe(false);
 for(const width of [1440,820,390]){await page.setViewportSize({width,height:1000});await expect(summary).toBeVisible();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw Error('Page overflow '+width);}
 fail=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.getByTestId('dashboard-read-failure')).toBeVisible({timeout:15000});
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS risk summary, staff drilldown/reset, unknown physical state, responsive layout, failed-query state');

 }finally{if(browser)await browser.close();await server.close();fs.unlinkSync(entry)}
})().catch(e=>{console.error(e);process.exitCode=1});
