const assert=require('node:assert/strict');
module.exports=async({prisma,check})=>{
 const staff=await check('POST','/api/staff',{storeId:'store',name:'Deposit Auto Fixture',phone:'081299901111',password:'SyntheticOnly2026',baseSalary:1000000},201);
 const one=await check('POST','/api/deposit/rules',{name:'First payroll fixture',depositAmount:30000000,deductionType:'one_time',refundType:'full'},201);
 const deposit=await check('POST','/api/deposit/staff',{staffId:staff.id,depositRuleId:one.id,totalAmount:30000000},201);
 await prisma.staffDeposit.update({where:{id:deposit.id},data:{startDate:new Date('2026-10-01T00:00:00+07:00')}});
 const preview=await check('GET',`/api/salaries/deposit-plan/${staff.id}?month=2026-10`);assert.equal(preview.amount,300000);
 const salary=await check('POST','/api/salaries',{staffId:staff.id,month:'2026-10',baseSalary:1000000,deduction:50000},201);
 assert.equal(salary.deduction,350000);assert.equal(salary.finalAmount,650000);
 const plan=(await check('GET','/api/salaries?staffId='+staff.id)).list[0].depositDeductions;assert.equal(plan[0].amountMinor,30000000);
 assert.equal((await prisma.staffDeposit.findUnique({where:{id:deposit.id}})).deductedAmount,0);
 await check('PUT','/api/salaries/'+salary.id,{baseSalary:1000000,deduction:350000,depositDeductions:plan});
 assert.equal((await prisma.salary.findUnique({where:{id:salary.id}})).deduction,350000);
 await check('PUT','/api/salaries/'+salary.id,{baseSalary:1000000,deduction:299999,depositDeductions:plan},400);
 await check('PUT','/api/salaries/'+salary.id+'/mark-paid',{});await check('PUT','/api/salaries/'+salary.id+'/mark-paid',{});
 assert.equal(await prisma.staffDepositDeduction.count({where:{salaryId:salary.id}}),1);
 assert.equal((await prisma.staffDeposit.findUnique({where:{id:deposit.id}})).deductedAmount,30000000);
 const next=await check('POST','/api/salaries',{staffId:staff.id,month:'2026-11',baseSalary:1000000},201);assert.equal(next.deduction,0);
 // A pre-existing draft without a plan must be reviewed before payment, then
 // editing it automatically adds the due deposit while retaining other deductions.
 const other=await check('POST','/api/staff',{storeId:'store',name:'Missing Plan Fixture',phone:'081299901112',password:'SyntheticOnly2026',baseSalary:1000000},201);
 const otherDeposit=await check('POST','/api/deposit/staff',{staffId:other.id,depositRuleId:one.id,totalAmount:30000000},201);
 await prisma.staffDeposit.update({where:{id:otherDeposit.id},data:{startDate:new Date('2026-10-01T00:00:00+07:00')}});
 const old=await prisma.salary.create({data:{staffId:other.id,month:'2026-10',baseSalary:1000000,deduction:50000,finalAmount:950000,status:'pending'}});
 await check('PUT','/api/salaries/'+old.id+'/mark-paid',{},409);
 assert.equal((await prisma.salary.findUnique({where:{id:old.id}})).status,'pending');assert.equal(await prisma.staffDepositDeduction.count({where:{salaryId:old.id}}),0);
 await check('PUT','/api/salaries/'+old.id,{baseSalary:1000000,deduction:50000});
 assert.equal((await prisma.salary.findUnique({where:{id:old.id}})).finalAmount,650000);
 await check('PUT','/api/salaries/'+old.id+'/mark-paid',{});
 // A new month's rule must never be applied to an earlier payroll.
 const future=await check('POST','/api/deposit/staff',{staffId:other.id,depositRuleId:one.id,totalAmount:30000000},201);
 await prisma.staffDeposit.update({where:{id:future.id},data:{startDate:new Date('2026-12-01T00:00:00+07:00')}});
 assert.equal((await check('GET',`/api/salaries/deposit-plan/${other.id}?month=2026-11`)).amount,0);
 assert.equal((await check('GET',`/api/salaries/deposit-plan/${other.id}?month=2026-12`)).amount,300000);
 await check('GET',`/api/salaries/deposit-plan/foreign-employee-staff?month=2026-10`,undefined,404);
 console.log('PASS automatic first payroll deposits: manual form/server save, pending preview, repeat edit, legacy draft review, payment exactly once, later month and future start date');
};
