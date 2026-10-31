import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{salary:{findUniqueOrThrow:jest.fn(),updateMany:jest.fn()},staff:{findUniqueOrThrow:jest.fn()},config:{findUnique:jest.fn(),upsert:jest.fn()},expense:{create:jest.fn()},financeAuditLog:{create:jest.fn()},$transaction:jest.fn()}}))
jest.mock('../src/config/env',()=>({config:{jwt:{secret:'synthetic'}}}))
jest.mock('../src/services/StaffService',()=>({calculateSalary:jest.fn()}))
jest.mock('../src/services/SalaryAdjustmentService',()=>({periodLock:jest.fn(async()=>{}),SalaryAdjustmentError:class extends Error{}}))
jest.mock('../src/services/SalaryDepositPlan',()=>({salaryDepositPlan:jest.fn(async()=>[]),salaryRefundPlan:jest.fn(async()=>({amount:300000,items:[{staffDepositId:'deposit',amountMinor:30000000}]})),sameDepositPlan:(a:any,b:any)=>JSON.stringify(a.map((i:any)=>[i.staffDepositId,i.amountMinor]))===JSON.stringify(b.map((i:any)=>[i.staffDepositId,i.amountMinor]))}))
jest.mock('../src/services/DepositService',()=>({DepositInputError:class extends Error{},recordDepositDeduction:jest.fn(async()=>{}),processRefund:jest.fn(async()=>({id:'refund'}))}))
jest.mock('../src/services/SalaryPayslipService',()=>({retainPayslip:jest.fn(async()=>({salaryId:'salary',staffName:'Saved'})),readPayslip:jest.fn(async()=>({salaryId:'salary',staffName:'Saved'}))}))
import prisma from '../src/config/database'
import {salaryRouter} from '../src/routes/salary'
import {processRefund} from '../src/services/DepositService'
import {retainPayslip,readPayslip} from '../src/services/SalaryPayslipService'
const db=prisma as any
let record:any
beforeEach(()=>{
 jest.clearAllMocks();jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-26T12:00:00+07:00'))
 record={id:'salary',staffId:'employee',month:'2026-10',status:'pending',baseSalary:1129032,overtime:0,commission:0,bonus:0,deduction:0,finalAmount:1129032,staff:{id:'employee',storeId:'store',name:'Saved',employeeNumber:'EMP',terminationDate:new Date('2026-10-25')}}
 db.salary.findUniqueOrThrow.mockImplementation(async()=>({...record}));db.salary.updateMany.mockImplementation(async()=>{const count=record.status==='pending'?1:0;record.status='paid';return {count}})
 db.staff.findUniqueOrThrow.mockResolvedValue({storeId:'store'});db.expense.create.mockResolvedValue({id:'expense'});db.$transaction.mockImplementation(async(fn:any)=>fn(db))
 db.config.findUnique.mockImplementation(async({where}:any)=>where.storeId_key.key==='salary.probationBasis.salary'?{value:JSON.stringify({version:2,settlementVersion:1,confirmed:true,manualCorrection:true,daysSource:'manual',depositRefund:{amount:300000,items:[{staffDepositId:'deposit',amountMinor:30000000}]}})}:null)
})
const response=()=>({statusCode:200,data:null as any,status(n:number){this.statusCode=n;return this},json(d:any){this.data=d;return this}})
test('confirmed resignation payroll can close before month end, refund and retain payslip in the payment transaction; retry performs neither twice',async()=>{
 try{
  const handler=(salaryRouter as any).stack.find((l:any)=>l.route?.path==='/:id/mark-paid').route.stack.at(-1).handle
  const req={params:{id:'salary'},user:{id:'admin',role:'admin',storeId:'store'}}
  const first=response();await handler(req,first);expect(first.statusCode).toBe(200)
  expect(processRefund).toHaveBeenCalledWith(expect.objectContaining({amount:30000000,fullSettlement:true,requestId:'salary-refund-salary-deposit'}),db)
  expect(db.expense.create.mock.calls.map(([arg]:any)=>[arg.data.referenceType,arg.data.amount])).toEqual([['salary_deposit_refund',30000000],['salary',112903200]])
  expect(retainPayslip).toHaveBeenCalledWith(db,expect.objectContaining({status:'paid'}),record.staff,expect.objectContaining({amount:300000}))
  const second=response();await handler(req,second);expect(second.statusCode).toBe(200);expect(processRefund).toHaveBeenCalledTimes(1);expect(retainPayslip).toHaveBeenCalledTimes(1);expect(db.expense.create).toHaveBeenCalledTimes(2)
 }finally{jest.useRealTimers()}
})
test('administrator reads the retained paid snapshot rather than re-running current wage rules',async()=>{
 try{record.status='paid';const handler=(salaryRouter as any).stack.find((l:any)=>l.route?.path==='/:id/payslip').route.stack.at(-1).handle;const res=response();await handler({params:{id:'salary'}},res);expect(res.statusCode).toBe(200);expect(res.data.data.staffName).toBe('Saved');expect(readPayslip).toHaveBeenCalledWith(db,'store','salary')}finally{jest.useRealTimers()}
})

test('QR attendance changing after confirmation requires re-confirmation before recording payment',async()=>{
 const probation=await import('../src/services/ProbationService')
 const recalc=jest.spyOn(probation,'calculatePayrollBasis').mockResolvedValue({amount:1300000} as any)
 try{
  db.config.findUnique.mockImplementation(async({where}:any)=>where.storeId_key.key==='salary.probationBasis.salary'?{value:JSON.stringify({version:2,settlementVersion:1,confirmed:true,manualCorrection:true,daysSource:'attendance',depositRefund:{amount:300000,items:[{staffDepositId:'deposit',amountMinor:30000000}]}})}:null)
  const handler=(salaryRouter as any).stack.find((l:any)=>l.route?.path==='/:id/mark-paid').route.stack.at(-1).handle,res=response()
  await handler({params:{id:'salary'},user:{id:'admin',role:'admin',storeId:'store'}},res)
  expect(res.statusCode).toBe(409);expect(res.data.message).toBe('SALARY_ATTENDANCE_RECALC_REQUIRED')
  expect(db.salary.updateMany).not.toHaveBeenCalled();expect(db.expense.create).not.toHaveBeenCalled()
 }finally{recalc.mockRestore();jest.useRealTimers()}
})
