import prisma from '../config/database'
import { socketManager } from '../socket'
import { projectCartState } from '../utils/posCartState'

export type POSAction =
  | 'login'
  | 'logout'
  | 'cart_add'
  | 'cart_update'
  | 'cart_clear'
  | 'checkout_start'
  | 'checkout_complete'
  | 'checkout_failed'
  | 'received_receipt'
  | 'order_created'
  | 'suspend'
  | 'resume'
  | 'member_add'
  | 'member_remove'
  | 'shift_open'
  | 'shift_close'

export type Severity = 'info' | 'warning' | 'critical'

export async function logPOSAction(data: {
  storeId: string
  staffId: string
  staffName: string
  sessionId: string
  action: POSAction
  entityId?: string
  description: string
  metadata?: Record<string, any>
  severity?: Severity
}) {
  const log = await prisma.pOSActionLog.create({
    data: {
      storeId: data.storeId,
      staffId: data.staffId,
      staffName: data.staffName,
      sessionId: data.sessionId,
      action: data.action,
      entityId: data.entityId || null,
      description: data.description,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      severity: data.severity || 'info',
    },
  })

  // Broadcast to admin dashboard in real-time if warning/critical
  if (data.severity === 'warning' || data.severity === 'critical') {
    socketManager.emitToStore(data.storeId, 'pos:alert', {
      type: 'pos:alert',
      data: {
        id: log.id,
        action: log.action,
        description: log.description,
        severity: log.severity,
        staffName: log.staffName,
        sessionId: log.sessionId,
        createdAt: log.createdAt,
        metadata: data.metadata,
      },
      timestamp: new Date().toISOString(),
    })
  }

  return log
}

export async function getPOSActionLogs(storeId: string, options?: {
  staffId?: string
  severity?: string
  startDate?: string
  endDate?: string
  sessionId?: string
  action?: string
  page?: number
  limit?: number
}) {
  const where: any = { storeId }

  if (options?.staffId) where.staffId = options.staffId
  if (options?.severity) where.severity = options.severity
  if (options?.sessionId) where.sessionId = options.sessionId
  if (options?.action) where.action = options.action

  if (options?.startDate || options?.endDate) {
    where.createdAt = {}
    if (options.startDate) where.createdAt.gte = new Date(options.startDate)
    if (options.endDate) where.createdAt.lte = new Date(options.endDate)
  }

  const page = options?.page || 1
  const limit = options?.limit || 50
  const skip = (page - 1) * limit

  const [logs, total] = await Promise.all([
    prisma.pOSActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.pOSActionLog.count({ where }),
  ])

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getActiveSessions(storeId: string) {
  const sessions = await prisma.pOSActionLog.groupBy({
    by: ['sessionId', 'staffId', 'staffName'],
    where: { storeId, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
    _count: { id: true },
  })
  const activeSessions = []
  const seen = new Set<string>()
  for (const session of sessions) {
    const identity = JSON.stringify([session.staffId, session.sessionId])
    if (seen.has(identity)) continue
    seen.add(identity)
    const actions = await prisma.pOSActionLog.findMany({
      where: { storeId, staffId: session.staffId, sessionId: session.sessionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { action: true, entityId: true, metadata: true, createdAt: true, staffName: true },
    })
    const state = projectCartState(actions)
    let lastCheckoutFailure: { code: string; httpStatus: number | null; outcome: string; at: Date } | null = null
    for (const action of actions) {
      let meta: any = {}
      try { meta = JSON.parse(action.metadata || '{}') } catch { /* Missing legacy details stay unknown. */ }
      if (['checkout_complete', 'cart_clear', 'suspend'].includes(action.action) || (meta.cartSnapshot?.version === 1 && Array.isArray(meta.cartSnapshot.items) && meta.cartSnapshot.items.length === 0)) lastCheckoutFailure = null
      if (action.action === 'checkout_failed') lastCheckoutFailure = {
        code: typeof meta.failureCode === 'string' ? meta.failureCode.slice(0, 160) : '',
        httpStatus: Number.isInteger(meta.httpStatus) ? meta.httpStatus : null,
        outcome: ['review', 'rejected'].includes(meta.outcome) ? meta.outcome : '', at: action.createdAt,
      }
    }
    if (state.itemCount > 0) activeSessions.push({
      sessionId: session.sessionId, staffId: session.staffId, staffName: actions.at(-1)?.staffName || session.staffName,
      lastAction: actions.at(-1)?.action || 'unknown', lastActionAt: actions.at(-1)?.createdAt,
      hasCheckoutComplete: false, ...state, lastCheckoutFailure,
    })
  }
  return activeSessions
}

export async function getAlertStats(storeId: string, startDate?: string, endDate?: string) {
  const where: any = { storeId, severity: { in: ['warning', 'critical'] } }
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = new Date(startDate)
    if (endDate) where.createdAt.lte = new Date(endDate)
  }

  const [warningCount, criticalCount, todayTotal] = await Promise.all([
    prisma.pOSActionLog.count({ where: { ...where, severity: 'warning' } }),
    prisma.pOSActionLog.count({ where: { ...where, severity: 'critical' } }),
    prisma.pOSActionLog.count({
      where: {
        storeId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ])

  return { warningCount, criticalCount, todayTotal }
}
