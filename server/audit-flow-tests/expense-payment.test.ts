import {readShiftHandover} from '../src/services/ShiftHandoverReadService'
import {afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {createPurchaseOrder,receivePurchaseOrder} from '../src/services/PurchaseOrderService'
import {calculateShiftCash,loadShiftCashReviews} from '../src/services/ShiftCashReconciliation'
import {confirmExpensePayment,paymentFields} from '../src/services/ExpensePaymentService'
import {createPosExpense} from '../src/services/PosExpenseService'
import {getCashFlow,getProfitAnalysis} from '../src/services/FinanceService'
import {revenueQuery} from '../src/services/RevenueQueryService'
afterAll(()=>prisma.$disconnect())
async function fixture(){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic payment separation'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic payment separation'}})
 const inv=await prisma.inventory.create({data:{storeId:store.id,name:'Powder',unit:'kg',category:'powder',currentStock:0,avgCost:0}})
 const shift=await prisma.shiftSession.create({data:{storeId:store.id,staffId:'buyer',shift:'day',status:'open',openFloat:100000,openedAt:new Date(Date.now()-3600000)}})
 await prisma.order.create({data:{orderNumber:randomUUID(),storeId:store.id,staffId:'buyer',status:'completed',paymentMethod:'cash',totalAmount:200000,finalAmount:200000}})
 return {store,inv,shift,actor:{id:'admin',storeId:store.id},now:()=>new Date(Date.now()+100)}
}
for(const source of ['owner_transfer','personal','other','unknown'] as const)test(source+' purchase affects cash flow, never shift drawer or sales cost, receipt does not repay',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,paymentSource:source,items:[{inventoryId:f.inv.id,quantity:3,paidAmount:335200}]})
 expect((await calculateShiftCash(prisma,f.store.id,f.shift,f.now())).expectedCash).toBe(300000)
 await receivePurchaseOrder(order.id,'buyer',f.store.id)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(3)
 expect(await prisma.expense.count({where:{storeId:f.store.id}})).toBe(1)
 expect((await calculateShiftCash(prisma,f.store.id,f.shift,f.now())).expenses).toBe(0)
 expect((await getCashFlow(f.store.id,new Date(0),f.now())).outflows.inventoryPurchases).toBe(335200)
 expect((await getProfitAnalysis(f.store.id,new Date(0),f.now())).totalOperatingCosts).toBe(0)
})
test('purchase payment is always online even if an old caller supplies drawer source; retry and receipt never deduct',async()=>{
 const f=await fixture(),data={storeId:f.store.id,paymentSource:'drawer_cash' as const,requestId:randomUUID(),items:[{inventoryId:f.inv.id,quantity:3,paidAmount:35000}]}
 const order=await createPurchaseOrder(data);await createPurchaseOrder(data);await receivePurchaseOrder(order.id,'buyer',f.store.id)
 const e=await prisma.expense.findFirstOrThrow({where:{referenceId:order.id}});expect(e.paymentSource).toBe('online_payment');expect(e.cashSessionId).toBeNull();expect(e.cashOccurredAt).toBeNull()
 const cash=await calculateShiftCash(prisma,f.store.id,f.shift,f.now());expect(cash.expenses).toBe(0);expect(cash.expectedCash).toBe(300000)
})
test('advance bank payment recorded on actual prior day, receipt today never touches drawer',async()=>{
 const f=await fixture(),paidDate='2026-01-02',order=await createPurchaseOrder({storeId:f.store.id,paymentSource:'owner_transfer',paidDate,items:[{inventoryId:f.inv.id,quantity:3,paidAmount:100}]})
 await receivePurchaseOrder(order.id,'buyer',f.store.id)
 expect((await prisma.expense.findFirstOrThrow({where:{referenceId:order.id}})).date.toISOString()).toBe('2026-01-01T17:00:00.000Z')
 expect((await calculateShiftCash(prisma,f.store.id,f.shift,f.now())).expenses).toBe(0)
 expect((await createPurchaseOrder({storeId:f.store.id,paymentSource:'drawer_cash',paidDate,items:[{inventoryId:f.inv.id,quantity:3,paidAmount:100}]})).paymentSource).toBe('online_payment')
})
test('drawer operating payment requires a unique open shift; online procurement does not',async()=>{
 const f=await fixture();await prisma.shiftSession.update({where:{id:f.shift.id},data:{status:'closed',closedAt:new Date()}})
 await expect(paymentFields(prisma,f.store.id,'drawer_cash',new Date())).rejects.toThrow('ONE_OPEN_SHIFT')
 await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:1,paidAmount:100}]})
 expect(await prisma.expense.count({where:{storeId:f.store.id}})).toBe(1)
 await prisma.shiftSession.update({where:{id:f.shift.id},data:{status:'open',closedAt:null}})
 await prisma.shiftSession.create({data:{storeId:f.store.id,staffId:'other',shift:'night',status:'open',openFloat:0,openedAt:new Date(Date.now()-5000)}})
 await expect(paymentFields(prisma,f.store.id,'drawer_cash',new Date())).rejects.toThrow('ONE_OPEN_SHIFT')
})
test('historical unknowns retain original snapshot, verified owner transfer recomputes derived cash once and leaves stored evidence intact',async()=>{
 const f=await fixture(),at=new Date(),expense=await prisma.expense.create({data:{storeId:f.store.id,type:'supplies',category:'supplies',amount:33520000,description:'Historic payment',date:at}})
 const closedAt=f.now();await prisma.shiftSession.update({where:{id:f.shift.id},data:{status:'closed',closedAt,actualCash:300000,expectedCash:-35200,cashDifference:335200}})
 const original={cashReconciliation:{version:1,source:'occurrence_cash_ledger',windowStart:f.shift.openedAt.toISOString(),windowEnd:closedAt.toISOString(),expenses:335200,cashFromRevenue:-135200,revenue:200000,qris:0,openFloat:100000,expectedCash:-35200}}
 const value=JSON.stringify(original);await prisma.config.create({data:{storeId:f.store.id,key:'pos.shift.report:'+f.shift.id,category:'shift_report',value}})
 const first=(await loadShiftCashReviews(prisma,f.store.id,[f.shift.id])).get(f.shift.id)!
 expect(first.cashReconciliation!.expectedCash).toBe(-35200);expect(first.cashReconciliation!.expenseReview!.unknownCount).toBe(1)
 const next=await confirmExpensePayment(prisma,f.actor,expense.id,{paymentSource:'owner_transfer',paidAt:at,expectedVersion:expense.updatedAt.toISOString(),reason:'Verified bank receipt'})
 for(let i=0;i<2;i++){const review=(await loadShiftCashReviews(prisma,f.store.id,[f.shift.id])).get(f.shift.id)!;expect(review.cashReconciliation!.expectedCash).toBe(300000);expect(review.cashReconciliation!.expenses).toBe(0);expect(review.cashReconciliation!.expenseReview!.excludedAmount).toBe(335200)}
 expect((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:f.store.id,key:'pos.shift.report:'+f.shift.id}}})).value).toBe(value)
 expect((await prisma.shiftSession.findUniqueOrThrow({where:{id:f.shift.id}})).expectedCash).toBe(-35200)
 await expect(confirmExpensePayment(prisma,f.actor,expense.id,{paymentSource:'other',paidAt:at,expectedVersion:expense.updatedAt.toISOString(),reason:'Stale change'})).rejects.toThrow('CHANGED')
 expect(next.paymentSource).toBe('owner_transfer');expect(await prisma.financeAuditLog.count({where:{entityId:expense.id,action:'verify_payment_source'}})).toBe(1)
})
test('historical cash confirmation uses actual payment instant and never assigns a later entry shift',async()=>{
 const f=await fixture(),at=new Date(f.shift.openedAt.getTime()+1000),e=await prisma.expense.create({data:{storeId:f.store.id,type:'supplies',category:'supplies',amount:700000,description:'Verified receipt',date:at}})
 await confirmExpensePayment(prisma,f.actor,e.id,{paymentSource:'drawer_cash',paidAt:at,expectedVersion:e.updatedAt.toISOString(),reason:'Actual drawer receipt'})
 expect((await calculateShiftCash(prisma,f.store.id,f.shift,f.now())).expenses).toBe(7000)
 const foreign={id:'admin',storeId:'other'};await expect(confirmExpensePayment(prisma,foreign,e.id,{paymentSource:'owner_transfer',paidAt:at,expectedVersion:e.updatedAt.toISOString(),reason:'Wrong store'})).rejects.toThrow()
})
test('POS personal advance and drawer payment coexist, only drawer portion deducted',async()=>{
 const f=await fixture();await prisma.config.create({data:{storeId:f.store.id,key:'expense.categories',category:'expense',value:JSON.stringify([{key:'supplies',posVisible:true}])}})
 for(const source of ['personal','drawer_cash'] as const)await createPosExpense(f.actor,{requestId:randomUUID(),category:'supplies',amount:7000,quantity:1,description:'Synthetic purchase',paymentSource:source})
 expect((await calculateShiftCash(prisma,f.store.id,f.shift,f.now())).expenses).toBe(7000)
})
test('store purchase in revenue query has no artificial entry-time shift and no unassigned warning',async()=>{
 const f=await fixture();await createPurchaseOrder({storeId:f.store.id,paymentSource:'owner_transfer',items:[{inventoryId:f.inv.id,quantity:1,paidAmount:100}]})
 const q=await revenueQuery(prisma,f.store.id,{period:'today',dataset:'expense'},true,f.now(),async()=>{})
 expect(q.rows).toHaveLength(1);expect(q.rows[0].sessionId).toBeNull();expect(q.unassignedCount).toBe(0);expect(q.storePaymentCount).toBe(1)
})
test('confirmed online purchase is removed from legacy cash even with other unverified operating expenses',async()=>{
 const f=await fixture(),time=new Date();await prisma.expense.create({data:{storeId:f.store.id,type:'supplies',category:'supplies',referenceType:'purchase',amount:33520000,description:'Owner-confirmed online procurement',date:time}})
 await prisma.expense.create({data:{storeId:f.store.id,type:'operational',category:'other',amount:4200000,description:'Unverified old operating expense',date:time}})
 const end=f.now(),r={version:1,source:'occurrence_cash_ledger',windowStart:f.shift.openedAt.toISOString(),windowEnd:end.toISOString(),revenue:200000,qris:0,expenses:377200,cashFromRevenue:-177200,openFloat:100000,expectedCash:-77200}
 await prisma.config.create({data:{storeId:f.store.id,key:'pos.shift.report:'+f.shift.id,category:'shift_report',value:JSON.stringify({cashReconciliation:r})}})
 const review=(await loadShiftCashReviews(prisma,f.store.id,[f.shift.id])).get(f.shift.id)!.cashReconciliation!
 expect(review.expenses).toBe(42000);expect(review.expectedCash).toBe(258000);expect(review.expenseReview!.excludedAmount).toBe(335200);expect(review.expenseReview!.unknownCount).toBe(1)
})

test('POS legacy missing or unknown source is current drawer cash with retry deduplication',async()=>{
 const f=await fixture();await prisma.config.create({data:{storeId:f.store.id,key:'expense.categories',category:'expense',value:JSON.stringify([{key:'supplies',posVisible:true}])}})
 for(const paymentSource of [undefined,'unknown']){const input={requestId:randomUUID(),category:'supplies',amount:16000,quantity:1,description:'Synthetic drawer payment',...(paymentSource?{paymentSource}:{})};const first=await createPosExpense(f.actor,input);const repeated=await createPosExpense(f.actor,input);expect(first.id).toBe(repeated.id);expect(first.paymentSource).toBe('drawer_cash');expect(first.cashSessionId).toBe(f.shift.id)}
 const cash=await calculateShiftCash(prisma,f.store.id,f.shift,f.now());expect(cash.expenses).toBe(32000)
})

test('reprint includes confirmed drawer expense and preserves the original closed report',async()=>{
 const f=await fixture(),at=new Date();await prisma.shiftSession.update({where:{id:f.shift.id},data:{status:'closed',closedAt:at,actualCash:284000}})
 const original={version:3,expectedCash:300000,cashDifference:-16000,cashReconciliation:{version:1,source:'occurrence_cash_ledger',expenseCashBasis:'explicit_payment_source_v1',windowStart:f.shift.openedAt.toISOString(),windowEnd:at.toISOString(),revenue:200000,expenses:0,qris:0,cashFromRevenue:200000,openFloat:100000,expectedCash:300000},handoverFinancials:{expenses:0}}
 await prisma.config.create({data:{storeId:f.store.id,key:'pos.shift.report:'+f.shift.id,category:'shift_report',value:JSON.stringify(original)}})
 await prisma.expense.create({data:{storeId:f.store.id,type:'operational',category:'supplies',amount:1600000,description:'Synthetic actual drawer payment',date:at,paymentSource:'drawer_cash',cashSessionId:f.shift.id,cashOccurredAt:new Date(at.getTime()-1)}})
 const report=await readShiftHandover(f.store.id,f.shift.id);expect(report?.report.cashReconciliation.expenses).toBe(16000);expect(report?.report.handoverFinancials.expenses).toBe(16000);expect(report?.expectedCash).toBe(284000);expect(report?.purchaseExpenses.total).toBe(16000);expect(report?.purchaseExpenses.items[0].description).toBe('Synthetic actual drawer payment')
 const again=await readShiftHandover(f.store.id,f.shift.id);expect(again?.expectedCash).toBe(284000)
 expect(JSON.parse((await prisma.config.findUniqueOrThrow({where:{storeId_key:{storeId:f.store.id,key:'pos.shift.report:'+f.shift.id}}})).value)).toEqual(original)
})
