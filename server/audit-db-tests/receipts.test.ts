import {afterAll,expect,test} from '@jest/globals'
import {readFileSync} from 'fs'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {receiveReceipt,ReceiptEnvelope} from '../src/services/ReceiptSyncService'
import {refundOrder} from '../src/services/OrderService'
afterAll(async()=>{await prisma.$disconnect()})
const root=process.env.AUDIT_SQLITE_ROOT
const enabled=!!root&&/^\/tmp\/bubble-audit-sqlite-[^/]+$/.test(root)
const run=enabled?test:test.skip
run('actual SQLite wire receipt persists in PostgreSQL with exact metadata and no financial effects',async()=>{
 const r=JSON.parse(readFileSync(root+'/receipt-envelope.json','utf8')) as ReceiptEnvelope
 const key=randomUUID();const tenant=await prisma.tenant.create({data:{name:'Synthetic SQLite receipt'}})
 const store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic cloud receiver'}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}})
 const product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,code:key,name:'Tea'}})
 const spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:100}})
 const member=await prisma.member.create({data:{storeId:store.id,phone:key,name:'Synthetic',points:5000}})
 r.tenantId=tenant.id;r.order.id=key;r.order.storeId=store.id;r.order.memberId=member.id;r.order.orderNumber=key
 r.order.items=r.order.items.map(i=>({...i,id:randomUUID(),productId:product.id,specId:spec.id}))
 r.evidence={...r.evidence!,id:randomUUID(),orderId:key,storeId:store.id}
 await receiveReceipt(prisma,r,store.id,'cloud-operator');await receiveReceipt(prisma,r,store.id,'cloud-operator')
 const stored=await prisma.order.findUniqueOrThrow({where:{id:key},include:{paymentEvidence:true}})
 expect(stored.finalAmount).toBe(r.order.finalAmount);expect(stored.checkoutTaxAmount).toBe(5);expect(stored.requestFingerprint).toBe(r.order.requestFingerprint)
 expect(stored.paymentEvidence!.image.toString('base64')).toBe(r.evidence.image)
 expect(stored.paymentEvidence!.confirmedAt!.toISOString()).toBe(r.evidence.confirmedAt)
 expect(stored.paymentEvidence!.confirmedBy).toBe('original-cashier')
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(5000)
 expect(await prisma.stockOutLog.count({where:{orderId:key}})).toBe(0)
 await expect(refundOrder(key)).rejects.toThrow('REPLICA_FINANCIAL_ACTION_LOCAL_ONLY')
 expect((await prisma.order.findUniqueOrThrow({where:{id:key}})).status).toBe('completed')
 await expect(receiveReceipt(prisma,{...r,order:{...r.order,note:'mutated'}},store.id,'actor')).rejects.toThrow('RECEIPT_SYNC_CONFLICT')
})
