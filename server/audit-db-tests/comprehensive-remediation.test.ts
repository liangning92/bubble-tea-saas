import {generateRecurringExpenses} from '../src/services/RecurringExpenseService'
import {test,expect,afterAll} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {changeMemberBalance} from '../src/services/MemberBalanceService'
import {batchImport} from '../src/services/BatchImportService'
import {getRevenueSummary as financeRevenue} from '../src/services/FinanceService'
import {getRevenueSummary as revenue} from '../src/services/RevenueService'
import {publicProduct} from '../src/utils/publicProduct'
afterAll(()=>prisma.$disconnect())
async function store(){const tenant=await prisma.tenant.create({data:{name:'Synthetic remediation'}});return prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic'}})}
test('concurrent member topups add both balances; same request retries once and overdraft rolls back',async()=>{
 const s=await store(),m=await prisma.member.create({data:{storeId:s.id,phone:randomUUID(),name:'Synthetic',balance:100}}),a=randomUUID(),b=randomUUID()
 await Promise.all([changeMemberBalance(m.id,s.id,40,'topup','actor','test',a),changeMemberBalance(m.id,s.id,60,'topup','actor','test',b)])
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).balance).toBe(200)
 await changeMemberBalance(m.id,s.id,40,'topup','actor','test',a)
 expect(await prisma.memberBalanceLog.count({where:{memberId:m.id}})).toBe(2)
 await expect(changeMemberBalance(m.id,s.id,201,'deduct','actor','test',randomUUID())).rejects.toThrow('INSUFFICIENT')
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).balance).toBe(200)
 await expect(changeMemberBalance(m.id,s.id,41,'topup','actor','test',a)).rejects.toThrow('IDEMPOTENCY')
})
test('batch import writes every row, reports bad rows, retains original data on retry',async()=>{
 const s=await store(),requestId=randomUUID(),input={requestId,type:'products' as const,rows:[{name:'Tea, iced',category:'Tea',specs:'S,L',price:'100,200',cost:'50',status:'active'},{name:'bad',category:'Tea',specs:'S,L',price:'100',cost:'0',status:'active'}]}
 const result=await batchImport(s.id,'synthetic',input);expect(result.imported).toBe(1);expect(result.failed).toBe(1)
 expect(await prisma.product.count({where:{storeId:s.id}})).toBe(1)
 expect((await batchImport(s.id,'synthetic',input)).imported).toBe(1)
 expect(await prisma.product.count({where:{storeId:s.id}})).toBe(1)
 await expect(batchImport(s.id,'synthetic',{...input,rows:[{...input.rows[0],name:'Changed'}]})).rejects.toThrow('IDEMPOTENCY')
})
test('discounted zero-tax receipts remain zero tax and net receipts agree across reports',async()=>{
 const s=await store()
 await prisma.order.create({data:{storeId:s.id,staffId:'synthetic',orderNumber:randomUUID(),status:'completed',paymentMethod:'cash',totalAmount:100000,discountAmount:20000,finalAmount:80000,checkoutTaxAmount:0}})
 const range=[new Date(0),new Date('2100-01-01')] as const
 const f=await financeRevenue(s.id,...range),r=await revenue(s.id,...range)
 expect(f.totalRevenue).toBe(80000);expect(r.revenue).toBe(80000);expect(f.ppnCollected).toBe(0);expect(f.ppnPaid).toBeNull()
})
test('cashiers cannot read costs or recipes through nested product responses',()=>{
 const source={id:'p',costPrice:10,bomItems:[{inventory:{avgCost:30}}],specs:[{id:'s',price:100}],category:{id:'c'}}
 expect(publicProduct(source,'cashier')).toEqual({id:'p',specs:[{id:'s',price:100}],category:{id:'c'}})
 expect(publicProduct(source,'manager')).toEqual(source)
})

test('recurring catch-up is serialized and cannot duplicate a paid occurrence after deletion',async()=>{
 const s=await store(),key='expenses.recurring',item={id:randomUUID(),name:'Synthetic rent',category:'rent',amount:100,frequency:'monthly',nextDueDate:'2026-09-30',active:true}
 await prisma.config.create({data:{storeId:s.id,key,category:'expense',value:JSON.stringify({revision:0,items:[item]})}})
 await Promise.all([generateRecurringExpenses(s.id,new Date('2026-10-07T01:00:00Z')),generateRecurringExpenses(s.id,new Date('2026-10-07T01:00:00Z'))])
 expect(await prisma.expense.count({where:{storeId:s.id}})).toBe(1)
 await prisma.expense.deleteMany({where:{storeId:s.id}})
 await prisma.config.update({where:{storeId_key:{storeId:s.id,key}},data:{value:JSON.stringify({revision:2,items:[item]})}})
 await generateRecurringExpenses(s.id,new Date('2026-10-07T01:00:00Z'))
 expect(await prisma.expense.count({where:{storeId:s.id}})).toBe(0)
})
