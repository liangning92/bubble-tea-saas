import prisma from '../config/database'
import { recalculateProductCost } from './ProductService'

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

  if (filter.storeId) where.storeId = filter.storeId
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

// Update PO status
export async function updatePurchaseOrderStatus(orderId: string, status: string) {
  const updateData: any = { status }

  if (status === 'received') {
    updateData.receivedDate = new Date()
  }

  return prisma.purchaseOrder.update({
    where: { id: orderId },
    data: updateData
  })
}

// Receive purchase order (update inventory + create batch)
export async function receivePurchaseOrder(orderId: string, staffId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: { items: true }
  })

  if (!order) throw new Error('Purchase order not found')
  if (order.status === 'cancelled') throw new Error('Cannot receive cancelled order')

  return prisma.$transaction(async (tx) => {
    // Update PO status
    await tx.purchaseOrder.update({
      where: { id: orderId },
      data: {
        status: 'received',
        receivedDate: new Date()
      }
    })

    // Process each item
    for (const item of order.items) {
      // Update inventory
      const inventory = await tx.inventory.findUnique({
        where: { id: item.inventoryId }
      })

      if (inventory) {
        // Calculate new average cost
        const totalCurrentValue = inventory.currentStock * inventory.avgCost
        const totalNewValue = item.quantity * item.unitCost
        const newStock = inventory.currentStock + item.quantity
        const newAvgCost = newStock > 0
          ? Math.round((totalCurrentValue + totalNewValue) / newStock)
          : item.unitCost // 如果原库存为0，使用新价格

        await tx.inventory.update({
          where: { id: item.inventoryId },
          data: {
            currentStock: { increment: item.quantity },
            avgCost: newAvgCost
          }
        })

        // Create batch
        await tx.batch.create({
          data: {
            inventoryId: item.inventoryId,
            batchNumber: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
            quantity: item.quantity,
            unitCost: item.unitCost,
            status: 'active'
          }
        })

        // Create stock in log
        await tx.stockInLog.create({
          data: {
            inventoryId: item.inventoryId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalAmount: item.quantity * item.unitCost,
            supplierId: order.supplierId,
            note: `PO: ${order.orderNumber}`
          }
        })
      }
    }

    // Recalculate cost for all products that use this inventory
    const affectedInventoryIds = order.items.map(i => i.inventoryId)
    const bomItems = await tx.bOMItem.findMany({
      where: { inventoryId: { in: affectedInventoryIds } },
      select: { productId: true }
    })
    const productIds = [...new Set(bomItems.map(b => b.productId))]
    for (const pid of productIds) {
      await recalculateProductCost(pid)
    }

    return order
  })
}

// Cancel purchase order
export async function cancelPurchaseOrder(orderId: string, reason: string) {
  return prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      status: 'cancelled',
      note: reason
    }
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