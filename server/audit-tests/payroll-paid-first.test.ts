import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
import {calculatePayrollBasis} from '../src/services/ProbationService'
import {unpaidLeavePlan} from '../src/services/SalaryLeavePlan'
const staff={id:'staff',storeId:'store',baseSalary:2600000,hireDate:new Date('2026-09-01T00:00:00+07:00')}
const values=new Map<string,any>()
const db:any={config:{findUnique:jest.fn(async({where}:any)=>{const value=values.get(where.storeId_key.key);return value?{value:JSON.stringify(value)}:null})},attendance:{findMany:jest.fn(async()=>[])}}
const date=(day:string)=>new Date(day+'T00:00:00+07:00')
const leave=(first:string,last=first,halfDay=false)=>({leaveType:'unpaid',startDate:date(first),endDate:date(last),halfDay})
beforeEach(()=>{values.clear();db.attendance.findMany.mockResolvedValue([]);values.set('staff.payroll.rules',{paidRestDays:2,dailyRateDivisor:26})})
test('monthly allowance covers leave first and only excess days reduce monthly pay',async()=>{
 const basis=await calculatePayrollBasis(db,staff,'2026-10')
 expect(unpaidLeavePlan(staff,{enabled:false},basis,[leave('2026-10-05','2026-10-06')],new Set(['unpaid']))).toMatchObject({paidDays:2,days:{regular:0,probation:0},deduction:0})
 const plan=unpaidLeavePlan(staff,{enabled:false},basis,[leave('2026-10-05','2026-10-07')],new Set(['unpaid']))
 expect(plan).toMatchObject({paidDays:2,requestedDays:{regular:3,probation:0},days:{regular:1,probation:0},deduction:83871})
 expect(unpaidLeavePlan(staff,{enabled:false},basis,[],new Set(['unpaid']),plan.requestedDays)).toMatchObject({deduction:plan.deduction,days:plan.days})
})
test('half days, duplicates, manual counts and zero allowance do not overdraw monthly credit',async()=>{
 const basis=await calculatePayrollBasis(db,staff,'2026-10')
 const list=[leave('2026-10-07',undefined,true),leave('2026-10-05','2026-10-06'),leave('2026-10-05')]
 expect(unpaidLeavePlan(staff,{enabled:false},basis,list,new Set(['unpaid']))).toMatchObject({paidDays:2,days:{regular:0.5},deduction:41935})
 expect(unpaidLeavePlan(staff,{enabled:false},basis,[],new Set(['unpaid']),{regular:3,probation:0})).toMatchObject({paidDays:2,days:{regular:1},deduction:83871})
 basis.payrollRules.paidRestDays=0
 expect(unpaidLeavePlan(staff,{enabled:false},basis,[leave('2026-10-05')],new Set(['unpaid']))).toMatchObject({paidDays:0,deduction:83871})
})
test.each(['full_month','prorated','any_employment'])('partial month ignores old %s credit policy and uses actual workdays × daily rate',async(mode)=>{
 values.set('staff.payroll.rules',{paidRestDays:5,paidRestEligibility:mode,dailyRateDivisor:26})
 const employee={...staff,hireDate:date('2026-10-16')}
 const basis=await calculatePayrollBasis(db,employee,'2026-10',{regular:5.5,probation:0})
 expect(basis).toMatchObject({amount:461290,workedAmount:461290,workedDays:5.5,paidRestDays:0,fullMonthEligible:false,proration:'actual_workdays',dailyRateDivisor:31})
 expect(basis.segments.reduce((sum,s)=>sum+s.amount,0)).toBe(461290)
 expect(unpaidLeavePlan(employee,{enabled:false},basis,[leave('2026-10-19')],new Set(['unpaid']))).toMatchObject({deduction:0,source:'included_in_days'})
})
test('partial-month attendance import uses deduplicated dates only when explicitly selected',async()=>{
 db.attendance.findMany.mockResolvedValue([{checkInTime:date('2026-10-05'),status:'normal'},{checkInTime:date('2026-10-19'),status:'normal'},{checkInTime:date('2026-10-19'),status:'late'},{checkInTime:date('2026-10-20'),status:'absence'}])
 const basis=await calculatePayrollBasis(db,{...staff,hireDate:date('2026-10-16')},'2026-10',undefined,'attendance')
 expect(basis).toMatchObject({amount:83871,workedDays:1,paidRestDays:0})
})
test('partial-month probation and regular pay use their respective daily rates',async()=>{
 values.set('staff.probation.rule',{enabled:true,durationUnit:'days',duration:5,salaryMode:'percentage',salaryValue:50})
 const basis=await calculatePayrollBasis(db,{...staff,hireDate:date('2026-10-16')},'2026-10',{probation:3,regular:2})
 expect(basis).toMatchObject({amount:293548,paidRestDays:0})
 expect(basis.segments.map(s=>s.amount)).toEqual([125806,167742])
})
