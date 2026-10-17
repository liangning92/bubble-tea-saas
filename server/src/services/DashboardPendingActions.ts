import { loadStoreDateSettings } from '../utils/storeDateSettings'
import { businessCalendarDate } from '../utils/revenueDateRange'
import { PrismaClient } from '@prisma/client'
import { CASH_WARNING_PREFIX, loadShiftCashReviews } from './ShiftCashReconciliation'

// Pending work is store-wide and independent of dashboard sales date filters.
export async function loadDashboardPendingActions(db: PrismaClient, storeId: string, now = new Date()) {
  const pending = { storeId, status: 'pending' }
  const [refunds, leave, correction, swap, overtime, reimbursement, rewards, purchases, counts, hygiene, permissions, cashWarnings] = await Promise.all([
    db.refundRequest.count({ where: { status: 'pending', order: { storeId } } }),
    db.leave.count({ where: pending }),
    db.attendanceCorrection.count({ where: pending }),
    db.shiftSwap.count({ where: pending }),
    db.overtimeRequest.count({ where: pending }),
    db.reimbursement.count({ where: pending }),
    db.staffPointRedemption.count({ where: pending }),
    db.purchaseOrder.count({ where: pending }),
    db.inventoryCount.count({ where: { storeId, status: 'pending_review' } }),
    db.hygieneTask.count({ where: { storeId, status: 'pending_approval' } }),
    db.staffActionApproval.count({ where: { ...pending, expiresAt: { gt: now } } }),
    db.config.findMany({ where: { storeId, key: { startsWith: CASH_WARNING_PREFIX } }, select: { key: true, value: true } })
  ])
  const actions = [
    { key: 'refunds', count: refunds, to: '/finance/orders?tab=refunds' },
    { key: 'leave', count: leave, to: '/staff/attendance/leave' },
    { key: 'correction', count: correction, to: '/staff/attendance/correction' },
    { key: 'swap', count: swap, to: '/staff/attendance/shift-swap' },
    { key: 'overtime', count: overtime, to: '/staff/attendance/overtime' },
    { key: 'reimbursement', count: reimbursement, to: '/staff/salary/reimbursement' },
    { key: 'rewards', count: rewards, to: '/staff/points/rewards?tab=redemptions' },
    { key: 'purchases', count: purchases, to: '/inventory/purchase-orders' },
    { key: 'counts', count: counts, to: '/inventory/count' },
    { key: 'hygiene', count: hygiene, to: '/hygiene/today' },
    { key: 'permissions', count: permissions, to: '/approvals' }
  ]
  const pendingShiftIds: string[] = []
  for (const row of cashWarnings) {
    try {
      if (JSON.parse(row.value).status === 'pending') pendingShiftIds.push(row.key.slice(CASH_WARNING_PREFIX.length))
    } catch { throw new Error('DASHBOARD_PENDING_CASH_WARNING_INVALID') }
  }
  if (pendingShiftIds.length) {
    const [sessions, settings, reviews] = await Promise.all([
      db.shiftSession.findMany({ where: { storeId, id: { in: pendingShiftIds } }, select: { id: true, openedAt: true, closedAt: true } }),
      loadStoreDateSettings(db, storeId),
      loadShiftCashReviews(db, storeId, pendingShiftIds)
    ])
    for (const session of sessions) {
      if(reviews.get(session.id)?.cashWarning?.status!=='pending')continue
      const range = new URLSearchParams({ startDate: businessCalendarDate(session.openedAt, settings.timezone), endDate: businessCalendarDate(session.closedAt || now, settings.timezone) })
      actions.push({ key: 'cash', count: 1, to: `/finance/revenue/shifts/${encodeURIComponent(session.id)}?${range}` })
    }
  }
  return { actions, total: actions.reduce((sum, action) => sum + action.count, 0), timestamp: now.toISOString() }
}
