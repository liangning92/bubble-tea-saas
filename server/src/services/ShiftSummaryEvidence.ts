import {calculateShiftCash} from './ShiftCashReconciliation'
import { orderDiscountTotal } from '../utils/orderDiscount'
import { PrismaClient } from '@prisma/client'

type EvidenceDB = Pick<PrismaClient, 'shiftSession' | 'cashEvent' | 'order'>&Partial<Pick<PrismaClient,'refundRequest'|'expense'>>

// Read-only window evidence. Insertion time/key never certify session ownership.
export async function loadShiftSummaryEvidence(db: EvidenceDB, storeId: string, asOf = new Date(), capturedShift?: {id:string;storeId:string;shift:string;openedAt:Date;openFloat:number}) {
  const sessions = capturedShift ? [capturedShift] : await db.shiftSession.findMany({
    where: { storeId, status: 'open' }, orderBy: { openedAt: 'desc' }
  })
  const shift = sessions.length === 1 ? sessions[0] : null
  const empty = {
    verified: false, status: 'unverifiable', windowStart: null as string | null,
    windowEnd: asOf.toISOString(), reasonCodes: [] as string[],
    cashSales: null as number | null, cashIns: null as number | null,
    cashOuts: null as number | null, qrisReceipts: null as number | null,
    orderCount: null as number | null, cupCount: null as number | null, orderReceipts: null as number | null,
    activityDiscountAmount: null as number | null, couponDiscountAmount: null as number | null,
    pointsDiscountAmount: null as number | null, manualDiscountAmount: null as number | null,
    totalDiscountAmount: null as number | null, activityOrderCount: null as number | null,
    activityOrders: [] as { orderNumber: string; pickupNumber: string | null; activityName: string | null; activitySource: string | null; activityDiscountAmount: number; totalDiscountAmount: number }[]
  }
  if (!shift || shift.openedAt >= asOf) {
    empty.reasonCodes = [sessions.length > 1 ? 'OVERLAPPING_SESSIONS' : shift ? 'INVALID_WINDOW' : 'NO_OPEN_SESSION']
    return { hasOpenShift: sessions.length > 0, shift, openFloat: shift?.openFloat ?? null,
      expectedCash: null, currentBalance: null, qrisSales: null,
      todayCashSales: null, todayCashIns: null, todayCashOuts: null,
      todayOrderCount: null, todayOrderAmount: null, summaryEvidence: empty }
  }
  const where = { storeId, createdAt: { gte: shift.openedAt, lt: asOf } }
  const [events, orders] = await Promise.all([
    db.cashEvent.findMany({ where, select: { type: true, amount: true, shift: true } }),
    db.order.findMany({ where, select: { orderNumber: true, pickupNumber: true, createdAt: true, finalAmount: true, status: true, paymentMethod: true, discountAmount: true, activityDiscountAmount: true, couponDiscountAmount: true, pointsDiscountAmount: true, manualDiscountAmount: true, activityName: true, activitySource: true, items: {select:{quantity:true}} } })
  ])
  const reasons = ['SESSION_ATTRIBUTION_NOT_PERSISTED', 'OFFLINE_ORIGIN_NOT_PERSISTED']
  const cashSubtotal = (type: string) => {
    const rows = events.filter(e => e.type === type)
    if (rows.some(e => e.shift !== shift.shift)) {
      reasons.push(`UNBOUND_${type.toUpperCase()}`)
      return null
    }
    return rows.reduce((sum, e) => sum + e.amount, 0)
  }
  const cashSales = cashSubtotal('cash_sale'), cashIns = cashSubtotal('cash_in'), cashOuts = cashSubtotal('cash_out')
  const qris = orders.filter(o => o.paymentMethod === 'qris')
  const hasRefund = qris.some(o => o.status === 'refunded')
  if (hasRefund) reasons.push('QRIS_REFUND_EXECUTION_UNKNOWN')
  const completed = orders.filter(o => o.status === 'completed')
  // Discount provenance for the shift window: what the store gave away and which orders caused it.
  const discounted = completed.filter(o => orderDiscountTotal(o) > 0)
  const activityOrders = discounted
    .filter(o => (o.activityDiscountAmount || 0) > 0 || !!o.activityName)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 20)
    .map(o => ({
      orderNumber: o.orderNumber,
      pickupNumber: o.pickupNumber,
      activityName: o.activityName || null,
      activitySource: o.activitySource || null,
      activityDiscountAmount: o.activityDiscountAmount || 0,
      totalDiscountAmount: orderDiscountTotal(o)
    }))
  const summaryEvidence = {
    ...empty, windowStart: shift.openedAt.toISOString(),
    status: cashSales === null || cashIns === null || cashOuts === null || hasRefund ? 'unverifiable' : 'provisional',
    reasonCodes: reasons, cashSales, cashIns, cashOuts,
    qrisReceipts: hasRefund ? null : qris.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.finalAmount, 0),
    orderCount: completed.length,
    cupCount: completed.every(o => Array.isArray(o.items) && o.items.every(i => Number.isSafeInteger(i.quantity) && i.quantity > 0)) ? completed.reduce((sum,o) => sum + o.items.reduce((cups,i)=>cups+i.quantity,0),0) : null,
    orderReceipts: orders.some(o => o.status === 'refunded') ? null : completed.reduce((sum, o) => sum + o.finalAmount, 0),
    activityDiscountAmount: completed.reduce((sum, o) => sum + (o.activityDiscountAmount || 0), 0),
    couponDiscountAmount: completed.reduce((sum, o) => sum + (o.couponDiscountAmount || 0), 0),
    pointsDiscountAmount: completed.reduce((sum, o) => sum + (o.pointsDiscountAmount || 0), 0),
    manualDiscountAmount: completed.reduce((sum, o) => sum + (o.manualDiscountAmount || 0), 0),
    totalDiscountAmount: completed.reduce((sum, o) => sum + orderDiscountTotal(o), 0),
    activityOrderCount: discounted.filter(o => (o.activityDiscountAmount || 0) > 0).length,
    activityOrders
  }
  if(db.refundRequest&&db.expense){
    const reconciled=await calculateShiftCash(db as any,storeId,shift,asOf)
    Object.assign(summaryEvidence,{cashSales:reconciled.cashFromRevenue+reconciled.expenses,cashIns:reconciled.cashIns,cashOuts:reconciled.cashOuts,qrisReceipts:reconciled.qris,orderReceipts:reconciled.revenue})
  }
  return { hasOpenShift: true, shift, openFloat: shift.openFloat,
    expectedCash: null, currentBalance: null, qrisSales: null,
    todayCashSales: cashSales, todayCashIns: cashIns, todayCashOuts: cashOuts,
    todayOrderCount: summaryEvidence.orderCount, todayOrderAmount: summaryEvidence.orderReceipts,
    summaryEvidence }
}
