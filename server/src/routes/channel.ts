import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import prisma from '../config/database'

const router = Router()

// Validation schemas
const createChannelSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  code: z.string().min(1),
  icon: z.string().optional(),
  commission: z.number().min(0).max(1).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  sortOrder: z.number().int().default(0),
  availableDays: z.string().default('1,2,3,4,5,6,7'),
  availableHours: z.string().default('00:00-23:59'),
  minOrderAmount: z.number().int().default(0),
  dailyOrderLimit: z.number().int().default(0)
})

const updateChannelSchema = createChannelSchema.partial()

// 默认渠道配置
const DEFAULT_CHANNELS = [
  { name: '堂食', code: 'DINE_IN', icon: '🍵', commission: 0, sortOrder: 1, availableDays: '1,2,3,4,5,6,7', availableHours: '08:00-22:00', minOrderAmount: 0, dailyOrderLimit: 0 },
  { name: 'POS收银', code: 'POS', icon: '💳', commission: 0, sortOrder: 2, availableDays: '1,2,3,4,5,6,7', availableHours: '00:00-23:59', minOrderAmount: 0, dailyOrderLimit: 0 },
  { name: 'GoFood', code: 'GOFOOD', icon: '🟢', commission: 0.2, sortOrder: 3, availableDays: '1,2,3,4,5,6,7', availableHours: '09:00-21:00', minOrderAmount: 25000, dailyOrderLimit: 50 },
  { name: 'GrabFood', code: 'GRAB', icon: '🟡', commission: 0.2, sortOrder: 4, availableDays: '1,2,3,4,5,6,7', availableHours: '09:00-21:00', minOrderAmount: 25000, dailyOrderLimit: 50 },
  { name: 'ShopeeFood', code: 'SHOPEE', icon: '🟠', commission: 0.18, sortOrder: 5, availableDays: '1,2,3,4,5,6,7', availableHours: '09:00-21:00', minOrderAmount: 20000, dailyOrderLimit: 30 },
]

// GET /api/channels - 获取渠道列表
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query
    const targetStoreId = storeId as string || req.user!.storeId

    let channels = await prisma.channel.findMany({
      where: { storeId: targetStoreId },
      orderBy: { sortOrder: 'asc' }
    })

    // 如果没有渠道，创建默认渠道
    if (channels.length === 0) {
      channels = await prisma.channel.createMany({
        data: DEFAULT_CHANNELS.map(ch => ({
          ...ch,
          storeId: targetStoreId,
          status: 'active'
        }))
      }).then(() => prisma.channel.findMany({
        where: { storeId: targetStoreId },
        orderBy: { sortOrder: 'asc' }
      }))
    }

    res.json({
      code: 200,
      data: { list: channels },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channels error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channels' })
  }
})

// GET /api/channels/:id - 获取单个渠道
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const channel = await prisma.channel.findUnique({
      where: { id }
    })

    if (!channel) {
      return res.status(404).json({ code: 404, message: 'Channel not found' })
    }

    res.json({
      code: 200,
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel' })
  }
})

// POST /api/channels - 创建渠道
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createChannelSchema), async (req: AuthRequest, res) => {
  try {
    const { storeId, name, code, icon, commission, status, sortOrder, availableDays, availableHours, minOrderAmount, dailyOrderLimit } = req.body

    // 检查是否已存在
    const existing = await prisma.channel.findFirst({
      where: { storeId, code }
    })

    if (existing) {
      return res.status(400).json({ code: 400, message: 'Channel code already exists' })
    }

    const channel = await prisma.channel.create({
      data: { storeId, name, code, icon, commission, status, sortOrder, availableDays, availableHours, minOrderAmount, dailyOrderLimit }
    })

    res.status(201).json({
      code: 201,
      message: 'Channel created',
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Create channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create channel' })
  }
})

// PUT /api/channels/:id - 更新渠道
router.put('/:id', authenticate, authorize('admin', 'manager'), validateBody(updateChannelSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const updateData: any = {}
    const fields = ['name', 'code', 'icon', 'commission', 'status', 'sortOrder', 'availableDays', 'availableHours', 'minOrderAmount', 'dailyOrderLimit']
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    })

    const channel = await prisma.channel.update({
      where: { id },
      data: updateData
    })

    res.json({
      code: 200,
      message: 'Channel updated',
      data: channel,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update channel' })
  }
})

// DELETE /api/channels/:id - 删除渠道
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    // 检查是否有订单使用此渠道
    const orderCount = await prisma.order.count({
      where: { channelId: id }
    })

    if (orderCount > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Cannot delete channel with existing orders'
      })
    }

    await prisma.channel.delete({ where: { id } })

    res.json({
      code: 200,
      message: 'Channel deleted',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Delete channel error:', error)
    res.status(500).json({ code: 500, message: 'Failed to delete channel' })
  }
})

// GET /api/channels/:id/products - 获取渠道的商品价格
router.get('/:id/products', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const prices = await prisma.productChannelPrice.findMany({
      where: { channelId: id },
      include: { product: true }
    })

    res.json({
      code: 200,
      data: { list: prices },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel products error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel products' })
  }
})

// PUT /api/channels/:id/products/:productId - 设置商品在渠道的价格
router.put('/:id/products/:productId', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id, productId } = req.params
    const { priceAdjustment, enabled } = req.body

    const price = await prisma.productChannelPrice.upsert({
      where: {
        productId_channelId: { productId, channelId: id }
      },
      create: { productId, channelId: id, priceAdjustment, enabled },
      update: { priceAdjustment, enabled }
    })

    res.json({
      code: 200,
      message: 'Product channel price updated',
      data: price,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update product channel price error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update product channel price' })
  }
})

// GET /api/channels/:id/products/all - 获取渠道所有商品的定价
router.get('/:id/products/all', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const prices = await prisma.productChannelPrice.findMany({
      where: { channelId: id },
      include: {
        product: {
          include: {
            specs: true,
            category: true
          }
        }
      }
    })

    const result = prices.map(p => ({
      id: p.id,
      productId: p.productId,
      productName: p.product.name,
      productCode: p.product.code,
      category: p.product.category?.name,
      basePrice: p.product.specs?.find((s: any) => s.isDefault)?.price || p.product.specs?.[0]?.price || 0,
      priceAdjustment: p.priceAdjustment,
      finalPrice: Math.round((p.product.specs?.find((s: any) => s.isDefault)?.price || 0) * p.priceAdjustment),
      enabled: p.enabled
    }))

    res.json({
      code: 200,
      data: { list: result },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel products error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel products' })
  }
})

// PUT /api/channels/:id/products/bulk - 批量更新渠道商品价格
router.put('/:id/products/bulk', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { adjustments } = req.body // [{productId, priceAdjustment, enabled}]

    // Validate adjustments is an array
    if (!Array.isArray(adjustments)) {
      return res.status(400).json({ code: 400, message: 'adjustments must be an array' })
    }

    // Limit array size to prevent DoS
    if (adjustments.length > 100) {
      return res.status(400).json({ code: 400, message: 'Maximum100 adjustments allowed per request' })
    }

    // Validate each adjustment
    for (const adj of adjustments) {
      if (!adj.productId || typeof adj.priceAdjustment !== 'number' || typeof adj.enabled !== 'boolean') {
        return res.status(400).json({ code: 400, message: 'Invalid adjustment format. Required: {productId, priceAdjustment, enabled}' })
      }
    }

    const results = []
    for (const adj of adjustments) {
      const result = await prisma.productChannelPrice.upsert({
        where: {
          productId_channelId: { productId: adj.productId, channelId: id }
        },
        create: { productId: adj.productId, channelId: id, priceAdjustment: adj.priceAdjustment, enabled: adj.enabled },
        update: { priceAdjustment: adj.priceAdjustment, enabled: adj.enabled }
      })
      results.push(result)
    }

    res.json({
      code: 200,
      message: 'Bulk update successful',
      data: { count: results.length },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Bulk update error:', error)
    res.status(500).json({ code: 500, message: 'Failed to bulk update' })
  }
})

// PUT /api/channels/:id/products/adjust - 批量调整渠道商品价格百分比
router.put('/:id/products/adjust', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { percent, enabled } = req.body // percent: 10 = +10%, -10 = -10%

    // Validate percent is a reasonable number (-100 to 100)
    if (typeof percent !== 'number' || percent < -100 || percent > 100) {
      return res.status(400).json({ code: 400, message: 'percent must be between -100 and 100' })
    }

    const products = await prisma.product.findMany({
      where: { status: 'active' },
      include: { specs: true }
    })

    const results = []
    for (const product of products) {
      const defaultSpec = product.specs?.find((s: any) => s.isDefault) || product.specs?.[0]
      if (!defaultSpec) continue

      const basePrice = defaultSpec.price || 0
      const adjustment = (100 + percent) / 100

      const result = await prisma.productChannelPrice.upsert({
        where: {
          productId_channelId: { productId: product.id, channelId: id }
        },
        create: { productId: product.id, channelId: id, priceAdjustment: adjustment, enabled: enabled ?? true },
        update: { priceAdjustment: adjustment, enabled: enabled ?? true }
      })
      results.push(result)
    }

    res.json({
      code: 200,
      message: 'Price adjustment applied',
      data: { count: results.length, adjustment: `${percent}%` },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Price adjust error:', error)
    res.status(500).json({ code: 500, message: 'Failed to adjust prices' })
  }
})

// GET /api/channels/:id/orders - 获取渠道的订单
router.get('/:id/orders', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status, startDate, endDate, page, pageSize } = req.query

    const where: any = { channelId: id }
    if (status) where.status = status as string
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    const pageNum = parseInt(page as string) || 1
    const size = parseInt(pageSize as string) || 50

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { channel: true, member: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size
      }),
      prisma.order.count({ where })
    ])

    res.json({
      code: 200,
      data: { list: orders, total, page: pageNum, pageSize: size, totalPages: Math.ceil(total / size) },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel orders error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel orders' })
  }
})

export { router as channelRouter }