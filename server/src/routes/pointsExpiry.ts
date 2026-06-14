import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as PointsExpiryService from '../services/PointsExpiryService'

const router = Router()

const createRuleSchema = z.object({
  storeId: z.string(),
  enabled: z.boolean().optional().default(true),
  expiryMonths: z.number().int().positive().optional().default(12),
  minPointsToExpire: z.number().int().optional().default(100),
  notificationDays: z.number().int().optional().default(14)
})

// GET /api/marketing/points-expiry-rules
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const rule = await PointsExpiryService.getPointsExpiryRule(storeId)
    res.json({ code: 200, data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get points expiry rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get points expiry rule' })
  }
})

// POST /api/marketing/points-expiry-rules
router.post('/', authenticate, authorize('admin'), validateBody(createRuleSchema), async (req: AuthRequest, res) => {
  try {
    const rule = await PointsExpiryService.upsertPointsExpiryRule(req.body)
    res.status(201).json({ code: 201, message: 'Points expiry rule saved', data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create points expiry rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save points expiry rule' })
  }
})

// PUT /api/marketing/points-expiry-rules/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const rule = await PointsExpiryService.updatePointsExpiryRule(req.params.id, req.body)
    res.json({ code: 200, message: 'Points expiry rule updated', data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update points expiry rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update points expiry rule' })
  }
})

// POST /api/marketing/points-expiry-rules/process
router.post('/process', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.body.storeId || req.user!.storeId
    const result = await PointsExpiryService.processPointsExpiry(storeId)
    res.json({ code: 200, message: 'Points expiry processed', data: result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Process points expiry error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process points expiry' })
  }
})

export { router as pointsExpiryRouter }