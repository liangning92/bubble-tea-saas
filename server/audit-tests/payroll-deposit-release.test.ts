import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>{const db={staffDeposit:{findFirst:jest.fn(),findMany:jest.fn(),findUnique:jest.fn(),updateMany:jest.fn()},staff:{findUnique:jest.fn()},$transaction:jest.fn()};return {__esModule:true,default:db,prisma:db}})
import db from '../src/config/database'
import {depositLifecycle,hasLeftEmployment} from '../src/services/DepositLifecycle'
import {getAllStaffDeposits,getStaffDeposit,recordDepositDeduction} from '../src/services/DepositService'
import {salaryDepositPlan} from '../src/services/SalaryDepositPlan'
const d=db as any,staff={status:'resigned',terminationDate:new Date('2026-10-21T00:00:00+07:00')}
const deposit={id:'deposit',staffId:'staff',storeId:'store',totalAmount:30000000,deductedAmount:0,refundedAmount:0,status:'active',staff}
beforeEach(()=>{jest.clearAllMocks();d.$transaction.mockImplementation(async(fn:any)=>fn(d));d.staff.findUnique.mockResolvedValue(staff);d.staffDeposit.findUnique.mockResolvedValue(deposit)})
test('zero-collected departure releases all outstanding money without inventing a refund',()=>{
 expect(depositLifecycle(deposit,staff)).toMatchObject({status:'released',totalAmount:30000000,remainingAmount:0,releasedAmount:30000000,refundableAmount:0,deductedAmount:0,refundedAmount:0})
 expect(deposit.status).toBe('active')
})
test('partly collected money remains refundable and is never recorded as refunded by release',()=>{
 expect(depositLifecycle({...deposit,deductedAmount:10000000,refundedAmount:2000000},staff)).toMatchObject({status:'released',releasedAmount:20000000,remainingAmount:0,refundableAmount:8000000,refundedAmount:2000000})
 expect(depositLifecycle({...deposit,status:'refunded',deductedAmount:30000000,refundedAmount:30000000},staff)).toMatchObject({status:'refunded',refundableAmount:0})
})
test('active staff and future end dates retain uncollected obligations',()=>{
 const active={status:'active',terminationDate:new Date('2099-01-01T00:00:00+07:00')}
 expect(hasLeftEmployment(active)).toBe(false)
 expect(depositLifecycle(deposit,active)).toMatchObject({status:'active',remainingAmount:30000000,releasedAmount:0})
})
test('existing departed records are automatically released in list and individual reads without rewriting history',async()=>{
 d.staffDeposit.findMany.mockResolvedValue([deposit]);d.staffDeposit.findFirst.mockResolvedValue(deposit)
 expect((await getAllStaffDeposits('store'))[0]).toMatchObject({status:'released',remainingAmount:0})
 expect(await getStaffDeposit('staff')).toMatchObject({status:'released',remainingAmount:0})
 expect(d.staffDeposit.updateMany).not.toHaveBeenCalled()
})
test('manual collection is rejected for departed staff even if the stored legacy status is active',async()=>{
 await expect(recordDepositDeduction({staffDepositId:'deposit',amount:1000000})).rejects.toThrow('DEPOSIT_RELEASED_ON_TERMINATION')
 expect(d.staffDeposit.updateMany).not.toHaveBeenCalled()
})
test('no deposit rule can reserve new salary deductions after departure',async()=>{
 expect(await salaryDepositPlan('staff','2026-10',d)).toEqual([])
 expect(d.staffDeposit.findMany).not.toHaveBeenCalled()
})
