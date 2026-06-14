import prisma from '../config/database'

// ============================================
// 原料分类类型
// ============================================
export const INVENTORY_TYPES = {
  RAW_MATERIAL: 'raw_material',       // 原料(毛料) - 直接采购使用
  SEMI_FINISHED: 'semi_finished',       // 加工原料(半成品) - 需要加工
  FINISHED_GOODS: 'finished_goods'     // 成品 - 直接销售
}

export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  [INVENTORY_TYPES.RAW_MATERIAL]: '原料(毛料)',
  [INVENTORY_TYPES.SEMI_FINISHED]: '加工原料(半成品)',
  [INVENTORY_TYPES.FINISHED_GOODS]: '成品'
}

export const INVENTORY_CATEGORIES = {
  TEA: '茶叶',
  MILK: '奶类',
  SUGAR: '糖类',
  TOPPING: '小料',
  SYRUP: '调味糖浆',
  SUPPLIES: '耗材',
  OTHER: '其他'
}

// ============================================
// 获取原料列表（带分类筛选）
// ============================================
export async function getInventoryList(storeId: string, type?: string) {
  const where: any = { storeId }
  if (type) where.type = type

  return prisma.inventory.findMany({
    where,
    orderBy: [
      { category: 'asc' },
      { name: 'asc' }
    ]
  })
}

// ============================================
// 获取单个原料详情（含批次）
// ============================================
export async function getInventoryDetail(id: string) {
  return prisma.inventory.findUnique({
    where: { id },
    include: {
      batches: {
        where: { status: 'active' },
        orderBy: { expiryDate: 'asc' }
      }
    }
  })
}

// ============================================
// 创建原料
// ============================================
export async function createInventory(data: {
  storeId: string
  name: string
  category: string
  type?: string
  unit: string
  avgCost?: number
  concentrateRatio?: number
  safetyStock?: number
  minStock?: number
  maxStock?: number
  shelfLife?: number
  processRecipeId?: string
}) {
  return prisma.inventory.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      category: data.category,
      type: data.type || 'raw_material',
      unit: data.unit,
      avgCost: data.avgCost || 0,
      concentrateRatio: data.concentrateRatio || 1,
      safetyStock: data.safetyStock || 0,
      minStock: data.minStock || 0,
      maxStock: data.maxStock || 0,
      shelfLife: data.shelfLife || 0,
      processRecipeId: data.processRecipeId || null
    }
  })
}

// ============================================
// 更新原料
// ============================================
export async function updateInventory(id: string, data: Partial<{
  name: string
  category: string
  type: string
  unit: string
  avgCost: number
  concentrateRatio: number
  safetyStock: number
  minStock: number
  maxStock: number
  shelfLife: number
}>) {
  return prisma.inventory.update({
    where: { id },
    data
  })
}

// ============================================
// 库存预警检查
// ============================================
export async function checkLowStockAlerts(storeId: string) {
  const inventory = await prisma.inventory.findMany({
    where: { storeId }
  })

  return inventory.filter(inv => {
    if (inv.safetyStock > 0 && inv.currentStock <= inv.safetyStock) {
      return true
    }
    if (inv.minStock > 0 && inv.currentStock <= inv.minStock) {
      return true
    }
    return false
  }).map(inv => ({
    id: inv.id,
    name: inv.name,
    category: inv.category,
    type: inv.type,
    unit: inv.unit,
    currentStock: inv.currentStock,
    safetyStock: inv.safetyStock,
    minStock: inv.minStock,
    avgCost: inv.avgCost
  }))
}

// ============================================
// 过期预警检查
// ============================================
export async function checkExpiryAlerts(storeId: string, daysAhead: number = 7) {
  const now = new Date()
  const futureDate = new Date()
  futureDate.setDate(now.getDate() + daysAhead)

  const batches = await prisma.batch.findMany({
    where: {
      inventory: { storeId },
      status: 'active',
      expiryDate: {
        lte: futureDate,
        gte: now
      }
    },
    include: {
      inventory: { select: { id: true, name: true, unit: true } }
    },
    orderBy: { expiryDate: 'asc' }
  })

  return batches.map(batch => ({
    id: batch.id,
    batchNumber: batch.batchNumber,
    inventoryId: batch.inventoryId,
    inventoryName: batch.inventory.name,
    quantity: batch.quantity,
    unit: batch.inventory.unit,
    expiryDate: batch.expiryDate,
    daysUntilExpiry: Math.ceil((new Date(batch.expiryDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }))
}

// ============================================
// 计算补货建议
// ============================================
export async function calculateRestockSuggestions(storeId: string, daysAhead: number = 7) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: 'completed',
      createdAt: { gte: startDate }
    },
    include: { items: true }
  })

  if (orders.length === 0) return []

  const productSales: Record<string, { productId: string; quantity: number }> = {}
  for (const order of orders) {
    for (const item of order.items) {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { productId: item.productId, quantity: 0 }
      }
      productSales[item.productId].quantity += item.quantity
    }
  }

  const materialUsage: Record<string, { inventoryId: string; name: string; unit: string; dailyUsage: number }> = {}

  for (const sale of Object.values(productSales)) {
    const bomItems = await prisma.bOMItem.findMany({
      where: { productId: sale.productId },
      include: { inventory: true }
    })

    const dailyQty = sale.quantity / 30

    for (const bom of bomItems) {
      const inv = bom.inventory
      if (!inv) continue

      const ratio = inv.concentrateRatio || 1
      const safeRatio = ratio === 0 ? 1 : ratio
      const itemUnit = bom.unit || inv.unit || '个'
      const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit)

      let usagePerProduct = bom.quantity * dailyQty
      if (!isPerPiece) {
        usagePerProduct = usagePerProduct / safeRatio
      }

      if (!materialUsage[inv.id]) {
        materialUsage[inv.id] = {
          inventoryId: inv.id,
          name: inv.name,
          unit: inv.unit,
          dailyUsage: 0
        }
      }

      materialUsage[inv.id].dailyUsage += usagePerProduct
    }
  }

  const suggestions = []
  for (const usage of Object.values(materialUsage)) {
    const inv = await prisma.inventory.findUnique({ where: { id: usage.inventoryId } })
    if (!inv) continue

    const neededQty = usage.dailyUsage * daysAhead
    const currentStock = inv.currentStock

    if (currentStock < neededQty) {
      const suggestQty = Math.ceil(neededQty - currentStock)
      suggestions.push({
        inventoryId: inv.id,
        name: inv.name,
        category: inv.category,
        unit: inv.unit,
        currentStock: Math.round(currentStock * 100) / 100,
        dailyUsage: Math.round(usage.dailyUsage * 100) / 100,
        suggestQty,
        suggestCost: suggestQty * (inv.avgCost || 0)
      })
    }
  }

  return suggestions.sort((a, b) => b.suggestCost - a.suggestCost)
}

// ============================================
// 执行加工配方
// ============================================
export async function executeProcessing(
  recipeId: string,
  staffId: string,
  multiplier: number = 1,
  note?: string
) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: {
      items: { include: { inventory: true } },
      store: { select: { id: true } },
      outputInventory: true  // 产出半成品库存
    }
  })

  if (!recipe) throw new Error('Recipe not found')
  if (!recipe.outputInventory) throw new Error('Recipe has no output inventory configured')

  const inputItems: any[] = []
  let totalInputCost = 0

  // 计算投入成本
  for (const input of recipe.items.filter(i => i.type === 'input')) {
    const inv = input.inventory
    if (!inv) continue
    const deductQty = input.quantity * multiplier
    const ratio = inv.concentrateRatio || 1
    const safeRatio = ratio === 0 ? 1 : ratio
    const itemUnit = (inv.unit || '个').toLowerCase()
    const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit)

    let unitCost = inv.avgCost || 0
    if (!isPerPiece) {
      // kg/L：先 ÷1000 转换为 g/ml，再 ÷concentrateRatio
      unitCost = unitCost / 1000 / safeRatio
    }
    // 个/件等：直接使用，不需要转换

    const cost = deductQty * unitCost
    totalInputCost += cost

    inputItems.push({
      inventoryId: inv.id,
      name: inv.name,
      unit: itemUnit,
      quantity: deductQty,
      unitCost: Math.round(unitCost),
      cost: Math.round(cost)
    })
  }

  // 计算产出总量
  let totalOutputQty = 0
  for (const output of recipe.items.filter(i => i.type === 'output')) {
    totalOutputQty += output.quantity * multiplier
  }
  const outputUnitCost = totalOutputQty > 0 ? Math.round(totalInputCost / totalOutputQty) : 0

  // 构建产出记录（使用 outputInventory）
  const outputItems = [{
    inventoryId: recipe.outputInventory.id,
    name: recipe.outputInventory.name,
    unit: recipe.outputUnit,
    quantity: totalOutputQty,
    unitCost: outputUnitCost,
    cost: totalInputCost
  }]

  // 事务执行
  return prisma.$transaction(async (tx) => {
    // 扣减投入原料
    for (const input of recipe.items.filter(i => i.type === 'input')) {
      if (!input.inventoryId) continue
      const deductQty = input.quantity * multiplier
      await tx.inventory.update({
        where: { id: input.inventoryId },
        data: { currentStock: { decrement: deductQty } }
      })
      await tx.stockOutLog.create({
        data: {
          inventoryId: input.inventoryId,
          quantity: deductQty,
          reason: 'process',
          note: `加工: ${recipe.name} x${multiplier}`
        }
      })
    }

    // 添加产出到 outputInventory
    await tx.inventory.update({
      where: { id: recipe.outputInventory.id },
      data: {
        currentStock: { increment: totalOutputQty },
        avgCost: outputUnitCost
      }
    })
    await tx.stockInLog.create({
      data: {
        inventoryId: recipe.outputInventory.id,
        quantity: totalOutputQty,
        unitCost: outputUnitCost,
        totalAmount: totalInputCost,
        note: `加工产出: ${recipe.name} x${multiplier}`
      }
    })

    // 记录加工日志
    const log = await tx.processingLog.create({
      data: {
        storeId: recipe.store.id,
        recipeId: recipe.id,
        staffId,
        multiplier,
        inputItems: JSON.stringify(inputItems),
        outputItems: JSON.stringify(outputItems),
        totalInputCost,
        totalOutputCost: totalInputCost,
        note
      }
    })

    return {
      id: log.id,
      recipeName: recipe.name,
      multiplier,
      inputItems,
      outputItems,
      totalInputCost,
      totalOutputCost: totalInputCost
    }
  })
}

// ============================================
// 获取加工历史
// ============================================
export async function getProcessingHistory(storeId: string, limit: number = 50) {
  return prisma.processingLog.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
}

// ============================================
// 获取加工日志详情
// ============================================
export async function getProcessingLogDetail(id: string) {
  const log = await prisma.processingLog.findUnique({
    where: { id }
  })

  if (!log) return null

  return {
    ...log,
    inputItems: JSON.parse(log.inputItems as string),
    outputItems: JSON.parse(log.outputItems as string)
  }
}