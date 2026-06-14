import prisma from '../config/database'

interface DateRange {
  startDate?: Date
  endDate?: Date
}

interface ChannelStats {
  channel: any
  orderCount: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  avgOrderValue: number
  commission: number
  netRevenue: number
}

interface CommissionSummary {
  channelId: string
  channelName: string
  channelCode: string
  icon: string
  commission: number
  orderCount: number
  grossRevenue: number
  commissionAmount: number
  netRevenue: number
}

// Get channel with statistics for a date range
export async function getChannelWithStats(channelId: string, dateRange?: DateRange): Promise<ChannelStats | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId }
  })

  if (!channel) return null

  const whereClause: any = { channelId }
  if (dateRange?.startDate) {
    whereClause.createdAt = { ...whereClause.createdAt, gte: dateRange.startDate }
  }
  if (dateRange?.endDate) {
    whereClause.createdAt = { ...whereClause.createdAt, lte: dateRange.endDate }
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    include: {
      items: true
    }
  })

  const orderCount = orders.length
  const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0)
  const totalCost = orders.reduce((sum, o) =>
    sum + o.items.reduce((itemSum, item) => itemSum + item.bomCost, 0), 0)
  const totalProfit = totalRevenue - totalCost
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0
  const commission = totalRevenue * channel.commission
  const netRevenue = totalRevenue - commission

  return {
    channel,
    orderCount,
    totalRevenue,
    totalCost,
    totalProfit,
    avgOrderValue,
    commission,
    netRevenue
  }
}

// Get orders for a specific channel
export async function getChannelOrders(channelId: string, params: {
  storeId?: string
  status?: string
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}) {
  const { storeId, status, startDate, endDate, page = 1, pageSize = 50 } = params

  const where: any = { channelId }

  if (storeId) where.storeId = storeId
  if (status) where.status = status
  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = startDate
    if (endDate) where.createdAt.lte = endDate
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        channel: true,
        member: true,
        items: {
          include: {
            product: true,
            spec: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.order.count({ where })
  ])

  return {
    list: orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
}

// Get all channels with statistics
export async function getAllChannelsWithStats(storeId: string, dateRange?: DateRange): Promise<ChannelStats[]> {
  const channels = await prisma.channel.findMany({
    where: { storeId },
    orderBy: { sortOrder: 'asc' }
  })

  const results: ChannelStats[] = []

  for (const channel of channels) {
    const stats = await getChannelWithStats(channel.id, dateRange)
    if (stats) {
      results.push(stats)
    }
  }

  return results
}

// Calculate commission summary for all channels
export async function getCommissionSummary(storeId: string, dateRange?: DateRange): Promise<CommissionSummary[]> {
  const channels = await prisma.channel.findMany({
    where: { storeId, commission: { gt: 0 } },
    orderBy: { sortOrder: 'asc' }
  })

  const summaries: CommissionSummary[] = []

  for (const channel of channels) {
    const stats = await getChannelWithStats(channel.id, dateRange)
    if (stats && stats.orderCount > 0) {
      summaries.push({
        channelId: channel.id,
        channelName: channel.name,
        channelCode: channel.code,
        icon: channel.icon || '',
        commission: channel.commission,
        orderCount: stats.orderCount,
        grossRevenue: stats.totalRevenue,
        commissionAmount: stats.commission,
        netRevenue: stats.netRevenue
      })
    }
  }

  return summaries
}

// Get channel price list with product details
export async function getChannelPriceList(channelId: string) {
  const prices = await prisma.productChannelPrice.findMany({
    where: { channelId },
    include: {
      product: {
        include: {
          specs: true,
          category: true
        }
      }
    }
  })

  return prices.map(p => ({
    id: p.id,
    productId: p.productId,
    productName: p.product.name,
    productCode: p.product.code,
    category: p.product.category?.name,
    basePrice: p.product.specs.find(s => s.isDefault)?.price || p.product.specs[0]?.price || 0,
    priceAdjustment: p.priceAdjustment,
    finalPrice: Math.round((p.product.specs.find(s => s.isDefault)?.price || 0) * p.priceAdjustment),
    enabled: p.enabled
  }))
}

// Bulk update channel prices
export async function bulkUpdateChannelPrices(channelId: string, updates: {
  productId: string
  priceAdjustment: number
  enabled: boolean
}[]) {
  const results = []

  for (const update of updates) {
    const result = await prisma.productChannelPrice.upsert({
      where: {
        productId_channelId: {
          productId: update.productId,
          channelId
        }
      },
      create: {
        productId: update.productId,
        channelId,
        priceAdjustment: update.priceAdjustment,
        enabled: update.enabled
      },
      update: {
        priceAdjustment: update.priceAdjustment,
        enabled: update.enabled
      }
    })
    results.push(result)
  }

  return results
}

// Apply percentage adjustment to all products in a channel
export async function applyChannelPriceAdjustment(channelId: string, adjustmentPercent: number, enabled: boolean = true) {
  const products = await prisma.product.findMany({
    where: { status: 'active' },
    include: { specs: true }
  })

  const adjustment = adjustmentPercent / 100

  const results = []

  for (const product of products) {
    const defaultSpec = product.specs?.find((s: any) => s.isDefault) || product.specs?.[0]
    if (!defaultSpec) continue

    const basePrice = defaultSpec.price || 0
    const newAdjustment = 1 + adjustment

    const result = await prisma.productChannelPrice.upsert({
      where: {
        productId_channelId: {
          productId: product.id,
          channelId
        }
      },
      create: {
        productId: product.id,
        channelId,
        priceAdjustment: newAdjustment,
        enabled
      },
      update: {
        priceAdjustment: newAdjustment,
        enabled
      }
    })
    results.push(result)
  }

  return results
}
