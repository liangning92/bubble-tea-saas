import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { getPointsRule, getOrCreatePointsRule, upsertPointsRule } from '../services/PointsRuleService'

const router = Router()

// GET /api/points-rules - Get points rule for store
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const rule = await getOrCreatePointsRule(storeId)
    res.json({ code: 200, data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get points rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get points rule' })
  }
})

// PUT /api/points-rules - Update points rule
router.put('/', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { pointsPerRupiah, minPurchase, birthdayMultiplier, tierMultiplier, isActive } = req.body

    const rule = await upsertPointsRule({
      storeId,
      pointsPerRupiah,
      minPurchase,
      birthdayMultiplier,
      tierMultiplier,
      isActive
    })

    res.json({ code: 200, message: 'Points rule updated', data: rule, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update points rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update points rule' })
  }
})

export { router as pointsRuleRouter }
