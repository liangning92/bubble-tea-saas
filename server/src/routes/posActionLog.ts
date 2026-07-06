import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middlewares/auth'
import { logPOSAction, getPOSActionLogs, getActiveSessions, getAlertStats, POSAction, Severity } from '../services/POSActionLogService'
import prisma from '../config/database'

const router = Router()

const logActionSchema = z.object({
  action: z.string(),
  sessionId: z.string(),
  entityId: z.string().optional(),
  description: z.string(),
  metadata: z.record(z.any()).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
})

// POST /api/pos-action-logs - Log a POS action
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { action, sessionId, entityId, description, metadata, severity } = req.body

    if (!action || !sessionId || !description) {
      res.status(400).json({ code: 400, message: 'Missing required fields' })
      return
    }

    const storeId = req.user!.storeId
    const staffId = req.user!.staffId || ''

    // Get staff name from database
    let staffName = 'Unknown'
    if (staffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { name: true },
      })
      staffName = staff?.name || 'Unknown'
    }

    const log = await logPOSAction({
      storeId,
      staffId,
      staffName,
      sessionId,
      action: action as POSAction,
      entityId,
      description,
      metadata,
      severity: severity as Severity || 'info',
    })

    res.status(201).json({ code: 201, data: log })
  } catch (error) {
    console.error('POS action log error:', error)
    res.status(500).json({ code: 500, message: 'Failed to log POS action' })
  }
})

// GET /api/pos-action-logs - Get logs with filters
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { staffId, severity, startDate, endDate, sessionId, action, page, limit } = req.query

    const result = await getPOSActionLogs(storeId, {
      staffId: staffId as string,
      severity: severity as string,
      startDate: startDate as string,
      endDate: endDate as string,
      sessionId: sessionId as string,
      action: action as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    })

    res.json({ code: 200, data: result })
  } catch (error) {
    console.error('Get POS action logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get logs' })
  }
})

// GET /api/pos-action-logs/stats - Get alert stats for dashboard
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const stats = await getAlertStats(
      storeId,
      startDate as string,
      endDate as string
    )

    res.json({ code: 200, data: stats })
  } catch (error) {
    console.error('Get alert stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stats' })
  }
})

// GET /api/pos-action-logs/sessions - Get active sessions (unfinished carts)
router.get('/sessions', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const sessions = await getActiveSessions(storeId)

    res.json({ code: 200, data: sessions })
  } catch (error) {
    console.error('Get active sessions error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get sessions' })
  }
})

export { router as posActionLogRouter }
