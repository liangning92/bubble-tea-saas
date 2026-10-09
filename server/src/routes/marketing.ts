import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as MarketingService from '../services/MarketingAutomationService'
import { getAutomationTime, setAutomationTime } from '../services/MarketingSchedulerService'
import prisma from '../config/database'
import socketManager from '../socket'

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

// POST /api/marketing/coupons/verify - POS/顾客核销验券或扫码查询
router.post('/coupons/verify', authenticate, async (req: AuthRequest, res) => {
  try {
    const { code, memberId } = req.body
    if (!code) {
      return res.status(400).json({ code: 400, message: 'Coupon code is required' })
    }

    const trimmedCode = String(code).trim().toUpperCase()
    const now = new Date()

    // 1. 查询优惠券母券
    const coupon = await prisma.coupon.findUnique({
      where: { code: trimmedCode }
    })

    if (!coupon) {
      return res.status(404).json({ code: 404, message: 'Coupon not found' })
    }

    if (coupon.status !== 'active') {
      return res.status(400).json({ code: 400, message: 'Coupon is not active' })
    }

    if (new Date(coupon.validFrom) > now || new Date(coupon.validUntil) < now) {
      return res.status(400).json({ code: 400, message: 'Coupon is expired or not yet valid' })
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ code: 400, message: 'Coupon usage limit reached' })
    }

    // 2. 如果关联了 memberId，查询或准备 memberCoupon 记录
    let memberCoupon = null
    if (memberId) {
      memberCoupon = await prisma.memberCoupon.findFirst({
        where: {
          memberId,
          couponId: coupon.id
        },
        include: { coupon: true }
      })

      if (memberCoupon && memberCoupon.status !== 'unused') {
        return res.status(400).json({ code: 400, message: 'Member already used this coupon' })
      }

      // 如果会员名下尚未领过该全局券，自动为该会员发券以便核销
      if (!memberCoupon) {
        memberCoupon = await prisma.memberCoupon.create({
          data: {
            memberId,
            couponId: coupon.id,
            status: 'unused'
          },
          include: { coupon: true }
        })
      }
    }

    res.json({
      code: 200,
      data: {
        coupon,
        memberCoupon
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Verify coupon error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to verify coupon' })
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
router.get('/discount-rules', authenticate, authorize('admin', 'manager', 'cashier', 'staff'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { status } = req.query
    const where: any = { storeId }
    if (status) {
      where.status = String(status)
    }
    const rules = await prisma.discountRule.findMany({
      where,
      orderBy: { priority: 'desc' }
    })
    res.json({
      code: 200,
      data: rules.map(r => ({
        ...r,
        applicableChannels: r.applicableChannels ? JSON.parse(r.applicableChannels) : [],
        applicableProducts: r.applicableProducts ? JSON.parse(r.applicableProducts) : [],
        excludeProducts: r.excludeProducts ? JSON.parse(r.excludeProducts) : []
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
    const {
      name,
      minOrderAmount,
      discountValue,
      discountType = 'fixed',
      maxDiscount,
      applicableChannels,
      applicableProducts,
      excludeProducts,
      validFrom,
      validUntil,
      priority,
      status
    } = req.body

    const resolvedMinOrderAmount = minOrderAmount !== undefined && minOrderAmount !== null
      ? Number(minOrderAmount)
      : (discountType === 'second_half' || discountType === 'bogo' ? 2 : 0)

    const resolvedDiscountValue = discountValue !== undefined && discountValue !== null
      ? Number(discountValue)
      : (discountType === 'second_half' ? 50 : discountType === 'bogo' ? 100 : 0)

    if (!name || resolvedMinOrderAmount === undefined || resolvedDiscountValue === undefined) {
      return res.status(400).json({ code: 400, message: 'Missing required fields' })
    }

    const rule = await prisma.discountRule.create({
      data: {
        storeId,
        name,
        minOrderAmount: resolvedMinOrderAmount,
        discountValue: resolvedDiscountValue,
        discountType: discountType || 'fixed',
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        applicableChannels: applicableChannels && Array.isArray(applicableChannels) ? JSON.stringify(applicableChannels) : null,
        applicableProducts: applicableProducts && Array.isArray(applicableProducts) ? JSON.stringify(applicableProducts) : null,
        excludeProducts: excludeProducts && Array.isArray(excludeProducts) ? JSON.stringify(excludeProducts) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        priority: priority ? Number(priority) : 0,
        status: status || 'active'
      }
    })

    // 实时同步终端：向门店 POS 和电视屏广播营销活动变更
    socketManager.emitToStore(storeId, 'marketing:rules:updated', { ruleId: rule.id, action: 'create' })
    socketManager.emitToStore(storeId, 'tv:config:update', { refresh: true })

    res.status(201).json({
      code: 201,
      message: 'Discount rule created',
      data: {
        ...rule,
        applicableChannels: rule.applicableChannels ? JSON.parse(rule.applicableChannels) : [],
        applicableProducts: rule.applicableProducts ? JSON.parse(rule.applicableProducts) : [],
        excludeProducts: rule.excludeProducts ? JSON.parse(rule.excludeProducts) : []
      },
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
    const {
      name,
      minOrderAmount,
      discountValue,
      discountType = 'fixed',
      maxDiscount,
      applicableChannels,
      applicableProducts,
      excludeProducts,
      validFrom,
      validUntil,
      priority,
      status
    } = req.body

    const existing = await prisma.discountRule.findUnique({ where: { id } })
    if (!existing || existing.storeId !== req.user!.storeId) {
      return res.status(404).json({ code: 404, message: 'Discount rule not found' })
    }

    const resolvedMinOrderAmount = minOrderAmount !== undefined && minOrderAmount !== null
      ? Number(minOrderAmount)
      : existing.minOrderAmount

    const resolvedDiscountValue = discountValue !== undefined && discountValue !== null
      ? Number(discountValue)
      : existing.discountValue

    const rule = await prisma.discountRule.update({
      where: { id },
      data: {
        name,
        minOrderAmount: resolvedMinOrderAmount,
        discountValue: resolvedDiscountValue,
        discountType,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        applicableChannels: applicableChannels && Array.isArray(applicableChannels) ? JSON.stringify(applicableChannels) : null,
        applicableProducts: applicableProducts && Array.isArray(applicableProducts) ? JSON.stringify(applicableProducts) : null,
        excludeProducts: excludeProducts && Array.isArray(excludeProducts) ? JSON.stringify(excludeProducts) : null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        priority: priority !== undefined ? Number(priority) : existing.priority,
        status: status || existing.status
      }
    })

    // 实时同步终端：向门店 POS 和电视屏广播营销活动变更
    socketManager.emitToStore(existing.storeId, 'marketing:rules:updated', { ruleId: rule.id, action: 'update' })
    socketManager.emitToStore(existing.storeId, 'tv:config:update', { refresh: true })

    res.json({
      code: 200,
      message: 'Discount rule updated',
      data: {
        ...rule,
        applicableChannels: rule.applicableChannels ? JSON.parse(rule.applicableChannels) : [],
        applicableProducts: rule.applicableProducts ? JSON.parse(rule.applicableProducts) : [],
        excludeProducts: rule.excludeProducts ? JSON.parse(rule.excludeProducts) : []
      },
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

    // 实时同步终端：向门店 POS 和电视屏广播营销活动变更
    socketManager.emitToStore(req.user!.storeId, 'marketing:rules:updated', { ruleId: id, action: 'delete' })
    socketManager.emitToStore(req.user!.storeId, 'tv:config:update', { refresh: true })

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

    // 实时同步终端：向门店 POS 和电视屏广播特价活动变更
    socketManager.emitToStore(storeId, 'marketing:specials:updated', { specialId: special.id, action: 'create' })
    socketManager.emitToStore(storeId, 'tv:config:update', { refresh: true })

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

    // 实时同步终端：向门店 POS 和电视屏广播特价活动变更
    socketManager.emitToStore(req.user!.storeId, 'marketing:specials:updated', { specialId: special.id, action: 'update' })
    socketManager.emitToStore(req.user!.storeId, 'tv:config:update', { refresh: true })

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

    // 实时同步终端：向门店 POS 和电视屏广播特价活动变更
    socketManager.emitToStore(req.user!.storeId, 'marketing:specials:updated', { specialId: id, action: 'delete' })
    socketManager.emitToStore(req.user!.storeId, 'tv:config:update', { refresh: true })

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

// ==================== TV INTERACTIVE SCREEN MARKETING ====================

// Default TV interactive configuration
const DEFAULT_TV_CONFIG = {
  enabled: true,
  storeName: 'YOUME Tea & Boba',
  welcomeText: 'Welcome to YOUME',
  // Layout columns (e.g. 60% media banner, 40% daily specials & QR code)
  layout: {
    columns: [
      { width: 60, content: 'media' },
      { width: 40, content: 'specials' }
    ]
  },
  // Banners & media
  mediaFiles: [
    {
      url: 'https://images.unsplash.com/photo-1558857563-b37fe8466e39?w=1200&q=80',
      title: 'Brown Sugar Pearl Milk Tea',
      subtitle: 'Rasakan Manisnya Brown Sugar Asli Taiwan'
    },
    {
      url: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=1200&q=80',
      title: 'Fresh Fruit Tea Special',
      subtitle: '100% Buah Segar Pilihan Setiap Hari'
    }
  ],
  carouselIntervalSeconds: 6,
  // Custom Daily Deals / Specials with product image, price and description
  dailySpecials: [
    {
      dayOfWeek: 1, // Monday
      productName: 'Signature Brown Sugar Boba',
      originalPrice: 28000,
      specialPrice: 19000,
      tag: 'Senin Hemat (Monday Deal)',
      imageUrl: 'https://images.unsplash.com/photo-1558857563-b37fe8466e39?w=600&q=80',
      description: 'Gula aren premium dengan boba kenyal lembut'
    },
    {
      dayOfWeek: 2, // Tuesday
      productName: 'Taro Milk Tea with Pudding',
      originalPrice: 26000,
      specialPrice: 18000,
      tag: 'Selasa Manis',
      imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80',
      description: 'Rasa taro creamy dengan puding telur lembut'
    },
    {
      dayOfWeek: 3, // Wednesday
      productName: 'Matcha Red Bean Latte',
      originalPrice: 30000,
      specialPrice: 22000,
      tag: 'Rabu Segar',
      imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&q=80',
      description: 'Matcha Uji Jepang berpadu kacang merah manis'
    },
    {
      dayOfWeek: 4, // Thursday
      productName: 'Mango Jasmine Green Tea',
      originalPrice: 25000,
      specialPrice: 18000,
      tag: 'Kamis Ceria',
      imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80',
      description: 'Teh melati wangi dengan sari mangga tropis asli'
    },
    {
      dayOfWeek: 5, // Friday
      productName: 'Brown Sugar Milk Tea (BOGO)',
      originalPrice: 50000,
      specialPrice: 30000,
      tag: 'Beli 1 Gratis 1 (Buy 1 Get 1)',
      imageUrl: 'https://images.unsplash.com/photo-1558857563-b37fe8466e39?w=600&q=80',
      description: 'Promo spesial hari Jumat untuk dinikmati bersama teman'
    },
    {
      dayOfWeek: 6, // Saturday
      productName: 'Cheese Foam Strawberry Slush',
      originalPrice: 32000,
      specialPrice: 24000,
      tag: 'Weekend Special',
      imageUrl: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&q=80',
      description: 'Strawberry segar asam manis dengan gurihnya cheese foam'
    },
    {
      dayOfWeek: 0, // Sunday
      productName: 'Family Boba Party Box',
      originalPrice: 85000,
      specialPrice: 65000,
      tag: 'Minggu Bahagia',
      imageUrl: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=600&q=80',
      description: '3 Cup Minuman Favorit Pilihan untuk Akhir Pekan'
    }
  ],
  // Lucky wheel lottery settings
  lottery: {
    enabled: true,
    triggerMinOrderAmount: 50000, // Rp 50.000 minimum order
    title: 'Putar Roda Hoki (Lucky Wheel)',
    subtitle: 'Belanja Min Rp 50.000 Berkesempatan Menang!',
    prizes: [
      { id: '1', name: 'Free Boba Topping', code: 'free_topping', color: '#F59E0B', weight: 40 },
      { id: '2', name: 'Diskon 10% Next Order', code: 'disc_10', color: '#EC4899', weight: 25 },
      { id: '3', name: 'Free Up Size', code: 'free_upsize', color: '#3B82F6', weight: 20 },
      { id: '4', name: 'Voucher Rp 5.000', code: 'voucher_5k', color: '#10B981', weight: 10 },
      { id: '5', name: 'Gratis 1 Milk Tea (FREE)', code: 'free_drink', color: '#EF4444', weight: 5 }
    ]
  },
  // Ticker marquee settings
  ticker: {
    enabled: true,
    text: 'Selamat Menikmati Minuman Anda di YOUME Tea! Follow Instagram @youmetea.id untuk kejutan promo lainnya!'
  }
}

// GET /api/marketing/tv-screen/config - Publicly or auth accessible by storeId
router.get('/tv-screen/config', async (req, res) => {
  try {
    const storeId = (req.query.storeId as string) || ''

    const configRecord = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'tv_screen_marketing_config' } }
    })

    let config = JSON.parse(JSON.stringify(DEFAULT_TV_CONFIG))
    if (configRecord?.value) {
      try {
        config = { ...DEFAULT_TV_CONFIG, ...JSON.parse(configRecord.value) }
      } catch (e) {
        console.warn('Failed to parse tv config JSON:', e)
      }
    }

    // 核心联动：自动拉取门店后台正在生效的真实特价、促销规则与营销活动
    if (storeId) {
      const now = new Date()
      const [liveTimedSpecials, liveDiscountRules, liveCampaigns] = await Promise.all([
        prisma.timedSpecial.findMany({
          where: {
            storeId,
            status: 'active',
            startTime: { lte: now },
            endTime: { gte: now }
          },
          include: {
            store: { select: { name: true } }
          }
        }),
        prisma.discountRule.findMany({
          where: {
            storeId,
            status: 'active'
          },
          orderBy: { priority: 'desc' }
        }),
        prisma.campaign.findMany({
          where: {
            storeId,
            status: 'active',
            startDate: { lte: now }
          }
        })
      ])

      // 1. 若门店在后台“限时特价”中创建了商品特价活动，自动关联真实产品图与价格
      if (liveTimedSpecials.length > 0) {
        const productIds = liveTimedSpecials.map(s => s.productId).filter(Boolean)
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          include: { specs: true }
        })
        const productMap = new Map(products.map(p => [p.id, p]))

        const mappedSpecials = liveTimedSpecials.map(s => {
          const product = productMap.get(s.productId)
          let daysArr: number[] = []
          try {
            daysArr = s.daysOfWeek ? JSON.parse(s.daysOfWeek) : []
          } catch {
            daysArr = []
          }
          const defaultDay = daysArr.length > 0 ? daysArr[0] : now.getDay()
          const originalPrice = s.originalPrice || (product?.specs?.[0]?.price ? product.specs[0].price : s.specialPrice)

          return {
            id: s.id,
            dayOfWeek: defaultDay,
            productName: s.name || product?.name || 'Menu Spesial',
            originalPrice,
            specialPrice: s.specialPrice,
            tag: s.name ? `PROMO: ${s.name}` : 'Spesial Hari Ini',
            imageUrl: product?.image || 'https://images.unsplash.com/photo-1558857563-b37fe8466e39?w=600&q=80',
            description: product?.description || 'Promo Spesial Menu Favorit Hari Ini'
          }
        })

        if (mappedSpecials.length > 0) {
          config.dailySpecials = mappedSpecials
        }
      }

      // 2. 将正在生效的满减/满折/第二杯半价/买一送一/大促自动汇入跑马灯及动态活动广播
      const promoHighlights: string[] = []
      liveDiscountRules.forEach(r => {
        if (r.validFrom && new Date(r.validFrom) > now) return
        if (r.validUntil && new Date(r.validUntil) < now) return

        if (r.discountType === 'second_half') {
          promoHighlights.push(`🎉 ${r.name || 'Beli 2 Cup Diskon 50% untuk Cup Kedua (第二杯半价)'}`)
        } else if (r.discountType === 'bogo') {
          promoHighlights.push(`✨ ${r.name || 'Beli 1 Gratis 1 (Buy 1 Get 1 Free)'}`)
        } else if (r.discountType === 'percent') {
          promoHighlights.push(`🔥 Belanja Min Rp ${(r.minOrderAmount || 0).toLocaleString('id-ID')} Diskon ${r.discountValue}%`)
        } else {
          promoHighlights.push(`🎁 Belanja Min Rp ${(r.minOrderAmount || 0).toLocaleString('id-ID')} Potongan Rp ${(r.discountValue || 0).toLocaleString('id-ID')}`)
        }
      })

      liveCampaigns.forEach(c => {
        if (c.endDate && new Date(c.endDate) < now) return
        promoHighlights.push(`🌟 Event: ${c.name} (${c.description || 'Nikmati promo menarik'})`)
      })

      if (promoHighlights.length > 0) {
        config.activePromotions = promoHighlights
        if (config.ticker?.enabled) {
          config.ticker.text = promoHighlights.join('  ✦  ') + '  ✦  ' + (config.ticker.text || '')
        }
      }
    }

    res.json({
      code: 200,
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get TV screen config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get TV screen config' })
  }
})

// POST /api/marketing/tv-screen/config - Save TV screen config (Admin / Manager)
router.post('/tv-screen/config', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const newConfig = req.body

    const saved = await prisma.config.upsert({
      where: { storeId_key: { storeId, key: 'tv_screen_marketing_config' } },
      create: {
        storeId,
        key: 'tv_screen_marketing_config',
        value: JSON.stringify(newConfig),
        category: 'marketing'
      },
      update: {
        value: JSON.stringify(newConfig),
        category: 'marketing'
      }
    })

    // Realtime broadcast to connected TVs
    socketManager.emitTVConfigUpdate(storeId, newConfig)

    res.json({
      code: 200,
      message: 'TV screen marketing configuration saved and broadcasted',
      data: JSON.parse(saved.value),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Save TV screen config error:', error)
    res.status(500).json({ code: 500, message: 'Failed to save TV screen config' })
  }
})

// POST /api/marketing/tv-screen/trigger-lottery - Trigger lottery from POS or Admin test
router.post('/tv-screen/trigger-lottery', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user?.storeId || req.body.storeId
    const { orderId, orderNumber, customerPhone, orderAmount } = req.body

    // Load active prizes
    const configRecord = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'tv_screen_marketing_config' } }
    })

    let config = DEFAULT_TV_CONFIG
    if (configRecord?.value) {
      try {
        config = { ...DEFAULT_TV_CONFIG, ...JSON.parse(configRecord.value) }
      } catch (e) {
        // fallback
      }
    }

    if (config.lottery?.enabled === false) {
      return res.json({
        code: 200,
        message: 'TV Lottery is disabled in marketing config',
        data: null
      })
    }

    const minAmount = config.lottery?.triggerMinOrderAmount || 0
    if (typeof orderAmount === 'number' && orderAmount < minAmount) {
      return res.json({
        code: 200,
        message: `Order amount ${orderAmount} below trigger threshold ${minAmount}`,
        data: null
      })
    }

    const prizes = config.lottery?.prizes || DEFAULT_TV_CONFIG.lottery.prizes
    // Calculate weighted random
    const totalWeight = prizes.reduce((sum, p) => sum + (p.weight || 10), 0)
    let randomNum = Math.random() * totalWeight
    let chosenIndex = 0
    let chosenPrize = prizes[0]

    for (let i = 0; i < prizes.length; i++) {
      randomNum -= (prizes[i].weight || 10)
      if (randomNum <= 0) {
        chosenIndex = i
        chosenPrize = prizes[i]
        break
      }
    }

    // Broadcast lottery event to TV
    socketManager.emitTVLotteryTrigger(storeId, {
      orderId,
      orderNumber: orderNumber || '#Lucky',
      prizeName: chosenPrize.name,
      prizeCode: chosenPrize.code,
      prizeIndex: chosenIndex,
      customerPhone: customerPhone ? `${customerPhone.slice(0, 4)}****${customerPhone.slice(-3)}` : undefined
    })

    res.json({
      code: 200,
      message: 'Lottery triggered on TV display',
      data: {
        prizeName: chosenPrize.name,
        prizeCode: chosenPrize.code,
        prizeIndex: chosenIndex
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Trigger TV lottery error:', error)
    res.status(500).json({ code: 500, message: 'Failed to trigger TV lottery' })
  }
})

export { router as marketingRouter }