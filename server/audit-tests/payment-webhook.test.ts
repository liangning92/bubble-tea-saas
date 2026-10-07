import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{qrisPayment:{findUnique:jest.fn(),update:jest.fn(),updateMany:jest.fn()},order:{findUnique:jest.fn(),update:jest.fn(),updateMany:jest.fn()},$transaction:jest.fn()}}))
import prisma from '../src/config/database'
import { handleQrisWebhook } from '../src/services/PaymentService'
const db=prisma as any
let payment:any,order:any,failOrder:boolean
beforeEach(()=>{
  jest.clearAllMocks();failOrder=false
  payment={id:'pay',externalId:'QRIS-victim-123',orderId:null,storeId:'a',amount:100,status:'pending'}
  order={id:'victim',storeId:'b',finalAmount:100,status:'pending'}
  const models=(p:any,o:any)=>({
    qrisPayment:{findUnique:async()=>({...p}),update:async({data}:any)=>Object.assign(p,data),updateMany:async({where,data}:any)=>{if(p.status!==where.status)return {count:0};Object.assign(p,data);return {count:1}}},
    order:{findUnique:async()=>({...o}),update:async({data}:any)=>{if(failOrder)throw new Error('synthetic order failure');return Object.assign(o,data)},updateMany:async({where,data}:any)=>{if(failOrder)throw new Error('synthetic order failure');if(where.storeId!==o.storeId||!where.status.in.includes(o.status))return {count:0};Object.assign(o,data);return {count:1}}}
  })
  const root=models(payment,order)
  for(const model of ['qrisPayment','order'])for(const name of Object.keys(root[model]))db[model][name].mockImplementation(root[model][name])
  db.$transaction.mockImplementation(async(fn:any)=>{
    const p={...payment},o={...order};const result=await fn(models(p,o));Object.assign(payment,p);Object.assign(order,o);return result
  })
})
test('pre-order QRIS reference cannot mutate an arbitrary order parsed from its name',async()=>{
  expect((await handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:100})).success).toBe(true)
  expect(order.status).toBe('pending')
  expect(payment.status).toBe('completed')
})
test('linked payment cannot cross stores',async()=>{
  payment.orderId='victim'
  await expect(handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:100})).rejects.toThrow()
  expect(payment.status).toBe('pending');expect(order.status).toBe('pending')
})
test('linked order write failure rolls payment back and retry succeeds',async()=>{
  payment.orderId='victim';order.storeId='a';failOrder=true
  await expect(handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:100})).rejects.toThrow('synthetic order failure')
  expect(payment.status).toBe('pending')
  failOrder=false;await handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:100})
  expect(payment.status).toBe('completed');expect(order.status).toBe('completed')
})
test('unknown provider state must not convert pending payment to failed',async()=>{
  await handleQrisWebhook({external_id:payment.externalId,status:'PENDING',amount:100})
  expect(payment.status).toBe('pending')
})
test('wrong amount is rejected without writes',async()=>{
  expect((await handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:99})).success).toBe(false)
  expect(payment.status).toBe('pending')
})
test('duplicate or delayed expired callback cannot undo completed payment',async()=>{
  payment.status='completed'
  await handleQrisWebhook({external_id:payment.externalId,status:'EXPIRED',amount:100})
  expect(payment.status).toBe('completed');expect(order.status).toBe('pending')
})

test('settled callback retry repairs a linked order left pending by a historical failure',async()=>{
 payment.status='completed';payment.orderId='victim';order.storeId='a'
 await handleQrisWebhook({external_id:payment.externalId,status:'PAID',amount:100})
 expect(order.status).toBe('completed');expect(payment.status).toBe('completed')
})
