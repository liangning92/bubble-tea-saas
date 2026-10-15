import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{staff:{findUniqueOrThrow:jest.fn()},config:{findUnique:jest.fn()},leaveBalance:{findUnique:jest.fn(),upsert:jest.fn(),create:jest.fn()}}}))
jest.mock('../src/services/StaffConfigService',()=>({getStaffConfig:jest.fn(async()=>({autoLeaveBalance:true}))}))
import prisma from '../src/config/database'
import {getLeaveBalance} from '../src/services/LeaveService'
import {getStaffConfig} from '../src/services/StaffConfigService'
const db=prisma as any
beforeEach(()=>{jest.clearAllMocks();db.staff.findUniqueOrThrow.mockResolvedValue({storeId:'s',hireDate:new Date('2024-05-01T00:00:00+07:00')});db.config.findUnique.mockResolvedValue({value:JSON.stringify({paidRestDays:2,annualLeaveDays:9,sickLeaveDays:8,tenureBonusEnabled:false})});db.leaveBalance.findUnique.mockResolvedValue(null);db.leaveBalance.upsert.mockImplementation(async({create}:any)=>create);(getStaffConfig as jest.MockedFunction<typeof getStaffConfig>).mockResolvedValue({autoLeaveBalance:true} as any)})
test('opening a balance initializes the requested year from the store policy',async()=>{
 expect(await getLeaveBalance('staff',2025)).toMatchObject({staffId:'staff',year:2025,annualLeave:9,sickLeave:8,usedLeave:0})
 expect(db.leaveBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_year:{staffId:'staff',year:2025}},update:{}}))
})
test('administrator-set balances are retained',async()=>{
 db.leaveBalance.findUnique.mockResolvedValue({annualLeave:0,sickLeave:1,usedLeave:0})
 expect(await getLeaveBalance('staff',2026)).toMatchObject({annualLeave:0,sickLeave:1})
 expect(db.leaveBalance.upsert).not.toHaveBeenCalled()
})
test('disabling automatic balance allocation is respected',async()=>{
 (getStaffConfig as jest.MockedFunction<typeof getStaffConfig>).mockResolvedValue({autoLeaveBalance:false} as any)
 expect(await getLeaveBalance('staff',2026)).toMatchObject({annualLeave:0,sickLeave:0})
})
