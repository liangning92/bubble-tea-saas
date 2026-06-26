import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'

const router = Router()

// Validation schemas
const createMemberSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1).max(50),
  phone: z.string().min(10).max(15),
  referredByPhone: z.string().optional()
})

const updateMemberSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  level: z.string().optional(),
  points: z.number().int().optional()
})

const redeemPointsSchema = z.object({
  points: z.number().int().positive()
})

// GET /api/members
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, level, search } = req.query
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    if (level) where.level = level as string
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } }
      ]
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        include: {
          _count: { select: { orders: true, pointLogs: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.member.count({ where })
    ])

    res.json({
      code: 200,
      data: {
        list: members.map(m => ({
          ...m,
          orderCount: m._count.orders,
          _count: undefined
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get members error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get members' })
  }
})

// GET /api/members/barcode/:barcode - Get member by barcode/card number
router.get('/barcode/:barcode', authenticate, async (req: AuthRequest, res) => {
  try {
    const { barcode } = req.params
    const storeId = req.query.storeId as string || req.user!.storeId

    // Look up member by phone (assuming phone is used as member card number)
    // Or by memberCard field if it exists
    const member = await prisma.member.findFirst({
      where: {
        storeId,
        OR: [
          { phone: barcode },
          { id: barcode }
        ]
      }
    })

    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    res.json({
      code: 200,
      data: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        level: member.level,
        points: member.points
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member by barcode error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member by barcode' })
  }
})

// GET /api/members/:id
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { type, limit } = req.query

    // Build pointLogs where clause
    const pointLogsWhere: any = {}
    if (type) pointLogsWhere.type = type as string

    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        pointLogs: {
          where: pointLogsWhere,
          orderBy: { createdAt: 'desc' },
          take: limit ? parseInt(limit as string) : 50
        }
      }
    })

    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    res.json({
      code: 200,
      data: member,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member' })
  }
})

// GET /api/members/phone/:phone
router.get('/phone/:phone', authenticate, async (req: AuthRequest, res) => {
  try {
    const { phone } = req.params

    const member = await prisma.member.findUnique({
      where: { phone },
      include: {
        _count: { select: { orders: true } }
      }
    })

    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    res.json({
      code: 200,
      data: {
        ...member,
        orderCount: member._count.orders,
        _count: undefined
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member by phone error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member' })
  }
})

// 生成6位随机推荐码
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// POST /api/members
router.post('/', authenticate, validateBody(createMemberSchema), async (req: AuthRequest, res) => {
  try {
    const { storeId, name, phone, referredByPhone } = req.body

    // Check if phone exists
    const existing = await prisma.member.findUnique({ where: { phone } })
    if (existing) {
      return res.status(400).json({ code: 400, message: 'Phone number already registered' })
    }

    // 自动生成推荐码
    const referralCode = generateReferralCode()

    // 如果有推荐人手机号，找到推荐人
    let referredById = null
    if (referredByPhone) {
      const referrer = await prisma.member.findUnique({ where: { phone: referredByPhone } })
      referredById = referrer?.id || null
    }

    const member = await prisma.member.create({
      data: {
        storeId,
        name,
        phone,
        referralCode,
        referredBy: referredById
      }
    })

    // Create welcome point log
    await prisma.pointLog.create({
      data: {
        memberId: member.id,
        type: 'earn',
        points: 100, // Welcome bonus
        note: 'Welcome bonus'
      }
    })

    await prisma.member.update({
      where: { id: member.id },
      data: { points: 100 }
    })

    // 如果有推荐人，给推荐人奖励
    if (referredById) {
      await prisma.pointLog.create({
        data: {
          memberId: referredById,
          type: 'earn',
          points: 500, // 推荐奖励
          note: `推荐奖励: ${name}`
        }
      })
      await prisma.member.update({
        where: { id: referredById },
        data: { points: { increment: 500 } }
      })
    }

    res.status(201).json({
      code: 201,
      message: 'Member created',
      data: {
        ...member,
        points: 100,
        welcomePoints: 100,
        referralCode: referralCode,
        referredByReward: referredById ? 500 : null
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create member error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create member' })
  }
})

// PUT /api/members/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, level, points } = req.body

    const member = await prisma.member.update({
      where: { id },
      data: { name, level, ...(points !== undefined && { points }) }
    })

    res.json({
      code: 200,
      message: 'Member updated',
      data: member,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update member error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update member' })
  }
})

// DELETE /api/members/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    await prisma.member.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Member deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete member error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete member' })
  }
})

// POST /api/members/:id/redeem
router.post('/:id/redeem', authenticate, validateBody(redeemPointsSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { points } = req.body

    const member = await prisma.member.findUnique({ where: { id } })
    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    if (member.points < points) {
      return res.status(400).json({ code: 400, message: 'Insufficient points' })
    }

    await prisma.member.update({
      where: { id },
      data: { points: { decrement: points } }
    })

    await prisma.pointLog.create({
      data: {
        memberId: id,
        type: 'redeem',
        points: -points,
        note: `Redeemed ${points} points`
      }
    })

    res.json({
      code: 200,
      message: 'Points redeemed',
      data: { remainingPoints: member.points - points },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Redeem points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to redeem points' })
  }
})

// GET /api/members/:id/points-history
router.get('/:id/points-history', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const logs = await prisma.pointLog.findMany({
      where: { memberId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    res.json({
      code: 200,
      data: logs,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get points history error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get points history' })
  }
})

// POST /api/members/:id/adjust-points
router.post('/:id/adjust-points', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { points, note } = req.body

    const member = await prisma.member.findUnique({ where: { id } })
    if (!member) {
      return res.status(404).json({ code: 404, message: 'Member not found' })
    }

    const newPoints = Math.max(0, member.points + points)

    await prisma.member.update({
      where: { id },
      data: { points: newPoints }
    })

    await prisma.pointLog.create({
      data: {
        memberId: id,
        type: 'adjust',
        points,
        note: note || 'Manual adjustment'
      }
    })

    res.json({
      code: 200,
      message: 'Points adjusted',
      data: { newPoints },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Adjust points error:', error)
    res.status(500).json({ code: 500, message: 'Failed to adjust points' })
  }
})

// GET /api/members/stats/summary
router.get('/stats/summary', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string

    const [totalMembers, byLevel, recentActivity] = await Promise.all([
      prisma.member.count({ where }),
      prisma.member.groupBy({
        by: ['level'],
        where,
        _count: { id: true }
      }),
      prisma.member.count({
        where: {
          ...where,
          lastVisit: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ])

    res.json({
      code: 200,
      data: {
        totalMembers,
        activeLast30Days: recentActivity,
        byLevel: byLevel.map(l => ({ level: l.level, count: l._count.id })),
        newThisMonth: await prisma.member.count({
          where: {
            ...where,
            createdAt: { gte: new Date(new Date().setDate(1)) }
          }
        })
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get member stats error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get member stats' })
  }
})

export { router as memberRouter }