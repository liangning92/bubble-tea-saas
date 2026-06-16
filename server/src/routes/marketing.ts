import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as MarketingService from '../services/MarketingAutomationService'
import { getAutomationTime, setAutomationTime } from '../services/MarketingSchedulerService'

const router = Router()

// Validation schemas
const createCampaignSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['birthday', 'reactivation', 'loyalty', 'seasonal', 'welcome', 'points_expiring']),
  triggerType: z.enum(['automatic', 'manual', 'scheduled']),
  startDate: z.string(),
  endDate: z.string().optional(),
  conditions: z.object({
    thresholdDays: z.number().optional(),
    minPoints: z.number().optional()
  }).optional(),
  actions: z.object({
    couponId: z.string().optional(),
    notificationMessage: z.string().optional()
  }).optional()
})

const createCouponSchema = z.object({
  storeId: z.string(),
  campaignId: z.string().optional(),
  code: z.string().min(3),
  type: z.enum(['discount_percent', 'discount_fixed', 'free_product', 'free_delivery']),
  value: z.number().int().positive(),
  minOrder: z.number().int().optional().default(0),
  maxDiscount: z.number().int().optional().default(0),
  validFrom: z.string(),
  validUntil: z.string(),
  usageLimit: z.number().int().optional().default(0)
})

// ==================== CAMPAIGNS ====================

// GET /api/marketing/campaigns
router.get('/campaigns', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    // Always use user's storeId for security
    const storeId = req.user!.storeId
    const campaigns = await MarketingService.getActiveCampaigns(storeId)

    res.json({
      code: 200,
      data: { list: campaigns },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get campaigns error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaigns' })
  }
})

// POST /api/marketing/campaigns
router.post('/campaigns', authenticate, authorize('admin'), validateBody(createCampaignSchema), async (req: AuthRequest, res) => {
  try {
    // Always use user's storeId for security
    const campaign = await MarketingService.createCampaign({
      ...req.body,
      storeId: req.user!.storeId,
      startDate: new Date(req.body.startDate),
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
    })

    res.status(201).json({
      code: 201,
      message: 'Campaign created',
      data: campaign,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create campaign' })
  }
})

// GET /api/marketing/campaigns/:id
router.get('/campaigns/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const campaign = await MarketingService.getCampaign(id)
    if (!campaign) {
      return res.status(404).json({ code: 404, message: 'Campaign not found' })
    }
    res.json({ code: 200, data: campaign, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign' })
  }
})

// PUT /api/marketing/campaigns/:id
router.put('/campaigns/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const campaign = await MarketingService.updateCampaign(id, {
      ...req.body,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
    })
    res.json({ code: 200, message: 'Campaign updated', data: campaign, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update campaign' })
  }
})

// DELETE /api/marketing/campaigns/:id
router.delete('/campaigns/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await MarketingService.deleteCampaign(id)
    res.json({ code: 200, message: 'Campaign deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete campaign' })
  }
})

// GET /api/marketing/campaigns/:id/stats
router.get('/campaigns/:id/stats', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const stats = await MarketingService.getCampaignStats(id)

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get campaign stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign stats' })
  }
})

// ==================== COUPONS ====================

// GET /api/marketing/coupons
router.get('/coupons', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const coupons = await MarketingService.getAllCoupons(storeId)
    res.json({ code: 200, data: { list: coupons }, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get coupons error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get coupons' })
  }
})

// POST /api/marketing/coupons
router.post('/coupons', authenticate, authorize('admin', 'manager'), validateBody(createCouponSchema), async (req: AuthRequest, res) => {
  try {
    const coupon = await MarketingService.createCoupon({
      ...req.body,
      validFrom: new Date(req.body.validFrom),
      validUntil: new Date(req.body.validUntil)
    })

    res.status(201).json({
      code: 201,
      message: 'Coupon created',
      data: coupon,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create coupon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create coupon' })
  }
})

// GET /api/marketing/coupons/:id
router.get('/coupons/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const coupon = await MarketingService.getCoupon(id)
    if (!coupon) {
      return res.status(404).json({ code: 404, message: 'Coupon not found' })
    }
    res.json({ code: 200, data: coupon, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Get coupon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get coupon' })
  }
})

// PUT /api/marketing/coupons/:id
router.put('/coupons/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const coupon = await MarketingService.updateCoupon(id, {
      ...req.body,
      validFrom: req.body.validFrom ? new Date(req.body.validFrom) : undefined,
      validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined
    })
    res.json({ code: 200, message: 'Coupon updated', data: coupon, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Update coupon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update coupon' })
  }
})

// DELETE /api/marketing/coupons/:id
router.delete('/coupons/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await MarketingService.deleteCoupon(id)
    res.json({ code: 200, message: 'Coupon deleted', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Delete coupon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete coupon' })
  }
})

// GET /api/marketing/members/:memberId/coupons
router.get('/members/:memberId/coupons', authenticate, async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params
    const coupons = await MarketingService.getMemberCoupons(memberId)

    res.json({
      code: 200,
      data: { list: coupons },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member coupons error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member coupons' })
  }
})

// POST /api/marketing/coupons/:couponId/generate/:memberId
router.post('/coupons/:couponId/generate/:memberId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { couponId, memberId } = req.params
    const memberCoupon = await MarketingService.generateMemberCoupon(memberId, couponId)

    res.status(201).json({
      code: 201,
      message: 'Coupon generated for member',
      data: memberCoupon,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Generate member coupon error:', error)
    res.status(500).json({ code: 500, message: 'Failed to generate coupon' })
  }
})

// POST /api/marketing/coupons/:memberCouponId/redeem
router.post('/coupons/:memberCouponId/redeem', authenticate, async (req: AuthRequest, res) => {
  try {
    const { memberCouponId } = req.params
    const { orderId } = req.body

    const result = await MarketingService.redeemCoupon(memberCouponId, orderId)

    res.json({
      code: 200,
      message: 'Coupon redeemed',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Redeem coupon error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to redeem coupon' })
  }
})

// ==================== AUTOMATION TRIGGERS ====================

// POST /api/marketing/automation/run
router.post('/automation/run', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await MarketingService.runAutomationChecks(storeId)

    res.json({
      code: 200,
      message: 'Automation checks completed',
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Run automation error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run automation' })
  }
})

// POST /api/marketing/automation/birthday
router.post('/automation/birthday', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await MarketingService.checkBirthdayCampaign(storeId)

    res.json({
      code: 200,
      message: 'Birthday campaign check completed',
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Birthday campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run birthday campaign' })
  }
})

// POST /api/marketing/automation/reactivation
router.post('/automation/reactivation', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await MarketingService.checkReactivationCampaign(storeId)

    res.json({
      code: 200,
      message: 'Reactivation campaign check completed',
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Reactivation campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run reactivation campaign' })
  }
})

// POST /api/marketing/automation/points-expiring
router.post('/automation/points-expiring', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await MarketingService.checkPointsExpiring(storeId)

    res.json({
      code: 200,
      message: 'Points expiring check completed',
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Points expiring check error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run points expiring check' })
  }
})

// POST /api/marketing/automation/seasonal
router.post('/automation/seasonal', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const results = await MarketingService.checkSeasonalCampaigns(storeId)

    res.json({
      code: 200,
      message: 'Seasonal campaign check completed',
      data: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Seasonal campaign error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run seasonal campaign' })
  }
})

// POST /api/marketing/automation/run/:campaignId - Run specific campaign automation
router.post('/automation/run/:campaignId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { campaignId } = req.params

    // Try new system first, fall back to legacy
    let result
    try {
      result = await MarketingService.runCampaignAutomation(campaignId)
    } catch (e) {
      // Fall back to legacy system
      result = await MarketingService.runCampaignAutomationLegacy(campaignId)
    }

    res.json({
      code: 200,
      message: 'Campaign automation completed',
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Run campaign automation error:', error)
    res.status(500).json({ code: 500, message: 'Failed to run campaign automation' })
  }
})

// GET /api/marketing/automation/time - Get automation time setting
router.get('/automation/time', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const time = await getAutomationTime(storeId)
    res.json({
      code: 200,
      data: { automationTime: time },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get automation time error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get automation time' })
  }
})

// PUT /api/marketing/automation/time - Set automation time
router.put('/automation/time', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { time } = req.body

    if (!time || typeof time !== 'string') {
      return res.status(400).json({ code: 400, message: 'Time is required (format: HH:MM)' })
    }

    // Validate time format
    const timeParts = time.split(':')
    if (timeParts.length !== 2) {
      return res.status(400).json({ code: 400, message: 'Invalid time format, use HH:MM' })
    }

    const hour = parseInt(timeParts[0], 10)
    const minute = parseInt(timeParts[1], 10)
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return res.status(400).json({ code: 400, message: 'Invalid time values' })
    }

    await setAutomationTime(storeId, time)
    res.json({
      code: 200,
      message: 'Automation time updated',
      data: { automationTime: time },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Set automation time error:', error)
    res.status(500).json({ code: 500, message: 'Failed to set automation time' })
  }
})

// ==================== MEMBER BALANCE ====================
import prisma from '../config/database'

// GET /api/marketing/members/search - Search member by phone
router.get('/members/search', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { phone } = req.query
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ code: 400, message: 'Phone is required' })
    }

    const member = await prisma.member.findFirst({
      where: { phone, storeId: req.user!.storeId },
      select: { id: true, name: true, phone: true, balance: true }
    })

    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    res.json({
      code: 200,
      data: {
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
        balance: member.balance
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Search member error:', error)
    res.status(500).json({ code: 500, message: 'Failed to search member' })
  }
})

// GET /api/marketing/members/:id/balance - Get member balance with logs
router.get('/members/:id/balance', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, balance: true, storeId: true }
    })

    if (!member || member.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    const logs = await prisma.memberBalanceLog.findMany({
      where: { memberId: id },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    res.json({
      code: 200,
      data: {
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
        balance: member.balance,
        logs: logs.map(log => ({
          id: log.id,
          type: log.type,
          amount: log.amount,
          balanceBefore: log.balanceBefore,
          balanceAfter: log.balanceAfter,
          note: log.note,
          createdAt: log.createdAt
        }))
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member balance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member balance' })
  }
})

// POST /api/marketing/members/:id/balance/topup - Topup member balance
router.post('/members/:id/balance/topup', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { amount, note } = req.body

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ code: 400, message: 'Valid amount is required' })
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, balance: true, storeId: true }
    })

    if (!member || member.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    const balanceBefore = member.balance
    const balanceAfter = balanceBefore + amount

    // Update balance and create log in transaction
    const [updatedMember, log] = await prisma.$transaction([
      prisma.member.update({
        where: { id },
        data: { balance: balanceAfter }
      }),
      prisma.memberBalanceLog.create({
        data: {
          memberId: id,
          type: 'topup',
          amount,
          balanceBefore,
          balanceAfter,
          note: note || 'Topup',
          operatorId: req.user!.id
        }
      })
    ])

    res.json({
      code: 200,
      message: 'Topup successful',
      data: {
        memberId: id,
        balance: updatedMember.balance,
        log: {
          id: log.id,
          type: log.type,
          amount: log.amount,
          balanceAfter: log.balanceAfter,
          createdAt: log.createdAt
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Topup error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process topup' })
  }
})

// POST /api/marketing/members/:id/balance/deduct - Deduct member balance
router.post('/members/:id/balance/deduct', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { amount, note } = req.body

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ code: 400, message: 'Valid amount is required' })
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, balance: true, storeId: true }
    })

    if (!member || member.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    if (member.balance < amount) {
      return res.status(400).json({ code: 400, message: 'Insufficient balance' })
    }

    const balanceBefore = member.balance
    const balanceAfter = balanceBefore - amount

    // Update balance and create log in transaction
    const [updatedMember, log] = await prisma.$transaction([
      prisma.member.update({
        where: { id },
        data: { balance: balanceAfter }
      }),
      prisma.memberBalanceLog.create({
        data: {
          memberId: id,
          type: 'deduct',
          amount: -amount,
          balanceBefore,
          balanceAfter,
          note: note || 'Deduct',
          operatorId: req.user!.id
        }
      })
    ])

    res.json({
      code: 200,
      message: 'Deduct successful',
      data: {
        memberId: id,
        balance: updatedMember.balance,
        log: {
          id: log.id,
          type: log.type,
          amount: log.amount,
          balanceAfter: log.balanceAfter,
          createdAt: log.createdAt
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Deduct error:', error)
    res.status(500).json({ code: 500, message: 'Failed to process deduct' })
  }
})

// GET /api/marketing/balance-logs - Get all balance logs for store
router.get('/balance-logs', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const logs = await prisma.memberBalanceLog.findMany({
      where: { member: { storeId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { member: { select: { name: true, phone: true } } }
    })

    res.json({
      code: 200,
      data: logs.map(log => ({
        id: log.id,
        type: log.type,
        amount: log.amount,
        balanceBefore: log.balanceBefore,
        balanceAfter: log.balanceAfter,
        note: log.note,
        createdAt: log.createdAt,
        memberName: log.member.name
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get balance logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get balance logs' })
  }
})

// ==================== DISCOUNT RULES ====================

// GET /api/marketing/discount-rules - Get all discount rules
router.get('/discount-rules', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const rules = await prisma.discountRule.findMany({
      where: { storeId },
      orderBy: { priority: 'desc' }
    })
    res.json({
      code: 200,
      data: rules.map(r => ({
        ...r,
        applicableChannels: r.applicableChannels ? JSON.parse(r.applicableChannels) : []
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get discount rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get discount rules' })
  }
})

// POST /api/marketing/discount-rules - Create discount rule
router.post('/discount-rules', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { name, minOrderAmount, discountValue, discountType, maxDiscount, applicableChannels, validFrom, validUntil, priority, status } = req.body

    if (!name || !minOrderAmount || !discountValue) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const rule = await prisma.discountRule.create({
      data: {
        storeId,
        name,
        minOrderAmount,
        discountValue,
        discountType: discountType || 'fixed',
        maxDiscount: maxDiscount || null,
        applicableChannels: applicableChannels ? JSON.stringify(applicableChannels) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        priority: priority || 0,
        status: status || 'active'
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Discount rule created',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create discount rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create discount rule' })
  }
})

// PUT /api/marketing/discount-rules/:id - Update discount rule
router.put('/discount-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, minOrderAmount, discountValue, discountType, maxDiscount, applicableChannels, validFrom, validUntil, priority, status } = req.body

    const existing = await prisma.discountRule.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Discount rule not found' })
    }

    const rule = await prisma.discountRule.update({
      where: { id },
      data: {
        name,
        minOrderAmount,
        discountValue,
        discountType,
        maxDiscount: maxDiscount || null,
        applicableChannels: applicableChannels ? JSON.stringify(applicableChannels) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        priority,
        status
      }
    })

    res.json({
      code: 200,
      message: 'Discount rule updated',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update discount rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update discount rule' })
  }
})

// DELETE /api/marketing/discount-rules/:id - Delete discount rule
router.delete('/discount-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.discountRule.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Discount rule not found' })
    }

    await prisma.discountRule.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Discount rule deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete discount rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete discount rule' })
  }
})

// ==================== TIMED SPECIALS ====================

// GET /api/marketing/timed-specials - Get all timed specials
router.get('/timed-specials', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const specials = await prisma.timedSpecial.findMany({
      where: { storeId },
      orderBy: { startTime: 'desc' },
      include: { store: { select: { name: true } } }
    })
    res.json({
      code: 200,
      data: specials.map(s => ({
        ...s,
        daysOfWeek: s.daysOfWeek ? JSON.parse(s.daysOfWeek) : []
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get timed specials error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get timed specials' })
  }
})

// POST /api/marketing/timed-specials - Create timed special
router.post('/timed-specials', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { name, productId, specialPrice, originalPrice, startTime, endTime, daysOfWeek, applicableChannels, status } = req.body

    if (!name || !productId || !specialPrice || !startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const special = await prisma.timedSpecial.create({
      data: {
        storeId,
        name,
        productId,
        specialPrice,
        originalPrice: originalPrice || null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
        applicableChannels: applicableChannels ? JSON.stringify(applicableChannels) : null,
        status: status || 'active'
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Timed special created',
      data: special,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create timed special error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create timed special' })
  }
})

// PUT /api/marketing/timed-specials/:id - Update timed special
router.put('/timed-specials/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, productId, specialPrice, originalPrice, startTime, endTime, daysOfWeek, applicableChannels, status } = req.body

    const existing = await prisma.timedSpecial.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Timed special not found' })
    }

    const special = await prisma.timedSpecial.update({
      where: { id },
      data: {
        name,
        productId,
        specialPrice,
        originalPrice: originalPrice || null,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
        applicableChannels: applicableChannels ? JSON.stringify(applicableChannels) : null,
        status
      }
    })

    res.json({
      code: 200,
      message: 'Timed special updated',
      data: special,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update timed special error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update timed special' })
  }
})

// DELETE /api/marketing/timed-specials/:id - Delete timed special
router.delete('/timed-specials/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.timedSpecial.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Timed special not found' })
    }

    await prisma.timedSpecial.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Timed special deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete timed special error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete timed special' })
  }
})

// ==================== STACKING RULES ====================

// GET /api/marketing/stacking-rules - Get all stacking rules
router.get('/stacking-rules', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const rules = await prisma.stackingRule.findMany({
      where: { storeId },
      orderBy: { priority: 'desc' }
    })
    res.json({
      code: 200,
      data: rules,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get stacking rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get stacking rules' })
  }
})

// POST /api/marketing/stacking-rules - Create stacking rule
router.post('/stacking-rules', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { name, ruleType, couponTypeA, couponTypeB, priority, note, status } = req.body

    if (!name || !ruleType) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const rule = await prisma.stackingRule.create({
      data: {
        storeId,
        name,
        ruleType,
        couponTypeA: couponTypeA || null,
        couponTypeB: couponTypeB || null,
        priority: priority || 0,
        note: note || null,
        status: status || 'active'
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Stacking rule created',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create stacking rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create stacking rule' })
  }
})

// PUT /api/marketing/stacking-rules/:id - Update stacking rule
router.put('/stacking-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, ruleType, couponTypeA, couponTypeB, priority, note, status } = req.body

    const existing = await prisma.stackingRule.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Stacking rule not found' })
    }

    const rule = await prisma.stackingRule.update({
      where: { id },
      data: {
        name,
        ruleType,
        couponTypeA: couponTypeA || null,
        couponTypeB: couponTypeB || null,
        priority,
        note: note || null,
        status
      }
    })

    res.json({
      code: 200,
      message: 'Stacking rule updated',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update stacking rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update stacking rule' })
  }
})

// DELETE /api/marketing/stacking-rules/:id - Delete stacking rule
router.delete('/stacking-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.stackingRule.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Stacking rule not found' })
    }

    await prisma.stackingRule.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Stacking rule deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete stacking rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete stacking rule' })
  }
})

// ==================== AUTOMATION RULES ====================

// GET /api/marketing/automation-rules - Get all automation rules (campaigns with auto/scheduled trigger)
router.get('/automation-rules', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const rules = await prisma.campaign.findMany({
      where: {
        storeId,
        triggerType: { in: ['automatic', 'scheduled'] }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json({
      code: 200,
      data: rules,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get automation rules error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get automation rules' })
  }
})

// POST /api/marketing/automation-rules - Create automation rule
router.post('/automation-rules', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { name, type, triggerType, startDate, endDate, status, actions } = req.body

    if (!name) {
      return res.status(400).json({ code: 400, message: 'Name is required' })
    }

    const rule = await prisma.campaign.create({
      data: {
        storeId,
        name,
        type: type || 'welcome',
        triggerType: triggerType || 'automatic',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'active',
        actions: actions || '{}'
      }
    })

    res.status(201).json({
      code: 201,
      message: 'Automation rule created',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create automation rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create automation rule' })
  }
})

// PUT /api/marketing/automation-rules/:id - Update automation rule
router.put('/automation-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, type, triggerType, startDate, endDate, status, actions } = req.body

    const existing = await prisma.campaign.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Automation rule not found' })
    }

    const rule = await prisma.campaign.update({
      where: { id },
      data: {
        name,
        type,
        triggerType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : null,
        status,
        actions
      }
    })

    res.json({
      code: 200,
      message: 'Automation rule updated',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update automation rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update automation rule' })
  }
})

// PUT /api/marketing/automation-rules/:id/status - Toggle automation rule status
router.put('/automation-rules/:id/status', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const existing = await prisma.campaign.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Automation rule not found' })
    }

    const rule = await prisma.campaign.update({
      where: { id },
      data: { status }
    })

    res.json({
      code: 200,
      message: 'Automation rule status updated',
      data: rule,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Toggle automation rule status error:', error)
    res.status(500).json({ code: 500, message: 'Failed to toggle automation rule status' })
  }
})

// DELETE /api/marketing/automation-rules/:id - Delete automation rule
router.delete('/automation-rules/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.campaign.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Automation rule not found' })
    }

    await prisma.campaign.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Automation rule deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete automation rule error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete automation rule' })
  }
})

// ==================== AUTOMATION LOGS ====================

// GET /api/marketing/automation-logs - Get automation logs
router.get('/automation-logs', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const logs = await prisma.automationLog.findMany({
      where: { storeId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { campaign: { select: { name: true } } }
    })
    res.json({
      code: 200,
      data: logs.map(log => ({
        ...log,
        campaignName: log.campaign?.name
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get automation logs error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get automation logs' })
  }
})

// ==================== MESSAGE STATS ====================

// GET /api/marketing/message-stats - Get message statistics
router.get('/message-stats', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { period = 'week' } = req.query

    // Calculate date range based on period
    const now = new Date()
    let startDate = new Date()
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    // Get message logs from the period
    const logs = await prisma.messageLog.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate }
      },
      orderBy: { createdAt: 'asc' }
    })

    // Calculate stats
    const totalSent = logs.length
    const totalDelivered = logs.filter(l => l.status === 'delivered').length
    const totalFailed = logs.filter(l => l.status === 'failed').length
    const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0

    // Group by channel
    const byChannelMap = new Map<string, { sent: number; delivered: number; failed: number }>()
    logs.forEach(log => {
      const channel = log.channelType || 'unknown'
      const existing = byChannelMap.get(channel) || { sent: 0, delivered: 0, failed: 0 }
      existing.sent++
      if (log.status === 'delivered') existing.delivered++
      if (log.status === 'failed') existing.failed++
      byChannelMap.set(channel, existing)
    })
    const byChannel = Array.from(byChannelMap.entries()).map(([channel, data]) => ({
      channel,
      ...data,
      deliveryRate: data.sent > 0 ? Math.round((data.delivered / data.sent) * 100) : 0
    }))

    // Group by type
    const byTypeMap = new Map<string, { sent: number; delivered: number; failed: number }>()
    logs.forEach(log => {
      const type = log.type || 'unknown'
      const existing = byTypeMap.get(type) || { sent: 0, delivered: 0, failed: 0 }
      existing.sent++
      if (log.status === 'delivered') existing.delivered++
      if (log.status === 'failed') existing.failed++
      byTypeMap.set(type, existing)
    })
    const byType = Array.from(byTypeMap.entries()).map(([type, data]) => ({ type, ...data }))

    // Group by day
    const dailyMap = new Map<string, { sent: number; delivered: number; failed: number }>()
    logs.forEach(log => {
      const date = log.createdAt.toISOString().split('T')[0]
      const existing = dailyMap.get(date) || { sent: 0, delivered: 0, failed: 0 }
      existing.sent++
      if (log.status === 'delivered') existing.delivered++
      if (log.status === 'failed') existing.failed++
      dailyMap.set(date, existing)
    })
    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    res.json({
      code: 200,
      data: {
        totalSent,
        totalDelivered,
        totalFailed,
        deliveryRate,
        clickRate: 0, // Click tracking not implemented yet
        byChannel,
        byType,
        dailyStats
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get message stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get message stats' })
  }
})

// ==================== COUPON REPORTS ====================

// GET /api/marketing/coupon-reports - Get coupon usage reports
router.get('/coupon-reports', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { period = 'month' } = req.query

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1)
    }

    // Get coupons with member coupons
    const coupons = await prisma.coupon.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate }
      },
      include: {
        memberCoupons: {
          where: {
            createdAt: { gte: startDate }
          }
        }
      }
    })

    // Calculate reports
    const reports = coupons.map(coupon => {
      const totalIssued = coupon.memberCoupons.length
      const totalUsed = coupon.memberCoupons.filter(c => c.status === 'used').length
      const usageRate = totalIssued > 0 ? Math.round((totalUsed / totalIssued) * 100) : 0
      const totalDiscount = coupon.type === 'discount_fixed'
        ? totalUsed * coupon.value
        : 0 // For percent, would need order data to calculate properly

      return {
        couponId: coupon.id,
        couponCode: coupon.code,
        couponType: coupon.type,
        totalIssued,
        totalUsed,
        usageRate,
        totalDiscount,
        avgDiscount: totalUsed > 0 ? Math.round(totalDiscount / totalUsed) : 0,
        byMonth: []
      }
    })

    res.json({
      code: 200,
      data: reports,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get coupon reports error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get coupon reports' })
  }
})

// ==================== CAMPAIGN REPORTS ====================

// GET /api/marketing/campaign-reports - Get campaign performance reports
router.get('/campaign-reports', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    // Get all campaigns with their coupons
    const campaigns = await prisma.campaign.findMany({
      where: { storeId },
      include: {
        coupons: {
          include: {
            memberCoupons: true
          }
        }
      }
    })

    // Calculate reports
    const reports = campaigns.map(campaign => {
      let totalIssued = 0
      let totalUsed = 0

      campaign.coupons.forEach(coupon => {
        totalIssued += coupon.memberCoupons.length
        totalUsed += coupon.memberCoupons.filter(c => c.status === 'used').length
      })

      const conversionRate = totalIssued > 0 ? Math.round((totalUsed / totalIssued) * 100) : 0
      const totalRevenue = campaign.coupons.reduce((sum, c) => sum + (c.usedCount * c.minOrder), 0)

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignType: campaign.type,
        status: campaign.status,
        totalMembers: 0, // Would need to track unique members
        couponsIssued: totalIssued,
        couponsUsed: totalUsed,
        conversionRate,
        totalRevenue,
        startDate: campaign.startDate.toISOString(),
        endDate: campaign.endDate?.toISOString()
      }
    })

    res.json({
      code: 200,
      data: reports,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get campaign reports error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get campaign reports' })
  }
})

// ==================== REFERRAL FUNNEL ====================

// GET /api/marketing/referral-funnel - Get referral funnel analytics
router.get('/referral-funnel', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { period = 'month' } = req.query

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1)
    }

    // Get referral logs
    const referralLogs = await prisma.referralLog.findMany({
      where: {
        referralCampaign: { storeId },
        createdAt: { gte: startDate }
      },
      include: {
        inviterMember: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Calculate funnel metrics
    const codesGenerated = referralLogs.length
    const codesUsed = referralLogs.filter(l => l.orderId).length

    // Get members who used referral codes
    const rewardeeIds = referralLogs.filter(l => l.rewardeeMemberId).map(l => l.rewardeeMemberId)
    const referredMembers = await prisma.member.findMany({
      where: { id: { in: rewardeeIds } },
      include: { orders: true }
    })

    const newRegistrations = referredMembers.length
    const firstPurchase = referredMembers.filter(m => m.orders.length > 0).length
    const repeatPurchase = referredMembers.filter(m => m.orders.length > 1).length

    // Calculate revenue from referred members
    const totalReferralRevenue = referredMembers.reduce((sum, m) => {
      return sum + m.orders.reduce((orderSum, o) => orderSum + o.totalAmount, 0)
    }, 0)

    // Reward cost (simplified - would need actual reward calculation)
    const rewardCost = codesUsed * 5000 // Assume 5K per referral reward
    const roi = rewardCost > 0 ? Math.round(((totalReferralRevenue - rewardCost) / rewardCost) * 100) : 0

    // Top referrers
    const referrerMap = new Map<string, { count: number; reward: number }>()
    referralLogs.forEach(log => {
      if (log.inviterMemberId) {
        const existing = referrerMap.get(log.inviterMemberId) || { count: 0, reward: 0 }
        existing.count++
        existing.reward += 5000
        referrerMap.set(log.inviterMemberId, existing)
      }
    })

    const topReferrers = Array.from(referrerMap.entries())
      .map(([inviterMemberId, data]) => ({
        memberId: inviterMemberId,
        memberName: referralLogs.find(l => l.inviterMemberId === inviterMemberId)?.inviterMember?.name || 'Unknown',
        phone: referralLogs.find(l => l.inviterMemberId === inviterMemberId)?.inviterMember?.phone || '-',
        referralCount: data.count,
        rewardEarned: data.reward
      }))
      .sort((a, b) => b.referralCount - a.referralCount)

    res.json({
      code: 200,
      data: {
        codesGenerated,
        codesUsed,
        newRegistrations,
        firstPurchase,
        repeatPurchase,
        totalReferralRevenue,
        rewardCost,
        roi,
        byMonth: [], // Simplified
        topReferrers
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get referral funnel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get referral funnel' })
  }
})

export { router as marketingRouter }