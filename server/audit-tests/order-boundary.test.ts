import { beforeEach, describe, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule: true, default: {
  order: { findUnique: jest.fn(), delete: jest.fn() },
  refundRequest: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  shiftSession: { findFirst: jest.fn() },shift:{findFirst:jest.fn(async()=>({key:'morning'}))},config:{findMany:jest.fn(async()=>[{storeId:'a',value:'{"cash":true}'}])}
} }))
jest.mock('../src/config/env', () => ({ config: { jwt: { secret: 'synthetic-test-only' } } }))
jest.mock('../src/services/OrderService', () => ({
  getOrderById: jest.fn(), updateOrderStatus: jest.fn(), refundOrder: jest.fn(), createRefundRequest: jest.fn(), createOrder: jest.fn(), bulkCreateOrders: jest.fn()
}))
import prisma from '../src/config/database'
import * as service from '../src/services/OrderService'
import { orderRouter } from '../src/routes/order'
const db = prisma as any
const svc = service as any
async function invoke(method: string, path: string, body = {}, params = {id: 'foreign'}, role = 'manager') {
  const layer = (orderRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method])
  const req: any = { body, params, query: {}, headers: {}, user: { id:'u', staffId:'staff-a', storeId:'a', role } }
  const res: any = { statusCode: 200, status(n: number) { this.statusCode=n; return this }, json(data: any) { this.data=data; return this } }
  for (const entry of layer.route.stack) {
    let next = false
    await entry.handle(req, res, () => { next=true })
    if (!next) break
  }
  return res
}
beforeEach(() => {
  jest.clearAllMocks()
  db.order.findUnique.mockResolvedValue({ id:'foreign', storeId:'b', status:'suspended' })
  db.refundRequest.findUnique.mockResolvedValue({ id:'foreign', order:{storeId:'b'}, status:'pending' })
  svc.getOrderById.mockResolvedValue({ id:'foreign', storeId:'b' })
})
describe('order object authorization', () => {
  test.each([
    ['get','/:id'], ['put','/:id/status'], ['delete','/:id'], ['post','/:id/refund'],
    ['post','/refund-request'], ['post','/refund-requests/:id/approve'], ['post','/refund-requests/:id/reject']
  ])('%s %s denies foreign store objects before service writes', async (method,path) => {
    const res = await invoke(method,path,{orderId:'foreign',reason:'test',note:'test',status:'ready'})
    expect(res.statusCode).toBe(403)
    for (const name of ['updateOrderStatus','refundOrder','createRefundRequest']) expect(svc[name]).not.toHaveBeenCalled()
    expect(db.order.delete).not.toHaveBeenCalled()
    expect(db.refundRequest.update).not.toHaveBeenCalled()
  })
  test('own store detail remains accessible', async () => {
    db.order.findUnique.mockResolvedValue({id:'own',storeId:'a'})
    svc.getOrderById.mockResolvedValue({id:'own',storeId:'a'})
    expect((await invoke('get','/:id')).statusCode).toBe(200)
  })
  test('valid local sale reaches service without relying on a global prisma variable', async () => {
    db.shiftSession.findFirst.mockResolvedValue({ id:'shift',shift:'morning' });db.order.findUnique.mockResolvedValue(null)
    svc.createOrder.mockResolvedValue({id:'new'})
    const res = await invoke('post','/', {storeId:'a',staffId:'staff-a',paymentMethod:'cash',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:1,unitPrice:100}]})
    expect(res.statusCode).toBe(201)
    expect(svc.createOrder).toHaveBeenCalledTimes(1)
  })
  test.each([
    {items:[]}, {discountAmount:-1}, {pointsRedeemed:-100}
  ])('rejects invalid online order input %j', async (change) => {
    const body = {storeId:'a',staffId:'staff-a',paymentMethod:'cash',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:1,unitPrice:100}],...change}
    expect((await invoke('post','/',body)).statusCode).toBe(400)
    expect(svc.createOrder).not.toHaveBeenCalled()
  })
  test('offline sync validates item quantities before any service write', async () => {
    const order={storeId:'a',staffId:'staff-a',paymentMethod:'cash',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:-1,unitPrice:100}]}
    expect((await invoke('post','/bulk-sync',{orders:[order]})).statusCode).toBe(400)
    expect(svc.bulkCreateOrders).not.toHaveBeenCalled()
  })
})

test.each([0,111])('refund approval accepts legacy full-refund zero or tax-inclusive received amount (%s)',async amount=>{
 db.refundRequest.findUnique.mockResolvedValue({id:'r',orderId:'own',status:'pending',amount,reason:'test',reasonCode:'customer_dissatisfied',selectedItemIds:'["item"]',order:{id:'own',storeId:'a',totalAmount:100,finalAmount:111,items:[{id:'item'}]}})
 expect((await invoke('post','/refund-requests/:id/approve',{verifiedPrepared:true}, {id:'r'})).statusCode).toBe(200)
 expect(svc.refundOrder).toHaveBeenCalledWith('own','test','staff-a',111,expect.objectContaining({requestId:'r'}))
 expect(db.refundRequest.update).not.toHaveBeenCalled()
})

test.each([-1,112,1.5,Number.NaN,Number.POSITIVE_INFINITY])('refund rejects invalid stored amount %s without financial writes',async amount=>{
 db.refundRequest.findUnique.mockResolvedValue({id:'r',orderId:'own',status:'pending',amount,reason:'test',order:{storeId:'a',totalAmount:100,finalAmount:111}})
 expect((await invoke('post','/refund-requests/:id/approve',{verifiedPrepared:true}, {id:'r'})).statusCode).toBe(400)
 expect(svc.refundOrder).not.toHaveBeenCalled()
})

test('cannot reject an already-approved refund',async()=>{
 db.refundRequest.findUnique.mockResolvedValue({id:'r',order:{storeId:'a'},status:'approved'})
 expect((await invoke('post','/refund-requests/:id/reject',{note:'test'},{id:'r'})).statusCode).toBe(409)
 expect(db.refundRequest.updateMany).not.toHaveBeenCalled()
})
test('concurrent approval winning the conditional rejection returns a conflict',async()=>{
 db.refundRequest.findUnique.mockResolvedValue({id:'r',order:{storeId:'a'},status:'pending'})
 db.refundRequest.updateMany.mockResolvedValue({count:0})
 expect((await invoke('post','/refund-requests/:id/reject',{note:'test'},{id:'r'})).statusCode).toBe(409)
 expect(db.refundRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'r',status:'pending'}}))
})

test('direct refund cannot bypass classified approval',async()=>{
 db.order.findUnique.mockResolvedValue({id:'own',storeId:'a'})
 expect((await invoke('post','/:id/refund',{reason:'test'},{id:'own'})).statusCode).toBe(409)
 expect(svc.refundOrder).not.toHaveBeenCalled()
})
test.each([['manager',403],['admin',409]])('unprepared %s approval cannot silently choose a stock policy',async(role,status)=>{
 db.refundRequest.findUnique.mockResolvedValue({id:'r',orderId:'own',status:'pending',amount:100,reasonCode:'paid_unprepared',selectedItemIds:'["item"]',order:{storeId:'a',finalAmount:100,items:[{id:'item'}]}})
 expect((await invoke('post','/refund-requests/:id/approve',{verifiedPrepared:true},{id:'r'},role as string)).statusCode).toBe(status)
 expect(svc.refundOrder).not.toHaveBeenCalled()
})

test.each(['refunded','paid','completed','cancelled','suspended','__proto__','toString'])('generic status route rejects financial target %s before a service write',async status=>{
 db.order.findUnique.mockResolvedValue({id:'own',storeId:'a',status:'completed'})
 expect((await invoke('put','/:id/status',{status},{id:'own'})).statusCode).toBe(409)
 expect(svc.updateOrderStatus).not.toHaveBeenCalled()
})
test('closed shift rejects a fresh sale before writes even if a client forges its actor',async()=>{
 db.order.findUnique.mockResolvedValue(null);db.shiftSession.findFirst.mockResolvedValue(null)
 const body={storeId:'a',staffId:'cashier-a',manualPaymentActorId:'forged-a',paymentMethod:'cash',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:1,unitPrice:100}]}
 expect((await invoke('post','/',body)).statusCode).toBe(409)
 expect(svc.createOrder).not.toHaveBeenCalled()
})
