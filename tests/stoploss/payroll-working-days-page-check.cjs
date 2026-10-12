const { chromium, expect } = require('@playwright/test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {pathToFileURL}=require('node:url')
;(async()=>{
const {createServer}=await import(pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')),'dist/node/index.js')).href)
const tailwind=(await import(pathToFileURL(path.resolve('client-admin/tailwind.config.js')).href)).default
tailwind.content=[path.resolve('client-admin/src/**/*.{js,ts,jsx,tsx}')]
const server=await createServer({css:{postcss:{plugins:[require('tailwindcss')(tailwind),require('autoprefixer')()]}},configFile:false,esbuild:{jsx:'automatic'},root:path.resolve('client-admin'),server:{host:'127.0.0.1',port:6322,strictPort:true}})
let browser
try{
 await server.listen();browser=await chromium.launch()
 const context=await browser.newContext({viewport:{width:1400,height:1100},serviceWorkers:'block'})
 await context.addInitScript(()=>{localStorage.setItem('bubble-tea-language','zh');sessionStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'synthetic',user:{id:'u',role:'admin',storeId:'s',staff:null}},version:0}))})
 const errors=[];let saved;let listQuery;let legacy=false;let issue=false
 const basis=(probation=15,regular=5)=>({month:'2026-10',formalMonthlySalary:1400000,daysInMonth:31,eligibleDays:20,payableDays:probation+regular,workingDays:{probation,regular},amount:Math.round((probation*1120000+regular*1400000)/31),segments:[{type:'probation',startDate:'2026-10-01',endDate:'2026-10-15',monthlyRate:1120000,eligibleDays:15,days:probation,amount:Math.round(probation*1120000/31)},{type:'regular',startDate:'2026-10-16',endDate:'2026-10-20',monthlyRate:1400000,eligibleDays:5,days:regular,amount:Math.round(regular*1400000/31)}]})
 context.on('pageerror',e=>errors.push(e.message))
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let data={}
  if(url.pathname==='/api/salaries/prepare-month')data={created:0,updated:0,existing:1,skipped:issue?[{staffId:'employee',name:'工资测试员工',reason:'INVALID_PAYROLL_AMOUNT'}]:[]}
  if(url.pathname==='/api/staff')data={list:[{id:'employee',name:'工资测试员工',employeeNumber:'EMP001'}],total:1}
  if(url.pathname==='/api/salaries'&&route.request().method()==='GET'){listQuery=url;const b=basis();if(legacy){b.workingDays=null;b.manualAdjustment=true;b.recordedBaseSalary=123456}data={list:[{id:legacy?'legacy':'unrecorded:employee',staffId:'employee',month:'2026-10',staff:{id:'employee',name:'工资测试员工',employeeNumber:'EMP001'},status:legacy?'pending':'unrecorded',payrollReview:issue?{reason:'DEDUCTIONS_EXCEED_PAY'}:null,payrollBasis:b,baseSalary:legacy?123456:b.amount,overtime:0,commission:0,bonus:0,deduction:0,finalAmount:b.amount}]}}
  if(url.pathname.includes('/deposit-plan/'))data={depositDeductions:[],compensation:{items:[],rewards:0,penalties:0}}
  if(url.pathname.includes('/calculate/')){const p=Number(url.searchParams.get('probationDays')??15),r=Number(url.searchParams.get('regularDays')??5);if(p>15||r>5){await route.fulfill({status:400,json:{code:400,message:'WORKING_DAYS_EXCEED_EMPLOYMENT_DAYS'}});return}const b=basis(p,r);data={baseSalary:b.amount,payrollBasis:b,overtimePay:0,bonuses:0,deductions:0,compensation:{items:[],rewards:0,penalties:0},depositDeductions:[]}}
  if(url.pathname==='/api/salaries'&&route.request().method()==='POST'){saved=route.request().postDataJSON();data={id:'saved'}}
  await route.fulfill({json:{code:200,data}})
 })
 const page=await context.newPage();await page.goto('http://127.0.0.1:6322/staff/salary/salary')
 await expect(page.locator('p').filter({hasText:'工资测试员工'})).toBeVisible()
 assert.equal(listQuery.searchParams.get('includeUnrecorded'),'true')
 await expect(page.getByRole('button',{name:'生成本月全部待发工资'})).toHaveCount(0);await expect(page.getByRole('button',{name:'新增工资记录'})).toHaveCount(0);await page.locator('header').getByRole('button',{name:'更正',exact:true}).click();await page.locator('select').last().selectOption('employee')
 const probation=page.getByRole('spinbutton',{name:'试用期实际工作天数'}),regular=page.getByRole('spinbutton',{name:'正式期实际工作天数'})
 await probation.fill('16');await expect(page.getByRole('alert').filter({hasText:'请检查工作天数'})).toBeVisible()
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeDisabled()
 await probation.fill('10.5');await regular.fill('4')
 await expect(page.locator('input[type=number]').nth(2)).toHaveValue('560000')
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeEnabled()
 await page.locator('input[type=number]').nth(2).fill('570000')
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect.poll(()=>saved?.workingDays).toEqual({probation:10.5,regular:4})
 assert.equal(saved.manualCorrection,true);assert.equal(saved.autoBaseSalary,false);assert.equal(saved.manualBaseSalary,true);assert.equal(saved.baseSalary,570000);assert.deepEqual(errors,[])
 legacy=true;await page.reload();await page.locator('header').getByRole('button',{name:'更正',exact:true}).click();await page.locator('select').last().selectOption('employee');await expect(page.locator('input[type=number]').nth(2)).toHaveValue('123456')
 await page.getByRole('button',{name:'取消',exact:true}).click();issue=true;await page.reload();await expect(page.getByText('扣款超过当前测算工资，请核实实际工作天数和扣款。')).toBeVisible();await expect(page.getByText('INVALID_PAYROLL_AMOUNT')).toHaveCount(0);await expect(page.getByText(/待发工资已生成/)).toHaveCount(0);await expect(page.getByRole('button',{name:'标记为已发放'})).toBeDisabled()
 console.log('PASS complete roster, half-day calculation, bounds, saved payload and preservation of legacy manual wages in real admin UI')
 await context.close()
}finally{if(browser)await browser.close();await server.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
