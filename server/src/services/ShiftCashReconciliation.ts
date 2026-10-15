import { POS_MANUAL_PAYMENT_METHODS } from '../utils/offlinePolicy'
import { PrismaClient } from '@prisma/client'
import { netReceivedAmount } from '../utils/refundAllocation'
import { z } from 'zod'
export const CASH_WARNING_PREFIX = 'pos.shift.cash-warning:'
export type CashReconciliation = {version:1;source:string;windowStart:string;windowEnd:string;revenue:number;expenses:number;qris:number;cashFromRevenue:number;openFloat:number;expectedCash:number;cashIns?:number;cashOuts?:number;otherNonCash?:number}
const money = (value:number) => Math.round(value * 100) / 100
export async function calculateShiftCash(db:Pick<PrismaClient,'order'|'expense'>&Partial<Pick<PrismaClient,'cashEvent'|'refundRequest'|'financeAuditLog'>>,storeId:string,shift:{openedAt:Date;openFloat:number},asOf:Date):Promise<CashReconciliation> {
  const where={storeId,createdAt:{gte:shift.openedAt,lt:asOf}}
  if(db.refundRequest&&db.cashEvent){
    // Cash follows payout time, independent of the original order date or payment channel.
    const [orders,expenses,events,refunds]=await Promise.all([
      db.order.findMany({where:{...where,status:{in:['completed','paid','refunded']},paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}},select:{finalAmount:true,status:true,paymentMethod:true,refundRequests:{where:{status:{in:['approved','paid']}},select:{id:true}}}}),
      db.expense.findMany({where,select:{amount:true}}),
      db.cashEvent.findMany({where:{...where,type:{in:['cash_in','cash_out']}},select:{type:true,amount:true}}),
      db.refundRequest.findMany({where:{status:{in:['approved','paid']},approvedAt:{gte:shift.openedAt,lt:asOf},order:{storeId,paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}}},select:{id:true,amount:true,order:{select:{paymentMethod:true}}}})
    ])
    const gross=orders.filter(o=>o.status!=='refunded'||o.refundRequests.length>0)
    const sum=(method?:string)=>gross.filter(o=>!method||o.paymentMethod===method).reduce((s,o)=>s+o.finalAmount,0)-refunds.filter(r=>!method||r.order.paymentMethod===method).reduce((s,r)=>s+r.amount,0)
    const audit=db.financeAuditLog&&refunds.length?await db.financeAuditLog.findMany({where:{storeId,entityType:'offline_refund',entityId:{in:refunds.map(r=>r.id)}},select:{entityId:true,newValue:true}}):[]
    const payouts=new Map(audit.map(a=>[a.entityId,JSON.parse(a.newValue||'{}').payoutMethod]))
    const bankReceived=(method:string)=>gross.filter(o=>o.paymentMethod===method).reduce((s,o)=>s+o.finalAmount,0)-refunds.filter(r=>r.order.paymentMethod===method&&(payouts.get(r.id)|| (method==='cash'?'cash':'external'))==='external').reduce((s,r)=>s+r.amount,0)
    const revenue=sum(),qris=bankReceived('qris'),otherNonCash=POS_MANUAL_PAYMENT_METHODS.filter(m=>!['cash','qris'].includes(m)).reduce((s,m)=>s+bankReceived(m),0)
    const expenseAmount=money(expenses.reduce((s,e)=>s+e.amount,0)/100),cashIns=events.filter(e=>e.type==='cash_in').reduce((s,e)=>s+e.amount,0),cashOuts=events.filter(e=>e.type==='cash_out').reduce((s,e)=>s+e.amount,0)
    const cashFromRevenue=money(gross.filter(o=>o.paymentMethod==='cash').reduce((s,o)=>s+o.finalAmount,0)-expenseAmount)
    return {version:1,source:'occurrence_cash_ledger',windowStart:shift.openedAt.toISOString(),windowEnd:asOf.toISOString(),revenue,expenses:expenseAmount,qris,otherNonCash,cashFromRevenue,openFloat:shift.openFloat,cashIns,cashOuts,expectedCash:money(shift.openFloat+cashFromRevenue+cashIns-cashOuts)}
  }
  const [orders,expenses]=await Promise.all([
    db.order.findMany({where:{...where,status:{in:['completed','paid']},paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}},select:{finalAmount:true,status:true,paymentMethod:true,refundRequests:{where:{status:{in:['approved','paid']}},select:{amount:true,status:true}}}}),
    db.expense.findMany({where,select:{amount:true}})
  ])
  const events=db.cashEvent?await db.cashEvent.findMany({where:{...where,type:{in:['cash_in','cash_out']},orderId:null},select:{type:true,amount:true}}):[]
  const cashIns=events.filter(e=>e.type==='cash_in').reduce((sum,e)=>sum+e.amount,0)
  const cashOuts=events.filter(e=>e.type==='cash_out').reduce((sum,e)=>sum+e.amount,0)
  const revenue=orders.reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const qris=orders.filter(o=>o.paymentMethod==='qris').reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const otherNonCash=orders.filter(o=>!['cash','qris'].includes(o.paymentMethod)).reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const expenseAmount=money(expenses.reduce((sum,e)=>sum+e.amount,0)/100)
  const cashFromRevenue=money(revenue-expenseAmount-qris-otherNonCash)
  return {version:1,source:'recorded_shift_formula',windowStart:shift.openedAt.toISOString(),windowEnd:asOf.toISOString(),revenue,expenses:expenseAmount,qris,cashFromRevenue,openFloat:shift.openFloat,cashIns,cashOuts,otherNonCash,expectedCash:money(cashFromRevenue+shift.openFloat+cashIns-cashOuts)}
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
