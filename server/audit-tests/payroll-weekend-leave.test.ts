import {expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{config:{findUnique:jest.fn(async()=>null)},leave:{findUnique:jest.fn()},leaveType:{findUnique:jest.fn()},$transaction:jest.fn()}}))
import prisma from '../src/config/database'
import {assertWeekdayLeave} from '../src/services/PayrollRuleService'
import {applyLeave,approveLeave} from '../src/services/LeaveService'
const db=prisma as any
const date=(s:string)=>new Date(s+'T00:00:00+07:00')
test.each([['2026-10-10','2026-10-10'],['2026-10-11','2026-10-11'],['2026-10-09','2026-10-12']])('weekend leave is forbidden even when the range endpoints are weekdays: %s to %s',async(start,end)=>{await expect(assertWeekdayLeave(db,'s',date(start),date(end))).rejects.toThrow('WEEKEND_LEAVE_NOT_ALLOWED')})
test('weekday-only leave remains allowed in Jakarta timezone',async()=>{await expect(assertWeekdayLeave(db,'s',date('2026-10-12'),date('2026-10-16'))).resolves.toBeUndefined()})
test('a weekend application is rejected before balance initialization or any write',async()=>{await expect(applyLeave({staffId:'a',storeId:'s',leaveType:'annual',startDate:date('2026-10-10'),endDate:date('2026-10-10'),totalDays:1})).rejects.toThrow('WEEKEND_LEAVE_NOT_ALLOWED');expect(db.$transaction).not.toHaveBeenCalled();expect(db.leaveType.findUnique).not.toHaveBeenCalled()})
test('an old pending weekend application cannot be approved',async()=>{db.leave.findUnique.mockResolvedValue({id:'leave',storeId:'s',status:'pending',startDate:date('2026-10-09'),endDate:date('2026-10-12')});await expect(approveLeave('leave','admin')).rejects.toThrow('WEEKEND_LEAVE_NOT_ALLOWED');expect(db.$transaction).not.toHaveBeenCalled()})

test('saving an empty blocked-day list immediately permits weekend leave',async()=>{
 const {savePayrollRules,getPayrollRules}=await import('../src/services/PayrollRuleService')
 let saved:any=null
 const config:any={findUnique:jest.fn(async()=>saved?{value:JSON.stringify(saved)}:null),upsert:jest.fn(async({create}:any)=>{saved=JSON.parse(create.value);return create})}
 const custom:any={config}
 await savePayrollRules(custom,'store',{paidRestDays:3,blockedLeaveWeekdays:[],allowHalfDayLeave:false})
 expect((await getPayrollRules(custom,'store')).blockedLeaveWeekdays).toEqual([])
 await expect(assertWeekdayLeave(custom,'store',date('2026-10-10'),date('2026-10-11'))).resolves.toBeUndefined()
 await savePayrollRules(custom,'store',{paidRestDays:3,blockedLeaveWeekdays:[1]})
 await expect(assertWeekdayLeave(custom,'store',date('2026-10-12'),date('2026-10-12'))).rejects.toThrow('LEAVE_DAY_NOT_ALLOWED')
 await expect(assertWeekdayLeave(custom,'store',date('2026-10-10'),date('2026-10-11'))).resolves.toBeUndefined()
})
test('legacy weekend flag remains configurable and new weekday list takes precedence',async()=>{
 const {payrollRuleSchema}=await import('../src/services/PayrollRuleService')
 expect(payrollRuleSchema.parse({paidRestDays:2,blockWeekendLeave:false}).blockedLeaveWeekdays).toEqual([])
 expect(payrollRuleSchema.parse({paidRestDays:2,blockWeekendLeave:true,blockedLeaveWeekdays:[2,2]}).blockedLeaveWeekdays).toEqual([2])
 expect(()=>payrollRuleSchema.parse({paidRestDays:2,blockedLeaveWeekdays:[7]})).toThrow()
 expect(()=>payrollRuleSchema.parse({paidRestDays:2,dailyRateDivisor:0})).toThrow()
})
test('annual and sick allowances come from saved rules rather than fixed amounts',async()=>{
 const {payrollRuleSchema,leaveEntitlement}=await import('../src/services/PayrollRuleService')
 const rules=payrollRuleSchema.parse({paidRestDays:0,annualLeaveDays:8,sickLeaveDays:9,tenureBonusEnabled:true,tenureBonusYears:3,tenureAnnualLeaveDays:20})
 expect(leaveEntitlement(rules,date('2025-01-01'),2026)).toEqual({annualLeave:8,sickLeave:9})
 expect(leaveEntitlement(rules,date('2020-01-01'),2026)).toEqual({annualLeave:20,sickLeave:9})
 expect(leaveEntitlement({...rules,tenureBonusEnabled:false},date('2020-01-01'),2026).annualLeave).toBe(8)
})
test('an older client changing paid days does not reset newer settings',async()=>{
 const {savePayrollRules}=await import('../src/services/PayrollRuleService')
 const config:any={findUnique:jest.fn(async()=>({value:JSON.stringify({paidRestDays:2,blockedLeaveWeekdays:[1],dailyRateDivisor:22,attendanceBonusAmount:999})})),upsert:jest.fn(async()=>({}))}
 const updated=await savePayrollRules({config},'s',{paidRestDays:4})
 expect(updated).toMatchObject({paidRestDays:4,blockedLeaveWeekdays:[1],dailyRateDivisor:22,attendanceBonusAmount:999})
})
