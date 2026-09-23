import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as ReferralService from '../services/ReferralService'
import { getStoreId } from '../utils/storeHelper'

const router = Router()

const createReferralSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  inviterReward: z.object({ type: z.string(), value: z.number() }),
  rewardeeReward: z.object({ type: z.string(), value: z.number() }),
  minOrderAmount: z.number().int().optional().default(0),
  maxUsageCount: z.number().int().optional().default(0),
  referralCode: z.string().min(3),
  conditions: z.any().optional()
})

// GET /api/marketing/referrals
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = getStoreId(req)
    const campaigns = await ReferralService.getReferralCampaigns(storeId)
    res.json({ code: 200, data: { list: campaigns }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get referrals error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get referral campaigns' })
  }
})

// POST /api/marketing/referrals
router.post('/', authenticate, authorize('admin'), validateBody(createReferralSchema), async (req: AuthRequest, res) => {
  try {
    const campaign = await ReferralService.createReferralCampaign({
      ...req.body,
      startDate: new Date(req.body.startDate),
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
    })
    res.status(201).json({ code: 201, message: 'Referral campaign created', data: campaign, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Create referral error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create referral campaign' })
  }
})

// GET /api/marketing/referrals/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const campaign = await ReferralService.getReferralCampaign(req.params.id)
    if (!campaign) return res.status(404).json({ code: 404, message: 'Referral campaign not found' })
    res.json({ code: 200, data: campaign, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get referral error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get referral campaign' })
  }
})

// PUT /api/marketing/referrals/:id
router.put('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const campaign = await ReferralService.updateReferralCampaign(req.params.id, {
      ...req.body,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
    })
    res.json({ code: 200, message: 'Referral campaign updated', data: campaign, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update referral error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update referral campaign' })
  }
})

// DELETE /api/marketing/referrals/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await ReferralService.deleteReferralCampaign(req.params.id)
    res.json({ code: 200, message: 'Referral campaign deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete referral error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete referral campaign' })
  }
})

// GET /api/marketing/referrals/:id/stats
router.get('/:id/stats', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const stats = await ReferralService.getReferralStats(req.params.id)
    res.json({ code: 200, data: stats, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get referral stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get referral stats' })
  }
})

// POST /api/marketing/referrals/apply - member applies a referral code
router.post('/apply', authenticate, async (req: AuthRequest, res) => {
  try {
    const { memberId, code } = req.body
    const result = await ReferralService.applyReferralCode(memberId, code)
    res.json({ code: 200, message: 'Referral code applied', data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Apply referral code error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to apply referral code' })
  }
})

export { router as referralRouter }