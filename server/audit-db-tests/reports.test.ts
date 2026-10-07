import {getAiPolicy,saveAiPolicy,defaultAiPolicy,rejectAiExecution} from '../src/services/AiPermissionService'
import {afterAll,beforeAll,expect,jest,test} from '@jest/globals'
import {randomUUID} from 'crypto'
jest.mock('../src/services/BomService',()=>({getLowStockAlerts:jest.fn(async()=>[])}))
jest.mock('../src/services/InventoryService',()=>({getConsumptionAnalysis:jest.fn(async()=>[])}))
import prisma from '../src/config/database'
import {getSalesReport,getStaffReport,getDashboardSummary} from '../src/services/ReportService'
import {getPaymentSummary} from '../src/services/PaymentService'
import {checkLevelUpgrade} from '../src/services/MemberService'
beforeAll(async()=>{
 const [row]=await prisma.$queryRawUnsafe<Array<{db:string;address:string|null}>>("SELECT current_database() AS db, inet_server_addr()::text AS address")
 expect(row.db).toBe('bubble_audit_test');expect(row.address).toBeNull()
})
afterAll(async()=>{await prisma.$disconnect()})
async function store(){const tenant=await prisma.tenant.create({data:{name:'Synthetic report'}});return prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic report store'}})}
async function ledger(){
 const s=await store()
 for(const status of ['completed','paid','pending','suspended','cancelled','refunded'])await prisma.order.create({data:{storeId:s.id,staffId:'synthetic-staff',orderNumber:randomUUID(),totalAmount:100,finalAmount:100,status,paymentMethod:'cash'}})
 return s
}
test('sales, staff and payment reports count paid sales only',async()=>{
 const s=await ledger();const range={startDate:new Date('2000-01-01'),endDate:new Date('2100-01-01')}
 const sales=await getSalesReport(s.id,range);expect(sales.summary.totalOrders).toBe(2);expect(sales.summary.totalRevenue).toBe(200)
 const staff=await getStaffReport(s.id,range);expect(staff.sales.reduce((sum,x)=>sum+x.revenue,0)).toBe(200)
 const payment=await getPaymentSummary(s.id,new Date());expect(payment.totalOrders).toBe(2);expect(payment.totalAmount).toBe(200)
})
test('dashboard attendance and revenue exclude foreign stores and unpaid receipts',async()=>{
 const a=await ledger(),b=await store();const key=randomUUID()
 const user=await prisma.user.create({data:{storeId:b.id,phone:key,password:'synthetic-unused-no-login',role:'staff'}})
 const staff=await prisma.staff.create({data:{storeId:b.id,userId:user.id,name:'Synthetic foreign employee',employeeNumber:key}})
 await prisma.attendance.create({data:{staffId:staff.id,checkInTime:new Date()}})
 const dashboard=await getDashboardSummary(a.id)
 expect(dashboard.today.revenue).toBe(200);expect(dashboard.staff.total).toBe(0)
})
test('missing tier configuration keeps a zero-spend member at the documented fallback bronze level',async()=>{
 const s=await store();const member=await prisma.member.create({data:{storeId:s.id,name:'Synthetic bronze',phone:randomUUID(),totalSpent:0}})
 await checkLevelUpgrade(member.id)
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).level).toBe('bronze')
})

test('AI permission drafts persist per store while real execution remains disabled',async()=>{
 const s=await store();const actor={id:'synthetic-admin',role:'admin',storeId:s.id}
 expect((await getAiPolicy(actor,s.id)).executionEnabled).toBe(false)
 const draft={...defaultAiPolicy(),read:{sales:true,inventory:true},actions:{refund:'approval',purchase:'automatic',price:'deny'}}
 await saveAiPolicy(actor,s.id,draft)
 expect(await getAiPolicy(actor,s.id)).toEqual(draft)
 expect(await prisma.financeAuditLog.count({where:{storeId:s.id,entityType:'ai_permission_draft'}})).toBe(1)
 await expect(saveAiPolicy({...actor,role:'manager'},s.id,draft)).rejects.toThrow('AI_POLICY_ACCESS_DENIED')
 await expect(saveAiPolicy(actor,'foreign',draft)).rejects.toThrow('AI_POLICY_ACCESS_DENIED')
 expect(()=>rejectAiExecution()).toThrow('AI_EXECUTION_NOT_AVAILABLE')
})
