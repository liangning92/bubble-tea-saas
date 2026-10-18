import { POS_MANUAL_PAYMENT_METHODS } from '../utils/offlinePolicy'
import { PrismaClient } from '@prisma/client'
import { netReceivedAmount } from '../utils/refundAllocation'
import { z } from 'zod'
import { drawerExpenseWhere, EXPLICIT_CASH_BASIS } from './ExpensePaymentService'
export const CASH_WARNING_PREFIX = 'pos.shift.cash-warning:'
export type CashReconciliation = {version:1;source:string;windowStart:string;windowEnd:string;revenue:number;expenses:number;qris:number;recordedQris?:number;qrisSource?:'recorded_orders'|'manual_handover';cashFromRevenue:number;openFloat:number;expectedCash:number;cashIns?:number;cashOuts?:number;otherNonCash?:number;expenseCashBasis?:string;expenseReview?:{originalExpenses:number;correctedExpenses:number;excludedAmount:number;unknownCount:number;originalExpectedCash:number}}
const money = (value:number) => Math.round(value * 100) / 100
// Manual QRIS is the shift total; only its difference replaces the recorded amount.
// Cash refunds and cash movements remain in their actual payout shift.
export function applyHandoverQris(recorded:CashReconciliation,manualQris?:number):CashReconciliation {
 const recordedQris=recorded.recordedQris??recorded.qris,qris=manualQris??recordedQris
 const cashFromRevenue=money(recorded.source==='occurrence_cash_ledger'?recorded.cashFromRevenue+recorded.qris-qris:recorded.revenue-recorded.expenses-qris-(recorded.otherNonCash||0))
 return {...recorded,recordedQris,qris,qrisSource:manualQris===undefined?'recorded_orders':'manual_handover',cashFromRevenue,expectedCash:money(recorded.openFloat+cashFromRevenue+(recorded.cashIns||0)-(recorded.cashOuts||0))}
}
export async function calculateShiftCash(db:Pick<PrismaClient,'order'|'expense'>&Partial<Pick<PrismaClient,'cashEvent'|'refundRequest'>>,storeId:string,shift:{id?:string;openedAt:Date;openFloat:number},asOf:Date):Promise<CashReconciliation> {
  const where={storeId,createdAt:{gte:shift.openedAt,lt:asOf}}
  if(db.refundRequest&&db.cashEvent){
    // Cash follows payout time, independent of the original order date or payment channel.
    const [orders,expenses,events,refunds]=await Promise.all([
      db.order.findMany({where:{...where,status:{in:['completed','paid','refunded']},paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}},select:{finalAmount:true,status:true,paymentMethod:true,refundRequests:{where:{status:{in:['approved','paid']}},select:{id:true}}}}),
      db.expense.findMany({where:drawerExpenseWhere(storeId,shift,asOf),select:{amount:true}}),
      db.cashEvent.findMany({where:{...where,type:{in:['cash_in','cash_out']}},select:{type:true,amount:true}}),
      db.refundRequest.findMany({where:{status:{in:['approved','paid']},approvedAt:{gte:shift.openedAt,lt:asOf},order:{storeId,paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}}},select:{id:true,amount:true,order:{select:{paymentMethod:true}}}})
    ])
    const gross=orders.filter(o=>o.status!=='refunded'||o.refundRequests.length>0)
    const sum=(method?:string)=>gross.filter(o=>!method||o.paymentMethod===method).reduce((s,o)=>s+o.finalAmount,0)-refunds.filter(r=>!method||r.order.paymentMethod===method).reduce((s,r)=>s+r.amount,0)
    // Channel receipts are original collections. Refunds are separate payouts;
    // subtracting them from QRIS here would count them twice when the cashier declares total QRIS collected.
    const collected=(method:string)=>gross.filter(o=>o.paymentMethod===method).reduce((s,o)=>s+o.finalAmount,0)
    const revenue=sum(),qris=collected('qris'),otherNonCash=POS_MANUAL_PAYMENT_METHODS.filter(m=>!['cash','qris'].includes(m)).reduce((s,m)=>s+collected(m),0)
    const expenseAmount=money(expenses.reduce((s,e)=>s+e.amount,0)/100),cashIns=events.filter(e=>e.type==='cash_in').reduce((s,e)=>s+e.amount,0),cashOuts=events.filter(e=>e.type==='cash_out').reduce((s,e)=>s+e.amount,0)
    const cashFromRevenue=money(gross.filter(o=>o.paymentMethod==='cash').reduce((s,o)=>s+o.finalAmount,0)-expenseAmount)
    return {version:1,expenseCashBasis:EXPLICIT_CASH_BASIS,source:'occurrence_cash_ledger',windowStart:shift.openedAt.toISOString(),windowEnd:asOf.toISOString(),revenue,expenses:expenseAmount,qris,otherNonCash,cashFromRevenue,openFloat:shift.openFloat,cashIns,cashOuts,expectedCash:money(shift.openFloat+cashFromRevenue+cashIns-cashOuts)}
  }
  const [orders,expenses]=await Promise.all([
    db.order.findMany({where:{...where,status:{in:['completed','paid']},paymentMethod:{in:[...POS_MANUAL_PAYMENT_METHODS]}},select:{finalAmount:true,status:true,paymentMethod:true,refundRequests:{where:{status:{in:['approved','paid']}},select:{amount:true,status:true}}}}),
    db.expense.findMany({where:drawerExpenseWhere(storeId,shift,asOf),select:{amount:true}})
  ])
  const events=db.cashEvent?await db.cashEvent.findMany({where:{...where,type:{in:['cash_in','cash_out']},orderId:null},select:{type:true,amount:true}}):[]
  const cashIns=events.filter(e=>e.type==='cash_in').reduce((sum,e)=>sum+e.amount,0)
  const cashOuts=events.filter(e=>e.type==='cash_out').reduce((sum,e)=>sum+e.amount,0)
  const revenue=orders.reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const qris=orders.filter(o=>o.paymentMethod==='qris').reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const otherNonCash=orders.filter(o=>!['cash','qris'].includes(o.paymentMethod)).reduce((sum,o)=>sum+netReceivedAmount(o),0)
  const expenseAmount=money(expenses.reduce((sum,e)=>sum+e.amount,0)/100)
  const cashFromRevenue=money(revenue-expenseAmount-qris-otherNonCash)
  return {version:1,expenseCashBasis:EXPLICIT_CASH_BASIS,source:'recorded_shift_formula',windowStart:shift.openedAt.toISOString(),windowEnd:asOf.toISOString(),revenue,expenses:expenseAmount,qris,cashFromRevenue,openFloat:shift.openFloat,cashIns,cashOuts,otherNonCash,expectedCash:money(cashFromRevenue+shift.openFloat+cashIns-cashOuts)}
}
export type CashWarning={version:1;status:'pending'|'reviewed'|'resolved';originalDifference?:number;approvedRefundAmount?:number;refundRequestIds?:string[];sessionId:string;expectedCash:number;actualCash:number;difference:number;createdAt:string;reviewedAt?:string;reviewedBy?:string;reviewedByName?:string;reviewNote?:string}
export function cashWarningFor(sessionId:string,actualCash:number,reconciliation:CashReconciliation,at:Date):CashWarning|null {
  const difference=money(actualCash-reconciliation.expectedCash)
  return difference===0 ? null : {version:1,status:'pending',sessionId,expectedCash:reconciliation.expectedCash,actualCash,difference,createdAt:at.toISOString()}
}
// A refund requested before handover can explain its pending shortage once approved.
// This is a view of review evidence, never a backdated cash payout or snapshot edit.
export function reconcileCashWarningRefunds(warning:CashWarning,refunds:{id:string;amount:number}[]):CashWarning {
  if(warning.status!=='pending' || warning.difference>=0 || !refunds.length)return warning
  const approvedRefundAmount=money(refunds.reduce((sum,r)=>sum+r.amount,0))
  // Excess refunds do not prove that the historical shortage has been explained.
  if(approvedRefundAmount<=0 || approvedRefundAmount> -warning.difference)return warning
  const difference=money(warning.difference+approvedRefundAmount)
  return {...warning,status:difference===0?'resolved':'pending',originalDifference:warning.difference,
    approvedRefundAmount,refundRequestIds:refunds.map(r=>r.id),expectedCash:money(warning.expectedCash-approvedRefundAmount),difference}
}
export async function loadShiftCashReviews(db:Pick<PrismaClient,'config'|'shiftSession'|'refundRequest'>&Partial<Pick<PrismaClient,'expense'>>,storeId:string,ids:string[]) {
  const results=new Map<string,{cashReconciliation:CashReconciliation|null;cashWarning:CashWarning|null}>()
  if(!ids.length)return results
  const rows=await db.config.findMany({where:{storeId,key:{in:ids.flatMap(id=>['pos.shift.report:'+id,CASH_WARNING_PREFIX+id])}},select:{key:true,value:true}})
  for(const row of rows){try{
    const isWarning=row.key.startsWith(CASH_WARNING_PREFIX),id=row.key.slice(isWarning?CASH_WARNING_PREFIX.length:'pos.shift.report:'.length),data=JSON.parse(row.value)
    const entry=results.get(id)||{cashReconciliation:null,cashWarning:null}
    if(isWarning) entry.cashWarning=data;else entry.cashReconciliation=data.cashReconciliation||null
    results.set(id,entry)
  }catch{}}
  // Preserve stored handover reports and cash counts. Correct only the derived view.
  if(db.expense)for(const [id,entry] of results){
    const r=entry.cashReconciliation
    if(!r)continue
    const start=new Date(r.windowStart),end=new Date(r.windowEnd)
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)continue
    const [legacy,eligible]=await Promise.all([
      db.expense.findMany({where:{storeId,createdAt:{gte:start,lt:end}},select:{amount:true,paymentSource:true,referenceType:true}}),
      db.expense.findMany({where:drawerExpenseWhere(storeId,{id,openedAt:start},end),select:{amount:true}})
    ])
    const confirmedDrawer=eligible.reduce((s,e)=>s+e.amount,0)/100,unknown=legacy.filter(e=>(!e.paymentSource||e.paymentSource==='unknown')&&!['purchase','purchase_refund'].includes(e.referenceType||'')),unknownCount=r.expenseCashBasis===EXPLICIT_CASH_BASIS?0:unknown.length
    const verifiedOutside=legacy.filter(e=>['purchase','purchase_refund'].includes(e.referenceType||'')||(e.paymentSource&&e.paymentSource!=='unknown'&&e.paymentSource!=='drawer_cash')).reduce((s,e)=>s+e.amount,0)/100
    const legacyTotal=money(legacy.reduce((s,e)=>s+e.amount,0)/100)
    const correctedExpenses=unknownCount?(legacyTotal===r.expenses?money(r.expenses-verifiedOutside):r.expenses):confirmedDrawer,delta=money(r.expenses-correctedExpenses)
    if(r.expenseCashBasis===EXPLICIT_CASH_BASIS&&delta===0)continue
    const review={originalExpenses:r.expenses,correctedExpenses,excludedAmount:delta,unknownCount,originalExpectedCash:r.expectedCash}
    entry.cashReconciliation={...r,expenseCashBasis:unknownCount?'legacy_unverified':EXPLICIT_CASH_BASIS,expenses:correctedExpenses,cashFromRevenue:money(r.cashFromRevenue+delta),expectedCash:money(r.expectedCash+delta),expenseReview:review}
    if(!entry.cashWarning&&delta!==0){const session=await db.shiftSession.findFirst({where:{id,storeId},select:{actualCash:true}});if(session?.actualCash!==null&&session?.actualCash!==undefined)entry.cashWarning=cashWarningFor(id,session.actualCash,entry.cashReconciliation,end)}
    if(entry.cashWarning&&delta!==0){const w=entry.cashWarning,difference=money(w.actualCash-entry.cashReconciliation.expectedCash)
      // The original reviewed status/note remains evidence; changed differences need review.
      entry.cashWarning={...w,expectedCash:entry.cashReconciliation.expectedCash,difference,status:difference===0?'resolved':w.status==='reviewed'&&w.expectedCash===entry.cashReconciliation.expectedCash?'reviewed':'pending'}
    }
  }
  const pendingIds=[...results].filter(([,entry])=>entry.cashWarning?.status==='pending' && !entry.cashReconciliation?.expenseReview?.unknownCount && entry.cashWarning.difference<0).map(([id])=>id)
  if(pendingIds.length){
    const sessions=await db.shiftSession.findMany({where:{storeId,id:{in:pendingIds},status:'closed'},select:{id:true,openedAt:true,closedAt:true}})
    const closed=sessions.filter(s=>s.closedAt!==null)
    if(closed.length){
      const overlapping=await db.shiftSession.findMany({where:{storeId,openedAt:{lt:new Date(Math.max(...closed.map(s=>s.closedAt!.getTime())))},OR:[{closedAt:null},{closedAt:{gt:new Date(Math.min(...closed.map(s=>s.openedAt.getTime())))}}]},select:{id:true,openedAt:true,closedAt:true}})
      const refunds=await db.refundRequest.findMany({where:{status:{in:['approved','paid']},amount:{gt:0},order:{storeId,paymentMethod:'cash'},OR:closed.map(s=>({
        createdAt:{gte:s.openedAt,lt:s.closedAt!},approvedAt:{gt:new Date(results.get(s.id)!.cashWarning!.createdAt)},
        order:{storeId,paymentMethod:'cash',createdAt:{gte:s.openedAt,lt:s.closedAt!}}
      }))},select:{id:true,amount:true,createdAt:true,approvedAt:true,order:{select:{createdAt:true}}}})
      for(const session of closed){
        // Overlapping windows cannot establish a unique handover attribution.
        if(overlapping.some(other=>other.id!==session.id && other.openedAt<session.closedAt! && (!other.closedAt || other.closedAt>session.openedAt)))continue
        const entry=results.get(session.id)!,warning=entry.cashWarning!
        const evidence=refunds.filter(r=>r.createdAt>=session.openedAt && r.createdAt<session.closedAt! && r.order.createdAt>=session.openedAt && r.order.createdAt<session.closedAt! && r.approvedAt && r.approvedAt>new Date(warning.createdAt))
        entry.cashWarning=reconcileCashWarningRefunds(warning,evidence)
      }
    }
  }
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
    const derived=(await loadShiftCashReviews(tx,actor.storeId,[sessionId])).get(sessionId)?.cashWarning
    if(!row&&!derived)throw new CashReviewError(404,'CASH_WARNING_NOT_FOUND')
    const previous=(derived||(row?JSON.parse(row.value):null)) as CashWarning
    if(previous.status==='reviewed')return previous
    if(previous.status!=='pending')throw new CashReviewError(409,'CASH_WARNING_STATE_INVALID')
    const staff=await tx.staff.findFirst({where:{userId:actor.id,storeId:actor.storeId},select:{name:true}})
    const reviewed={...previous,status:'reviewed' as const,reviewedAt:new Date().toISOString(),reviewedBy:actor.id,reviewedByName:staff?.name||'Admin',reviewNote:input.note}
    await tx.config.upsert({where,create:{storeId:actor.storeId,key:CASH_WARNING_PREFIX+sessionId,category:'shift_report',value:JSON.stringify(reviewed)},update:{value:JSON.stringify(reviewed)}})
    await tx.financeAuditLog.create({data:{storeId:actor.storeId,userId:actor.id,action:'review',entityType:'shift_cash_warning',entityId:sessionId,description:'Administrator reviewed shift cash discrepancy',oldValue:row?.value||null,newValue:JSON.stringify(reviewed)}})
    return reviewed
  })
}
