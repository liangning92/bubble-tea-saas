import prisma from '../config/database'
import { calculateProductCost } from './ProductService'

export interface PurchaseOrderFilter {
  storeId?: string
  supplierId?: string
  status?: string
  startDate?: Date
  endDate?: Date
}

// Generate PO number
function generatePONumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PO-${dateStr}-${random}`
}

// Get purchase orders
export async function getPurchaseOrders(filter: PurchaseOrderFilter) {
  const where: any = {}

  if (filter.storeId !== undefined) where.storeId = filter.storeId
  if (filter.supplierId) where.supplierId = filter.supplierId
  if (filter.status) where.status = filter.status
  if (filter.startDate || filter.endDate) {
    where.createdAt = {}
    if (filter.startDate) where.createdAt.gte = filter.startDate
    if (filter.endDate) where.createdAt.lte = filter.endDate
  }

  return prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      items: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get PO by ID
export async function getPurchaseOrderById(orderId: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: {
      supplier: true,
      items: true
    }
  })
}

// Create purchase order
export async function createPurchaseOrder(data: {
  storeId: string
  supplierId: string
  expectedDate?: Date
  note?: string
  items: { inventoryId: string; quantity: number; unitCost: number }[]
}) {
  if (!await prisma.supplier.findFirst({ where: { id: data.supplierId, storeId: data.storeId } })) {
    throw new PurchaseOrderError('Supplier does not belong to this store', 400)
  }
  for (const item of data.items) {
    if (!await prisma.inventory.findFirst({ where: { id: item.inventoryId, storeId: data.storeId } })) {
      throw new PurchaseOrderError('Inventory does not belong to this store', 400)
    }
  }
  // Calculate total
  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  )

  return prisma.purchaseOrder.create({
    data: {
      storeId: data.storeId,
      supplierId: data.supplierId,
      orderNumber: generatePONumber(),
      totalAmount,
      expectedDate: data.expectedDate,
      note: data.note,
      status: 'pending',
      items: {
        create: data.items.map(item => ({
          inventoryId: item.inventoryId,
          quantity: item.quantity,
          unitCost: item.unitCost
        }))
      }
    },
    include: {
      supplier: true,
      items: true
    }
  })
}

export class PurchaseOrderError extends Error {
  constructor(message: string, public statusCode = 409) { super(message) }
}

async function scopedOrder(tx: any, orderId: string, storeId?: string) {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: orderId, ...(storeId !== undefined ? { storeId } : {}) },
    include: { items: { orderBy: { inventoryId: 'asc' } } }
  })
  if (!order) throw new PurchaseOrderError('Purchase order not found', 404)
  return order
}

// Status changes cannot bypass receiving or reopen terminal orders.
export async function updatePurchaseOrderStatus(orderId: string, status: string, storeId?: string) {
  if (status !== 'approved') throw new PurchaseOrderError('Use receive or cancel to finish a purchase order', 400)
  return prisma.$transaction(async tx => {
    const order = await scopedOrder(tx, orderId, storeId)
    const changed = await tx.purchaseOrder.updateMany({
      where: { id: order.id, status: 'pending' }, data: { status: 'approved' }
    })
    if (!changed.count) throw new PurchaseOrderError('Only pending orders can be approved')
    return tx.purchaseOrder.findUnique({ where: { id: order.id } })
  })
}

// Claim the pending order and commit stock, cost, batches and logs together.
export async function receivePurchaseOrder(orderId: string, _staffId: string, storeId?: string) {
  try {
    return await prisma.$transaction(async tx => {
      const order = await scopedOrder(tx, orderId, storeId)
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id: order.id, status: { in: ['pending', 'approved'] } },
        data: { status: 'received', receivedDate: new Date() }
      })
      if (!claimed.count) throw new PurchaseOrderError('Purchase order is already received or cancelled')
      for (const item of order.items) {
        const inventory = await tx.inventory.findFirst({ where: { id: item.inventoryId, storeId: order.storeId } })
        if (!inventory) throw new PurchaseOrderError('Inventory does not belong to this store', 400)
        if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0) {
          throw new PurchaseOrderError('Invalid purchase order quantity or cost', 400)
        }
        const newStock = inventory.currentStock + item.quantity
        const newAvgCost = newStock > 0 ? Math.round((inventory.currentStock * Number(inventory.avgCost) + item.quantity * item.unitCost) / newStock) : item.unitCost
        if (!Number.isFinite(newStock) || !Number.isSafeInteger(newAvgCost)) throw new PurchaseOrderError('Invalid inventory balance', 400)
        const changed = await tx.inventory.updateMany({
          where: { id: inventory.id, storeId: order.storeId, currentStock: inventory.currentStock, avgCost: inventory.avgCost },
          data: { currentStock: { increment: item.quantity }, avgCost: newAvgCost }
        })
        if (!changed.count) throw new PurchaseOrderError('Inventory changed during receiving; retry this order')
        await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } })
        await tx.batch.create({ data: {
          inventoryId: item.inventoryId,
          batchNumber: `PO-${order.id}-${item.id}`,
          quantity: item.quantity, unitCost: item.unitCost, status: 'active'
        } })
        await tx.stockInLog.create({ data: {
          inventoryId: item.inventoryId, quantity: item.quantity, unitCost: item.unitCost,
          totalAmount: item.quantity * item.unitCost, supplierId: order.supplierId, note: `PO: ${order.orderNumber}`
        } })
      }
      const rows = await tx.bOMItem.findMany({
        where: { inventoryId: { in: order.items.map((item: any) => item.inventoryId) } }, select: { productId: true }
      })
      for (const productId of [...new Set(rows.map(row => row.productId))]) {
        const costPrice = await calculateProductCost(productId, tx)
        await tx.product.update({ where: { id: productId }, data: { costPrice } })
      }
      return tx.purchaseOrder.findUnique({ where: { id: order.id }, include: { items: true } })
    })
  } catch (error: any) {
    if (error.code === 'P2034' || error.code === 'P2028') throw new PurchaseOrderError('Receiving is busy; retry this order')
    throw error
  }
}

export async function cancelPurchaseOrder(orderId: string, reason: string, storeId?: string) {
  return prisma.$transaction(async tx => {
    const order = await scopedOrder(tx, orderId, storeId)
    const changed = await tx.purchaseOrder.updateMany({
      where: { id: order.id, status: { in: ['pending', 'approved'] } }, data: { status: 'cancelled', note: reason }
    })
    if (!changed.count) throw new PurchaseOrderError('Received or cancelled orders cannot be cancelled')
    return tx.purchaseOrder.findUnique({ where: { id: order.id } })
  })
}

// Get pending purchase orders (for reorder suggestions)
export async function getPendingPurchaseOrders(storeId: string) {
  return prisma.purchaseOrder.findMany({
    where: {
      storeId,
      status: { in: ['pending', 'approved'] }
    },
    include: {
      supplier: true,
      items: true
    }
  })
}