import { z } from 'zod'
import { businessCalendarDate } from '../utils/revenueDateRange'
import { loadStoreDateSettings } from '../utils/storeDateSettings'
export const paymentSourceSchema=z.enum(['online_payment','drawer_cash','owner_transfer','personal','other','unknown'])
export type PaymentSource=z.infer<typeof paymentSourceSchema>
export const EXPLICIT_CASH_BASIS='explicit_payment_source_v1'
export function drawerExpenseWhere(storeId:string,shift:{id?:string;openedAt:Date},end:Date){
 return {storeId,OR:[{referenceType:null},{referenceType:{notIn:['purchase','purchase_refund']}}],paymentSource:'drawer_cash',cashSessionId:shift.id || '__missing_session__',cashOccurredAt:{gte:shift.openedAt,lt:end}}
}
export class ExpensePaymentError extends Error {statusCode=400}
// The store lock serializes payment registration with handover. A receipt never calls this.
export async function paymentFields(tx:any,storeId:string,source:unknown,paidAt:Date,now=new Date()){
 const paymentSource=paymentSourceSchema.parse(source??'unknown')
 if(!Number.isFinite(paidAt.getTime())||paidAt>now)throw new ExpensePaymentError('INVALID_PAYMENT_DATE')
 if(paymentSource!=='drawer_cash')return {paymentSource,cashSessionId:null,cashOccurredAt:null}
 await tx.store.update({where:{id:storeId},data:{updatedAt:now}})
 const settings=await loadStoreDateSettings(tx,storeId)
 if(businessCalendarDate(paidAt,settings.timezone)!==businessCalendarDate(now,settings.timezone))throw new ExpensePaymentError('DRAWER_PAYMENT_MUST_BE_CURRENT')
 const sessions=await tx.shiftSession.findMany({where:{storeId,status:'open',openedAt:{lte:now}}})
 if(sessions.length!==1)throw new ExpensePaymentError('DRAWER_PAYMENT_REQUIRES_ONE_OPEN_SHIFT')
 return {paymentSource,cashSessionId:sessions[0].id,cashOccurredAt:now}
}

// Explicit administrator verification of actual payment evidence; original report is immutable.
export async function confirmExpensePayment(db:any,actor:{id:string;storeId:string},id:string,input:{paymentSource:PaymentSource;paidAt:Date;expectedVersion:string;reason:string}){
 if(!input.reason.trim()||!Number.isFinite(input.paidAt.getTime())||input.paidAt>new Date())throw new ExpensePaymentError('PAYMENT_EVIDENCE_REQUIRED')
 return db.$transaction(async(tx:any)=>{
  await tx.store.update({where:{id:actor.storeId},data:{updatedAt:new Date()}})
  const old=await tx.expense.findFirst({where:{id,storeId:actor.storeId}})
  if(!old)throw new ExpensePaymentError('EXPENSE_NOT_FOUND')
  const source=['purchase','purchase_refund'].includes(old.referenceType||'')?'online_payment':paymentSourceSchema.parse(input.paymentSource)
  if(['purchase','purchase_refund'].includes(old.referenceType||'')&&input.paymentSource!=='online_payment')throw new ExpensePaymentError('PURCHASE_IS_ONLINE_PAYMENT')
  let cashSessionId:string|null=null,cashOccurredAt:Date|null=null
  if(source==='drawer_cash'){
   const sessions=await tx.shiftSession.findMany({where:{storeId:actor.storeId,openedAt:{lte:input.paidAt},OR:[{closedAt:null},{closedAt:{gt:input.paidAt}}]}})
   if(sessions.length!==1)throw new ExpensePaymentError('DRAWER_PAYMENT_REQUIRES_ONE_SHIFT')
   cashSessionId=sessions[0].id;cashOccurredAt=input.paidAt
  }
  const changed=await tx.expense.updateMany({where:{id,storeId:actor.storeId,updatedAt:new Date(input.expectedVersion)},data:{paymentSource:source,cashSessionId,cashOccurredAt,date:input.paidAt}})
  if(changed.count!==1)throw new ExpensePaymentError('EXPENSE_CHANGED_REFRESH')
  const next=await tx.expense.findUnique({where:{id}})
  if(old.referenceType==='purchase'&&old.referenceId)await tx.purchaseOrder.updateMany({where:{id:old.referenceId,storeId:actor.storeId},data:{paidAt:input.paidAt}})
  await tx.financeAuditLog.create({data:{storeId:actor.storeId,userId:actor.id,action:'verify_payment_source',entityType:'expense',entityId:id,description:input.reason,oldValue:JSON.stringify(old),newValue:JSON.stringify(next)}})
  return next
 })
}
