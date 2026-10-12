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
