import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{},prisma:{}}))
import { payrollBasis, refreshEmploymentPayroll } from '../src/services/ProbationService'
import { unpaidLeavePlan } from '../src/services/SalaryLeavePlan'
import { ensureOnboardingDeposit, salaryDepositPlan, salaryRefundPlan } from '../src/services/SalaryDepositPlan'
import { retainPayslip, readPayslip } from '../src/services/SalaryPayslipService'
const policy={enabled:true,durationUnit:'months' as const,duration:1,salaryMode:'fixed' as const,salaryValue:1300000}
let staff:any,records:any[],values:Map<string,string>,salaries:any[],db:any
beforeEach(()=>{
 staff={id:'employee',storeId:'store',name:'Original name',employeeNumber:'EMP1',baseSalary:1400000,hireDate:new Date('2026-10-25T00:00:00+07:00'),terminationDate:null,user:{role:'staff'}};records=[];values=new Map([['staff.deposit.onboardingRule',JSON.stringify({depositRuleId:'rule'})]]);salaries=[]
 const rule={id:'rule',storeId:'store',name:'Onboarding',isActive:true,depositAmount:30000000,deductionType:'one_time',refundType:'full'}
 db={staff:{findUnique:jest.fn(async()=>staff),findUniqueOrThrow:jest.fn(async()=>staff)},depositRule:{findUnique:jest.fn(async()=>rule)},config:{findUnique:jest.fn(async({where}:any)=>{const value=values.get(where.storeId_key.key);return value===undefined?null:{value}}),upsert:jest.fn(async({where,create,update}:any)=>{const key=where.storeId_key.key;const row=values.has(key)?update:create;if(row.value!==undefined)values.set(key,row.value);return row}),create:jest.fn(async({data}:any)=>{if(values.has(data.key))throw Error('duplicate');values.set(data.key,data.value);return data})},staffDeposit:{findFirst:jest.fn(async()=>records[0]||null),findMany:jest.fn(async({where}:any)=>records.filter(d=>(where.status==='active'?d.status==='active':d.status!=='refunded'))),create:jest.fn(async({data}:any)=>{const r={...data,depositRule:rule,deductionLogs:[]};records.push(r);return r})},salary:{findFirst:jest.fn(async({where}:any)=>salaries.find(s=>s.month===where.month)||null),findMany:jest.fn(async({where}:any)=>salaries.filter(s=>s.status===where.status&&(!where.month?.lt||s.month<where.month.lt)))}}
})
test('25th starter earns seven probation days; seven-day resignation and regular 25th resignation use inclusive dates',()=>{
 expect(payrollBasis(staff,{enabled:true,rule:policy},'2026-10')).toMatchObject({amount:293548,eligibleDays:7,confirmationDate:'2026-11-25'})
 staff.hireDate=new Date('2026-10-01');staff.terminationDate=new Date('2026-10-07');expect(payrollBasis(staff,{enabled:true,rule:policy},'2026-10').amount).toBe(293548)
 staff.hireDate=new Date('2026-08-01');staff.terminationDate=new Date('2026-10-25');expect(payrollBasis(staff,{enabled:false},'2026-10').amount).toBe(1129032)
})
test('two paid leave days do not reduce full pay; only three additional unpaid days reduce monthly salary',()=>{
 staff.hireDate=new Date('2026-08-01');const basis=payrollBasis(staff,{enabled:false},'2026-10')
 expect(basis.amount).toBe(1400000);expect(unpaidLeavePlan(staff,{enabled:false},basis,[],new Set(['unpaid']),{probation:0,regular:3}).deduction).toBe(135484)
 const paid={leaveType:'paid',startDate:new Date('2026-10-01'),endDate:new Date('2026-10-02')};expect(unpaidLeavePlan(staff,{enabled:false},basis,[paid],new Set(['unpaid'])).deduction).toBe(0)
})
test('overlapping unpaid records count once and mixed rates use the appropriate trial period',()=>{
 staff.hireDate=new Date('2026-09-16');const enrollment={enabled:true,rule:policy};const basis=payrollBasis(staff,enrollment,'2026-10');const leave={leaveType:'unpaid',startDate:new Date('2026-10-15'),endDate:new Date('2026-10-16')};const result=unpaidLeavePlan(staff,enrollment,basis,[leave,{...leave,halfDay:true}],new Set(['unpaid']))
 expect(result.days).toEqual({probation:1,regular:1});expect(result.deduction).toBe(87097)
})
test('automatic preview creates no deposit records; employee setup is idempotent',async()=>{
 const plan=await salaryDepositPlan(staff.id,'2026-10',db,293548);expect(plan[0]).toMatchObject({amount:293548,amountMinor:29354800});expect(records).toHaveLength(0);expect(db.config.upsert).not.toHaveBeenCalled()
 await ensureOnboardingDeposit(db,staff);await ensureOnboardingDeposit(db,staff);expect(records).toHaveLength(1);expect(records[0].startDate).toEqual(staff.hireDate);expect((await salaryDepositPlan(staff.id,'2026-10',db,293548))[0].staffDepositId).toBe(plan[0].staffDepositId)
})
test('only 6452 carries forward after a 293548 allocation or actual collection',async()=>{
 await ensureOnboardingDeposit(db,staff);values.set('salary.depositPlan.first',JSON.stringify(await salaryDepositPlan(staff.id,'2026-10',db,293548)));salaries=[{id:'first',month:'2026-10',status:'pending'}];expect((await salaryDepositPlan(staff.id,'2026-11',db))[0].amount).toBe(6452)
 salaries=[];records[0].deductedAmount=29354800;records[0].deductionCount=1;expect((await salaryDepositPlan(staff.id,'2026-11',db))[0].amount).toBe(6452);records[0].deductedAmount=30000000;records[0].status='completed';expect(await salaryDepositPlan(staff.id,'2026-12',db)).toEqual([])
})
test('a fully reserved first-month deposit is not charged again while its wages are unpaid',async()=>{
 await ensureOnboardingDeposit(db,staff);values.set('salary.depositPlan.first',JSON.stringify([{staffDepositId:records[0].id,amountMinor:30000000}]));salaries=[{id:'first',month:'2026-10',status:'pending'}];expect(await salaryDepositPlan(staff.id,'2026-11',db)).toEqual([])
})
test('leaving before first payment neither deducts nor refunds; leaving later cancels the remainder and refunds only actual outstanding collection',async()=>{
 await ensureOnboardingDeposit(db,staff);staff.terminationDate=new Date('2026-10-31');expect(await salaryDepositPlan(staff.id,'2026-10',db,293548)).toEqual([]);expect(await salaryRefundPlan(staff.id,'2026-10',db)).toEqual({items:[],amount:0})
 staff.terminationDate=new Date('2026-11-25');records[0].deductedAmount=29354800;records[0].refundedAmount=10000000;expect(await salaryDepositPlan(staff.id,'2026-11',db)).toEqual([]);expect((await salaryRefundPlan(staff.id,'2026-11',db)).amount).toBe(193548)
 records[0].refundedAmount=29354800;records[0].status='refunded';expect((await salaryRefundPlan(staff.id,'2026-11',db)).amount).toBe(0)
})
test('paid payslip preserves original identity, rates and refund total across later changes and retry',async()=>{
 const salary={id:'salary',month:'2026-10',status:'paid',baseSalary:293548,overtime:0,commission:0,bonus:0,deduction:0,finalAmount:293548};values.set('salary.probationBasis.salary',JSON.stringify({version:2,formalMonthlySalary:1400000,confirmed:true}));const refund={amount:300000,items:[{staffDepositId:'old',amountMinor:30000000}]};const first=await retainPayslip(db,salary,staff,refund)
 staff.name='Changed';salary.finalAmount=999999;values.set('salary.probationBasis.salary',JSON.stringify({version:2,formalMonthlySalary:9000000}));expect(await retainPayslip(db,salary,staff,refund)).toEqual(first);expect(await readPayslip(db,'store','salary')).toMatchObject({staffName:'Original name',totalSalary:293548,settlementAmount:593548,payrollBasis:{formalMonthlySalary:1400000}});expect(db.config.create).toHaveBeenCalledTimes(1)
})

test('a zero first wage allocation carries the full outstanding deposit forward',async()=>{
 await ensureOnboardingDeposit(db,staff);values.set('salary.depositPlan.first','[]');salaries=[{id:'first',month:'2026-10',status:'paid'}]
 expect((await salaryDepositPlan(staff.id,'2026-11',db,1400000))[0].amount).toBe(300000)
})

test('seven-day resignation spanning month end cancels deductions even in unpaid earlier-month wages',async()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-02T12:00:00+07:00'))
 try{staff.hireDate=new Date('2026-09-25T00:00:00+07:00');await ensureOnboardingDeposit(db,staff);staff.terminationDate=new Date('2026-10-01T00:00:00+07:00');staff.status='resigned'
 expect(await salaryDepositPlan(staff.id,'2026-09',db,260000)).toEqual([]);expect(await salaryRefundPlan(staff.id,'2026-10',db)).toEqual({items:[],amount:0})
 }finally{jest.useRealTimers()}
})

test('resigning after seven days cancels planned uncollected deposits before rebasing pending wages',async()=>{
 staff.hireDate=new Date('2026-10-01');values.set('staff.probation.rule',JSON.stringify(policy));values.set('salary.probationBasis.salary',JSON.stringify({version:2,settlementVersion:1,daysSource:'estimate',confirmed:false,manualCorrection:false}));values.set('salary.depositPlan.salary',JSON.stringify([{staffDepositId:'deposit',amountMinor:30000000}]))
 const old={id:'salary',staffId:staff.id,month:'2026-10',status:'pending',baseSalary:1300000,overtime:0,commission:0,bonus:0,deduction:300000,finalAmount:1000000}
 db.salary.findMany=jest.fn(async()=>[old]);db.salary.findUnique=jest.fn(async()=>old);db.salary.updateMany=jest.fn(async()=>({count:1}));db.attendance={findMany:jest.fn(async()=>[])}
 await refreshEmploymentPayroll(db,{...staff,status:'resigned',terminationDate:new Date('2026-10-07')})
 expect(db.salary.updateMany).toHaveBeenCalledWith({where:{id:'salary',status:'pending'},data:{baseSalary:293548,finalAmount:293548,deduction:0}});expect(JSON.parse(values.get('salary.depositPlan.salary')!)).toEqual([])
})
