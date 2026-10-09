import { PrismaClient } from '@prisma/client'
import { netReceivedAmount } from '../utils/refundAllocation'
import { z } from 'zod'
export const CASH_WARNING_PREFIX = 'pos.shift.cash-warning:'
export type CashReconciliation = {version:1;source:string;windowStart:string;windowEnd:string;revenue:number;expenses:number;qris:number;cashFromRevenue:number;openFloat:number;expectedCash:number}
const money = (value:number) => Math.round(value * 100) / 100
export async function calculateShiftCash(db:Pick<PrismaClient,'order'|'expense'>,storeId:string,shift:{openedAt:Date;openFloat:number},asOf:Date):Promise<CashReconciliation> {
  const where={storeId,createdAt:{gte:shift.openedAt,lt:asOf}}
  const [orders,expenses]=await Promise.all([
    db.order.findMany({where:{...where,status:{in:['completed','paid']},paymentMethod:{in:['cash','qris']}},select:{finalAmount:true,status:true,paymentMethod:true,refundRequests:{where:{status:{in:['approved','paid']}},select:{amount:true,status:true}}}}),
    db.expense.findMany({where,select:{amount:true}})
  ])
  const revenue=orders.reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const qris=orders.filter(o=>o.paymentMethod==='qris').reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const expenseAmount=money(expenses.reduce((sum,e)=>sum+e.amount,0)/100)
  const cashFromRevenue=money(revenue-expenseAmount-qris)
  return {version:1,source:'recorded_shift_formula',windowStart:shift.openedAt.toISOString(),windowEnd:asOf.toISOString(),revenue,expenses:expenseAmount,qris,cashFromRevenue,openFloat:shift.openFloat,expectedCash:money(cashFromRevenue+shift.openFloat)}
}
export type CashWarning={version:1;status:'pending'|'reviewed';sessionId:string;expectedCash:number;actualCash:number;difference:number;createdAt:string;reviewedAt?:string;reviewedBy?:string;reviewedByName?:string;reviewNote?:string}
export function cashWarningFor(sessionId:string,actualCash:number,reconciliation:CashReconciliation,at:Date):CashWarning|null {
  const difference=money(actualCash-reconciliation.expectedCash)
  return difference===0 ? null : {version:1,status:'pending',sessionId,expectedCash:reconciliation.expectedCash,actualCash,difference,createdAt:at.toISOString()}
}
export async function loadShiftCashReviews(db:Pick<PrismaClient,'config'>,storeId:string,ids:string[]) {
  const results=new Map<string,{cashReconciliation:CashReconciliation|null;cashWarning:CashWarning|null}>()
  if(!ids.length)return results
  const rows=await db.config.findMany({where:{storeId,key:{in:ids.flatMap(id=>['pos.shift.report:'+id,CASH_WARNING_PREFIX+id])}},select:{key:true,value:true}})
  for(const row of rows){try{
    const isWarning=row.key.startsWith(CASH_WARNING_PREFIX),id=row.key.slice(isWarning?CASH_WARNING_PREFIX.length:'pos.shift.report:'.length),data=JSON.parse(row.value)
    const entry=results.get(id)||{cashReconciliation:null,cashWarning:null}
    if(isWarning) entry.cashWarning=data;else entry.cashReconciliation=data.cashReconciliation||null
    results.set(id,entry)
  }catch{}}
  return results
}
export const cashReviewSchema=z.object({note:z.string().trim().min(1).max(2000)}).strict()
export class CashReviewError extends Error {constructor(public status:number,message:string){super(message)}}
export async function reviewCashWarning(db:Pick<PrismaClient,'$transaction'>,actor:{id:string;storeId:string;role:string},sessionId:string,note:string) {
  if(actor.role!=='admin')throw new CashReviewError(403,'ADMIN_REQUIRED')
  const input=cashReviewSchema.parse({note})
  return db.$transaction(async tx=>{
    await tx.store.update({where:{id:actor.storeId},data:{updatedAt:new Date()}})
    const session=await tx.shiftSession.findFirst({where:{id:sessionId,storeId:actor.storeId,status:'closed'}})
    if(!session)throw new CashReviewError(404,'SHIFT_NOT_FOUND')
    const where={storeId_key:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+sessionId}}
    const row=await tx.config.findUnique({where})
    if(!row)throw new CashReviewError(404,'CASH_WARNING_NOT_FOUND')
    const previous=JSON.parse(row.value) as CashWarning
    if(previous.status==='reviewed')return previous
    if(previous.status!=='pending')throw new CashReviewError(409,'CASH_WARNING_STATE_INVALID')
    const staff=await tx.staff.findFirst({where:{userId:actor.id,storeId:actor.storeId},select:{name:true}})
    const reviewed={...previous,status:'reviewed' as const,reviewedAt:new Date().toISOString(),reviewedBy:actor.id,reviewedByName:staff?.name||'Admin',reviewNote:input.note}
    await tx.config.update({where,data:{value:JSON.stringify(reviewed)}})
    await tx.financeAuditLog.create({data:{storeId:actor.storeId,userId:actor.id,action:'review',entityType:'shift_cash_warning',entityId:sessionId,description:'Administrator reviewed shift cash discrepancy',oldValue:row.value,newValue:JSON.stringify(reviewed)}})
    return reviewed
  })
}
