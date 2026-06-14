import prisma from '../config/database'

export interface CreateInventoryCountData {
  storeId: string
  period: 'monthly' | 'quarterly' | 'annual'
  startDate: Date
  endDate: Date
  notes?: string
}

// Get inventory counts
export async function getInventoryCounts(storeId: string) {
  return prisma.inventoryCount.findMany({
    where: { storeId },
    include: {
      items: {
        include: {
          inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get single inventory count
export async function getInventoryCountById(countId: string) {
  return prisma.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      items: {
        include: {
          inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
        }
      }
    }
  })
}

// Create inventory count (initiate count)
export async function createInventoryCount(data: CreateInventoryCountData) {
  const inventoryItems = await prisma.inventory.findMany({
    where: { storeId: data.storeId },
    select: { id: true, currentStock: true }
  })

  return prisma.inventoryCount.create({
    data: {
      storeId: data.storeId,
      period: data.period,
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes,
      status: 'in_progress',
      items: {
        create: inventoryItems.map(item => ({
          inventoryId: item.id,
          systemQty: item.currentStock
        }))
      }
    },
    include: {
      items: {
        include: {
          inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
        }
      }
    }
  })
}

// Update count item (record actual count)
export async function updateCountItem(
  countItemId: string,
  countedQty: number,
  countedBy: string,
  note?: string
) {
  const item = await prisma.inventoryCountItem.findUnique({
    where: { id: countItemId },
    include: { inventoryCount: true }
  })

  if (!item) throw new Error('Count item not found')
  if (item.inventoryCount.status !== 'in_progress') throw new Error('Count is not in progress')

  const variance = countedQty - item.systemQty

  return prisma.inventoryCountItem.update({
    where: { id: countItemId },
    data: {
      countedQty,
      variance,
      countedAt: new Date(),
      countedBy,
      note
    }
  })
}

// Complete inventory count (apply adjustments)
export async function completeInventoryCount(countId: string, staffId: string) {
  const count = await prisma.inventoryCount.findUnique({
    where: { id: countId },
    include: { items: true }
  })

  if (!count) throw new Error('Inventory count not found')
  if (count.status !== 'in_progress') throw new Error('Count is not in progress')

  return prisma.$transaction(async (tx) => {
    await tx.inventoryCount.update({
      where: { id: countId },
      data: { status: 'completed' }
    })

    for (const item of count.items) {
      if (item.countedQty !== null && item.variance !== 0) {
        await tx.inventory.update({
          where: { id: item.inventoryId },
          data: { currentStock: item.countedQty }
        })

        if (item.variance! > 0) {
          await tx.stockInLog.create({
            data: {
              inventoryId: item.inventoryId,
              quantity: item.variance!,
              unitCost: 0,
              totalAmount: 0,
              note: `Inventory count: ${item.note || 'Adjustment'}`
            }
          })
        } else if (item.variance! < 0) {
          await tx.stockOutLog.create({
            data: {
              inventoryId: item.inventoryId,
              quantity: Math.abs(item.variance!),
              reason: 'adjust',
              note: `Inventory count: ${item.note || 'Adjustment'}`
            }
          })
        }
      }
    }

    return count
  })
}

// Cancel inventory count
export async function cancelInventoryCount(countId: string) {
  return prisma.inventoryCount.update({
    where: { id: countId },
    data: { status: 'cancelled' }
  })
}
