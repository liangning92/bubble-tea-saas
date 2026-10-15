import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{staff:{findUnique:jest.fn()},attendance:{findMany:jest.fn()},attendanceRule:{findFirst:jest.fn()},schedule:{findMany:jest.fn()},leave:{findMany:jest.fn()},overtimeRequest:{findMany:jest.fn()},config:{findUnique:jest.fn()}}}))
jest.mock('../src/config/env',()=>({config:{database:{url:'file:synthetic.db'}}}))
jest.mock('../src/services/EmployeeWorkspaceStore',()=>({readWork:jest.fn(async()=>null),listWork:jest.fn(async()=>[])}))
jest.mock('../src/services/SalaryAdjustmentService',()=>({adjustmentPlan:jest.fn(async()=>({items:[],rewards:50000,penalties:20000}))}))
jest.mock('../src/services/SalaryDepositPlan',()=>({salaryRefundPlan:jest.fn(async()=>({items:[],amount:0})),ensureOnboardingDeposit:jest.fn(async()=>{}),salaryDepositPlan:jest.fn(async()=>[{amount:100000,amountMinor:10000000}])}))
jest.mock('../src/services/StaffConfigService',()=>({getStaffConfig:jest.fn(async()=>({attendanceBonus:true}))}))
import prisma from '../src/config/database'
import {calculateSalary} from '../src/services/StaffService'
const db=prisma as any
beforeEach(()=>{jest.clearAllMocks();db.staff.findUnique.mockResolvedValue({id:'staff',storeId:'s',name:'Test',baseSalary:1400000,hireDate:new Date('2026-10-01T00:00:00+07:00'),terminationDate:null});db.config.findUnique.mockResolvedValue(null);db.attendance.findMany.mockResolvedValue([]);db.attendanceRule.findFirst.mockResolvedValue({absenceDeductionType:'fixed',absenceDeductionFixed:10000000,overtimeRate:1.5,overtimeMinHours:1});db.schedule.findMany.mockResolvedValue([{date:new Date('2026-10-05T00:00:00+07:00')}]);db.leave.findMany.mockResolvedValue([]);db.overtimeRequest.findMany.mockResolvedValue([])})
test('manual workdays retain deposits and adjustments without inferring absences but retain deposits and rewards/penalties',async()=>{const result=await calculateSalary('staff',10,2026,{probation:0,regular:31});expect(result.baseSalary).toBe(1400000);expect(result.deductions).toBe(120000);expect(result.bonuses).toBe(50000);expect(result.totalSalary).toBe(1330000)})
test('approved overtime and leave queries end on the inclusive termination day',async()=>{db.staff.findUnique.mockResolvedValue({id:'staff',storeId:'s',name:'Test',baseSalary:1400000,hireDate:new Date('2026-10-12T00:00:00+07:00'),terminationDate:new Date('2026-10-20T00:00:00+07:00')});const result=await calculateSalary('staff',10,2026,{probation:0,regular:9});expect(result.baseSalary).toBe(406452);expect(db.overtimeRequest.findMany).toHaveBeenCalledWith({where:{staffId:'staff',status:'approved',date:{gte:new Date('2026-10-12T00:00:00+07:00'),lte:new Date('2026-10-20T23:59:59.999+07:00')}}});expect(result.payrollBasis.eligibleDays).toBe(9)})

test('18 automatic attendance days are paid with fixed credits and do not also incur absence penalties',async()=>{db.attendance.findMany.mockResolvedValue(Array.from({length:18},(_,i)=>({checkInTime:new Date(`2026-10-${String(i+1).padStart(2,'0')}T09:00:00+07:00`),checkOutTime:new Date(`2026-10-${String(i+1).padStart(2,'0')}T18:00:00+07:00`),status:'normal'})));const result=await calculateSalary('staff',10,2026,undefined,undefined,'attendance');expect(result.payrollBasis.workedDays).toBe(18);expect(result.payrollBasis.paidRestDays).toBe(2);expect(result.baseSalary).toBe(Math.round(1400000*18/31)+Math.round(1400000*2/31));expect(result.deductions).toBe(120000)})

test('changing workdays alone retains configured lateness and early-leave deductions',async()=>{
 db.attendanceRule.findFirst.mockResolvedValue({lateDeductionType:'fixed',lateDeductionFixed:500000,earlyLeaveDeductionType:'fixed',earlyLeaveDeductionFixed:300000,overtimeRate:1.5,overtimeMinHours:1})
 db.attendance.findMany.mockResolvedValue([{checkInTime:new Date('2026-10-05T10:00:00+07:00'),checkOutTime:new Date('2026-10-05T17:00:00+07:00'),status:'late'}])
 const result=await calculateSalary('staff',10,2026,{probation:0,regular:18})
 expect(result.latePenalty).toBe(5000);expect(result.deductions).toBe(128000)
})

test('custom payroll divisors, bonus thresholds and paid rest are consumed by salary calculation',async()=>{
 db.config.findUnique.mockImplementation(async({where}:any)=>where.storeId_key.key==='staff.payroll.rules'?{value:JSON.stringify({paidRestDays:3,dailyRateDivisor:20,overtimeMonthlyHours:100,attendanceBonusDays:1,attendanceBonusAmount:12345})}:null)
 db.attendance.findMany.mockResolvedValue([{checkInTime:new Date('2026-10-05T09:00:00+07:00'),checkOutTime:new Date('2026-10-05T18:00:00+07:00'),status:'normal'}])
 db.overtimeRequest.findMany.mockResolvedValue([{hours:2,date:new Date('2026-10-05T00:00:00+07:00')}])
 const result=await calculateSalary('staff',10,2026,undefined,undefined,'attendance')
 expect(result.payrollBasis.paidRestDays).toBe(3)
 expect(result.overtimePay).toBe(42000)
 expect(result.bonuses).toBe(62345)
 expect(result.calculationBasis).toEqual({workDaysPerMonth:20,hoursPerMonth:100})
})
test.each([['full_month',0],['prorated',1.5],['any_employment',3]])('partial-month paid rest follows %s policy',async(mode,expected)=>{
 db.staff.findUnique.mockResolvedValue({id:'staff',storeId:'s',name:'Test',baseSalary:1400000,hireDate:new Date('2026-10-16T00:00:00+07:00'),terminationDate:null})
 db.config.findUnique.mockImplementation(async({where}:any)=>where.storeId_key.key==='staff.payroll.rules'?{value:JSON.stringify({paidRestDays:3,paidRestEligibility:mode})}:null)
 const result=await calculateSalary('staff',10,2026,{probation:0,regular:5})
 expect(result.payrollBasis.paidRestDays).toBe(expected)
 expect(result.baseSalary).toBe(Math.round(1400000*(5+Number(expected))/31))
})
