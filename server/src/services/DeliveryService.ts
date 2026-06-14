import prisma from '../config/database'

export type DeliveryPlatform = 'grabfood' | 'gofood' | 'shopee' | 'direct'
export type DeliveryStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled' | 'refunded'

export interface DeliveryOrder {
  id: string
  platform: DeliveryPlatform
  platformOrderId: string
  storeId: string
  items: any[]
  subtotal: number
  deliveryFee: number
  platformFee: number
  finalAmount: number
  customerName: string
  customerPhone: string
  deliveryAddress?: string
  status: DeliveryStatus
  estimatedReadyTime?: number
  createdAt: Date
}

// Get all delivery orders for a store
export async function getDeliveryOrders(storeId: string, filters?: {
  platform?: DeliveryPlatform
  status?: DeliveryStatus
  date?: Date
}) {
  const where: any = { storeId }

  if (filters?.platform) where.platform = filters.platform
  if (filters?.status) where.status = filters.status
  if (filters?.date) {
    const startOfDay = new Date(filters.date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.date)
    endOfDay.setHours(23, 59, 59, 999)
    where.createdAt = { gte: startOfDay, lte: endOfDay }
  }

  const orders = await prisma.config.findMany({
    where: {
      storeId,
      category: 'delivery_orders'
    }
  })

  return orders
    .map(o => JSON.parse(o.value))
    .filter(o => !filters?.platform || o.platform === filters.platform)
    .filter(o => !filters?.status || o.status === filters.status)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// Get single delivery order
export async function getDeliveryOrder(orderId: string) {
  const order = await prisma.config.findFirst({
    where: {
      id: orderId,
      category: 'delivery_orders'
    }
  })

  return order ? JSON.parse(order.value) : null
}

// Create delivery order (from platform webhook or manual)
export async function createDeliveryOrder(data: Omit<DeliveryOrder, 'id' | 'status' | 'createdAt'>) {
  const orderId = `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`

  const order: DeliveryOrder = {
    ...data,
    id: orderId,
    status: 'new',
    createdAt: new Date()
  }

  await prisma.config.create({
    data: {
      storeId: data.storeId,
      category: 'delivery_orders',
      key: orderId,
      value: JSON.stringify(order)
    }
  })

  return order
}

// Update delivery order status
export async function updateDeliveryStatus(orderId: string, status: DeliveryStatus, estimatedReadyTime?: number) {
  const order = await prisma.config.findFirst({
    where: {
      id: orderId,
      category: 'delivery_orders'
    }
  })

  if (!order) {
    throw new Error('Delivery order not found')
  }

  const orderData = JSON.parse(order.value)
  orderData.status = status
  if (estimatedReadyTime) {
    orderData.estimatedReadyTime = estimatedReadyTime
  }

  await prisma.config.update({
    where: { id: orderId },
    data: {
      key: orderId,
      value: JSON.stringify(orderData)
    }
  })

  return orderData
}

// Confirm delivery order
export async function confirmDeliveryOrder(orderId: string, estimatedReadyTime: number) {
  return updateDeliveryStatus(orderId, 'confirmed', estimatedReadyTime)
}

// Start preparing
export async function startPreparing(orderId: string) {
  return updateDeliveryStatus(orderId, 'preparing')
}

// Mark ready for pickup
export async function markReady(orderId: string) {
  return updateDeliveryStatus(orderId, 'ready')
}

// Cancel delivery order
export async function cancelDeliveryOrder(orderId: string, reason: string) {
  return updateDeliveryStatus(orderId, 'cancelled')
}

// Get delivery statistics
export async function getDeliveryStats(storeId: string, date: Date) {
  const orders = await getDeliveryOrders(storeId, { date })

  const summary = {
    total: orders.length,
    new: orders.filter(o => o.status === 'new').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => ['picked_up', 'delivered'].includes(o.status)).length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    totalRevenue: orders
      .filter(o => !['cancelled', 'refunded'].includes(o.status))
      .reduce((sum, o) => sum + o.finalAmount, 0),
    byPlatform: {
      grabfood: orders.filter(o => o.platform === 'grabfood').length,
      gofood: orders.filter(o => o.platform === 'gofood').length,
      shopee: orders.filter(o => o.platform === 'shopee').length,
      direct: orders.filter(o => o.platform === 'direct').length
    }
  }

  return summary
}

// Platform adapter interface (for future integration with actual platforms)
export interface PlatformAdapter {
  fetchOrders(): Promise<DeliveryOrder[]>
  confirmOrder(orderId: string): Promise<boolean>
  updateStatus(orderId: string, status: DeliveryStatus): Promise<boolean>
  syncMenu(products: any[]): Promise<boolean>
}

// Mock GrabFood adapter
export class GrabFoodAdapter implements PlatformAdapter {
  private apiKey: string
  private storeId: string

  constructor(apiKey: string, storeId: string) {
    this.apiKey = apiKey
    this.storeId = storeId
  }

  async fetchOrders(): Promise<DeliveryOrder[]> {
    // In production, this would call GrabFood API
    // For now, return empty array (mock)
    return []
  }

  async confirmOrder(orderId: string): Promise<boolean> {
    // In production, call GrabFood API to confirm
    return true
  }

  async updateStatus(orderId: string, status: DeliveryStatus): Promise<boolean> {
    // In production, call GrabFood API to update status
    return true
  }

  async syncMenu(products: any[]): Promise<boolean> {
    // In production, call GrabFood API to sync menu
    return true
  }
}

// Mock GoFood adapter
export class GoFoodAdapter implements PlatformAdapter {
  private apiKey: string
  private storeId: string

  constructor(apiKey: string, storeId: string) {
    this.apiKey = apiKey
    this.storeId = storeId
  }

  async fetchOrders(): Promise<DeliveryOrder[]> {
    return []
  }

  async confirmOrder(orderId: string): Promise<boolean> {
    return true
  }

  async updateStatus(orderId: string, status: DeliveryStatus): Promise<boolean> {
    return true
  }

  async syncMenu(products: any[]): Promise<boolean> {
    return true
  }
}

// Mock ShopeeFood adapter
export class ShopeeAdapter implements PlatformAdapter {
  private apiKey: string
  private storeId: string

  constructor(apiKey: string, storeId: string) {
    this.apiKey = apiKey
    this.storeId = storeId
  }

  async fetchOrders(): Promise<DeliveryOrder[]> {
    return []
  }

  async confirmOrder(orderId: string): Promise<boolean> {
    return true
  }

  async updateStatus(orderId: string, status: DeliveryStatus): Promise<boolean> {
    return true
  }

  async syncMenu(products: any[]): Promise<boolean> {
    return true
  }
}

// Unified order inbox - aggregates all platforms
export async function getUnifiedOrderInbox(storeId: string) {
  const [deliveryOrders, posOrders] = await Promise.all([
    getDeliveryOrders(storeId),
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // Last 2 hours
        },
        status: { in: ['pending', 'preparing', 'ready'] }
      }
    })
  ])

  // Transform POS orders to unified format
  const unifiedPosOrders = posOrders.map(o => ({
    id: `POS-${o.id}`,
    platform: 'direct' as DeliveryPlatform,
    platformOrderId: o.orderNumber,
    items: [],
    subtotal: o.totalAmount,
    deliveryFee: 0,
    platformFee: 0,
    finalAmount: o.finalAmount,
    customerName: 'Unknown',
    customerPhone: '',
    status: mapPosStatusToDelivery(o.status),
    createdAt: o.createdAt
  }))

  // Combine and sort by creation time
  const allOrders = [
    ...deliveryOrders.map(d => ({ ...d, type: 'delivery' as const })),
    ...unifiedPosOrders.map(p => ({ ...p, type: 'pos' as const }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    orders: allOrders,
    summary: {
      pending: allOrders.filter(o => o.status === 'new').length,
      preparing: allOrders.filter(o => o.status === 'preparing').length,
      ready: allOrders.filter(o => o.status === 'ready').length,
      totalRevenue: allOrders
        .filter(o => !['cancelled', 'refunded'].includes(o.status))
        .reduce((sum, o) => sum + o.finalAmount, 0)
    }
  }
}

function mapPosStatusToDelivery(status: string): DeliveryStatus {
  const mapping: Record<string, DeliveryStatus> = {
    pending: 'new',
    preparing: 'preparing',
    ready: 'ready',
    completed: 'delivered'
  }
  return mapping[status] || 'new'
}