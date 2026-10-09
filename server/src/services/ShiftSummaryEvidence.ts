import { PrismaClient } from '@prisma/client'

type EvidenceDB = Pick<PrismaClient, 'shiftSession' | 'cashEvent' | 'order'>

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
    orderCount: null as number | null, cupCount: null as number | null, orderReceipts: null as number | null
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
    db.order.findMany({ where, select: { finalAmount: true, status: true, paymentMethod: true, items: {select:{quantity:true}} } })
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
  const summaryEvidence = {
    ...empty, windowStart: shift.openedAt.toISOString(),
    status: cashSales === null || cashIns === null || cashOuts === null || hasRefund ? 'unverifiable' : 'provisional',
    reasonCodes: reasons, cashSales, cashIns, cashOuts,
    qrisReceipts: hasRefund ? null : qris.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.finalAmount, 0),
    orderCount: completed.length,
    cupCount: completed.every(o => Array.isArray(o.items) && o.items.every(i => Number.isSafeInteger(i.quantity) && i.quantity > 0)) ? completed.reduce((sum,o) => sum + o.items.reduce((cups,i)=>cups+i.quantity,0),0) : null,
    orderReceipts: orders.some(o => o.status === 'refunded') ? null : completed.reduce((sum, o) => sum + o.finalAmount, 0)
  }
  return { hasOpenShift: true, shift, openFloat: shift.openFloat,
    expectedCash: null, currentBalance: null, qrisSales: null,
    todayCashSales: cashSales, todayCashIns: cashIns, todayCashOuts: cashOuts,
    todayOrderCount: summaryEvidence.orderCount, todayOrderAmount: summaryEvidence.orderReceipts,
    summaryEvidence }
}
