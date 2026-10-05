import prisma from '../config/database'

// Recipe/Process management for making intermediate materials
export interface ProcessRecipe {
  id: string
  storeId: string
  name: string
  category: string // base_milk | syrup | topping | other
  ingredients: ProcessIngredient[]
  outputQty: number
  outputUnit: string
  laborCost: number
  notes?: string
  isActive: boolean
}

export interface ProcessIngredient {
  inventoryId: string
  quantity: number
  unit: string
}

// Get all process recipes
export async function getProcessRecipes(storeId: string) {
  return prisma.config.findMany({
    where: {
      storeId,
      category: 'process_recipe',
      key: { startsWith: 'recipe_' }
    }
  }).then(recipes => recipes.map(r => ({
    id: r.id,
    ...JSON.parse(r.value)
  })))
}

// Get recipe by ID
export async function getRecipeById(recipeId: string) {
  const recipe = await prisma.config.findFirst({
    where: {
      id: recipeId,
      category: 'process_recipe'
    }
  })
  return recipe ? JSON.parse(recipe.value) : null
}

// Create process recipe
export async function createProcessRecipe(data: {
  storeId: string
  name: string
  category: string
  ingredients: ProcessIngredient[]
  outputQty: number
  outputUnit: string
  laborCost?: number
  notes?: string
}) {
  const recipeId = `recipe_${Date.now()}`

  return prisma.config.create({
    data: {
      storeId: data.storeId,
      category: 'process_recipe',
      key: recipeId,
      value: JSON.stringify({
        name: data.name,
        category: data.category,
        ingredients: data.ingredients,
        outputQty: data.outputQty,
        outputUnit: data.outputUnit,
        laborCost: data.laborCost || 0,
        notes: data.notes || '',
        isActive: true,
        createdAt: new Date().toISOString()
      })
    }
  })
}

// Calculate recipe cost
export async function calculateRecipeCost(recipeId: string) {
  const recipe = await getRecipeById(recipeId)
  if (!recipe) throw new Error('Recipe not found')

  let materialCost = 0

  for (const ing of recipe.ingredients) {
    const inventory = await prisma.inventory.findUnique({
      where: { id: ing.inventoryId }
    })
    if (inventory) {
      // Cost per unit = avgCost / unit conversion
      const costPerUnit = Number(inventory.avgCost) / (inventory.unit === 'kg' ? 1000 : inventory.unit === 'l' ? 1000 : 1)
      materialCost += costPerUnit * ing.quantity
    }
  }

  return {
    materialCost: Math.round(materialCost),
    laborCost: recipe.laborCost || 0,
    totalCost: Math.round(materialCost + (recipe.laborCost || 0)),
    costPerOutputUnit: Math.round((materialCost + (recipe.laborCost || 0)) / recipe.outputQty)
  }
}

// Get product mix analysis
export async function getProductMixAnalysis(storeId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['completed', 'paid'] }
    },
    include: {
      items: {
        include: { product: { include: { category: true } } }
      }
    }
  })

  const productStats = new Map<string, { productId: string; productName: string; category: string; quantity: number; revenue: number; cost: number; profit: number; orderIds: Set<string> }>()

  for (const order of orders) {
    for (const item of order.items) {
      const row = productStats.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        category: item.product?.category?.name || 'Uncategorized',
        quantity: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        orderIds: new Set<string>()
      }
      const grossRevenue = item.unitPrice * item.quantity
      // Allocate order-level discounts in proportion to line revenue so product
      // margins use the same discounted sales basis as the finance report.
      const discount = order.totalAmount > 0 ? Math.max(0, order.discountAmount || 0) * grossRevenue / order.totalAmount : 0
      const revenue = Math.max(0, grossRevenue - discount)
      const cost = (item.bomCost || 0) * item.quantity
      row.quantity += item.quantity
      row.revenue += revenue
      row.cost += cost
      row.profit += revenue - cost
      row.orderIds.add(order.id)
      productStats.set(item.productId, row)
    }
  }

  // Calculate percentages
  const totalRevenue = [...productStats.values()].reduce((sum, p) => sum + p.revenue, 0)

  return [...productStats.values()]
    .map(({ orderIds, ...p }) => ({
      ...p,
      orderCount: orderIds.size,
      revenuePercent: totalRevenue > 0 ? Math.round(p.revenue / totalRevenue * 100) : 0,
      margin: p.revenue > 0 ? Math.round(p.profit / p.revenue * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

// Get ABC analysis (best sellers)
export async function getABCAnalysis(storeId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['completed', 'paid'] }
    },
    include: { items: true }
  })

  // Product sales
  const productSales: Record<string, { name: string; quantity: number; revenue: number; cost: number; orderIds: Set<string> }> = {}

  for (const order of orders) {
    for (const item of order.items) {
      if (!productSales[item.productId]) {
        productSales[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          cost: 0,
          orderIds: new Set<string>()
        }
      }
      productSales[item.productId].quantity += item.quantity
      const grossRevenue = item.unitPrice * item.quantity
      const discount = order.totalAmount > 0 ? Math.max(0, order.discountAmount || 0) * grossRevenue / order.totalAmount : 0
      productSales[item.productId].revenue += Math.max(0, grossRevenue - discount)
      productSales[item.productId].cost += (item.bomCost || 0) * item.quantity
      productSales[item.productId].orderIds.add(order.id)
    }
  }

  const sorted = Object.entries(productSales)
    .map(([id, data]) => ({ productId: id, ...data, orderCount: data.orderIds.size, margin: data.revenue > 0 ? Math.round((data.revenue - data.cost) / data.revenue * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = sorted.reduce((sum, p) => sum + p.revenue, 0)
  let cumulative = 0

  return sorted.map((p, idx) => {
    cumulative += p.revenue
    const cumulativePercent = totalRevenue > 0 ? Math.round(cumulative / totalRevenue * 100) : 0

    let category: 'A' | 'B' | 'C'
    if (cumulativePercent <= 80) category = 'A'
    else if (cumulativePercent <= 95) category = 'B'
    else category = 'C'

    const { orderIds: _orderIds, ...row } = p
    return { ...row, productName: p.name, rank: idx + 1, category, class: category, percentage: totalRevenue > 0 ? p.revenue / totalRevenue : 0 }
  })
}

export async function getProductSalesTrend(storeId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: startDate, lte: endDate }, status: { in: ['completed', 'paid'] } },
    include: { items: true }
  })
  const daily = new Map<string, { date: string; revenue: number; cost: number; quantity: number; orders: number }>()
  for (let day = new Date(startDate); day <= endDate; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10)
    daily.set(date, { date, revenue: 0, cost: 0, quantity: 0, orders: 0 })
  }
  for (const order of orders) {
    const date = order.createdAt.toISOString().slice(0, 10)
    const row = daily.get(date)
    if (!row) continue
    const grossRevenue = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = order.totalAmount > 0 ? Math.max(0, order.discountAmount || 0) * grossRevenue / order.totalAmount : 0
    row.revenue += Math.max(0, grossRevenue - discount)
    row.cost += order.items.reduce((sum, item) => sum + (item.bomCost || 0) * item.quantity, 0)
    row.quantity += order.items.reduce((sum, item) => sum + item.quantity, 0)
    row.orders += 1
  }
  return [...daily.values()].map(row => ({ ...row, grossProfit: row.revenue - row.cost, margin: row.revenue > 0 ? Math.round((row.revenue - row.cost) / row.revenue * 100) : 0 }))
}

// Get product performance score
export async function getProductPerformanceScore(productId: string, days: number = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const orders = await prisma.orderItem.findMany({
    where: {
      productId,
      order: {
        createdAt: { gte: startDate },
        status: { not: 'refunded' }
      }
    },
    include: { order: true }
  })

  const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0)
  const totalRevenue = orders.reduce((sum, o) => sum + o.unitPrice * o.quantity, 0)
  const avgPrice = totalQty > 0 ? totalRevenue / totalQty : 0

  return {
    productId,
    period: `${days} days`,
    totalQuantity: totalQty,
    totalRevenue,
    avgPrice: Math.round(avgPrice),
    orderCount: orders.length
  }
}
