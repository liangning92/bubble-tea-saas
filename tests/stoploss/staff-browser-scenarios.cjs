const assert = require('node:assert/strict'), fs = require('node:fs');
module.exports = async function staffBrowser({ page, browser, prisma, check, base, output, assertEventually }) {
  const adminOrigin=process.env.WORKFLOW_ADMIN_ORIGIN || 'http://127.0.0.1:6311';
  const staffOrigin=process.env.WORKFLOW_STAFF_ORIGIN || 'http://127.0.0.1:6312';
  const passed=[];
  await page.goto(adminOrigin+'/staff/new');
  for(const key of ['name','phone','password','position'])assert.equal(await page.locator('#staff-'+key).getAttribute('required'),'');
  await page.locator('#staff-name').fill('UI Workflow Employee');await page.locator('#staff-phone').fill('081234567899');await page.locator('#staff-password').fill('SyntheticStaffOnly2026');await page.locator('#staff-position').selectOption('cashier');await page.locator('#staff-employmentType').selectOption('part_time');await page.locator('#staff-weeklyHours').fill('20');await page.locator('#staff-hourlyRate').fill('25000');await page.locator('#staff-baseSalary').fill('3500000');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/staff');await page.getByRole('cell',{name:'UI Workflow Employee',exact:true}).waitFor();
  const staff=await prisma.staff.findFirst({where:{name:'UI Workflow Employee'}});assert.ok(staff);assert.equal(staff.baseSalary,3500000);assert.equal(staff.hourlyRate,25000);assert.equal(staff.weeklyHours,20);
  await page.goto(adminOrigin+'/staff/'+staff.id+'/edit');await assertEventually(async()=>assert.equal(await page.locator('#staff-baseSalary').inputValue(),'3500000'));await page.locator('#staff-baseSalary').fill('4000000');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/staff');await page.reload();assert.ok((await page.getByRole('row').filter({hasText:'UI Workflow Employee'}).innerText()).replace(/\u00a0/g,' ').includes('Rp 4.000.000'));
  passed.push('actual staff form required controls, part-time numeric save, salary edit/reload in archive');
  for(const [url,parent,child] of [['/staff/attendance/correction','/staff/attendance','/staff/attendance/correction'],['/staff/attendance/overtime','/staff/attendance','/staff/attendance/overtime'],['/staff/salary/deposit','/staff/salary','/staff/salary/deposit'],['/staff/points/rewards','/staff/points','/staff/points/rewards']]){
    await page.goto(adminOrigin+url);await page.locator(`a[href="${parent}"][aria-current=page]`).waitFor();await page.locator(`a[href="${child}"][aria-current=page]`).waitFor();
  }
  await page.goto(adminOrigin+'/staff/salary/deposit');await page.getByRole('button',{name:'Add Deposit',exact:true}).click();let dialog=page.locator('.fixed.inset-0').last();await dialog.getByRole('link',{name:'Deposit Rules',exact:true}).click();await page.waitForURL('**/staff/salary/deposit-rules');await page.locator('a[href="/staff/salary/deposit-rules"][aria-current=page]').waitFor();
  await page.getByRole('button',{name:'Add Rule',exact:true}).click();dialog=page.locator('.fixed.inset-0').last();await dialog.locator('input[type=text]').fill('UI Workflow Deposit Rule');await dialog.locator('input[type=number]').nth(0).fill('500000');await dialog.locator('input[type=number]').nth(1).fill('100000');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();await page.getByText('UI Workflow Deposit Rule',{exact:true}).waitFor();
  const rule=await prisma.depositRule.findFirst({where:{name:'UI Workflow Deposit Rule'}});assert.equal(rule.depositAmount,50000000);assert.equal(rule.monthlyAmount,10000000);
  const smallerRule=await check('POST','/api/deposit/rules',{name:'UI Deposit Rp 300000',depositAmount:30000000,deductionType:'monthly',monthlyAmount:10000000,refundType:'full'},201);
  await page.goto(adminOrigin+'/staff/salary/deposit');await page.getByRole('button',{name:'Add Deposit',exact:true}).click();dialog=page.locator('.fixed.inset-0').last();await dialog.locator('select').nth(0).selectOption(staff.id);await dialog.locator('select').nth(1).selectOption(smallerRule.id);assert.equal(await dialog.locator('input[type=number]').inputValue(),'300000');await page.screenshot({path:output+'/deposit-rule-autofill-300000.png',fullPage:true});await dialog.locator('select').nth(1).selectOption(rule.id);assert.equal(await dialog.getByLabel('Deposit collection target (Rp) *').inputValue(),'500000');await dialog.locator('select').nth(1).selectOption('');assert.equal(await dialog.locator('input[type=number]').inputValue(),'');await dialog.locator('select').nth(1).selectOption(rule.id);assert.equal(await dialog.locator('input[type=number]').inputValue(),'500000');await dialog.locator('input[type=number]').fill('500000');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});const deposit=await prisma.staffDeposit.findFirst({where:{staffId:staff.id}});assert.equal(deposit.totalAmount,50000000);assert.equal(deposit.deductedAmount,0);await page.screenshot({path:output+'/deposit-target-saved.png',fullPage:true});
  passed.push('correct nested navigation, visible rule entry from deposit form, create rule/save/reload and create employee deposit');
  for(const [type,amount,reason] of [['reward',100000,'UI October award'],['penalty',50000,'UI October deduction']])await check('POST','/api/salaries/adjustments',{staffId:staff.id,month:'2026-10',type,amount,reason,requestId:require('node:crypto').randomUUID()},201);
  await page.goto(adminOrigin+'/staff/salary/salary');await page.getByRole('button',{name:/Add Salary/}).click();dialog=page.locator('.fixed.inset-0').last();await dialog.locator('select').selectOption(staff.id);await dialog.locator('input[type=month]').fill('2026-10');await dialog.getByRole('button',{name:/Calculate/}).click();await assertEventually(async()=>assert.equal(await dialog.locator('input[type=number]').nth(0).inputValue(),'4000000'));assert.equal(await dialog.locator('input[type=number]').nth(4).inputValue(),'150000');
  for(const [index,amount] of [[1,'200000'],[2,'50000']])await dialog.locator('input[type=number]').nth(index).fill(amount);
  // The fifth monetary control is deduction; use labels' order from actual DOM below.
  assert.equal(await dialog.locator('input[type=number]').last().inputValue(),'150000');
  assert.equal(await dialog.locator('input[type=number]').last().getAttribute('readonly'),'');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});const salary=await prisma.salary.findFirst({where:{staffId:staff.id,month:'2026-10'}});assert.equal(salary.finalAmount,4200000);
  await page.reload();await page.getByText('UI Workflow Employee',{exact:true}).last().waitFor();assert.ok((await page.locator('body').innerText()).replace(/\u00a0/g,' ').includes('Rp 4.200.000'));
  const payrollCard=page.locator('.bg-white.rounded-2xl').filter({hasText:'UI Workflow Employee'});await payrollCard.getByRole('button',{name:'Mark as Paid',exact:true}).click();await assertEventually(async()=>assert.equal((await prisma.staffDeposit.findUnique({where:{id:deposit.id}})).deductedAmount,10000000));await check('PUT','/api/salaries/'+salary.id+'/mark-paid',{});assert.equal(await prisma.staffDepositDeduction.count({where:{salaryId:salary.id}}),1);
  passed.push('actual payroll staff selector, auto-calculated base/deposit IDR, component save and total/reload');
  // Record rewards/penalties through their independent employee navigation.
  await page.goto(adminOrigin+'/staff/adjustments');
  await page.locator('a[href="/staff/adjustments"][aria-current=page]').waitFor();
  for(const [kind,amount,reason] of [['reward','100000','UI service award'],['penalty','25000','UI deduction reason']]) {
    await page.getByRole('button',{name:'Add Adjustment',exact:true}).click();
    const panel=page.locator('.fixed.inset-0 form');
    await panel.getByLabel('Employee',{exact:true}).selectOption(staff.id);
    await panel.getByLabel('Payroll Month',{exact:true}).fill('2026-11');
    await panel.getByLabel('Type',{exact:true}).selectOption(kind);
    await panel.getByLabel('Amount',{exact:true}).fill(amount);
    await panel.getByLabel('Reason',{exact:true}).fill(reason);
    await panel.getByRole('button',{name:'Save',exact:true}).click();await panel.waitFor({state:'hidden'});
    await page.getByText(reason,{exact:true}).waitFor();
  }
  await page.goto(adminOrigin+'/staff/salary/salary');await page.getByRole('button',{name:/Add Salary/}).click();dialog=page.locator('.fixed.inset-0').last();
  await dialog.locator('select').selectOption(staff.id);await dialog.locator('input[type=month]').fill('2026-11');
  await assertEventually(async()=>assert.equal(await dialog.locator('input[type=number]').last().inputValue(),'125000'));
  assert.equal(await dialog.locator('input[type=number]').nth(3).inputValue(),'100000');
  await dialog.locator('input[type=number]').nth(0).fill('4000000');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const november=await prisma.salary.findFirst({where:{staffId:staff.id,month:'2026-11'}});assert.equal(november.finalAmount,3975000);
  await page.goto(adminOrigin+'/staff/adjustments');
  await page.locator('tr').filter({hasText:'UI deduction reason'}).getByRole('button',{name:'Cancel Record',exact:true}).click();
  await assertEventually(async()=>assert.equal((await prisma.salary.findUnique({where:{id:november.id}})).finalAmount,4000000));
  await page.goto(adminOrigin+'/staff/salary/salary');
  const novemberCard=page.locator('.bg-white.rounded-2xl').filter({hasText:'UI Workflow Employee'}).filter({hasText:'November 2026'});
  await novemberCard.getByText('Rewards',{exact:true}).waitFor();await novemberCard.getByText('Penalty Deductions',{exact:true}).waitFor();await novemberCard.getByText('Deposit Deduction',{exact:true}).waitFor();
  await novemberCard.getByRole('button',{name:'Edit',exact:true}).click();dialog=page.locator('.fixed.inset-0').last();
  await assertEventually(async()=>assert.equal(await dialog.locator('input[type=number]').last().inputValue(),'100000'));
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal((await prisma.salary.findUnique({where:{id:november.id}})).finalAmount,4000000);
  assert.equal((await prisma.staffDeposit.findUnique({where:{id:deposit.id}})).deductedAmount,10000000);
  await page.screenshot({path:output+'/salary-rewards-penalties-deposit.png',fullPage:true});
  await page.goto(adminOrigin+'/staff/adjustments');await page.getByRole('button',{name:'Add Adjustment',exact:true}).click();
  const lockedForm=page.locator('.fixed.inset-0 form');await lockedForm.getByLabel('Employee',{exact:true}).selectOption(staff.id);await lockedForm.getByLabel('Payroll Month',{exact:true}).fill('2026-10');
  await lockedForm.getByText('Payroll is already paid for this month; rewards and penalties are locked.',{exact:true}).waitFor();
  assert.equal(await lockedForm.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);await lockedForm.getByRole('button',{name:'Cancel',exact:true}).click();
  passed.push('independent employee rewards/penalties UI, reason history, manual payroll automatically includes deposit/rewards/penalties without Calculate, cancellation updates pending payroll, distinct wage cards, edit does not double count');
  const auth=await check('POST','/api/auth/login',{phone:'081234567899',password:'SyntheticStaffOnly2026'});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
  try {
    await context.addInitScript(({token,id,staffId})=>{sessionStorage.setItem('staff-auth-storage',JSON.stringify({state:{token,user:{id,staffId,storeId:'store',role:'staff',name:'UI Workflow Employee',position:'cashier'},isAuthenticated:true},version:0}));localStorage.setItem('bubble-tea-language','en')},{token:auth.token,id:staff.userId,staffId:staff.id});
    let failSalary=false;
    await context.route('**/api/**',async route=>{const url=new URL(route.request().url());if(failSalary&&url.pathname==='/api/staff/salary/my')return route.fulfill({status:503,json:{code:503,message:'Synthetic outage'}});const response=await route.fetch({url:base+url.pathname+url.search});await route.fulfill({response});});
    const employee=await context.newPage();await employee.goto(staffOrigin+'/salary');await assertEventually(async()=>assert.ok((await employee.locator('body').innerText()).replace(/\u00a0/g,' ').includes('Rp 4.200.000')));await employee.getByText('Commission',{exact:true}).waitFor();
    const downloadEvent=employee.waitForEvent('download');await employee.getByRole('button',{name:'Download Slip',exact:true}).click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),'salary-2026-10.html');await download.saveAs(output+'/synthetic-payslip.html');const html=fs.readFileSync(output+'/synthetic-payslip.html','utf8');assert.ok(html.includes('UI Workflow Employee'));assert.ok(html.includes('4.200.000'));assert.ok(html.includes('Commission'));
    await employee.screenshot({path:output+'/staff-salary.png',fullPage:true});await employee.locator('button').nth(0).click();await assertEventually(async()=>assert.ok(!(await employee.locator('body').innerText()).replace(/\u00a0/g,' ').includes('Rp 4.200.000')));assert.equal(await employee.getByRole('button',{name:'Download Slip',exact:true}).count(),0);
    failSalary=true;await employee.reload();await employee.getByRole('alert').waitFor();failSalary=false;await employee.getByRole('button',{name:'Retry',exact:true}).click();await employee.getByRole('alert').waitFor({state:'hidden'});
    await employee.goto(staffOrigin+'/deposit');await assertEventually(async()=>assert.ok((await employee.locator('body').innerText()).replace(/\u00a0/g,' ').includes('Rp 500.000')));await employee.screenshot({path:output+'/staff-deposit.png',fullPage:true});await employee.goto(staffOrigin+'/deposit/rules');await employee.getByText('UI Workflow Deposit Rule',{exact:true}).waitFor();assert.ok((await employee.locator('body').innerText()).replace(/\u00a0/g,' ').includes('Rp 100.000'));
    await check('POST','/api/staff-points/earn',{staffId:staff.id,points:1234,reason:'UI Workflow Award'},201);await employee.goto(staffOrigin+'/points');await employee.getByText('UI Workflow Award',{exact:true}).waitFor();await employee.getByText('1234',{exact:true}).waitFor();
    await employee.goto(staffOrigin+'/overtime');await employee.getByRole('button',{name:'New Overtime Request',exact:true}).click();await employee.locator('input[type=date]').fill('2026-10-22');await employee.getByLabel('Start Time',{exact:true}).fill('17:00');await employee.getByLabel('End Time',{exact:true}).fill('19:00');await employee.locator('textarea').fill('UI Workflow Overtime');await employee.getByRole('button',{name:'Submit',exact:true}).click();await assertEventually(async()=>assert.ok(await prisma.overtimeRequest.findFirst({where:{staffId:staff.id,reason:'UI Workflow Overtime'}})));
    await page.goto(adminOrigin+'/staff/attendance/overtime');let requestCard=page.locator('.bg-white.rounded-xl.shadow-sm.p-4').filter({hasText:'UI Workflow Overtime'});await requestCard.getByRole('button',{name:'Approve',exact:true}).click();await assertEventually(async()=>assert.equal((await prisma.overtimeRequest.findFirst({where:{staffId:staff.id,reason:'UI Workflow Overtime'}})).status,'approved'));await employee.reload();await employee.getByText('UI Workflow Overtime',{exact:true}).waitFor();await employee.getByText('Approved',{exact:true}).waitFor();
    await employee.goto(staffOrigin+'/attendance/correction');await employee.getByRole('button',{name:'New Correction',exact:true}).click();await employee.locator('input[type=date]').fill('2026-10-23');await employee.locator('input[type=time]').nth(2).fill('08:00');await employee.locator('input[type=time]').nth(3).fill('16:00');await employee.locator('textarea').fill('UI Workflow Correction');await employee.getByRole('button',{name:'Submit',exact:true}).click();await assertEventually(async()=>assert.ok(await prisma.attendanceCorrection.findFirst({where:{staffId:staff.id,reason:'UI Workflow Correction'}})));
    await page.goto(adminOrigin+'/staff/attendance/correction');requestCard=page.locator('.bg-white.rounded-xl.shadow-sm.p-4').filter({hasText:'UI Workflow Correction'});await requestCard.getByRole('button',{name:'Approve',exact:true}).click();await assertEventually(async()=>assert.ok(await prisma.attendance.findFirst({where:{staffId:staff.id,checkInTime:new Date('2026-10-23T01:00:00Z')}})));await employee.reload();await employee.getByText('Approved',{exact:true}).waitFor();
    passed.push('actual employee overtime/correction form submission, admin UI approval, App status after reload and repaired attendance');
    passed.push('employee App sees saved payroll/commission, downloads real payslip, no-record month clears previous, failure/retry, deposit/rules in correct IDR, points history');
  } finally {await context.close();}
  await page.goto(adminOrigin+'/staff/salary/deposit-rules');await page.screenshot({path:output+'/admin-deposit-rules.png',fullPage:true});
  for(const item of passed)console.log('PASS staff browser: '+item);
  fs.writeFileSync(output+'/staff-browser-workflows.json',JSON.stringify({passed},null,2));
};
