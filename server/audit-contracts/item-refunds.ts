import {afterAll,expect,jest,test} from '@jest/globals'
import {randomUUID} from 'crypto'
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
import prisma from '../src/config/database'
import {createOrder,refundOrder,createRefundRequest} from '../src/services/OrderService'
import {requestItemRefund,approveItemRefund,quoteItemRefund} from '../src/services/ItemRefundService'
import {getSalesReport} from '../src/services/ReportService'
import {getPaymentSummary} from '../src/services/PaymentService'
import {redeemPoints} from '../src/services/MemberService'
afterAll(()=>prisma.$disconnect())
async function fixture(){
 const key=randomUUID(),tenant=await prisma.tenant.create({data:{name:'Refund '+key}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,code:key,name:'Tea'}}),spec=await prisma.spec.create({data:{productId:product.id,name:'Cup',price:101}}),other=await prisma.spec.create({data:{productId:product.id,name:'Large',price:203}}),member=await prisma.member.create({data:{storeId:store.id,name:'Synthetic',phone:key,points:1000}}),inventory=await prisma.inventory.create({data:{storeId:store.id,name:'raw',unit:'g',category:'tea',currentStock:100}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:inventory.id,quantity:2,unit:'g'}})
 const created=await createOrder({storeId:store.id,staffId:'actor',orderNumber:key,paymentMethod:'cash',memberId:member.id,discountAmount:5,pointsRedeemed:100,taxEnabled:true,items:[{productId:product.id,specId:spec.id,productName:'Tea',specName:'Cup',quantity:3,unitPrice:101},{productId:product.id,specId:other.id,productName:'Tea large',specName:'Large',quantity:1,unitPrice:203}]})
 const order=await prisma.order.findUniqueOrThrow({where:{id:created.id},include:{items:true}})
 const actor={storeId:store.id,id:'approver',role:'admin'},base={orderId:order.id,storeId:store.id,reason:'Taste',reasonCode:'customer_dissatisfied',requestedBy:'actor'}
 const line=order.items.find(i=>i.quantity===3)!
 return {order,store,member,inventory,actor,base,line,product,spec}
}
test('selected quantity allocation, exact request/approval retry, full cumulative cap and no prepared restock',async()=>{
 const f=await fixture(),requestId=randomUUID(),input={...f.base,requestId,items:[{itemId:f.line.id,quantity:1}]}
 const r=await requestItemRefund(input);expect(f.order.totalAmount).toBe(506);expect(f.order.checkoutTaxAmount).toBe(55);expect(f.order.finalAmount).toBe(555);expect(r.amount).toBe(111)
 expect((await requestItemRefund(input)).id).toBe(r.id)
 await expect(requestItemRefund({...input,reason:'changed'})).rejects.toThrow('REFUND_IDEMPOTENCY_CONFLICT')
 await expect(approveItemRefund(r.id,{...f.actor,role:'staff'},true)).rejects.toThrow('FORBIDDEN')
 await expect(approveItemRefund(r.id,{...f.actor,storeId:'foreign'},true)).rejects.toThrow('NOT_FOUND')
 await expect(approveItemRefund(r.id,f.actor,false)).rejects.toThrow('CLASSIFICATION')
 const approvals=await Promise.allSettled([approveItemRefund(r.id,f.actor,true),approveItemRefund(r.id,f.actor,true)])
 expect(approvals.some(a=>a.status==='fulfilled')).toBe(true);await approveItemRefund(r.id,f.actor,true)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(1)
 expect((await prisma.cashEvent.findFirstOrThrow({where:{storeId:f.store.id,type:'cash_out'}})).amount).toBe(111)
 expect((await prisma.member.findUniqueOrThrow({where:{id:f.member.id}})).points).toBe(920)
 expect((await prisma.order.findUniqueOrThrow({where:{id:f.order.id}})).status).toBe('completed')
 await expect(refundOrder(f.order.id)).rejects.toThrow('REFUND_REMAINING_ITEMS_REQUIRED')
 await expect(requestItemRefund({...input,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:3}]})).rejects.toThrow('QUANTITY_EXCEEDED')
 const quote=await quoteItemRefund(f.order.id,f.store.id)
 const rest=await requestItemRefund({...f.base,requestId:randomUUID(),items:quote.items.filter((i:any)=>i.remaining>0).map((i:any)=>({itemId:i.itemId,quantity:i.remaining}))})
 await approveItemRefund(rest.id,f.actor,true)
 const sum=await prisma.refundRequest.aggregate({where:{orderId:f.order.id,status:'approved'},_sum:{amount:true}})
 expect(sum._sum.amount).toBe(f.order.finalAmount);expect((await prisma.order.findUniqueOrThrow({where:{id:f.order.id}})).status).toBe('refunded')
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(92)
 expect((await prisma.member.findUniqueOrThrow({where:{id:f.member.id}})).points).toBe(1000)
 expect((await prisma.member.findUniqueOrThrow({where:{id:f.member.id}})).totalSpent).toBe(0)
 expect((await requestItemRefund(input)).id).toBe(r.id)
})
test('concurrent distinct request keys reserve only one pending selection; insufficient historical evidence fails',async()=>{
 const f=await fixture();const create=(requestId:string)=>requestItemRefund({...f.base,requestId,items:[{itemId:f.line.id,quantity:1}]})
 const races=await Promise.allSettled([create(randomUUID()),create(randomUUID())]);expect(races.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(await prisma.refundRequest.count({where:{orderId:f.order.id,status:'pending'}})).toBe(1)
 await prisma.order.update({where:{id:f.order.id},data:{requestFingerprint:null}})
 await expect(quoteItemRefund(f.order.id,f.store.id)).rejects.toThrow('EVIDENCE_REQUIRED')
})
test('refund approval concurrent with points redemption never produces negative balance or duplicate refund',async()=>{
 const f=await fixture(),r=await requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:1}]})
 await prisma.pointLog.create({data:{memberId:f.member.id,orderId:f.order.id,type:'earn',points:900,note:'Synthetic earnings'}})
 await prisma.member.update({where:{id:f.member.id},data:{points:20}})
 await Promise.allSettled([approveItemRefund(r.id,f.actor,true),redeemPoints(f.member.id,20,'synthetic')])
 await approveItemRefund(r.id,f.actor,true)
 expect((await prisma.member.findUniqueOrThrow({where:{id:f.member.id}})).points).toBeGreaterThanOrEqual(0)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(1)
})

async function financialState(f:Awaited<ReturnType<typeof fixture>>) {
 return {
  order:await prisma.order.findUniqueOrThrow({where:{id:f.order.id},select:{status:true,finalAmount:true}}),
  member:await prisma.member.findUniqueOrThrow({where:{id:f.member.id},select:{points:true,totalSpent:true}}),
  stock:(await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock,
  cash:await prisma.cashEvent.findMany({where:{storeId:f.store.id},orderBy:{id:'asc'}}),
  points:await prisma.pointLog.findMany({where:{memberId:f.member.id},orderBy:{id:'asc'}}),
  reversals:await prisma.stockOutLog.findMany({where:{orderId:f.order.id,reason:'refund_unprepared'}}),
  requests:await prisma.refundRequest.findMany({where:{orderId:f.order.id},orderBy:{id:'asc'}})
 }
}
async function rejectCash(storeId:string) {
 const sqlite=process.env.DATABASE_URL!.startsWith('file:')
 if(sqlite)await prisma.$executeRawUnsafe(`CREATE TRIGGER audit_item_refund_fail BEFORE INSERT ON "CashEvent" WHEN NEW."storeId" = '${storeId}' AND NEW.type = 'cash_out' BEGIN SELECT RAISE(ABORT, 'AUDIT_ITEM_REFUND_FAILURE'); END`)
 else {
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION audit_item_refund_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."storeId" = '${storeId}' AND NEW.type = 'cash_out' THEN RAISE EXCEPTION 'AUDIT_ITEM_REFUND_FAILURE'; END IF; RETURN NEW; END $$`)
  await prisma.$executeRawUnsafe('CREATE TRIGGER audit_item_refund_fail BEFORE INSERT ON "CashEvent" FOR EACH ROW EXECUTE FUNCTION audit_item_refund_failure()')
 }
 return ()=>prisma.$executeRawUnsafe(sqlite?'DROP TRIGGER audit_item_refund_fail':'DROP TRIGGER audit_item_refund_fail ON "CashEvent"')
}
test('actual database failure rolls back partial approval, points and cash; retry commits once',async()=>{
 const f=await fixture(),r=await requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:1}]})
 const before=await financialState(f),release=await rejectCash(f.store.id)
 try {await expect(approveItemRefund(r.id,f.actor,true)).rejects.toThrow();expect(await financialState(f)).toEqual(before)}finally{await release()}
 await approveItemRefund(r.id,f.actor,true);await approveItemRefund(r.id,f.actor,true)
 expect((await prisma.cashEvent.findMany({where:{storeId:f.store.id,type:'cash_out'}})).map(x=>x.amount)).toEqual([111])
})
test('unprepared full approval reverses original sold quantities once despite changed BOM; failure rolls everything back',async()=>{
 const f=await fixture(),r=await createRefundRequest({requestId:randomUUID(),orderId:f.order.id,reason:'Not started',requestedBy:'actor',reasonCode:'paid_unprepared',selectedItemIds:f.order.items.map(i=>i.id)})
 const sold=await prisma.stockOutLog.findMany({where:{orderId:f.order.id,reason:'sold'}})
 expect(sold.map(x=>x.quantity).sort()).toEqual([2,6])
 await prisma.bOMItem.updateMany({where:{productId:f.product.id},data:{quantity:99}})
 const approval={requestId:r.id,approvedBy:f.actor.id,restoreUnprepared:true}
 const before=await financialState(f),release=await rejectCash(f.store.id)
 try {await expect(refundOrder(f.order.id,'Not started','actor',555,approval)).rejects.toThrow();expect(await financialState(f)).toEqual(before)}finally{await release()}
 const raced=await Promise.allSettled([refundOrder(f.order.id,'Not started','actor',555,approval),refundOrder(f.order.id,'Not started','actor',555,approval)])
 expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(100)
 const reversals=await prisma.stockOutLog.findMany({where:{orderId:f.order.id,reason:'refund_unprepared'}})
 expect(reversals).toHaveLength(2);expect(reversals.map(x=>x.quantity).sort()).toEqual([-2,-6])
 for(const log of sold)expect(reversals.some(x=>x.quantity===-log.quantity&&x.note!.includes(log.id))).toBe(true)
 expect(await prisma.stockInLog.count({where:{inventoryId:f.inventory.id}})).toBe(0)
 expect((await prisma.cashEvent.findMany({where:{storeId:f.store.id,type:'cash_out'}})).map(x=>x.amount)).toEqual([555])
 expect((await prisma.member.findUniqueOrThrow({where:{id:f.member.id}})).points).toBe(1000)
})
test('missing allocation or original sold evidence blocks without fabricating values or restocking',async()=>{
 const f=await fixture();await prisma.order.update({where:{id:f.order.id},data:{checkoutTaxAmount:null}})
 await expect(requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:1}]})).rejects.toThrow('EVIDENCE_REQUIRED')
 const r=await createRefundRequest({requestId:randomUUID(),orderId:f.order.id,reason:'Not started',requestedBy:'actor',reasonCode:'paid_unprepared',selectedItemIds:f.order.items.map(i=>i.id)})
 await prisma.stockOutLog.updateMany({where:{orderId:f.order.id},data:{note:null}})
 const before=await financialState(f)
 await expect(refundOrder(f.order.id,'Not started','actor',555,{requestId:r.id,approvedBy:'admin',restoreUnprepared:true})).rejects.toThrow('STOCK_EVIDENCE_REQUIRED')
 expect(await financialState(f)).toEqual(before)
})
test('catalogue/discount changes do not reprice a request; forged amount and stale quantity cannot approve',async()=>{
 const f=await fixture(),r=await requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:1}]})
 await prisma.spec.update({where:{id:f.spec.id},data:{price:999999}})
 await prisma.refundRequest.update({where:{id:r.id},data:{amount:556}})
 const before=await financialState(f)
 await expect(approveItemRefund(r.id,f.actor,true)).rejects.toThrow('ALLOCATION_CHANGED');expect(await financialState(f)).toEqual(before)
 await prisma.refundRequest.update({where:{id:r.id},data:{amount:111}})
 await approveItemRefund(r.id,f.actor,true)
 expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:r.id}})).amount).toBe(111)
 await expect(requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:3}]})).rejects.toThrow('QUANTITY_EXCEEDED')
})

test('partial refund reduces reported net receipt without rewriting original paid total',async()=>{
 const f=await fixture(),r=await requestItemRefund({...f.base,requestId:randomUUID(),items:[{itemId:f.line.id,quantity:1}]})
 await approveItemRefund(r.id,f.actor,true)
 const report=await getSalesReport(f.store.id,{startDate:new Date(0),endDate:new Date(Date.now()+1000)})
 expect(report.summary.totalRevenue).toBe(444)
 expect((await getPaymentSummary(f.store.id,new Date())).totalAmount).toBe(444)
 expect((await prisma.order.findUniqueOrThrow({where:{id:f.order.id}})).finalAmount).toBe(555)
})
