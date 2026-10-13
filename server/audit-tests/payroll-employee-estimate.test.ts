import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{staff:{findFirst:jest.fn()},salary:{findFirst:jest.fn()},config:{findUnique:jest.fn()},attendance:{findMany:jest.fn()},overtimeRequest:{findMany:jest.fn()}}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
jest.mock('../src/services/StaffService',()=>({calculateSalary:jest.fn()}))
import prisma from '../src/config/database'
import { calculateSalary } from '../src/services/StaffService'
import { staffRouter } from '../src/routes/staff'
const db=prisma as any,calculate=calculateSalary as jest.MockedFunction<typeof calculateSalary>
const forecast:any={staffId:'own',staffName:'Own employee',baseSalary:1132258,payrollBasis:{version:2,daysSource:'estimate',eligibleDays:27},compensation:{rewards:0,penalties:0,items:[]},depositDeductions:[],deductions:0,latePenalty:0,totalSalary:1132258}
beforeEach(()=>{jest.clearAllMocks();db.staff.findFirst.mockResolvedValue({id:'own',name:'Own employee',storeId:'store'});db.salary.findFirst.mockResolvedValue(null);db.config.findUnique.mockResolvedValue(null);db.attendance.findMany.mockResolvedValue([]);db.overtimeRequest.findMany.mockResolvedValue([]);calculate.mockResolvedValue(forecast)})
async function read(){const layer=(staffRouter as any).stack.find((l:any)=>l.route?.path==='/salary/my'),res:any={statusCode:200,status(n:number){this.statusCode=n;return this},json(data:any){this.data=data;return this}};await layer.route.stack.at(-1).handle({query:{month:'10',year:'2026',staffId:'someone-else'},user:{id:'current-user',storeId:'store',role:'staff'}},res);return res}
test('employee gets their own estimate when payroll has not been confirmed',async()=>{
 const res=await read();expect(res.statusCode).toBe(200);expect(res.data.data).toMatchObject({status:'unrecorded',baseSalary:1132258,totalSalary:1132258})
 expect(db.staff.findFirst).toHaveBeenCalledWith({where:{userId:'current-user'}});expect(calculate).toHaveBeenCalledWith('own',10,2026)
})
test('legacy automatic zero payroll shows the same full-month estimate and original amount',async()=>{
 db.salary.findFirst.mockResolvedValue({id:'salary',month:'2026-10',status:'pending',finalAmount:0,commission:30000})
 db.config.findUnique.mockResolvedValue({value:JSON.stringify({version:1,daysSource:'attendance'})})
 const res=await read();expect(res.data.data).toMatchObject({status:'pending',originalFinalAmount:0,totalSalary:1162258,baseSalary:1132258,commissions:30000})
})
test.each(['paid','pending'])('paid or manually corrected %s payroll retains saved amount and basis',async(status)=>{
 const basis={version:1,manualCorrection:true,daysSource:'manual',recordedBaseSalary:500000}
 db.salary.findFirst.mockResolvedValue({id:'salary',month:'2026-10',status,baseSalary:500000,finalAmount:480000,overtime:0,bonus:0,commission:0,deduction:20000})
 db.config.findUnique.mockImplementation(async({where}:any)=>where.storeId_key.key==='salary.probationBasis.salary'?{value:JSON.stringify(basis)}:null)
 const res=await read();expect(res.data.data).toMatchObject({status,totalSalary:480000,baseSalary:500000,payrollBasis:basis});expect(calculate).not.toHaveBeenCalled()
})
test('outside employment month clears the previous salary instead of returning a fake zero',async()=>{
 calculate.mockResolvedValue({...forecast,payrollBasis:{...forecast.payrollBasis,eligibleDays:0}})
 expect((await read()).data.data).toBe(null)
})
