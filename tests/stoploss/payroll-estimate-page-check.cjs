const { chromium, expect } = require('@playwright/test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
;(async () => {
 const { createServer } = await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js')).href)
 const servers=[];let browser
 const output=path.resolve(process.env.PAYROLL_EVIDENCE_DIR||'/tmp/payroll-estimate-evidence');fs.mkdirSync(output,{recursive:true})
 const lateRule={month:'2026-10',enabled:true,mode:'interval',intervalMinutes:10,intervalAmount:5000,tiers:[],version:'test-v1'}
 const makeBasis=(days=27,source='estimate',minutes=0,other=0)=>({version:2,month:'2026-10',daysSource:source,formalMonthlySalary:1400000,daysInMonth:31,eligibleDays:27,workedDays:days,payableDays:days,workingDays:source==='estimate'?null:{probation:days,regular:0},attendanceDays:{probation:2,regular:0},paidRestDays:0,amount:Math.round(1300000*days/31),segments:[{type:'probation',startDate:'2026-10-05',endDate:'2026-10-31',monthlyRate:1300000,days,eligibleDays:27,amount:Math.round(1300000*days/31)}],correction:{lateMinutes:minutes,lateMode:'rule',manualLateDeduction:0,otherAttendanceDeduction:other,lateDeduction:Math.floor(minutes/10)*5000,lateRule}})
 let saved=null,prepareCalls=0,ruleAvailable=true
 let basis=makeBasis(),salary={id:'unrecorded:employee',staffId:'employee',month:'2026-10',staff:{id:'employee',name:'工资测试员工',employeeNumber:'EMP008'},status:'unrecorded',payrollBasis:basis,baseSalary:basis.amount,overtime:0,commission:0,bonus:50000,deduction:108000,finalAmount:basis.amount+50000-108000,compensationRewards:50000,compensationPenalties:8000,compensationAdjustmentIds:['penalty'],depositDeductionAmount:100000,depositDeductions:[{staffDepositId:'deposit',amountMinor:10000000}]}
 async function start(client,port){const tailwind=(await import(pathToFileURL(path.resolve(client,'tailwind.config.js')).href)).default;tailwind.content=[path.resolve(client,'src/**/*.{js,ts,jsx,tsx}'),path.resolve('shared/components/PayrollBasisDetails.tsx')];const server=await createServer({css:{postcss:{plugins:[require('tailwindcss')(tailwind),require('autoprefixer')()]}},configFile:false,esbuild:{jsx:'automatic'},root:path.resolve(client),server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[process.cwd(),path.dirname(require.resolve('react/package.json'))]}}});servers.push(server);await server.listen()}
 try{
  await start('client-admin',6332);await start('client-staff',6333);browser=await chromium.launch()
  const context=await browser.newContext({viewport:{width:1400,height:1100},serviceWorkers:'block'})
  await context.addInitScript(()=>{if(location.origin==='null')return;localStorage.setItem('bubble-tea-language','zh');sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic',user:{id:'u',role:'admin',storeId:'s',staff:null}},version:0}))})
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),method=route.request().method();let data={}
   if(url.pathname==='/api/salaries/prepare-month')prepareCalls++
   if(url.pathname==='/api/staff')data={list:[salary.staff],total:1}
   if(url.pathname==='/api/salaries'&&method==='GET')data={list:[salary]}
   if(url.pathname.includes('/deposit-plan/'))data={depositDeductions:[{staffDepositId:'deposit',amountMinor:10000000}],compensation:{items:[{id:'penalty'}],rewards:50000,penalties:8000}}
   if(url.pathname.includes('/calculate/')){
    const attendance=url.searchParams.get('daysSource')==='attendance',days=attendance&&!url.searchParams.has('probationDays')?2:Number(url.searchParams.get('probationDays')??27)
    if(days>27||days<0){await route.fulfill({status:400,json:{code:400,message:'WORKING_DAYS_EXCEED_EMPLOYMENT_DAYS'}});return}
    const minutes=Number(url.searchParams.get('lateMinutes')||0),other=Number(url.searchParams.get('otherAttendanceDeduction')||0),b=makeBasis(days,attendance?'attendance':'manual',minutes,other)
    b.correction.lateMode=url.searchParams.get('lateMode')||'rule';b.correction.manualLateDeduction=Number(url.searchParams.get('manualLateDeduction')||0)
    if(!ruleAvailable){b.correction.lateRule=null;b.correction.lateRuleRequired=minutes>0&&b.correction.lateMode==='rule'}
    if(b.correction.lateMode==='manual')b.correction.lateDeduction=b.correction.manualLateDeduction
    data={baseSalary:b.amount,payrollBasis:b,overtimePay:0,bonuses:50000,deductions:108000+b.correction.lateDeduction+other,compensation:{items:[{id:'penalty'}],rewards:50000,penalties:8000},compensationAdjustmentIds:['penalty'],depositDeductions:[{staffDepositId:'deposit',amountMinor:10000000,amount:100000}]}
   }
   if(url.pathname==='/api/salaries'&&method==='POST'||url.pathname==='/api/salaries/salary'&&method==='PUT'){
    saved=route.request().postDataJSON();const b=makeBasis(saved.workingDays.probation,saved.daysSource,saved.correction.lateMinutes,saved.correction.otherAttendanceDeduction);b.confirmed=true;b.reason=saved.correction.reason
    salary={...salary,...saved,id:'salary',status:'pending',payrollBasis:b,finalAmount:saved.baseSalary+saved.bonus-saved.deduction};data=salary
   }
   await route.fulfill({json:{code:200,data}})
  })
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-13T12:00:00+07:00'))
  await page.goto('http://127.0.0.1:6332/staff/salary/salary');await expect(page.locator('p').filter({hasText:'工资测试员工'})).toBeVisible();assert.equal(prepareCalls,0)
  await expect(page.getByText('按整月在职日期预计；月底更正实际工作天数及考勤后结算。预计金额不计入应付工资。')).toBeVisible()
  await page.screenshot({path:path.join(output,'admin-estimate-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'更正',exact:true}).last().click()
  const work=page.getByRole('spinbutton',{name:'试用期实际工作天数'}),minutes=page.getByRole('spinbutton',{name:'有效迟到分钟数'})
  await work.fill('28');await expect(page.getByRole('button',{name:'保存并确认工资'})).toBeDisabled()
  await work.fill('18.5');await minutes.fill('35');await page.getByLabel('其他考勤扣款 (Rp)',{exact:true}).fill('7000');await page.getByLabel('更正原因',{exact:true}).fill('月底核对实际工作天数与迟到')
  await expect(page.getByRole('spinbutton',{name:'本期基本工资'})).toHaveValue('775806');await expect(page.getByRole('spinbutton',{name:'扣款合计'})).toHaveValue('130000')
  await page.getByRole('button',{name:'预览考勤统计'}).click();await expect(page.getByRole('button',{name:'使用这份考勤统计'})).toBeVisible();await expect(work).toHaveValue('18.5');await page.getByRole('button',{name:'取消',exact:true}).first().click();await expect(work).toHaveValue('18.5')
  ruleAvailable=false;await minutes.fill('36');await expect(page.getByRole('button',{name:'保存并确认工资'})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('未配置本月分钟扣款规则')
  ruleAvailable=true;await minutes.fill('35');await expect(page.getByRole('button',{name:'保存并确认工资'})).toBeEnabled()
  await page.screenshot({path:path.join(output,'admin-correction-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'保存并确认工资'}).click();await expect.poll(()=>saved?.workingDays).toEqual({probation:18.5,regular:0});assert.equal(saved.includedAttendanceDeduction,22000);assert.equal(saved.deduction,130000)
  await expect(page.getByRole('button',{name:'标记为已发放'})).toBeDisabled()
  await page.getByRole('button',{name:'更正',exact:true}).last().click();await page.getByLabel('更正原因',{exact:true}).fill('再次核对');await page.getByRole('button',{name:'保存并确认工资'}).click();await expect.poll(()=>saved?.correction.reason).toBe('再次核对');assert.equal(saved.deduction,130000)
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'admin-confirmed-mobile.png'),fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  const staffContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  await staffContext.addInitScript(()=>{if(location.origin==='null')return;localStorage.setItem('bubble-tea-language','zh');sessionStorage.setItem('staff-auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic',user:{id:'u',role:'staff',staffId:'employee',position:'Cashier'}},version:0}))})
  let staffEstimate=false,noRecord=false
  await staffContext.route('**/api/**',async route=>{const url=new URL(route.request().url());let data={};if(url.pathname==='/api/staff-permissions/me')data={role:null};if(url.pathname==='/api/staff/salary/my')data=noRecord?null:staffEstimate?{staffName:'工资测试员工',month:'2026-10',status:'unrecorded',payrollBasis:makeBasis(),baseSalary:1132258,overtimePay:0,commissions:0,bonuses:0,deductions:0,totalSalary:1132258}:{...salary,staffName:'工资测试员工',overtimePay:salary.overtime,commissions:salary.commission,bonuses:salary.bonus,deductions:salary.deduction,totalSalary:salary.finalAmount};await route.fulfill({json:{code:200,data}})})
  const staffPage=await staffContext.newPage();staffPage.on('pageerror',e=>errors.push(e.message));await staffPage.goto('http://127.0.0.1:6333/salary');await expect(staffPage.getByText('工资测试员工',{exact:true})).toBeVisible();await expect(staffPage.getByText('已确认待发放',{exact:true})).toBeVisible()
  await staffPage.getByText('计薪依据',{exact:true}).click();await expect(staffPage.getByText(/有效迟到分钟数: 35/)).toBeVisible();await staffPage.screenshot({path:path.join(output,'staff-confirmed-mobile.png'),fullPage:true})
  assert.equal(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  const downloadPromise=staffPage.waitForEvent('download');await staffPage.getByRole('button',{name:/下载工资条/}).click();const download=await downloadPromise;const file=await download.path();const html=fs.readFileSync(file,'utf8');assert.match(html,/775[.,]806/);assert.match(html,/35/);assert.match(html,/test-v1/);assert.match(html,/再次核对/)
  staffEstimate=true;await staffPage.reload();await expect(staffPage.getByText('按整月在职日期预计；月底更正实际工作天数及考勤后结算。预计金额不计入应付工资。')).toBeVisible();await staffPage.screenshot({path:path.join(output,'staff-estimate-mobile.png'),fullPage:true})
  noRecord=true;await staffPage.getByRole('button',{name:'下个月'}).click();await expect(staffPage.getByText('工资测试员工',{exact:true})).toHaveCount(0)
  salary={...salary,status:'pending',baseSalary:123456,payrollBasis:{...salary.payrollBasis,version:1,confirmed:undefined,manualAdjustment:true,recordedBaseSalary:123456}}
  await page.reload();await page.getByRole('button',{name:'更正',exact:true}).last().click();await expect(page.getByRole('spinbutton',{name:'本期基本工资'})).toHaveValue('123456')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  const legacyForecast=makeBasis()
  salary={...salary,baseSalary:0,finalAmount:0,payrollBasis:{...legacyForecast,version:1,daysSource:'attendance',workingDays:{probation:0,regular:0},manualCorrection:false,manualAdjustment:false},reestimate:{baseSalary:legacyForecast.amount,overtime:0,commission:0,bonus:50000,deduction:108000,finalAmount:legacyForecast.amount+50000-108000,originalFinalAmount:0,difference:legacyForecast.amount+50000-108000,payrollBasis:legacyForecast}}
  await page.reload();await expect(page.getByText(/原保存金额/)).toBeVisible();await page.getByRole('button',{name:'更正',exact:true}).last().click();await expect(page.getByRole('spinbutton',{name:'试用期实际工作天数'})).toHaveValue('27');await expect(page.getByRole('spinbutton',{name:'本期基本工资'})).toHaveValue('1132258')
  assert.deepEqual(errors,[]);console.log('PASS admin/staff desktop/mobile: estimate without payables, half days, minutes and manual deductions, rule guard, import preview, repeated save, payment gate, downloaded payslip; evidence '+output)
  await context.close();await staffContext.close()
 }finally{if(browser)await browser.close();for(const server of servers)await server.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
