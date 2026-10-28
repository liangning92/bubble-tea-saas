import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{}}))
import { calculatePayrollBasis, savePayrollBasis, savedPayrollBasis } from '../src/services/ProbationService'
import { correctionPreview, saveCorrection, payrollMonthClosed, payrollCorrectionSchema } from '../src/services/PayrollCorrectionService'
import { adjustmentPlan } from '../src/services/SalaryAdjustmentService'
const staff={id:'employee',storeId:'store',baseSalary:1400000,hireDate:new Date('2026-10-05T00:00:00+07:00'),terminationDate:null}
const values=new Map<string,any>()
const rule={month:'2026-10',enabled:true,mode:'interval',intervalMinutes:10,intervalAmount:5000,tiers:[],version:'v1',effectiveAt:'2026-10-01'}
const db:any={config:{findUnique:jest.fn(async({where}:any)=>{const value=values.get(where.storeId_key.key);return value?{value:JSON.stringify(value)}:null}),upsert:jest.fn(async({create}:any)=>{values.set(create.key,JSON.parse(create.value))}),findMany:jest.fn(async()=>[])},attendance:{findMany:jest.fn(async()=>[])}}
beforeEach(()=>{values.clear();jest.clearAllMocks();db.config.findMany.mockResolvedValue([]);db.attendance.findMany.mockResolvedValue([])})
test('new starter without attendance has no worked pay or paid credit',async()=>{
 values.set('staff.probation.rule',{enabled:true,durationUnit:'months',duration:1,salaryMode:'fixed',salaryValue:1300000})
 const basis=await calculatePayrollBasis(db,staff,'2026-10')
 expect(basis).toMatchObject({version:2,eligibleDays:27,payableDays:0,paidRestDays:0,daysSource:'estimate',amount:0,attendanceDays:{probation:0,regular:0}})
 expect(basis.segments[0]).toMatchObject({type:'probation',days:0,startDate:'2026-10-05',endDate:'2026-10-31'})
 expect(db.config.upsert).not.toHaveBeenCalled()
})
test('full-month estimate excludes fixed credits and actual half-day correction keeps them capped',async()=>{
 const employee={...staff,hireDate:new Date('2024-02-01T00:00:00+07:00'),terminationDate:new Date('2024-02-29T00:00:00+07:00')}
 const estimate=await calculatePayrollBasis(db,employee,'2024-02')
 expect(estimate.amount).toBe(1400000);expect(estimate.paidRestDays).toBe(0)
 const actual=await calculatePayrollBasis(db,employee,'2024-02',{probation:0,regular:28.5})
 expect(actual).toMatchObject({workedDays:28.5,paidRestDays:0.5,payableDays:29,amount:1400000})
})
test('attendance remains an explicit source and importing does not write a correction',async()=>{
 db.attendance.findMany.mockResolvedValue([{checkInTime:new Date('2026-10-06T09:00:00+07:00'),status:'normal'}])
 const basis=await calculatePayrollBasis(db,staff,'2026-10',undefined,'attendance')
 expect(basis).toMatchObject({daysSource:'attendance',workedDays:1,paidRestDays:0})
 expect(db.config.upsert).not.toHaveBeenCalled()
})
test('minute rules, disabled rules, tiers, missing rules, and manual override are explicit',async()=>{
 const input={lateMinutes:25,lateMode:'rule' as const,manualLateDeduction:0,otherAttendanceDeduction:2000}
 expect((await correctionPreview(db,'store','2026-10',input)).lateRuleRequired).toBe(true)
 await expect(saveCorrection(db,'store','employee','2026-10',{...input,reason:'checked'},'admin')).rejects.toThrow('LATE_RULE_REQUIRED')
 values.set('employee.workspace.rule.2026-10',rule)
 expect((await correctionPreview(db,'store','2026-10',input)).lateDeduction).toBe(10000)
 values.set('employee.workspace.rule.2026-10',{...rule,enabled:false})
 expect((await correctionPreview(db,'store','2026-10',input)).lateDeduction).toBe(0)
 values.set('employee.workspace.rule.2026-10',{...rule,mode:'tiers',tiers:[{minutes:10,amount:10000},{minutes:20,amount:30000}]})
 expect((await correctionPreview(db,'store','2026-10',input)).lateDeduction).toBe(30000)
 expect((await correctionPreview(db,'store','2026-10',{...input,lateMode:'manual',manualLateDeduction:7500})).lateDeduction).toBe(7500)
})
test('correction snapshots exclude automatic monthly late penalties and preserve other adjustments on repeated saves',async()=>{
 values.set('employee.workspace.rule.2026-10',rule)
 const input={lateMinutes:25,lateMode:'rule' as const,manualLateDeduction:0,otherAttendanceDeduction:2000,reason:'Verified month-end'}
 const items=[{id:'late-employee-2026-10',staffId:'employee',month:'2026-10',type:'penalty',amount:9000,status:'active'},{id:'other',staffId:'employee',month:'2026-10',type:'penalty',amount:8000,status:'active'}]
 db.config.findMany.mockResolvedValue(items.map(item=>({value:JSON.stringify(item)})))
 for(let i=0;i<2;i++){
  const correction=await saveCorrection(db,'store','employee','2026-10',input,'admin')
  const plan=await adjustmentPlan('store','employee','2026-10',db)
  expect(plan.penalties).toBe(8000);expect(plan.items.map(item=>item.id)).toEqual(['other'])
  await savePayrollBasis(db,{id:'salary',staffId:staff.id,month:'2026-10',baseSalary:1000000},staff,{probation:0,regular:20},true,{confirmed:true,correction,reason:input.reason,actorId:'admin'})
 }
 const basis=await savedPayrollBasis(db,'store','salary')
 expect(basis).toMatchObject({version:2,confirmed:true,correction:{lateMinutes:25,lateDeduction:10000,lateRule:{version:'v1'}},reason:input.reason,actorId:'admin'})
})
test('month-end payment boundary follows Jakarta even when UTC is still previous month',()=>{
 expect(payrollMonthClosed('2026-10',new Date('2026-10-31T16:59:59Z'))).toBe(false)
 expect(payrollMonthClosed('2026-10',new Date('2026-10-31T17:00:00Z'))).toBe(true)
 expect(payrollCorrectionSchema.safeParse({lateMinutes:-1,lateMode:'rule',reason:'checked'}).success).toBe(false)
 expect(payrollCorrectionSchema.safeParse({lateMinutes:0.5,lateMode:'rule',reason:'checked'}).success).toBe(false)
})
