import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as TierBenefitService from '../services/TierBenefitService'

const router = Router()

const createTierBenefitSchema = z.object({
  storeId: z.string(),
  level: z.enum(['bronze', 'silver', 'gold', 'diamond']),
  pointsRate: z.number().positive().optional().default(1.0),
  birthdayReward: z.any().optional(),
  discountPercent: z.number().optional().default(0),
  freeDeliveryThreshold: z.number().int().optional().default(0),
  pointsToUpgrade: z.number().int().optional(),
  description: z.string().optional()
})

// GET /api/marketing/tier-benefits
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const benefits = await TierBenefitService.getTierBenefits(storeId)
    res.json({ code: 200, data: { list: benefits }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get tier benefits error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get tier benefits' })
  }
})

// POST /api/marketing/tier-benefits
router.post('/', authenticate, authorize('admin'), validateBody(createTierBenefitSchema), async (req: AuthRequest, res) => {
  try {
    const benefit = await TierBenefitService.upsertTierBenefit(req.body)
    res.status(201).json({ code: 201, message: 'Tier benefit saved', data: benefit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create tier benefit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save tier benefit' })
  }
})

// GET /api/marketing/tier-benefits/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const benefit = await TierBenefitService.getTierBenefitById(req.params.id)
    if (!benefit) return res.status(404).json({ code: 404, message: 'Tier benefit not found' })
    res.json({ code: 200, data: benefit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get tier benefit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get tier benefit' })
  }
})

// PUT /api/marketing/tier-benefits/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const benefit = await TierBenefitService.updateTierBenefit(req.params.id, req.body)
    res.json({ code: 200, message: 'Tier benefit updated', data: benefit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update tier benefit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update tier benefit' })
  }
})

// DELETE /api/marketing/tier-benefits/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await TierBenefitService.deleteTierBenefit(req.params.id)
    res.json({ code: 200, message: 'Tier benefit deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete tier benefit error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete tier benefit' })
  }
})

// GET /api/marketing/tier-benefits/level/:level
router.get('/level/:level', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.query.storeId as string || req.user!.storeId
    const benefit = await TierBenefitService.getTierBenefitByLevel(storeId, req.params.level)
    res.json({ code: 200, data: benefit, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get tier benefit by level error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get tier benefit' })
  }
})

export { router as tierBenefitRouter }