import {afterAll,test,expect} from '@jest/globals'
import {randomUUID} from 'crypto'
import prisma from '../src/config/database'
import {createPurchaseOrder,editPurchaseOrder,receivePurchaseOrder,reversePurchaseReceipt,cancelPurchaseOrder,refundPurchasePayment,confirmPurchasePayment} from '../src/services/PurchaseOrderService'
import {inventoryQuantityCost} from '../src/services/InventoryQuantityService'
import {reverseTransfer} from '../src/services/FinanceAccountService'
import {getCashFlow,getProfitAnalysis} from '../src/services/FinanceService'
const financePeriod=[new Date(0),new Date('2100-01-01')] as const

afterAll(()=>prisma.$disconnect())
async function fixture(){
 const tenant=await prisma.tenant.create({data:{name:'Synthetic purchase payment'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic purchase payment'}})
 const inv=await prisma.inventory.create({data:{storeId:store.id,name:'Mango jam',unit:'g',category:'jam',currentStock:0,avgCost:0}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}}),product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name:'Mango tea',code:randomUUID()}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:inv.id,quantity:25,unit:'g'}})
 return {store,inv,product}
}
test('2.3 kg and Rp160000 preserve exact cost, payment posts once, receive refreshes recipes once',async()=>{
 const f=await fixture(),data={storeId:f.store.id,createdBy:'buyer',requestId:randomUUID(),source:'online',items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:160000}]}
 const order=await createPurchaseOrder(data),again=await createPurchaseOrder(data)
 expect(again.id).toBe(order.id);expect(order.items[0].quantity).toBe(2300);expect(order.items[0].unitCost).toBeCloseTo(160000/2300,9);expect(order.items[0].inputUnitCost).toBeCloseTo(160000/2.3,6)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(0)
 const expenses=await prisma.expense.findMany({where:{referenceId:order.id}});expect(expenses).toHaveLength(1);expect(expenses[0].amount).toBe(16000000);expect(expenses[0].description).toContain('Mango jam')
 await receivePurchaseOrder(order.id,'receiver',f.store.id);await receivePurchaseOrder(order.id,'receiver',f.store.id)
 const inv=await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}});expect(inv.currentStock).toBe(2300);expect(Number(inv.avgCost)).toBeCloseTo(160000/2300,9)
 expect(await inventoryQuantityCost(prisma,f.inv.id,25,'g')).toBeCloseTo(1739.1304347826,7)
 expect((await prisma.product.findUniqueOrThrow({where:{id:f.product.id}})).costPrice).toBe(1739)
 expect(await prisma.expense.count({where:{referenceId:order.id}})).toBe(1)
 expect((await getCashFlow(f.store.id,...financePeriod)).outflows.inventoryPurchases).toBe(160000);expect((await getCashFlow(f.store.id,...financePeriod)).totalOutflows).toBe(160000);expect((await getProfitAnalysis(f.store.id,...financePeriod)).netProfit).toBe(0)
})
test('pending edit uses actual paid amounts and optimistic version; foreign owner and units rejected',async()=>{
 const f=await fixture(),data={storeId:f.store.id,createdBy:'buyer',items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:160000}]},order=await createPurchaseOrder(data)
 await expect(editPurchaseOrder(order.id,data,'other',order.updatedAt.toISOString(),'fix',true)).rejects.toThrow('OWNER')
 await expect(editPurchaseOrder(order.id,{...data,items:[{inventoryId:f.inv.id,quantity:2,inputUnit:'L',paidAmount:100}]},'buyer',order.updatedAt.toISOString(),'fix',true)).rejects.toThrow('INCOMPATIBLE')
 const updated=await editPurchaseOrder(order.id,{...data,items:[{inventoryId:f.inv.id,quantity:2,inputUnit:'kg',paidAmount:150000}]},'buyer',order.updatedAt.toISOString(),'actual invoice',true)
 expect(updated.totalAmount).toBe(150000);expect((await prisma.expense.findFirstOrThrow({where:{referenceId:order.id}})).amount).toBe(15000000)
 await expect(editPurchaseOrder(order.id,data,'buyer',order.updatedAt.toISOString(),'stale',true)).rejects.toThrow('CHANGED')
})
test('cancel is not a refund; explicit actual refund is exactly once',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2,inputUnit:'kg',paidAmount:160000}]})
 await cancelPurchaseOrder(order.id,'cancel',f.store.id)
 expect((await prisma.expense.aggregate({where:{referenceId:order.id},_sum:{amount:true}}))._sum.amount).toBe(16000000)
 await refundPurchasePayment(order.id,f.store.id,'admin','refund received')
 await expect(refundPurchasePayment(order.id,f.store.id,'admin','duplicate')).rejects.toThrow('ALREADY_REFUNDED')
 expect((await prisma.expense.aggregate({where:{referenceId:order.id},_sum:{amount:true}}))._sum.amount).toBe(0)
 expect((await getCashFlow(f.store.id,...financePeriod)).totalOutflows).toBe(0)
})
test('intact receipt can be reversed and received again without deleting historical ledger evidence',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:160000}]})
 await receivePurchaseOrder(order.id,'buyer',f.store.id);await reversePurchaseReceipt(order.id,f.store.id,'admin','wrong arrival')
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(0)
 expect(await prisma.stockInLog.count({where:{purchaseOrderId:order.id}})).toBe(1)
 await receivePurchaseOrder(order.id,'buyer',f.store.id)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(2300)
 expect(await prisma.stockInLog.count({where:{purchaseOrderId:order.id}})).toBe(2)
 expect(await prisma.expense.count({where:{referenceId:order.id}})).toBe(1)
})
test('legacy unit-price order remains unpaid until explicitly confirmed, fractional quantity retained',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',unitCost:70000}]})
 expect(order.paidAt).toBeNull();expect(order.items[0].inputQuantity).toBe(2.3);expect(order.totalAmount).toBe(161000);expect(await prisma.expense.count({where:{referenceId:order.id}})).toBe(0)
})
test('transfer reversal restores both balances, retains original and rejects duplicate/cross-store',async()=>{
 const f=await fixture(),other=await fixture();const a=await prisma.financeAccount.create({data:{storeId:f.store.id,code:randomUUID(),name:'Cash',type:'cash',balance:100}}),b=await prisma.financeAccount.create({data:{storeId:f.store.id,code:randomUUID(),name:'Bank',type:'bank',balance:900}})
 const transfer=await prisma.financeTransfer.create({data:{storeId:f.store.id,fromAccountId:a.id,toAccountId:b.id,amount:400,date:new Date()}})
 await expect(reverseTransfer(transfer.id,other.store.id,'admin','wrong store')).rejects.toThrow('NOT_FOUND')
 await reverseTransfer(transfer.id,f.store.id,'admin','correction')
 expect((await prisma.financeAccount.findUniqueOrThrow({where:{id:a.id}})).balance).toBe(500)
 expect((await prisma.financeAccount.findUniqueOrThrow({where:{id:b.id}})).balance).toBe(500)
 await expect(reverseTransfer(transfer.id,f.store.id,'admin','again')).rejects.toThrow('ALREADY_REVERSED')
 expect(await prisma.financeTransfer.count({where:{storeId:f.store.id}})).toBe(2)
})

import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import {config} from '../src/config/env'
import {declareAccessRoutes} from '../src/middlewares/staffAccessV2'
import {staffCorrectionRouter,shiftSwapRouter,overtimeRouter} from '../src/routes/staffCorrection'
import {purchaseOrderRouter} from '../src/routes/purchaseOrder'
import {memberRouter} from '../src/routes/member'
import {depositRouter} from '../src/routes/deposit'
import {hygieneRouter} from '../src/routes/hygiene'
import {configRouter} from '../src/routes/config'
const app=express();app.use(express.json());
for(const [prefix,router]of [['staff-correction',staffCorrectionRouter],['shift-swap',shiftSwapRouter],['overtime',overtimeRouter],['purchase-orders',purchaseOrderRouter],['members',memberRouter],['deposit',depositRouter],['hygiene',hygieneRouter],['config',configRouter]] as const)app.use('/api/'+prefix,declareAccessRoutes('/api/'+prefix,router));
async function staffToken(storeId:string,role='staff'){
 const user=await prisma.user.create({data:{storeId,phone:randomUUID(),password:'synthetic',role}});
 const staff=await prisma.staff.create({data:{storeId,userId:user.id,name:'Synthetic buyer',employeeNumber:randomUUID()}});
 return {staff,user,token:'Bearer '+jwt.sign({id:user.id,phone:user.phone,role,storeId,staffId:staff.id,issuedAtMs:Date.now()+1000},config.jwt.secret)}
}
test('employee can revise and withdraw own pending requests, but cannot change another employee or an approved request',async()=>{
 const f=await fixture(),a=await staffToken(f.store.id),b=await staffToken(f.store.id),colleague=await staffToken(f.store.id),api=request(app);
 for(const [path,model,data,edit] of [
  ['staff-correction','attendanceCorrection',{date:'2026-10-15',correctCheckIn:'09:00',reason:'missed clock'},{date:'2026-10-15',correctCheckIn:'08:30',reason:'correct time'}],
  ['overtime','overtimeRequest',{date:'2026-10-15',startTime:'18:00',endTime:'20:00',reason:'delivery'},{date:'2026-10-15',startTime:'18:00',endTime:'21:00',reason:'correct hours'}],
  ['shift-swap','shiftSwap',{originalDate:'2026-10-16',originalShift:'morning',targetDate:'2026-10-17',targetShift:'evening',targetStaffId:colleague.staff.id,reason:'swap'},{originalDate:'2026-10-16',originalShift:'morning',targetDate:'2026-10-18',targetShift:'evening',targetStaffId:colleague.staff.id,reason:'correct day'}]
 ] as const){
  const created=await api.post('/api/'+path).set('Authorization',a.token).set('X-Client-App','employee').send(data);expect(created.status).toBe(201);const id=created.body.data.id;
  expect((await api.put(`/api/${path}/${id}`).set('Authorization',b.token).set('X-Client-App','employee').send({...edit,expectedVersion:created.body.data.updatedAt})).status).toBe(409);
  const changed=await api.put(`/api/${path}/${id}`).set('Authorization',a.token).set('X-Client-App','employee').send({...edit,expectedVersion:created.body.data.updatedAt});expect(changed.status).toBe(200);
  if(model==='overtimeRequest')expect(changed.body.data.hours).toBe(3);
  expect((await api.put(`/api/${path}/${id}/withdraw`).set('Authorization',a.token).set('X-Client-App','employee').send({})).status).toBe(200);
  expect((await (prisma[model] as any).findUniqueOrThrow({where:{id}})).status).toBe('cancelled');
  expect((await api.put(`/api/${path}/${id}`).set('Authorization',a.token).set('X-Client-App','employee').send({...edit,expectedVersion:created.body.data.updatedAt})).status).toBe(409);
 }
})
test('employee purchase editing/cancellation works only for owner and management reversal stays denied',async()=>{
 const f=await fixture(),a=await staffToken(f.store.id),b=await staffToken(f.store.id),api=request(app);
 const data={storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:160000}]};
 const created=await api.post('/api/purchase-orders').set('Authorization',a.token).set('X-Client-App','employee').send(data);expect(created.status).toBe(201);
 const id=created.body.data.id,body={...data,expectedVersion:created.body.data.updatedAt,reason:'invoice correction'};
 expect((await api.put(`/api/purchase-orders/${id}`).set('Authorization',b.token).set('X-Client-App','employee').send(body)).status).toBe(403);
 expect((await api.put(`/api/purchase-orders/${id}`).set('Authorization',a.token).set('X-Client-App','employee').send(body)).status).toBe(200);
 expect((await api.post(`/api/purchase-orders/${id}/reverse-receipt`).set('Authorization',a.token).set('X-Client-App','employee').send({reason:'test'})).status).toBe(403);
 expect((await api.delete(`/api/purchase-orders/${id}`).set('Authorization',b.token).set('X-Client-App','employee').send({})).status).toBe(404);
 expect((await api.delete(`/api/purchase-orders/${id}`).set('Authorization',a.token).set('X-Client-App','employee').send({reason:'owner cancelled'})).status).toBe(200);
 expect(await prisma.expense.count({where:{referenceId:id}})).toBe(1);
})
test('member profile correction retains money/points and rejects duplicate phones and stale data',async()=>{
 const f=await fixture(),admin=await staffToken(f.store.id,'admin'),api=request(app);
 const member=await prisma.member.create({data:{storeId:f.store.id,name:'Member',phone:'081234567890',points:100,balance:9000}});
 const input={name:'Correct member',phone:'081234567891',birthday:'1990-02-01',email:'member@example.test',expectedVersion:member.updatedAt.toISOString(),points:0,balance:0};
 const result=await api.put('/api/members/'+member.id).set('Authorization',admin.token).send(input);expect(result.status).toBe(200);expect(result.body.data.points).toBe(100);expect(result.body.data.balance).toBe(9000);
 expect((await api.put('/api/members/'+member.id).set('Authorization',admin.token).send(input)).status).toBe(409);
 await prisma.member.create({data:{storeId:f.store.id,phone:'081234567892',name:'Other'}});
 expect((await api.put('/api/members/'+member.id).set('Authorization',admin.token).send({...input,expectedVersion:result.body.data.updatedAt,phone:'081234567892'})).status).toBe(409);
})

test('deposit correction preserves history, prevents underfunded total and duplicate reversal',async()=>{
 const f=await fixture(),admin=await staffToken(f.store.id,'admin'),employee=await staffToken(f.store.id),api=request(app);
 const rule=await prisma.depositRule.create({data:{storeId:f.store.id,name:'Synthetic deposit',depositAmount:1000,deductionType:'one_time',refundType:'full'}});
 const d=await prisma.staffDeposit.create({data:{storeId:f.store.id,staffId:employee.staff.id,depositRuleId:rule.id,totalAmount:1000,deductedAmount:500,deductionCount:1}});
 const log=await prisma.staffDepositDeduction.create({data:{staffDepositId:d.id,amount:500}});
 const url='/api/deposit/staff/'+d.id;
 expect((await api.put(url).set('Authorization',admin.token).send({totalAmount:400,expectedVersion:d.updatedAt.toISOString(),reason:'wrong total'})).status).toBe(409);
 expect((await api.put(url).set('Authorization',admin.token).send({totalAmount:1200,expectedVersion:d.updatedAt.toISOString(),reason:'correct total'})).status).toBe(200);
 expect((await api.post(url+'/reverse/deduction/'+log.id).set('Authorization',employee.token).send({reason:'no access'})).status).toBe(403);
 expect((await api.post(url+'/reverse/deduction/'+log.id).set('Authorization',admin.token).send({reason:'wrong deduction'})).status).toBe(200);
 expect((await prisma.staffDeposit.findUniqueOrThrow({where:{id:d.id}})).deductedAmount).toBe(0);
 expect(await prisma.staffDepositDeduction.count({where:{staffDepositId:d.id}})).toBe(2);
 expect((await api.post(url+'/reverse/deduction/'+log.id).set('Authorization',admin.token).send({reason:'again'})).status).toBe(409);
});
test('hygiene assignment edit requires pending task and own-store staff, and retains evidence',async()=>{
 const f=await fixture(),other=await fixture(),admin=await staffToken(f.store.id,'admin'),staff=await staffToken(f.store.id),foreign=await staffToken(other.store.id),api=request(app);
 const task=await prisma.hygieneTask.create({data:{storeId:f.store.id,areaCode:'bar',name:'Clean bar',date:'2026-10-15',time:'10:00'}});
 const body={name:'Clean tea bar',staffId:staff.staff.id,date:'2026-10-15',time:'11:00',priority:2,reason:'correct assignment',expectedVersion:task.updatedAt.toISOString()},url='/api/hygiene/tasks/'+task.id;
 expect((await api.put(url).set('Authorization',admin.token).send({...body,staffId:foreign.staff.id})).status).toBe(409);
 const result=await api.put(url).set('Authorization',admin.token).send(body);expect(result.status).toBe(200);expect(result.body.data.staffId).toBe(staff.staff.id);
 expect(await prisma.hygieneTaskLog.count({where:{taskId:task.id}})).toBe(1);
 await prisma.hygieneTask.update({where:{id:task.id},data:{status:'completed'}});
 expect((await api.put(url).set('Authorization',admin.token).send({...body,expectedVersion:result.body.data.updatedAt})).status).toBe(409);
});

import {applyLeave} from '../src/services/LeaveService'
import {applyReimbursement} from '../src/services/ReimbursementService'
test('leave and reimbursement revise only owned pending applications with unchanged balance and receipts',async()=>{
 const f=await fixture(),a=await staffToken(f.store.id),b=await staffToken(f.store.id);
 const input={storeId:f.store.id,staffId:a.staff.id,leaveType:'unpaid',startDate:new Date('2026-10-19T00:00:00+07:00'),endDate:new Date('2026-10-19T00:00:00+07:00'),totalDays:1,reason:'original'};
 const leave=await applyLeave(input),edited=await applyLeave({...input,reason:'correct reason'},true,{id:leave.id,expectedVersion:leave.updatedAt.toISOString()});expect(edited.id).toBe(leave.id);expect(edited.reason).toBe('correct reason');
 await expect(applyLeave({...input,staffId:b.staff.id},true,{id:leave.id,expectedVersion:edited.updatedAt.toISOString()})).rejects.toThrow('NOT_OWNED');
 await prisma.leave.update({where:{id:leave.id},data:{status:'approved'}});
 await expect(applyLeave(input,true,{id:leave.id,expectedVersion:edited.updatedAt.toISOString()})).rejects.toThrow('NOT_OWNED');
 const claim={storeId:f.store.id,staffId:a.staff.id,type:'transport',amount:10000,description:'delivery',receiptUrls:['/synthetic-receipt.png']};
 const r=await applyReimbursement(claim),changed=await applyReimbursement({...claim,amount:9000},{id:r.id,expectedVersion:r.updatedAt.toISOString()});expect(changed.id).toBe(r.id);expect(changed.receiptUrls).toContain('synthetic-receipt');
 await expect(applyReimbursement(claim,{id:r.id,expectedVersion:r.updatedAt.toISOString()})).rejects.toThrow('CHANGED');
 await prisma.reimbursement.update({where:{id:r.id},data:{status:'approved'}});
 await expect(applyReimbursement(claim,{id:r.id,expectedVersion:changed.updatedAt.toISOString()})).rejects.toThrow('NOT_OWNED');
});
test('invalid payment rolls back and consumed batches cannot be reversed',async()=>{
 const f=await fixture();
 await expect(createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:1.5}]})).rejects.toThrow('INVALID_PURCHASE_AMOUNT');
 expect(await prisma.purchaseOrder.count({where:{storeId:f.store.id}})).toBe(0);
 const order=await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:2.3,inputUnit:'kg',paidAmount:160000}]});await receivePurchaseOrder(order.id,'buyer',f.store.id);
 await prisma.batch.updateMany({where:{inventoryId:f.inv.id},data:{quantity:2299}});
 await expect(reversePurchaseReceipt(order.id,f.store.id,'admin','already consumed')).rejects.toThrow();
 expect((await prisma.purchaseOrder.findUniqueOrThrow({where:{id:order.id}})).status).toBe('received');
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(2300);
});

test('legacy receipt reconstructs cost from original invoice quantity and preserves supplier reference on edit',async()=>{
 const f=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,onlineOrderNumber:'INVOICE-REFERENCE',items:[{inventoryId:f.inv.id,quantity:6.9,inputUnit:'kg',unitCost:6765}]});
 expect(order.items[0].inputUnitCost).toBe(6765);
 const edited=await editPurchaseOrder(order.id,{storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:6.9,inputUnit:'kg',unitCost:6765}]},'admin',order.updatedAt.toISOString(),'quantity review');expect(edited.onlineOrderNumber).toBe('INVOICE-REFERENCE');
 await prisma.purchaseOrderItem.updateMany({where:{purchaseOrderId:order.id},data:{unitCost:7,lineAmount:null}});
 await receivePurchaseOrder(order.id,'admin',f.store.id);
 const batch=await prisma.batch.findFirstOrThrow({where:{inventoryId:f.inv.id}}),log=await prisma.stockInLog.findFirstOrThrow({where:{purchaseOrderId:order.id}});
 expect(batch.unitCost).toBeCloseTo(46679/6900,9);expect(log.unitCost).toBeCloseTo(46679/6900,9);expect(log.totalAmount).toBe(46679);expect(await prisma.expense.count({where:{referenceId:order.id}})).toBe(0);
});

import {adjustInventory} from '../src/services/InventoryService'
test('upward stock correction retains fractional unit cost and posts a whole-rupiah log total',async()=>{
 const f=await fixture();await prisma.inventory.update({where:{id:f.inv.id},data:{currentStock:2300,avgCost:160000/2300}});
 await adjustInventory(f.inv.id,2301,'verified physical stock correction','admin');
 const log=await prisma.stockInLog.findFirstOrThrow({where:{inventoryId:f.inv.id}});expect(log.quantity).toBe(1);expect(log.unitCost).toBeCloseTo(160000/2300,9);expect(log.totalAmount).toBe(70);expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(2301);
});

test('correction markers stay private and cannot be reset through generic configuration APIs',async()=>{
 const f=await fixture(),admin=await staffToken(f.store.id,'admin'),api=request(app);
 await prisma.config.create({data:{storeId:f.store.id,key:'shiftSettings',category:'pos',value:'{}'}});
 for(const key of ['transfer.reversal.original','deposit.reversal.deduction.original','leave.period.employee.2026']){
  await prisma.config.create({data:{storeId:f.store.id,key,category:'finance',value:JSON.stringify({actor:'admin',reason:'private correction',reversalId:'original'})}});
  expect((await api.get(`/api/config/${f.store.id}/${key}`).set('Authorization',admin.token)).status).toBe(403);
  expect((await api.post('/api/config').set('Authorization',admin.token).send({storeId:f.store.id,key,value:{},category:'finance'})).status).toBe(403);
  expect((await api.delete(`/api/config/${f.store.id}/${key}`).set('Authorization',admin.token)).status).toBe(403);
 }
 const result=await api.get('/api/config').query({storeId:f.store.id}).set('Authorization',admin.token);expect(result.status).toBe(200);expect(result.body.data.shiftSettings).toEqual({});expect(Object.keys(result.body.data).some(key=>/reversal|leave.period/.test(key))).toBe(false);
});

test('historical confirmation preserves original items and payment date, links exactly once, rejects stale or foreign confirmation',async()=>{
 const f=await fixture(),other=await fixture(),order=await createPurchaseOrder({storeId:f.store.id,items:[{inventoryId:f.inv.id,quantity:6.9,inputUnit:'kg',unitCost:6765}]})
 const paidAt=new Date('2026-01-15T00:00:00+07:00')
 await expect(confirmPurchasePayment(order.id,other.store.id,'admin',order.updatedAt.toISOString(),paidAt,'verified')).rejects.toThrow('not found')
 await expect(confirmPurchasePayment(order.id,f.store.id,'admin',new Date(0).toISOString(),paidAt,'verified')).rejects.toThrow('CHANGED')
 await expect(confirmPurchasePayment(order.id,f.store.id,'admin',order.updatedAt.toISOString(),new Date('2100-01-01'),'verified')).rejects.toThrow('DATE')
 const updated=await confirmPurchasePayment(order.id,f.store.id,'admin',order.updatedAt.toISOString(),paidAt,'actual payment verified')
 expect(updated.financeExpenseId).toBeTruthy();expect(updated.items.map((i:any)=>i.id)).toEqual(order.items.map((i:any)=>i.id));expect(updated.totalAmount).toBe(46679)
 const expense=await prisma.expense.findFirstOrThrow({where:{referenceId:order.id,referenceType:'purchase'}})
 expect(expense.date).toEqual(paidAt);expect(expense.amount).toBe(4667900)
 await expect(confirmPurchasePayment(order.id,f.store.id,'admin',updated.updatedAt.toISOString(),paidAt,'retry')).rejects.toThrow('ALREADY_PAID')
 expect(await prisma.expense.count({where:{referenceId:order.id}})).toBe(1)
 expect(await prisma.financeAuditLog.count({where:{entityId:order.id,action:'confirm_payment'}})).toBe(1)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inv.id}})).currentStock).toBe(0)
})
