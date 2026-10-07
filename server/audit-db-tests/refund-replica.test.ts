import { getCashFlow } from '../src/services/FinanceService'
import {afterAll,expect,test} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {receiptFor,receiveReceipt,replicaKey} from '../src/services/ReceiptSyncService'
import {requestItemRefund,approveItemRefund} from '../src/services/ItemRefundService'
import {getSalesReport,getStaffReport,getDashboardSummary} from '../src/services/ReportService'
import {getPaymentSummary} from '../src/services/PaymentService'
afterAll(()=>prisma.$disconnect())
async function setup(){
 const k=randomUUID(),tenant=await prisma.tenant.create({data:{name:'Synthetic replica refund'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic'}}),cat=await prisma.category.create({data:{storeId:store.id,name:'Tea'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:cat.id,code:k,name:'Tea'}}),spec=await prisma.spec.create({data:{productId:product.id,name:'Cup',price:101}}),member=await prisma.member.create({data:{storeId:store.id,phone:k,name:'Synthetic',points:1000}}),inv=await prisma.inventory.create({data:{storeId:store.id,name:'Tea stock',category:'tea',unit:'g',currentStock:100}})
 return {tenant,store,product,spec,member,inv}
}
const range={startDate:new Date(0),endDate:new Date('2100-01-01')}
test('555 paid /111 refunded locally =444; v1 replica cannot certify net receipts, no local financial replay',async()=>{
 const a=await setup(),b=await setup(),id=randomUUID()
 const o=await prisma.order.create({data:{id,storeId:a.store.id,staffId:'synthetic',orderNumber:id,totalAmount:506,finalAmount:555,discountAmount:5,checkoutTaxAmount:55,requestFingerprint:'v1:'+('a'.repeat(64)),paymentMethod:'cash',status:'completed',items:{create:[{productId:a.product.id,specId:a.spec.id,productName:'Cup',specName:'Cup',unitPrice:101,quantity:3,addons:'[]'},{productId:a.product.id,specId:a.spec.id,productName:'Large',specName:'Large',unitPrice:203,quantity:1,addons:'[]'}]}},include:{items:true,paymentEvidence:true}})
 const r=await requestItemRefund({requestId:randomUUID(),orderId:id,storeId:a.store.id,reason:'Taste',reasonCode:'customer_dissatisfied',requestedBy:'synthetic',items:[{itemId:o.items.find(i=>i.quantity===3)!.id,quantity:1}]})
 await approveItemRefund(r.id,{storeId:a.store.id,id:'approver',role:'admin'},true)
 expect((await getCashFlow(a.store.id,range.startDate,range.endDate)).inflows.cashSales).toBe(444);expect(r.amount).toBe(111);expect((await getSalesReport(a.store.id,range)).summary.totalRevenue).toBe(444)
 // Remap fixture references to a separate recipient store, as existing receipt contracts do.
 const wire=receiptFor(randomUUID(),a.tenant.id,await prisma.order.findUniqueOrThrow({where:{id},include:{items:true,paymentEvidence:true}}))
 wire.tenantId=b.tenant.id;wire.order.id=randomUUID();wire.order.orderNumber=randomUUID();wire.order.storeId=b.store.id;wire.order.memberId=b.member.id;wire.order.items=wire.order.items.map(i=>({...i,id:randomUUID(),productId:b.product.id,specId:b.spec.id}))
 const receive=(x:any)=>receiveReceipt(prisma,x,b.store.id,'receiver')
 await receive(wire);await receive(wire)
 const newer={...wire,order:{...wire.order,updatedAt:new Date(Date.parse(wire.order.updatedAt)+1000).toISOString()}}
 await receive(newer);await receive(wire)
 const marker=JSON.parse((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:b.store.id,key:replicaKey(wire.order.id)}}})).value)
 expect(marker.sourceUpdatedAt).toBe(newer.order.updatedAt)
 await expect(receive({...newer,sourceId:randomUUID()})).rejects.toThrow('CONFLICT')
 await expect(receive({...newer,order:{...newer.order,finalAmount:444}})).rejects.toThrow('CONFLICT')
 await expect(receive({...newer,version:2})).rejects.toThrow()
 await expect(receive({...newer,refundSummary:{amount:111}})).rejects.toThrow()
 for(const report of [()=>getCashFlow(b.store.id,range.startDate,range.endDate),()=>getSalesReport(b.store.id,range),()=>getStaffReport(b.store.id,range),()=>getDashboardSummary(b.store.id),()=>getPaymentSummary(b.store.id,new Date())])await expect(report()).rejects.toThrow('RECEIPT_NET_INCOME_UNVERIFIED')
 expect((await prisma.order.findUniqueOrThrow({where:{id:wire.order.id}})).finalAmount).toBe(555)
 expect(await prisma.refundRequest.count({where:{orderId:wire.order.id}})).toBe(0)
 expect(await prisma.cashEvent.count({where:{storeId:b.store.id}})).toBe(0)
 expect(await prisma.pointLog.count({where:{memberId:b.member.id}})).toBe(0)
 expect((await prisma.member.findUniqueOrThrow({where:{id:b.member.id}})).points).toBe(1000)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:b.inv.id}})).currentStock).toBe(100)
 expect(await prisma.stockOutLog.count({where:{orderId:wire.order.id}})).toBe(0)
 // Unrelated local store still reports its verified 444; receipt age cannot certify refunds.
 expect((await getSalesReport(a.store.id,range)).summary.totalRevenue).toBe(444)
 wire.order.id=randomUUID();wire.order.orderNumber=randomUUID();wire.order.items=wire.order.items.map(i=>({...i,id:randomUUID()}));wire.order.requestFingerprint=null;wire.order.checkoutTaxAmount=null
 await receive(wire);await expect(getSalesReport(b.store.id,range)).rejects.toThrow('RECEIPT_NET_INCOME_UNVERIFIED')
})

test('receipt evidence is limited to included order dates/store/status, not all store history',async()=>{
 const a=await setup(),b=await setup()
 const make=(storeId:string,createdAt:string,amount:number)=>prisma.order.create({data:{storeId,staffId:'synthetic',orderNumber:randomUUID(),totalAmount:amount,finalAmount:amount,paymentMethod:'cash',status:'completed',createdAt:new Date(createdAt)}})
 const local=await make(a.store.id,'2001-01-15T12:00:00Z',321)
 const replica=await make(a.store.id,'2002-01-15T12:00:00Z',555)
 await make(b.store.id,'2002-01-15T12:00:00Z',789)
 await prisma.config.create({data:{storeId:a.store.id,key:replicaKey(replica.id),value:'{}',category:'store'}})
 const day=(year:number)=>({startDate:new Date(`${year}-01-15T00:00:00Z`),endDate:new Date(`${year}-01-15T23:59:59.999Z`)})
 expect((await getCashFlow(a.store.id,day(2001).startDate,day(2001).endDate)).inflows.cashSales).toBe(321)
 expect((await getCashFlow(b.store.id,day(2002).startDate,day(2002).endDate)).inflows.cashSales).toBe(789)
 expect((await getSalesReport(a.store.id,day(2001))).summary.totalRevenue).toBe(321)
 expect((await getStaffReport(a.store.id,day(2001))).sales[0].revenue).toBe(321)
 expect((await getPaymentSummary(a.store.id,local.createdAt)).totalAmount).toBe(321)
 expect((await getDashboardSummary(a.store.id,local.createdAt)).month.revenue).toBe(321)
 expect((await getSalesReport(b.store.id,day(2002))).summary.totalRevenue).toBe(789)
 for(const report of [()=>getSalesReport(a.store.id,day(2002)),()=>getStaffReport(a.store.id,day(2002)),()=>getPaymentSummary(a.store.id,replica.createdAt),()=>getDashboardSummary(a.store.id,replica.createdAt)])await expect(report()).rejects.toThrow('RECEIPT_NET_INCOME_UNVERIFIED')
 expect((await getSalesReport(a.store.id,day(2003))).summary.totalRevenue).toBe(0)
 // An excluded status must not invalidate a report; no date-boundary approximation.
 await prisma.order.update({where:{id:replica.id},data:{status:'cancelled'}})
 expect((await getSalesReport(a.store.id,day(2002))).summary.totalRevenue).toBe(0)
})
