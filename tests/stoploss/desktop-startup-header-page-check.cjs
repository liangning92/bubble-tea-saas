const {chromium,expect}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{const fixture=await require('./desktop-startup-header-fixture.cjs').createFixture();const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.origin+'/fixture?hold=1#/login');
 const submit=page.getByRole('button',{name:'登录',exact:true});await expect(submit).toBeVisible();await expect(submit).toBeDisabled();await expect(page.getByRole('status')).toContainText('正在准备收银');
 await page.locator('input[type=tel]').fill('08100000000');assert.equal(fixture.state.apiCalls,0,'no business HTTP before service readiness');
 await expect.poll(()=>fixture.state.painted).toBe(true);
 await page.request.post(fixture.origin+'/fixture-controls?ready=true');await expect(submit).toBeEnabled();await expect(page.locator('input[type=tel]')).toHaveValue('08100000000');
 fixture.state.ready=false;await page.goto(fixture.origin+'/fixture?hold=1&pos=1#/');await expect(page.getByRole('button',{name:'登录',exact:true})).toBeDisabled();await page.request.post(fixture.origin+'/fixture-controls?ready=true');await page.getByText('Synthetic Tea',{exact:true}).first().waitFor();await page.getByRole('button',{name:'确认渠道',exact:true}).click();
 const header=page.getByTestId('pos-header');await expect(header.getByRole('button',{name:'任务',exact:true})).toBeVisible();
 for(const language of ['ID','EN','ZH']){
  await header.getByRole('button',{name:language,exact:true}).click();
  for(const width of [1440,1280,1024,850,768]){
   await page.setViewportSize({width,height:900});const geometry=await header.evaluate(el=>({height:el.getBoundingClientRect().height,ys:Array.from(el.querySelectorAll('.pos-toolbar > button')).map(b=>b.getBoundingClientRect().top),toolbar:el.querySelector('.pos-toolbar')?.clientWidth,scroll:el.querySelector('.pos-toolbar')?.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.ok(geometry.height<=100,JSON.stringify({language,width,geometry}));assert.ok(Math.max(...geometry.ys)-Math.min(...geometry.ys)<2);assert.equal(geometry.overflow,false);if(width>=1024)assert.ok(geometry.scroll<=geometry.toolbar+1,'seven configured buttons all fit at '+language+'/'+width);
  }
 }
 await header.getByRole('button',{name:'ZH',exact:true}).click();await page.request.post(fixture.origin+'/fixture-controls?tasks=false');await page.getByRole('button',{name:'ZH',exact:true}).press('Tab');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(header.getByRole('button',{name:'任务',exact:true})).toHaveCount(0);
 await page.request.post(fixture.origin+'/fixture-controls?tasks=true');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(header.getByRole('button',{name:'任务',exact:true})).toBeVisible();
 await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS early login while API pending, disabled submission, input retained, delayed upgrade session resumes POS, all header operations single row at 768..1440 in three languages, task false/true refresh and mobile bounds');
 }finally{await browser.close();await fixture.close()}})().catch(e=>{console.error(e);process.exitCode=1});
