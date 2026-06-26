import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import {
  getStaffPointBalance,
  getStaffPointBalancesByStore,
  getStaffPointHistory,
  awardPoints,
  redeemPoints,
  adjustPoints,
  processExpiredPoints,
  getRewards,
  createReward,
  updateReward,
  deleteReward,
  createRedemption,
  getPendingRedemptions,
  fulfillRedemption,
  cancelRedemption
} from '../services/StaffPointService'

const router = Router()

// GET /api/staff-points/balance/:staffId
router.get('/balance/:staffId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const result = await getStaffPointBalance(staffId)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get balance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get balance' })
  }
})

// GET /api/staff-points/store/:storeId - Get all staff points for a store (batch)
router.get('/store/:storeId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.params
    const result = await getStaffPointBalancesByStore(storeId)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get store points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get store points' })
  }
})

// GET /api/staff-points/history/:staffId
router.get('/history/:staffId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId } = req.params
    const limit = parseInt(req.query.limit as string) || 50
    const result = await getStaffPointHistory(staffId, limit)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get history error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get history' })
  }
})

// POST /api/staff-points/earn
router.post('/earn', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId, points, reason, referenceId, note, expiresAt } = req.body

    if (!staffId || !points || !reason) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const result = await awardPoints({
      staffId,
      storeId: req.user!.storeId,
      points,
      reason,
      referenceId,
      note,
      createdBy: req.user!.id,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    })

    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Award points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to award points' })
  }
})

// POST /api/staff-points/redeem
router.post('/redeem', authenticate, async (req: AuthRequest, res) => {
  try {
    const { staffId, points, reason, rewardId, note } = req.body

    if (!staffId || !points || !reason) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const result = await redeemPoints({
      staffId,
      storeId: req.user!.storeId,
      points,
      reason,
      referenceId: rewardId,
      note
    })

    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Redeem points error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to redeem points' })
  }
})

// POST /api/staff-points/adjust
router.post('/adjust', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { staffId, points, reason, note } = req.body

    if (!staffId || points === undefined || !reason) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const result = await adjustPoints({
      staffId,
      storeId: req.user!.storeId,
      points,
      reason,
      note,
      createdBy: req.user!.id
    })

    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Adjust points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to adjust points' })
  }
})

// POST /api/staff-points/process-expiry
router.post('/process-expiry', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await processExpiredPoints(req.user!.storeId)
    res.json({ code: 200, data: { processed: result.length }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Process expiry error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process expiry' })
  }
})

// GET /api/staff-points/rewards
router.get('/rewards', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await getRewards(req.user!.storeId)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get rewards error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get rewards' })
  }
})

// POST /api/staff-points/rewards
router.post('/rewards', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { name, type, pointsCost, value, stock } = req.body

    if (!name || !type || !pointsCost) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const result = await createReward({
      storeId: req.user!.storeId,
      name,
      type,
      pointsCost,
      value,
      stock
    })

    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create reward error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create reward' })
  }
})

// PUT /api/staff-points/rewards/:id
router.put('/rewards/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const result = await updateReward(id, req.body)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update reward error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update reward' })
  }
})

// DELETE /api/staff-points/rewards/:id
router.delete('/rewards/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await deleteReward(id)
    res.json({ code: 200, message: 'Reward deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete reward error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete reward' })
  }
})

// POST /api/staff-points/redemption
router.post('/redemption', authenticate, async (req: AuthRequest, res) => {
  try {
    const { rewardId, pointsCost } = req.body
    const staffId = req.user!.staffId

    if (!staffId) {
      return res.status(400).json({ code: 400, message: 'Staff profile not found' })
    }

    if (!rewardId || !pointsCost) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const result = await createRedemption({
      staffId,
      storeId: req.user!.storeId,
      rewardId,
      pointsCost
    })

    res.status(201).json({ code: 201, data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Create redemption error:', error)
    res.status(400).json({ code: 400, message: error.message || 'Failed to create redemption' })
  }
})

// GET /api/staff-points/redemption/pending
router.get('/redemption/pending', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const result = await getPendingRedemptions(req.user!.storeId)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get pending redemptions error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get redemptions' })
  }
})

// POST /api/staff-points/redemption/:id/fulfill
router.post('/redemption/:id/fulfill', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const result = await fulfillRedemption(id, req.user!.id)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Fulfill redemption error:', error)
    res.status(500).json({ code: 500, message: 'Failed to fulfill redemption' })
  }
})

// POST /api/staff-points/redemption/:id/cancel
router.post('/redemption/:id/cancel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const result = await cancelRedemption(id)
    res.json({ code: 200, data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Cancel redemption error:', error)
    res.status(500).json({ code: 500, message: 'Failed to cancel redemption' })
  }
})

// GET /api/staff-points/my - Get current staff's points (Staff APP)
router.get('/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const pointData = await getStaffPointBalance(staff.id)
    res.json({
      code: 200,
      data: {
        currentPoints: pointData.balance,
        lifetimePoints: pointData.totalEarned,
        staffId: staff.id,
        staffName: staff.name
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get my points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get points' })
  }
})

// GET /api/staff-points/logs/my - Get current staff's point history (Staff APP)
router.get('/logs/my', authenticate, async (req: AuthRequest, res) => {
  try {
    const { type, startDate, endDate } = req.query

    const staff = await prisma.staff.findFirst({
      where: { userId: req.user!.id }
    })

    if (!staff) {
      return res.status(404).json({ code: 404, message: 'Staff profile not found' })
    }

    const where: any = { staffId: staff.id }
    if (type) where.type = type as string
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    const logs = await prisma.staffPointLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // Transform to match frontend expected format
    const formattedLogs = logs.map(log => ({
      id: log.id,
      type: log.type,
      points: log.points,
      description: log.reason,
      createdAt: log.createdAt,
      note: log.note
    }))

    res.json({
      code: 200,
      data: { list: formattedLogs },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get my point logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get point history' })
  }
})

// GET /api/staff-points/rewards/available - Get available rewards for current store (Staff APP)
router.get('/rewards/available', authenticate, async (req: AuthRequest, res) => {
  try {
    const rewards = await getRewards(req.user!.storeId)
    res.json({
      code: 200,
      data: rewards.filter((r: any) => r.isActive),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get available rewards error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get rewards' })
  }
})

// ==================== Points Rule Config ====================

import { z } from 'zod'

const pointsRuleSchema = z.object({
  perfectAttendancePoints: z.number().optional(),
  goodPerformancePoints: z.number().optional(),
  completedTrainingPoints: z.number().optional(),
  holidayWorkPoints: z.number().optional(),
  overtimePerHourPoints: z.number().optional(),
  isActive: z.boolean().optional()
})

// GET /api/staff-points/rules - Get store points rule
router.get('/rules', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    let rule = await prisma.staffPointRule.findUnique({ where: { storeId } })

    // Create default if not exists
    if (!rule) {
      rule = await prisma.staffPointRule.create({
        data: {
          storeId,
          perfectAttendancePoints: 50,
          goodPerformancePoints: 100,
          completedTrainingPoints: 30,
          holidayWorkPoints: 20,
          overtimePerHourPoints: 5,
          isActive: true
        }
      })
    }

    res.json({ code: 200, data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get points rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get points rule' })
  }
})

// PUT /api/staff-points/rules - Update store points rule
router.put('/rules', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const data = pointsRuleSchema.parse(req.body)

    let rule = await prisma.staffPointRule.findUnique({ where: { storeId } })

    if (rule) {
      rule = await prisma.staffPointRule.update({
        where: { storeId },
        data
      })
    } else {
      rule = await prisma.staffPointRule.create({
        data: { storeId, ...data }
      })
    }

    res.json({ code: 200, message: 'Points rule updated', data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update points rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update points rule' })
  }
})

export { router as staffPointRouter }