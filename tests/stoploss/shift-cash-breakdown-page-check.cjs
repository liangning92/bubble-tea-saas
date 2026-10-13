const {chromium,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve('client-admin'),fixture=path.join(root,'__shift_cash_breakdown_test.html');
  const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href);
  const snapshot={revenue:347000,expenses:0,qris:121000,cashFromRevenue:226000,openFloat:420000,expectedCash:646000,windowStart:'2026-10-13T12:03:55.107Z',windowEnd:'2026-10-13T15:58:52.058Z'};
  const initial={reconciliation:snapshot,actualCash:652000,recordedDifference:6000,manualQris:124000};
  const tw=(await import(pathToFileURL(path.join(root,'tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'src/**/*.{js,ts,jsx,tsx}')];
  fs.writeFileSync(fixture,`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-100 p-4"><main id="root" class="max-w-5xl mx-auto"></main><script type="module">
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import i18n from '/src/i18n/index.ts'; import '/src/index.css';
    import {ShiftCashBreakdown} from '/src/components/ShiftCashBreakdown.tsx';
    const root=createRoot(document.getElementById('root'));
    window.showBreakdown=async(language,props)=>{await i18n.changeLanguage(language);root.render(React.createElement(ShiftCashBreakdown,props))};
    await window.showBreakdown('zh',${JSON.stringify(initial)});
  </script></body></html>`,{flag:'wx'});
  const server=await createServer({configFile:false,root,cacheDir:'/tmp/shift-cash-breakdown-vite',css:{postcss:{plugins:[require('tailwindcss')(tw),require('autoprefixer')()]}},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:6219,strictPort:true}});
  let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:6219/__shift_cash_breakdown_test.html');
    const card=page.getByTestId('shift-cash-breakdown');await expect(card).toContainText('差额计算与来源');
    await expect(page.getByTestId('breakdown-system-difference')).toContainText('6.000');await expect(page.getByTestId('breakdown-manual-difference')).toHaveText(/9\.000/);await expect(page.getByTestId('breakdown-qris-difference')).toHaveText(/3\.000/);
    const dir=path.resolve('test-results/shift-cash-breakdown');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'zh-desktop.png'),fullPage:true});
    for(const [language,title] of [['en','Difference calculation and sources'],['id','Perhitungan dan sumber selisih']]){await page.evaluate(([language,props])=>window.showBreakdown(language,props),[language,initial]);await expect(card).toContainText(title);await expect(page.getByTestId('breakdown-manual-difference')).toHaveText(/9\.000/);}
    await page.evaluate(props=>window.showBreakdown('zh',props),initial);await page.setViewportSize({width:390,height:844});await expect(card).toContainText('差额计算与来源');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile content overflow');await page.screenshot({path:path.join(dir,'zh-mobile.png'),fullPage:true});
    await page.evaluate(props=>window.showBreakdown('zh',props),{...initial,manualQris:null});await expect(card).toContainText('未填写交班 QRIS');await expect(page.getByTestId('breakdown-manual-difference')).toHaveCount(0);
    await page.evaluate(props=>window.showBreakdown('zh',props),{...initial,manualQris:0});await expect(page.getByTestId('breakdown-manual-qris')).toHaveText(/Rp\s*0/);
    await page.evaluate(props=>window.showBreakdown('zh',props),{...initial,recordedDifference:9000});await expect(card.getByRole('alert')).toContainText('保存金额与复算结果不一致');
    await page.evaluate(props=>window.showBreakdown('zh',props),{...initial,reconciliation:null});await expect(card).toContainText('缺少交班现金快照');await expect(page.getByTestId('breakdown-system-difference')).toHaveCount(0);
    if(errors.length)throw Error(errors.join('\n'));
    console.log('PASS real React display: closing snapshot, QRIS discrepancy, three languages, mobile, missing data, zero, inconsistent snapshot');
  }finally{if(browser)await browser.close();await server.close();fs.unlinkSync(fixture);}
})().catch(e=>{console.error(e);process.exitCode=1});
