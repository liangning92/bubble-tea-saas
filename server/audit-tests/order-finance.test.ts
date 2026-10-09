import {encodeOrderReceipt} from '../src/services/OrderReplayService'
import { orderRequestFingerprint } from '../src/utils/orderRequestFingerprint'
import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{
 product:{findMany:jest.fn()},productChannelPrice:{findUnique:jest.fn(async()=>null)},member:{findUnique:jest.fn(),update:jest.fn(),updateMany:jest.fn()},
 shiftSession:{findMany:jest.fn()},channel:{findUnique:jest.fn(),findFirst:jest.fn()},bOMItem:{findMany:jest.fn()},config:{findFirst:jest.fn()},inventory:{findMany:jest.fn()},order:{create:jest.fn(),update:jest.fn(),findUnique:jest.fn()},qrisPayment:{findUnique:jest.fn(),updateMany:jest.fn()},cashEvent:{create:jest.fn()},pointLog:{create:jest.fn()},$transaction:jest.fn()
}}))
jest.mock('../src/config/env',()=>({config:{indonesia:{ppnRate:0.11}}}))
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
jest.mock('../src/services/PointsRuleService',()=>({getOrCreatePointsRule:jest.fn(async()=>({pointsPerRupiah:10000,minPurchase:0,birthdayMultiplier:1,tierMultiplier:'{}'})),calculatePoints:jest.fn(()=>0)}))
import prisma from '../src/config/database'
import {createOrder} from '../src/services/OrderService'
const db=prisma as any
const input=()=>({storeId:'a',staffId:'s',memberId:'m',orderNumber:'ORD-TEST',pickupNumber:'A01',paymentMethod:'cash',items:[{productId:'p',productName:'Tea',specId:'s',specName:'Regular',quantity:2,unitPrice:100}],discountAmount:20,taxEnabled:true})
beforeEach(()=>{
 jest.clearAllMocks()
 db.shiftSession.findMany.mockResolvedValue([{shift:'morning'}])
 db.product.findMany.mockResolvedValue([{id:'p',storeId:'a'}]);db.member.findUnique.mockResolvedValue({id:'m',storeId:'a',points:10000,level:'bronze'})
 db.channel.findUnique.mockResolvedValue(null);db.channel.findFirst.mockResolvedValue(null)
 db.bOMItem.findMany.mockResolvedValue([]);db.config.findFirst.mockResolvedValue(null);db.inventory.findMany.mockResolvedValue([])
 db.member.updateMany.mockResolvedValue({count:1})
 db.qrisPayment.findUnique.mockResolvedValue({id:'pay',externalId:'QRIS2-test',storeId:'a',amount:200,status:'completed',orderId:null})
 db.qrisPayment.updateMany.mockResolvedValue({count:1});db.order.findUnique.mockResolvedValue(null)
 db.order.create.mockImplementation(async({data}:any)=>({...data,id:'o',createdAt:new Date(),items:[]}))
 db.order.update.mockResolvedValue({})
 db.$transaction.mockImplementation(async(fn:any)=>fn(db))
})
test('discount and tax use discounted base and persist actual received total',async()=>{
 const result=await createOrder(input());expect(result.totalAmount).toBe(200);expect(result.ppnAmount).toBe(20);expect(result.grandTotal).toBe(200)
 expect(db.order.create.mock.calls[0][0].data.finalAmount).toBe(200)
})
test('member spend increases even when the purchase earns zero points',async()=>{
 await createOrder(input())
 expect(db.member.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({totalSpent:{increment:200}})}))
 expect(db.pointLog.create).not.toHaveBeenCalled()
})
test('foreign-store member rejected before writes',async()=>{
 db.member.findUnique.mockResolvedValue({id:'m',storeId:'b',points:10000})
 await expect(createOrder(input())).rejects.toThrow('MEMBER_STORE_MISMATCH');expect(db.order.create).not.toHaveBeenCalled()
})
test('foreign or missing product rejected before writes',async()=>{
 db.product.findMany.mockResolvedValue([])
 await expect(createOrder(input())).rejects.toThrow('PRODUCT_STORE_MISMATCH');expect(db.order.create).not.toHaveBeenCalled()
})
test('foreign channel id rejected before price lookup/writes',async()=>{
 db.channel.findUnique.mockResolvedValue({id:'foreign',storeId:'b'})
 await expect(createOrder({...input(),channelId:'foreign'})).rejects.toThrow('CHANNEL_STORE_MISMATCH');expect(db.order.create).not.toHaveBeenCalled()
})
test('discount beyond subtotal is rejected instead of negative tax and zero-charge sale',async()=>{
 await expect(createOrder({...input(),discountAmount:201})).rejects.toThrow('DISCOUNT_EXCEEDS_TOTAL');expect(db.order.create).not.toHaveBeenCalled()
})
test('suspended member order does not change points/spend/cash',async()=>{
 await createOrder({...input(),status:'suspended'})
 expect(db.member.update).not.toHaveBeenCalled();expect(db.cashEvent.create).not.toHaveBeenCalled()
})

test.each(['pending','expired','failed'])('QRIS %s cannot create a completed order',async status=>{
 db.qrisPayment.findUnique.mockResolvedValue({id:'pay',storeId:'a',amount:200,status,orderId:null})
 await expect(createOrder({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'} as any)).rejects.toThrow('QRIS_PAYMENT_NOT_CONFIRMED')
 expect(db.order.create).not.toHaveBeenCalled()
})
test('confirmed QRIS is linked once inside the sale transaction',async()=>{
 await createOrder({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'} as any)
 expect(db.qrisPayment.updateMany).toHaveBeenCalledWith({where:{id:'pay',storeId:'a',status:'completed',orderId:null},data:{orderId:'o'}})
 expect(db.cashEvent.create).not.toHaveBeenCalled()
})
test('a racing second QRIS claim fails rather than creating another paid order',async()=>{
 db.qrisPayment.updateMany.mockResolvedValue({count:0})
 await expect(createOrder({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'} as any)).rejects.toThrow('QRIS_PAYMENT_ALREADY_LINKED')
 expect(db.member.update).not.toHaveBeenCalled()
})
test.each(['QRIS-old-123'])('invalid provider reference cannot silently certify a paid QRIS order (%s)',async qrisExternalId=>{
 await expect(createOrder({...input(),paymentMethod:'qris',qrisExternalId} as any)).rejects.toThrow('QRIS_PAYMENT_REFERENCE_REQUIRED')
 expect(db.order.create).not.toHaveBeenCalled()
})
test.each([{storeId:'b',amount:200},{storeId:'a',amount:201}])('QRIS rejects foreign store or wrong amount %j',async change=>{
 db.qrisPayment.findUnique.mockResolvedValue({id:'pay',storeId:'a',amount:200,status:'completed',orderId:null,...change})
 await expect(createOrder({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'} as any)).rejects.toThrow('QRIS_PAYMENT_MISMATCH')
 expect(db.order.create).not.toHaveBeenCalled()
})

test('exact offline order-number replay returns original receipt without ledger side effects',async()=>{
 db.order.findUnique.mockResolvedValue({...input(),id:'old',status:'completed',finalAmount:200,discountAmount:20,items:input().items,requestFingerprint:orderRequestFingerprint(input()),checkoutTaxAmount:20,requestReceipt:encodeOrderReceipt(input(),{...input(),id:'old',totalAmount:200,ppnAmount:20,grandTotal:200,status:'completed',items:input().items,createdAt:new Date()} as any)})
 expect((await createOrder(input())).id).toBe('old')
 expect(db.product.findMany).not.toHaveBeenCalled();expect(db.member.findUnique).not.toHaveBeenCalled();expect(db.productChannelPrice.findUnique).not.toHaveBeenCalled()
 expect(db.order.create).not.toHaveBeenCalled();expect(db.member.update).not.toHaveBeenCalled();expect(db.cashEvent.create).not.toHaveBeenCalled()
})
test.each([{storeId:'b'},{discountAmount:21},{items:[{...input().items[0],quantity:3}]}])('reused order number with different original request conflicts %j',async change=>{
 db.order.findUnique.mockResolvedValue({...input(),id:'old',status:'completed',finalAmount:200,items:input().items,requestFingerprint:orderRequestFingerprint(input()),checkoutTaxAmount:20,requestReceipt:encodeOrderReceipt(input(),{...input(),id:'old',totalAmount:200,ppnAmount:20,grandTotal:200,status:'completed',items:input().items,createdAt:new Date()} as any)})
 await expect(createOrder({...input(),...change})).rejects.toThrow(change.storeId ? 'ORDER_STORE_MISMATCH' : 'ORDER_IDEMPOTENCY_CONFLICT');expect(db.order.create).not.toHaveBeenCalled()
})
test('replay returns original committed receipt even after a subsequent refund',async()=>{
 db.order.findUnique.mockResolvedValue({...input(),id:'old',status:'refunded',finalAmount:200,items:input().items,requestFingerprint:orderRequestFingerprint(input()),checkoutTaxAmount:20,requestReceipt:encodeOrderReceipt(input(),{...input(),id:'old',totalAmount:200,ppnAmount:20,grandTotal:200,status:'completed',items:input().items,createdAt:new Date()} as any)})
 expect((await createOrder(input())).status).toBe('completed');expect(db.order.create).not.toHaveBeenCalled()
})
test('legacy receipts without original fingerprint cannot be silently repriced on retry',async()=>{
 db.order.findUnique.mockResolvedValue({...input(),id:'old',storeId:'a',status:'completed',finalAmount:200,items:input().items})
 await expect(createOrder(input())).rejects.toThrow('ORDER_REPLAY_UNVERIFIED');expect(db.order.create).not.toHaveBeenCalled()
})
test('confirmed QRIS replay returns its linked receipt without a second claim',async()=>{
 db.qrisPayment.findUnique.mockResolvedValue({id:'pay',storeId:'a',amount:200,status:'completed',orderId:'old'})
 db.order.findUnique.mockResolvedValue({...input(),id:'old',paymentMethod:'qris',status:'completed',finalAmount:200,items:input().items,requestFingerprint:orderRequestFingerprint({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'}),checkoutTaxAmount:20,requestReceipt:encodeOrderReceipt({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'},{...input(),id:'old',totalAmount:200,ppnAmount:20,grandTotal:200,status:'completed',items:input().items,createdAt:new Date()} as any)})
 expect((await createOrder({...input(),paymentMethod:'qris',qrisExternalId:'QRIS2-test'})).id).toBe('old')
 expect(db.order.create).not.toHaveBeenCalled();expect(db.qrisPayment.updateMany).not.toHaveBeenCalled()
})

test('manual static QR payment can be recorded without claiming provider verification',async()=>{
 const result=await createOrder({...input(),paymentMethod:'qris'})
 expect(result.id).toBe('o')
 expect(db.qrisPayment.findUnique).not.toHaveBeenCalled()
 expect(db.qrisPayment.updateMany).not.toHaveBeenCalled()
 expect(db.cashEvent.create).not.toHaveBeenCalled()
})
