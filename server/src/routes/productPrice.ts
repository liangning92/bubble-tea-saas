import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'

const router = Router()

// GET /api/products/:productId/price - 获取商品在指定渠道的价格
router.get('/:productId/price', authenticate, async (req: AuthRequest, res) => {
  try {
    const { productId } = req.params
    const { channelId, specId } = req.query

    // 获取商品的基础规格价格
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        specs: true
      }
    })

    if (!product) {
      return res.status(404).json({ code: 404, message: 'Product not found' })
    }

    // 基础价格
    let basePrice = 0
    if (specId) {
      const spec = product.specs.find(s => s.id === specId)
      basePrice = spec?.price || 0
    } else {
      // 默认使用默认规格的价格
      const defaultSpec = product.specs.find(s => s.isDefault) || product.specs[0]
      basePrice = defaultSpec?.price || 0
    }

    // 如果有渠道，检查是否有自定义价格
    let finalPrice = basePrice
    let priceAdjustment = 1.0
    let channelName = ''

    if (channelId && typeof channelId === 'string') {
      const channelPrice = await prisma.productChannelPrice.findUnique({
        where: {
          productId_channelId: { productId, channelId }
        }
      })

      if (channelPrice && channelPrice.enabled) {
        priceAdjustment = channelPrice.priceAdjustment
        finalPrice = Math.round(basePrice * priceAdjustment)
        channelName = (await prisma.channel.findUnique({ where: { id: channelId } }))?.name || ''
      } else {
        // 没有自定义价格，检查渠道的默认佣金
        const channel = await prisma.channel.findUnique({
          where: { id: channelId }
        })
        if (channel && channel.commission > 0) {
          // 外卖平台通常需要加价来覆盖佣金
          // 默认加价幅度 = 佣金 / (1 - 佣金)
          priceAdjustment = 1 + (channel.commission * 1.2) // 加20%的buffer
          finalPrice = Math.round(basePrice * priceAdjustment)
          channelName = channel.name
        }
      }
    }

    res.json({
      code: 200,
      data: {
        productId,
        channelId: channelId || null,
        channelName,
        basePrice,
        priceAdjustment,
        finalPrice,
        specId: specId || product.specs[0]?.id || null
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product price error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product price' })
  }
})

// GET /api/products/:productId/channels - 获取商品在所有渠道的价格
router.get('/:productId/channels', authenticate, async (req: AuthRequest, res) => {
  try {
    const { productId } = req.params

    // 获取商品和所有渠道
    const [product, channels] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        include: { specs: true }
      }),
      prisma.channel.findMany({
        orderBy: { sortOrder: 'asc' }
      })
    ])

    if (!product) {
      return res.status(404).json({ code: 404, message: 'Product not found' })
    }

    // 获取商品在所有渠道的自定义价格
    const customPrices = await prisma.productChannelPrice.findMany({
      where: { productId }
    })

    const basePrice = product.specs.find(s => s.isDefault)?.price || product.specs[0]?.price || 0

    // 构建每个渠道的价格信息
    const channelPrices = channels.map(channel => {
      const customPrice = customPrices.find(cp => cp.channelId === channel.id)
      let priceAdjustment = customPrice?.priceAdjustment || 1.0
      let enabled = customPrice?.enabled ?? (channel.commission > 0)
      let finalPrice = Math.round(basePrice * priceAdjustment)

      // 如果是外卖平台且没有自定义价格，应用默认加价
      if (!customPrice && channel.commission > 0) {
        priceAdjustment = 1 + (channel.commission * 1.2)
        finalPrice = Math.round(basePrice * priceAdjustment)
      }

      return {
        channelId: channel.id,
        channelName: channel.name,
        channelCode: channel.code,
        icon: channel.icon,
        commission: channel.commission,
        basePrice,
        priceAdjustment,
        enabled,
        finalPrice
      }
    })

    res.json({
      code: 200,
      data: {
        productId,
        productName: product.name,
        basePrice,
        channelPrices
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get product channels error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get product channels' })
  }
})

// PUT /api/products/:productId/channels/:channelId - 设置商品在渠道的价格
router.put('/:productId/channels/:channelId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { productId, channelId } = req.params
    const { priceAdjustment, enabled } = req.body

    const productChannelPrice = await prisma.productChannelPrice.upsert({
      where: {
        productId_channelId: { productId, channelId }
      },
      create: {
        productId,
        channelId,
        priceAdjustment: priceAdjustment || 1.0,
        enabled: enabled !== false
      },
      update: {
        priceAdjustment: priceAdjustment || 1.0,
        enabled: enabled !== false
      }
    })

    res.json({
      code: 200,
      message: 'Product channel price updated',
      data: productChannelPrice,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Update product channel price error:', error)
    res.status(500).json({ code: 500, message: 'Failed to update product channel price' })
  }
})

export { router as productPriceRouter }