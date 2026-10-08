import { PrismaClient } from '@prisma/client'
import { parseBusinessDate } from '../utils/businessDate'
import { formatDate } from '../utils/dateUtils'
import { withPurchaseQuantities } from './ExpenseService'

export class ShiftReviewInputError extends Error {}
export function shiftReviewRange(start: unknown, end: unknown, now = new Date()) {
  try {
    const startDate = parseBusinessDate(start || formatDate(now))
    const lastDate = parseBusinessDate(end || start || formatDate(now))
    if (typeof start === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw Error()
    if (typeof end === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw Error()
    const endDate = new Date(lastDate.getTime() + 86400000)
    if (endDate <= startDate || endDate.getTime() - startDate.getTime() > 31 * 86400000) throw Error()
    return { startDate, endDate }
  } catch { throw new ShiftReviewInputError('INVALID_SHIFT_DATE_RANGE') }
}

type ReviewDB = Pick<PrismaClient, 'shiftSession' | 'shift' | 'order' | 'expense' | 'pOSActionLog' | 'staff' | 'user' | 'financeAuditLog' | 'config'>
export async function loadShiftReview(db: ReviewDB, storeId: string, start: unknown, end: unknown, now = new Date()) {
  const range = shiftReviewRange(start, end, now)
  const sessions = await db.shiftSession.findMany({ where: { storeId, openedAt: { lt: range.endDate, lte: now }, OR: [{ closedAt: null }, { closedAt: { gt: range.startDate } }] }, orderBy: { openedAt: 'asc' } })
  if (sessions.length > 500) throw new ShiftReviewInputError('SHIFT_RANGE_TOO_LARGE')
  const ends = sessions.map(s => s.closedAt && s.closedAt < now ? s.closedAt : now)
  const from = new Date(Math.min(range.startDate.getTime(), ...sessions.map(s => s.openedAt.getTime())))
  const until = new Date(Math.min(now.getTime(), Math.max(range.endDate.getTime(), ...ends.map(d => d.getTime()))))
  const window = { storeId, createdAt: { gte: from, lt: until } }
  const [orders, expenses, warnings, staff, users, definitions, categoryConfig] = await Promise.all([
    db.order.findMany({ where: window, select: { id: true, orderNumber: true, pickupNumber: true, staffId: true, status: true, finalAmount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    db.expense.findMany({ where: { ...window, referenceType: 'pos_reimbursement' }, orderBy: { createdAt: 'desc' } }),
    db.pOSActionLog.findMany({ where: { ...window, severity: { in: ['warning', 'critical'] } }, select: { id: true, staffId: true, staffName: true, action: true, severity: true, description: true, entityId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    db.staff.findMany({ where: { storeId }, select: { id: true, userId: true, name: true, employeeNumber: true, position: true } }),
    db.user.findMany({ where: { storeId }, select: { id: true, role: true } }),
    db.shift.findMany({ where: { storeId }, select: { key: true, name: true, nameZh: true, nameId: true } }),
    db.config.findUnique({ where: { storeId_key: { storeId, key: 'expense.categories' } }, select: { value: true } })
  ])
  let categories: { key: string; label?: string; labelZh?: string; labelEn?: string; labelId?: string; isDefault?: boolean }[] = []
  try { const parsed = JSON.parse(categoryConfig?.value || '[]'); if (Array.isArray(parsed)) categories = parsed.filter(c => c && typeof c.key === 'string') } catch {}
  const quantities = await withPurchaseQuantities(expenses, db)
  const names = new Map<string, { id: string; name: string; employeeNumber: string | null; position: string | null }>()
  for (const s of staff) { const person = { id: s.id, name: s.name, employeeNumber: s.employeeNumber, position: s.position }; names.set(s.id, person); names.set(s.userId, person) }
  for (const u of users) if (!names.has(u.id)) names.set(u.id, { id: u.id, name: u.role === 'admin' ? 'Admin' : u.role, employeeNumber: null, position: u.role })
  const person = (id: string) => names.get(id) || { id, name: id, employeeNumber: null, position: null }
  const buckets = sessions.map((s, i) => ({ id: s.id, session: { ...s, opener: person(s.staffId), nextStaff: s.nextStaffId ? person(s.nextStaffId) : null, definition: definitions.find(d => d.key === s.shift) || null }, windowStart: s.openedAt, windowEnd: ends[i], orders: [] as typeof orders, expenses: [] as typeof quantities, warnings: [] as typeof warnings }))
  const outside = { id: 'unassigned', session: null, windowStart: range.startDate, windowEnd: new Date(Math.min(range.endDate.getTime(), now.getTime())), orders: [] as typeof orders, expenses: [] as typeof quantities, warnings: [] as typeof warnings }
  const assign = (date: Date) => {
    const matches = buckets.filter(b => date >= b.windowStart && date < b.windowEnd)
    if (matches.length === 1) return matches[0]
    return date >= range.startDate && date < range.endDate ? outside : null
  }
  for (const o of orders) assign(o.createdAt)?.orders.push(o)
  for (const e of quantities) assign(e.createdAt)?.expenses.push(e)
  for (const w of warnings) assign(w.createdAt)?.warnings.push(w)
  const serialize = (b: typeof buckets[number] | typeof outside) => {
    const participants = new Map<string, ReturnType<typeof person> & { orders: number; expenses: number; warnings: number; roles: string[] }>()
    const add = (id: string, role: string, metric?: 'orders' | 'expenses' | 'warnings') => {
      const p = person(id), row = participants.get(p.id) || { ...p, orders: 0, expenses: 0, warnings: 0, roles: [] }
      if (!row.roles.includes(role)) row.roles.push(role)
      if (metric) row[metric]++
      participants.set(p.id, row)
    }
    if (b.session) { add(b.session.staffId, 'opener'); if (b.session.nextStaffId) add(b.session.nextStaffId, 'handover') }
    for (const o of b.orders) add(o.staffId, 'cashier', 'orders')
    for (const e of b.expenses) if (e.referenceId) add(e.referenceId.split(':')[0], 'purchaser', 'expenses')
    for (const w of b.warnings) add(w.staffId, 'operator', 'warnings')
    const completed = b.orders.filter(o => o.status === 'completed')
    const overlap = b.session ? buckets.some(other => other.id !== b.id && other.windowStart < b.windowEnd && other.windowEnd > b.windowStart) : false
    return { ...b, attribution: 'recorded_time_window', overlapping: overlap,
      summary: { revenue: completed.reduce((sum, o) => sum + o.finalAmount, 0) / 100, completedOrders: completed.length, orders: b.orders.length, refundedOrders: b.orders.filter(o => o.status === 'refunded').length, refundedAmount: b.orders.filter(o => o.status === 'refunded').reduce((sum, o) => sum + o.finalAmount, 0) / 100, expenses: b.expenses.length, expenseAmount: b.expenses.reduce((sum, e) => sum + e.amount, 0) / 100, warnings: b.warnings.length, employees: participants.size },
      orders: b.orders.map(o => ({ ...o, amount: o.finalAmount / 100, staffName: person(o.staffId).name })),
      expenses: b.expenses.map(e => ({ id: e.id, category: e.category, amount: e.amount / 100, quantity: e.quantity ?? null, description: e.description, createdAt: e.createdAt, staffName: e.referenceId ? person(e.referenceId.split(':')[0]).name : null })),
      employees: [...participants.values()] }
  }
  return { range: { start: range.startDate, end: range.endDate, timezone: 'Asia/Jakarta' }, asOf: now, categories, sessions: buckets.map(serialize), unassigned: serialize(outside) }
}
