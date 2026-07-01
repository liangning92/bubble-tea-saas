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
      status: { not: 'refunded' }
    },
    include: {
      items: {
        include: { product: { include: { category: true } } }
      }
    }
  })

  // Group by category
  const categoryStats: Record<string, { name: string; quantity: number; revenue: number; cost: number; profit: number }> = {}

  for (const order of orders) {
    for (const item of order.items) {
      const catName = item.product?.category?.name || 'Uncategorized'
      if (!categoryStats[catName]) {
        categoryStats[catName] = { name: catName, quantity: 0, revenue: 0, cost: 0, profit: 0 }
      }
      categoryStats[catName].quantity += item.quantity
      categoryStats[catName].revenue += item.unitPrice * item.quantity
      categoryStats[catName].cost += item.bomCost * item.quantity
      categoryStats[catName].profit += (item.unitPrice - item.bomCost) * item.quantity
    }
  }

  // Calculate percentages
  const totalRevenue = Object.values(categoryStats).reduce((sum, c) => sum + c.revenue, 0)

  return Object.values(categoryStats)
    .map(c => ({
      ...c,
      revenuePercent: totalRevenue > 0 ? Math.round(c.revenue / totalRevenue * 100) : 0,
      margin: c.revenue > 0 ? Math.round(c.profit / c.revenue * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

// Get ABC analysis (best sellers)
export async function getABCAnalysis(storeId: string, startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: startDate, lte: endDate },
      status: { not: 'refunded' }
    },
    include: { items: true }
  })

  // Product sales
  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {}

  for (const order of orders) {
    for (const item of order.items) {
      if (!productSales[item.productId]) {
        productSales[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0
        }
      }
      productSales[item.productId].quantity += item.quantity
      productSales[item.productId].revenue += item.unitPrice * item.quantity
    }
  }

  const sorted = Object.entries(productSales)
    .map(([id, data]) => ({ productId: id, ...data }))
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

    return { ...p, rank: idx + 1, category }
  })
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