import prisma from '../config/database'

/**
 * 获取所有产品的BOM成本分析
 */
export async function getProductsWithBomCost(storeId: string) {
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    include: {
      category: { select: { name: true } },
      specs: { orderBy: { isDefault: 'desc' }, take: 1 },
      bomItems: {
        include: { inventory: true }
      }
    }
  })

  return products.map(product => {
    const bomCost = calculateBomCost(product.bomItems)
    const defaultSpec = product.specs[0]
    const sellingPrice = defaultSpec?.price || 0
    const profit = sellingPrice - bomCost
    const profitRate = sellingPrice > 0 ? Math.round(profit / sellingPrice * 100) : 0

    return {
      id: product.id,
      name: product.name,
      code: product.code,
      category: product.category?.name,
      sellingPrice,
      bomCost,
      profit,
      profitRate,
      bomItemCount: product.bomItems.length
    }
  })
}

/**
 * 获取单个产品的BOM明细
 */
export async function getProductBomDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: { select: { name: true } },
      specs: { orderBy: { isDefault: 'desc' } },
      bomItems: {
        include: { inventory: true }
      }
    }
  })

  if (!product) return null

  const bomDetails = await Promise.all(product.bomItems.map(async (item) => {
    const inv = item.inventory
    const recipeUnit = ((item as any).unit || inv?.unit || '个').toLowerCase()

    // 对于 semi_finished 类型，使用 getInventoryCostBreakdown 递归计算
    if (inv?.type === 'semi_finished' && inv.processRecipeId) {
      const breakdown = await getInventoryCostBreakdown(inv.id, item.quantity)
      return {
        inventoryId: inv.id,
        name: inv.name,
        unit: recipeUnit,
        quantity: item.quantity,
        costPerUnit: breakdown.cost / (item.quantity || 1),
        totalCost: breakdown.cost,
        currentStock: inv.currentStock,
        avgCost: inv.avgCost,
        safetyStock: inv.safetyStock,
        inventoryType: 'semi_finished',
        costBreakdown: breakdown.breakdown ? {
          processRecipeName: breakdown.processRecipeName,
          breakdown: breakdown.breakdown
        } : undefined
      }
    }

    // 对于 raw_material，直接计算
    const invUnit = (inv?.unit || '个').toLowerCase()
    let factor = 1
    if (invUnit === 'kg') factor = 1000
    if (invUnit === 'l') factor = 1000

    const ratio = inv?.concentrateRatio || 1
    const safeRatio = ratio === 0 ? 1 : ratio
    const cpu = (inv?.avgCost || 0) / factor / safeRatio
    const totalCost = (item.quantity || 0) * cpu

    return {
      inventoryId: inv?.id || item.inventoryId,
      name: inv?.name || '',
      unit: recipeUnit,
      quantity: item.quantity,
      costPerUnit: Math.round(cpu * 100) / 100,
      totalCost: Math.round(totalCost),
      currentStock: inv?.currentStock,
      avgCost: inv?.avgCost,
      safetyStock: inv?.safetyStock,
      inventoryType: 'raw_material'
    }
  }))

  const totalBomCost = bomDetails.reduce((sum, item) => sum + item.totalCost, 0)

  return {
    id: product.id,
    name: product.name,
    code: product.code,
    category: product.category?.name,
    specs: product.specs,
    bomDetails,
    totalBomCost: Math.round(totalBomCost),
    suggestedPrices: product.specs.map(spec => {
      const costMarkup = Math.round(totalBomCost * 1.5) // 50% profit minimum
      return {
        specId: spec.id,
        specName: spec.name,
        price: spec.price,
        cost: totalBomCost,
        profit: spec.price - totalBomCost,
        profitRate: spec.price > 0 ? Math.round((spec.price - totalBomCost) / spec.price * 100) : 0
      }
    })
  }
}

/**
 * 单位换算系数
 * 将配方单位(g/ml/个)转换为库存单位(kg/L/个)需要的除数
 * 例如: 库存是 kg, 配方用 g, 需要除以 1000
 */
function getConversionFactor(inventoryUnit: string, recipeUnit: string): number {
  const invUnit = (inventoryUnit || '').toLowerCase()
  const recUnit = (recipeUnit || '').toLowerCase()

  // 如果单位相同，不需要换算
  if (invUnit === recUnit) return 1

  // 库存是 kg，配方用 g 或 ml
  if (invUnit === 'kg') {
    if (recUnit === 'g' || recUnit === 'ml') return 1000
  }

  // 库存是 L，配方用 ml
  if (invUnit === 'l') {
    if (recUnit === 'ml') return 1000
  }

  // 其他情况默认 1 (包括: g->g, ml->ml, 个->个, kg->kg 等)
  return 1
}

/**
 * 计算BOM成本
 * 公式: 成本 = 配方用量 × (avgCost / 1000 / concentrateRatio)
 *
 * 单位转换：
 * - kg/L 库存 → g/ml 配方用量：÷1000
 * - 个/支/卷/pce/件/张：直接使用，无需转换
 *
 * 浓缩比例：
 * - concentrateRatio > 1：浓缩液需要稀释，如茶叶10倍浓缩，实际用量 = 配方用量 / ratio
 */
function calculateBomCost(bomItems: { quantity: number; costPerUnit: number; unit?: string; totalCost?: number; inventory: { avgCost: number; concentrateRatio: number; unit: string } }[]) {
  let totalBomCost = 0

  for (const item of bomItems) {
    const qty = item.quantity || 0
    const invUnit = (item.inventory?.unit || '个').toLowerCase()
    const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(invUnit)
    const ratio = item.inventory?.concentrateRatio || 1
    // 防止除零
    const safeRatio = ratio === 0 ? 1 : ratio

    // 优先使用 costPerUnit，如果为 0 则使用 inventory.avgCost
    let cpu = item.costPerUnit || item.inventory?.avgCost || 0

    if (!isPerPiece) {
      // kg/L：先 ÷1000 转换为 g/ml，再 ÷concentrateRatio
      // 公式：qty(g/ml) × (avgCost(分/kg) / 1000 / ratio)
      cpu = cpu / 1000 / safeRatio
    }
    // 个/件等：直接使用 cpu，不需要转换

    totalBomCost += qty * cpu
  }

  return Math.round(totalBomCost)
}

/**
 * 获取原料使用预测（根据历史销售）
 */
export async function getMaterialUsageForecast(storeId: string, days: number = 30) {
  // 获取历史销售数据
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: 'completed',
      createdAt: { gte: startDate }
    },
    include: {
      items: true
    }
  })

  // 计算每天平均销售量
  const orderCount = orders.length
  if (orderCount === 0) return []

  // 按产品统计销售量
  const productSales: Record<string, { productId: string; productName: string; quantity: number }> = {}

  for (const order of orders) {
    for (const item of order.items) {
      if (!productSales[item.productId]) {
        productSales[item.productId] = {
          productId: item.productId,
          productName: item.productName || '',
          quantity: 0
        }
      }
      productSales[item.productId].quantity += item.quantity
    }
  }

  // 计算每种原料的消耗预测
  const materialUsage: Record<string, {
    inventoryId: string
    name: string
    unit: string
    avgCost: number
    dailyUsage: number
    totalUsage: number
    currentStock: number
    daysUntilStockOut: number | null
    suggestedReorderQty: number | null
  }> = {}

  for (const sale of Object.values(productSales)) {
    const bomItems = await prisma.bOMItem.findMany({
      where: { productId: sale.productId },
      include: { inventory: true }
    })

    const dailyQty = sale.quantity / days

    for (const bom of bomItems) {
      const inv = bom.inventory
      if (!inv) continue

      const ratio = inv.concentrateRatio || 1
      const itemUnit = bom.unit || inv.unit || '个'
      const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit)

      let usagePerProduct = bom.quantity * dailyQty
      if (!isPerPiece) {
        usagePerProduct = usagePerProduct / ratio
      }

      if (!materialUsage[inv.id]) {
        materialUsage[inv.id] = {
          inventoryId: inv.id,
          name: inv.name,
          unit: inv.unit,
          avgCost: inv.avgCost,
          dailyUsage: 0,
          totalUsage: 0,
          currentStock: inv.currentStock,
          daysUntilStockOut: null,
          suggestedReorderQty: null
        }
      }

      materialUsage[inv.id].dailyUsage += usagePerProduct
      materialUsage[inv.id].totalUsage += usagePerProduct * days
    }
  }

  // 计算库存预警
  const result = Object.values(materialUsage).map(mat => {
    mat.dailyUsage = Math.round(mat.dailyUsage * 100) / 100
    mat.totalUsage = Math.round(mat.totalUsage)

    if (mat.dailyUsage > 0) {
      mat.daysUntilStockOut = Math.floor(mat.currentStock / mat.dailyUsage)

      // 如果库存不足7天，建议补货量
      if (mat.daysUntilStockOut <= 7) {
        //建议补货量 = 7天用量 * 1.5 (安全库存)
        mat.suggestedReorderQty = Math.ceil(mat.dailyUsage * 7 * 1.5)
      }
    }

    return mat
  })

  return result.sort((a, b) => (a.daysUntilStockOut || 999) - (b.daysUntilStockOut || 999))
}

/**
 * 获取低库存预警（基于预测消耗）
 */
export async function getLowStockAlerts(storeId: string, days: number = 7) {
  const usageForecast = await getMaterialUsageForecast(storeId, days)

  return usageForecast
    .filter(mat => mat.daysUntilStockOut !== null && mat.daysUntilStockOut <= days)
    .map(mat => ({
      ...mat,
      urgency: mat.daysUntilStockOut <= 3 ? 'critical' : mat.daysUntilStockOut <= 7 ? 'warning' : 'normal'
    }))
}

/**
 * 计算单个产品成本
 */
export async function calculateProductCost(productId: string): Promise<number> {
  const bomItems = await prisma.bOMItem.findMany({
    where: { productId },
    include: { inventory: true }
  })

  return calculateBomCost(bomItems)
}

/**
 * 获取原料的成本分解（支持 semi_finished 递归展开）
 * 用于配方编辑页面显示每个原料的成本来源
 */
export async function getInventoryCostBreakdown(inventoryId: string, quantity: number) {
  const inv = await prisma.inventory.findUnique({
    where: { id: inventoryId }
  })

  if (!inv) {
    return { type: 'unknown', cost: 0, breakdown: null }
  }

  const invUnit = (inv.unit || '个').toLowerCase()
  let factor = 1
  if (invUnit === 'kg') factor = 1000
  if (invUnit === 'l') factor = 1000

  if (inv.type === 'raw_material') {
    const ratio = inv.concentrateRatio || 1
    const safeRatio = ratio === 0 ? 1 : ratio
    const cpu = (inv.avgCost || 0) / factor / safeRatio
    return {
      type: 'raw_material',
      cost: Math.round(quantity * cpu),
      breakdown: null
    }
  }

  if (inv.type === 'semi_finished' && inv.processRecipeId) {
    const recipe = await prisma.processRecipe.findUnique({
      where: { id: inv.processRecipeId },
      include: {
        items: { include: { inventory: true } }
      }
    })

    if (!recipe) {
      return { type: 'semi_finished', cost: 0, breakdown: null }
    }

    const outputItem = recipe.items.find(i => i.type === 'output')
    if (!outputItem || outputItem.quantity === 0) {
      return { type: 'semi_finished', cost: 0, breakdown: null }
    }

    const outputRatio = outputItem.quantity
    const outputMultiplier = quantity / outputRatio

    // 计算每个投入原料的成本
    const breakdown: Array<{
      inventoryId: string
      name: string
      unit: string
      quantity: number
      costPerUnit: number
      totalCost: number
    }> = []

    let totalInputCost = 0

    for (const input of recipe.items.filter(i => i.type === 'input')) {
      const inputInv = input.inventory
      if (!inputInv) continue

      const inputUnit = (inputInv.unit || '个').toLowerCase()
      const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(inputUnit)
      const inputRatio = inputInv.concentrateRatio || 1
      const safeRatio = inputRatio === 0 ? 1 : inputRatio

      const inputQty = input.quantity * outputMultiplier
      let inputCpu = inputInv.avgCost || 0
      if (!isPerPiece) {
        // kg/L：先 ÷1000 再 ÷concentrateRatio
        inputCpu = inputCpu / 1000 / safeRatio
      }
      const inputCost = Math.round(inputQty * inputCpu)

      breakdown.push({
        inventoryId: inputInv.id,
        name: inputInv.name,
        unit: inputInv.unit,
        quantity: Math.round(inputQty * 100) / 100,
        costPerUnit: Math.round(inputCpu * 100) / 100,
        totalCost: inputCost
      })

      totalInputCost += inputCost
    }

    return {
      type: 'semi_finished',
      cost: totalInputCost,
      breakdown,
      processRecipeId: recipe.id,
      processRecipeName: recipe.name,
      outputQuantity: outputRatio
    }
  }

  return { type: inv.type || 'unknown', cost: 0, breakdown: null }
}