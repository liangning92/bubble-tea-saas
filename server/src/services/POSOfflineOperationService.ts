import { requestItemRefund } from './ItemRefundService'
import { createRefundRequest } from './OrderService'
import { POS_OFFLINE_TTL_MS, POS_OFFLINE_DAYS, POS_MANUAL_PAYMENT_METHODS } from '../utils/offlinePolicy'
import { createHash } from 'crypto'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import prisma from '../config/database'
import { config } from '../config/env'
import type { AuthUser } from '../middlewares/auth'
import { userAccessV2 } from './StaffPermissionV2Service'
import { assignedStaffAccess } from './StaffPermissionService'
import { calculateShiftCash, cashWarningFor, CASH_WARNING_PREFIX } from './ShiftCashReconciliation'
import { loadShiftSummaryEvidence } from './ShiftSummaryEvidence'
import { shiftHandoverFinancials } from './ShiftHandoverFinancials'
import { summarizeShiftPurchases } from './PosExpenseService'
import { manualReceiptsSchema } from './ShiftManualReceipts'
import { posExpenseSchema } from './PosExpenseService'

const prefix = 'pos.offline.operation:'
const money = z.number().int().min(0).max(2147483647)
const base = z.object({id:z.string().uuid(), sessionId:z.string().min(1).max(100), occurredAt:z.string().datetime(), authorization:z.string().min(1).max(10000)})
export const offlineOperationSchema = z.discriminatedUnion('kind',[
 base.extend({kind:z.literal('open'),data:z.object({shift:z.string().min(1).max(100),openFloat:money.refine(n=>n>0)}).strict()}),
 base.extend({kind:z.literal('close'),data:z.object({actualCash:money,closeNote:z.string().max(2000).optional(),nextStaffId:z.string().max(100).optional(),manualReceiptsCashBasis:z.enum(['drawer_total','cash_receipts']).optional(),manualReceipts:manualReceiptsSchema.optional(),orders:z.array(z.object({orderNumber:z.string().max(100),finalAmount:money})).max(10000),localReport:z.record(z.unknown())}).strict()}),
 base.extend({kind:z.literal('cash'),data:z.object({type:z.enum(['cash_in','cash_out','float']),amount:money.refine(n=>n>0),note:z.string().max(2000).optional()}).strict()}),
 base.extend({kind:z.literal('expense'),data:posExpenseSchema}),
 base.extend({kind:z.literal('refund'),data:z.object({orderNumber:z.string().min(1).max(100),reason:z.string().trim().min(1).max(2000),reasonCode:z.enum(['customer_dissatisfied','paid_unprepared']),selection:z.array(z.object({itemId:z.string().max(150),quantity:z.number().int().positive(),productId:z.string(),specId:z.string(),unitPrice:money,originalQuantity:z.number().int().positive()})).min(1).max(500)}).strict()})
])
export class OfflineOperationError extends Error { constructor(message:string,public status=409){super(message)} }
const permitted=(user:Pick<AuthUser,'role'|'accessRole'>,key:string)=>{
 if(user.role==='admin')return true
 if(!user.accessRole)return key==='orders.discount'?user.role==='manager':['manager','cashier'].includes(user.role)
 return user.accessRole.version===2?user.accessRole.modes?.[key]==='allow':user.accessRole.permissions.includes(key==='orders.refund.request'?'orders.refund':key)
}
export function offlineAuthorization(user:AuthUser,allowedPayments:string[]=[],policy:Record<string,unknown>={}) {
 const issuedAt=Date.now()
 const permissions=['pos.shift','pos.cash','pos.expense','orders.create','orders.discount','orders.refund.request','members.read'].filter(key=>permitted(user,key))
 return {token:jwt.sign({actorId:user.id,staffId:user.staffId,storeId:user.storeId,role:user.role,issuedAt,permissions,allowedPayments,...policy},config.jwt.secret,{audience:'pos-offline-operations',expiresIn:`${POS_OFFLINE_DAYS}d`}),actorId:user.id,issuedAt:new Date(issuedAt).toISOString(),expiresAt:new Date(issuedAt+POS_OFFLINE_TTL_MS).toISOString(),permissions}
}
async function operationActor(storeId:string,input:z.infer<typeof offlineOperationSchema>,permission?:string) {
 const at=new Date(input.occurredAt).getTime()
 if(at>Date.now()+60000)throw new OfflineOperationError('OFFLINE_CLOCK_INVALID',400)
 let grant:any
 try {grant=jwt.verify(input.authorization,config.jwt.secret,{audience:'pos-offline-operations',clockTimestamp:Math.floor(at/1000)})}catch{throw new OfflineOperationError('OFFLINE_AUTHORIZATION_INVALID',403)}
 if(grant.storeId!==storeId||!Number.isFinite(grant.issuedAt)||at<grant.issuedAt-1000)throw new OfflineOperationError('OFFLINE_AUTHORIZATION_INVALID',403)
 const user=await prisma.user.findUnique({where:{id:grant.actorId},include:{staff:true}})
 const actor={id:user?.id,role:user?.role,storeId:user?.staff?.storeId||user?.storeId||'',staffId:user?.staff?.id||''} as AuthUser
 if(!user||user.updatedAt.getTime()>grant.issuedAt||(user.staff&&user.staff.status!=='active')||actor.storeId!==storeId||actor.staffId!==grant.staffId||actor.role!==grant.role)throw new OfflineOperationError('OFFLINE_AUTHORIZATION_REVOKED',403)
 actor.accessRole=await userAccessV2(actor)||await assignedStaffAccess(actor)
 const key=permission|| (input.kind==='refund'?'orders.refund.request':input.kind==='cash'?'pos.cash':input.kind==='expense'?'pos.expense':'pos.shift')
 if(!grant.permissions?.includes(key)||!permitted(actor,key))throw new OfflineOperationError('STAFF_ACCESS_PERMISSION_DENIED',403)
 return actor
}
export async function verifyOfflineSale(storeId:string,authorization:string,occurredAt:string,staffId:string,paymentMethod:string,manualDiscountAmount=0){
 const input={kind:'open',occurredAt,authorization} as z.infer<typeof offlineOperationSchema>
 const actor=await operationActor(storeId,input,'orders.create')
 const grant=jwt.decode(authorization) as any
 if(actor.staffId!==staffId||!(POS_MANUAL_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)||!grant.allowedPayments?.includes(paymentMethod))throw new OfflineOperationError('OFFLINE_SALE_AUTHORIZATION_INVALID',403)
 if(manualDiscountAmount&&(!grant.permissions?.includes('orders.discount')||!permitted(actor,'orders.discount')))throw new OfflineOperationError('STAFF_ACCESS_APPROVAL_REQUIRED',403)
 return actor
}
/** A receipt and all financial effects commit together. Replaying cannot duplicate money. */
export async function applyOfflineOperation(storeId:string,body:unknown) {
 const input=offlineOperationSchema.parse(body)
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex')
 const key=prefix+input.id
 // Store authentication is checked by the route. Immutable replays precede mutable authorization.
 const saved=await prisma.config.findUnique({where:{storeId_key:{storeId,key}}})
 if(saved){const receipt=JSON.parse(saved.value);if(receipt.fingerprint!==fingerprint)throw new OfflineOperationError('OFFLINE_OPERATION_CONFLICT');return receipt.result}
 const actor=await operationActor(storeId,input)
 const authorization=jwt.decode(input.authorization) as any
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const existing=await tx.config.findUnique({where:{storeId_key:{storeId,key}}})
  if(existing){const receipt=JSON.parse(existing.value);if(receipt.fingerprint!==fingerprint)throw new OfflineOperationError('OFFLINE_OPERATION_CONFLICT');return receipt.result}
  const at=new Date(input.occurredAt)
  let result:any
  if(input.kind==='open'){
   const active=await tx.shift.findFirst({where:{storeId,key:input.data.shift,isActive:true}})
   if(input.data.shift==='off'||(Array.isArray(authorization.shiftKeys)?!authorization.shiftKeys.includes(input.data.shift):!active))throw new OfflineOperationError('SHIFT_DISABLED')
   if(!input.sessionId.startsWith('POSSHIFT-'))throw new OfflineOperationError('OFFLINE_SESSION_ID_INVALID',400)
   const overlap=await tx.shiftSession.findFirst({where:{storeId,OR:[{status:'open'},{closedAt:{gt:at}}]}})
   if(overlap)throw new OfflineOperationError('SHIFT_SESSIONS_OVERLAP')
   result=await tx.shiftSession.create({data:{id:input.sessionId,storeId,staffId:actor.staffId,shift:input.data.shift,openFloat:input.data.openFloat,status:'open',openedAt:at}})
   await tx.cashEvent.create({data:{id:input.id,storeId,staffId:actor.staffId,type:'float',amount:input.data.openFloat,shift:result.shift,createdAt:at,note:'Offline shift opening'}})
  }else if(input.kind==='refund'){
   const order=await tx.order.findFirst({where:{storeId,orderNumber:input.data.orderNumber},include:{items:true}})
   if(!order)throw new OfflineOperationError('OFFLINE_REFUND_ORDER_PENDING')
   const used=new Set<string>()
   const selected=input.data.selection.map(item=>{
    const exact=order.items.find(line=>line.id===item.itemId)
    const matches=exact?[exact]:order.items.filter(line=>line.productId===item.productId&&line.specId===item.specId&&line.unitPrice===item.unitPrice&&line.quantity===item.originalQuantity&&!used.has(line.id)).sort((a,b)=>a.id.localeCompare(b.id))
    if(!matches.length||item.quantity>matches[0].quantity)throw new OfflineOperationError('OFFLINE_REFUND_SELECTION_CHANGED')
    const line=matches[0];used.add(line.id);return {itemId:line.id,quantity:item.quantity}
   })
   if(new Set(selected.map(i=>i.itemId)).size!==selected.length)throw new OfflineOperationError('OFFLINE_REFUND_SELECTION_CHANGED')
   if(input.data.reasonCode==='paid_unprepared'&&(selected.length!==order.items.length||selected.some(i=>i.quantity!==order.items.find(line=>line.id===i.itemId)!.quantity)))throw new OfflineOperationError('UNPREPARED_FULL_REFUND_REQUIRED')
   result=input.data.reasonCode==='paid_unprepared'
    ?await createRefundRequest({requestId:input.id,orderId:order.id,reason:input.data.reason,reasonCode:input.data.reasonCode,requestedBy:actor.staffId||actor.id,selectedItemIds:selected.map(i=>i.itemId)},tx)
    :await requestItemRefund({requestId:input.id,orderId:order.id,storeId,reason:input.data.reason,reasonCode:input.data.reasonCode,requestedBy:actor.staffId||actor.id,items:selected},tx)
  }else{
   const shift=await tx.shiftSession.findFirst({where:{id:input.sessionId,storeId,status:'open'}})
   if(!shift||at<shift.openedAt)throw new OfflineOperationError('OFFLINE_SHIFT_CONFLICT')
   if(input.kind==='cash'){
    result=await tx.cashEvent.create({data:{id:input.id,storeId,staffId:actor.staffId,type:input.data.type==='float'?'cash_in':input.data.type!,amount:input.data.amount!,note:input.data.note,shift:shift.shift,createdAt:at}})
   }else if(input.kind==='expense'){
    const categories=await tx.config.findUnique({where:{storeId_key:{storeId,key:'expense.categories'}}})
    if(Array.isArray(authorization.expenseCategoryKeys)?!authorization.expenseCategoryKeys.includes(input.data.category):!categories||!JSON.parse(categories.value).some((c:any)=>c.key===input.data.category&&c.posVisible!==false))throw new OfflineOperationError('POS_EXPENSE_CATEGORY_INVALID')
    result=await tx.expense.create({data:{id:input.id,storeId,type:'operational',category:input.data.category,amount:input.data.amount*100,description:input.data.description,date:new Date(new Date(at.getTime()+7*3600000).toISOString().slice(0,10)+'T00:00:00+07:00'),referenceType:'pos_reimbursement',referenceId:actor.id+':'+input.data.requestId,createdAt:at}})
    await tx.financeAuditLog.create({data:{storeId,userId:actor.id,action:'create',entityType:'expense',entityId:result.id,description:'Offline POS purchase',newValue:JSON.stringify({...input.data,source:'pos_reimbursement'})}})
    result={...result,amount:input.data.amount,quantity:input.data.quantity}
   }else{
    const settingsRow=await tx.config.findUnique({where:{storeId_key:{storeId,key:'shiftSettings'}}})
    const settings=settingsRow?JSON.parse(settingsRow.value):{}
    if((authorization.requireSupervisorConfirm??settings.requireSupervisorConfirm)&&!['admin','manager'].includes(actor.role))throw new OfflineOperationError('SUPERVISOR_REQUIRED',403)
    const receipts=input.data.manualReceipts
    if(input.data.manualReceiptsCashBasis==='drawer_total'&&receipts?.cash!==input.data.actualCash)throw new OfflineOperationError('SHIFT_DRAWER_AMOUNT_MISMATCH',400)
    if(input.data.nextStaffId&&!await tx.staff.findFirst({where:{id:input.data.nextStaffId,storeId,status:'active'}}))throw new OfflineOperationError('SHIFT_NEXT_STAFF_INVALID',400)
    const numbers=input.data.orders.map(o=>o.orderNumber)
    if(new Set(numbers).size!==numbers.length)throw new OfflineOperationError('OFFLINE_ORDER_MANIFEST_INVALID',400)
    const posted=await tx.order.findMany({where:{storeId,orderNumber:{in:numbers}},select:{orderNumber:true,finalAmount:true,createdAt:true}})
    if(posted.length!==numbers.length||input.data.orders.some(o=>!posted.some(p=>p.orderNumber===o.orderNumber&&p.finalAmount===o.finalAmount&&p.createdAt>=shift.openedAt&&p.createdAt<at)))throw new OfflineOperationError('OFFLINE_ORDERS_NOT_RECONCILED')
    const cashReconciliation=await calculateShiftCash(tx,storeId,shift,at)
    const captured=await loadShiftSummaryEvidence(tx,storeId,at,shift)
    const purchaseExpenses=await summarizeShiftPurchases(storeId,shift.openedAt,at,tx)
    const difference=input.data.actualCash-cashReconciliation.expectedCash
    const session=await tx.shiftSession.update({where:{id:shift.id},data:{status:'closed',closedAt:at,actualCash:input.data.actualCash,...(Number.isSafeInteger(cashReconciliation.expectedCash)&&cashReconciliation.expectedCash>=-2147483648&&cashReconciliation.expectedCash<=2147483647?{expectedCash:cashReconciliation.expectedCash}:{}),cashDifference:Number.isSafeInteger(difference)&&difference>=-2147483648&&difference<=2147483647?difference:null,closeNote:input.data.closeNote,nextStaffId:input.data.nextStaffId}})
    const cashier=await tx.staff.findUnique({where:{id:actor.staffId},select:{name:true}})
    const report={version:3,reportKind:'handover',sessionId:shift.id,offline:true,offlineStatus:'synced',localReport:input.data.localReport,manualReceiptsCashBasis:input.data.manualReceiptsCashBasis||'cash_receipts',manualReceipts:receipts||null,manualReceiptsSource:receipts?'manual_handover':null,handoverFinancials:shiftHandoverFinancials(input.data.actualCash,shift.openFloat,cashReconciliation.expenses,receipts?.qris??null,receipts?.shopeefood||0,receipts?.gofood||0,cashReconciliation.revenue),cashReconciliation,reportedBy:actor.id,cashierName:cashier?.name||null,shiftType:shift.shift,openedAt:shift.openedAt,closedAt:at,openFloat:shift.openFloat,actualCash:input.data.actualCash,summaryEvidence:captured.summaryEvidence,recordedBalance:cashReconciliation.expectedCash,expectedCash:cashReconciliation.expectedCash,cashDifference:difference,purchaseExpenses,summaryItems:settings.summaryItems||{},orderManifest:input.data.orders}
    for(const [reportKey,value]of [['pos.shift.report:'+shift.id,report],['pos.shift.purchase:'+shift.id,purchaseExpenses]] as const)await tx.config.create({data:{storeId,key:reportKey,category:'shift_report',value:JSON.stringify(value)}})
    const warning=cashWarningFor(shift.id,input.data.actualCash,cashReconciliation,at)
    if(warning)await tx.config.create({data:{storeId,key:CASH_WARNING_PREFIX+shift.id,category:'shift_report',value:JSON.stringify(warning)}})
    await tx.cashEvent.create({data:{id:input.id,storeId,staffId:actor.staffId,type:'close_shift',amount:input.data.actualCash,shift:shift.shift,createdAt:at,note:'Offline handover'}})
    result={...session,expectedCash:cashReconciliation.expectedCash,cashDifference:difference,purchaseExpenses,report}
   }
  }
  await tx.config.create({data:{storeId,key,category:'pos_offline_operation',value:JSON.stringify({fingerprint,result,sessionId:input.sessionId,occurredAt:input.occurredAt,kind:input.kind})}})
  return result
 })
}
