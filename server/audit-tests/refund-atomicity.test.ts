import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule:true, default: { $transaction: jest.fn() } }))
jest.mock('../src/config/env', () => ({ config:{indonesia:{ppnRate:0.11}} }))
jest.mock('../src/services/ReferralService', () => ({ processOrderReferralRewards:jest.fn() }))
jest.mock('../src/services/PointsRuleService', () => ({ getOrCreatePointsRule:jest.fn(), calculatePoints:jest.fn() }))
import prisma from '../src/config/database'
import { refundOrder } from '../src/services/OrderService'
const db=prisma as any
let state:any, failCash:boolean
beforeEach(() => {
  jest.clearAllMocks(); failCash=false
  state={status:'completed',stock:5,cash:0,logs:0,request:'pending'}
  db.$transaction.mockImplementation(async (fn:any) => {
    const draft={...state}
    const tx={
      config:{findUnique:async()=>null,findMany:async()=>[]},
      order:{updateMany:async()=>{if(draft.status==='refunded')return {count:0};draft.status='refunded';return {count:1}},findUnique:async()=>({id:'o'}),findUniqueOrThrow:async()=>({id:'o',orderNumber:'ORD1',storeId:'a',staffId:'s',paymentMethod:'cash',finalAmount:100,items:[{productId:'p',quantity:2}]})},
      refundRequest:{findFirst:async()=>null,updateMany:async({data}:any)=>{draft.request='approved';draft.approvedAmount=data.amount;return {count:1}}},
      memberCoupon:{updateMany:async()=>({count:0})},
      cashEvent:{create:async()=>{if(failCash)throw new Error('synthetic cash failure');draft.cash+=100}},
      bOMItem:{findMany:async()=>[{inventoryId:'i',quantity:3}]},
      inventory:{findUnique:async()=>({id:'i',type:'raw_material',avgCost:1}),update:async({data}:any)=>{draft.stock+=data.currentStock.increment}},
      stockInLog:{create:async()=>{draft.logs++}}
    }
    const result=await fn(tx)
    state=draft
    return result
  })
})
test('cash failure rolls back order status and cash refund so retry remains possible',async()=>{
  failCash=true
  await expect(refundOrder('o')).rejects.toThrow('synthetic cash failure')
  expect(state).toEqual({status:'completed',stock:5,cash:0,logs:0,request:'pending'})
  failCash=false
  await refundOrder('o')
  expect(state).toEqual({status:'refunded',stock:5,cash:100,logs:0,request:'pending'})
})
test('successful refund uses one transaction and repeated refund has no duplicate effects',async()=>{
  await refundOrder('o')
  expect(db.$transaction).toHaveBeenCalledTimes(1)
  await expect(refundOrder('o')).rejects.toThrow('ORDER_ALREADY_REFUNDED')
  expect(state).toEqual({status:'refunded',stock:5,cash:100,logs:0,request:'pending'})
})

test('approval status rolls back with cash failure then commits with retry',async()=>{
  failCash=true
  await expect(refundOrder('o','test','s',100,{requestId:'r',approvedBy:'s'})).rejects.toThrow('synthetic cash failure')
  expect(state.request).toBe('pending');expect(state.status).toBe('completed')
  failCash=false;await refundOrder('o','test','s',100,{requestId:'r',approvedBy:'s'})
  expect(state.request).toBe('approved');expect(state.status).toBe('refunded');expect(state.approvedAmount).toBe(100)
})

test('refund leaves consumed ingredients deducted and creates no stock-in log',async()=>{await refundOrder('o','customer dissatisfied');expect(state.stock).toBe(5);expect(state.logs).toBe(0)})
