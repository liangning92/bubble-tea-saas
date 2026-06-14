import prisma from '../config/database'
import { getInventoryCostBreakdown } from './BomService'

export interface ProductFilter {
  storeId?: string
  categoryId?: string
  status?: string
  search?: string
  includeDeleted?: boolean
}

export interface CreateProductData {
  storeId: string
  name: string
  description?: string
  categoryId: string
  image?: string
  status?: string
  tags?: string[]
  specs?: { name: string; price: number }[]
  addons?: { addonId: string; price?: number }[]
  bomItems?: { inventoryId: string; quantity: number; unit?: string }[]
}

// Generate product code: based on category prefix
// Format: [CATEGORY_CODE]-[SEQUENCE]
// Example: MILK-001, TEA-001, JUI-001
async function generateProductCode(storeId: string, categoryId: string): Promise<string> {
  // Get category info
  const category = await prisma.category.findFirst({
    where: { id: categoryId, storeId }
  })

  // Default category code if not set
  let categoryCode = category?.code || 'PRD'

  // If category has a name but no code, generate from name
  if (!category?.code && category?.name) {
    categoryCode = generateCategoryCode(category.name)
  }

  // Count products in this category
  const count = await prisma.product.count({
    where: { storeId, categoryId }
  })

  // Generate: CATEGORY-001, CATEGORY-002, ...
  return `${categoryCode.toUpperCase()}-${String(count + 1).padStart(3, '0')}`
}

// Generate 3-letter code from category name
function generateCategoryCode(name: string): string {
  // Remove common words
  const cleanName = name
    .replace(/\s+(茶|奶茶|饮料|饮品|冰沙|奶茶店|泡泡茶)\s*/gi, '')
    .replace(/[奶茶饮料冰沙]s*$/gi, '')
    .trim()

  if (cleanName.length === 0) return 'PRD'

  // Take first letter of each significant word, or first 3 letters
  const words = cleanName.split(/\s+/)
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0].toUpperCase()).join('')
  }

  // Single word: take first 3 letters
  return cleanName.substring(0, 3).toUpperCase().padEnd(3, 'X')
}

// 单位换算系数
function getConversionFactor(inventoryUnit: string, recipeUnit: string): number {
  const invUnit = (inventoryUnit || '').toLowerCase()
  const recUnit = (recipeUnit || '').toLowerCase()

  if (invUnit === recUnit) return 1

  if (invUnit === 'kg') {
    if (recUnit === 'g' || recUnit === 'ml') return 1000
  }
  if (invUnit === 'l') {
    if (recUnit === 'ml') return 1000
  }
  return 1
}

// Calculate product cost from BOM items (handles semi_finished recursively)
async function calculateProductCost(productId: string): Promise<number> {
  const bomItems = await prisma.bOMItem.findMany({
    where: { productId },
    include: { inventory: true }
  })

  let totalCost = 0
  for (const item of bomItems) {
    const inv = item.inventory
    if (!inv) continue

    // For semi_finished items, recursively calculate cost from process recipe
    if (inv.type === 'semi_finished' && inv.processRecipeId) {
      const breakdown = await getInventoryCostBreakdown(inv.id, item.quantity)
      totalCost += breakdown.cost
    } else {
      // For raw materials, calculate directly
      const invUnit = (inv.unit || '个').toLowerCase()
      const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(invUnit)
      const ratio = inv.concentrateRatio || 1
      const safeRatio = ratio === 0 ? 1 : ratio

      let cpu = item.costPerUnit || inv.avgCost || 0
      if (!isPerPiece) {
        // kg/L: divide by 1000 to convert to g/ml, then divide by ratio
        cpu = cpu / 1000 / safeRatio
      }
      totalCost += (item.quantity || 0) * cpu
    }
  }

  return Math.round(totalCost)
}

// Get products with filtering
export async function getProducts(filter: ProductFilter) {
  const where: any = {
    deletedAt: filter.includeDeleted ? undefined : null
  }

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.status) where.status = filter.status
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
      { code: { contains: filter.search, mode: 'insensitive' } }
    ]
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      specs: { orderBy: { isDefault: 'desc' } },
      addons: {
        include: { addon: true }
      },
      bomItems: {
        include: { inventory: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  // Calculate cost from BOM if not set
  const productsWithCost = await Promise.all(products.map(async (p) => {
    if (p.costPrice === 0 && p.bomItems.length > 0) {
      const cost = await calculateProductCost(p.id)
      await prisma.product.update({
        where: { id: p.id },
        data: { costPrice: cost }
      })
      return { ...p, costPrice: cost }
    }
    return p
  }))

  return productsWithCost
}

// Get single product
export async function getProductById(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      specs: { orderBy: { isDefault: 'desc' } },
      addons: {
        include: { addon: true }
      },
      bomItems: {
        include: { inventory: true }
      }
    }
  })
}

// Get product by barcode (using product code)
export async function getProductByBarcode(barcode: string, storeId: string) {
  return prisma.product.findFirst({
    where: {
      storeId,
      OR: [
        { code: barcode },
        { id: barcode }
      ],
      status: 'active'
    },
    include: {
      category: true,
      specs: { orderBy: { isDefault: 'desc' }, take: 1 },
      addons: {
        include: { addon: true }
      }
    }
  })
}

// Create product with specs, addons, and BOM
export async function createProduct(data: CreateProductData) {
  return prisma.$transaction(async (tx) => {
    // Generate product code based on category
    const code = await generateProductCode(data.storeId, data.categoryId)

    // Create product
    const product = await tx.product.create({
      data: {
        storeId: data.storeId,
        code,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        image: data.image,
        status: data.status || 'active',
        tags: JSON.stringify(data.tags || [])
      }
    })

    // Create specs
    if (data.specs && data.specs.length > 0) {
      await tx.spec.createMany({
        data: data.specs.map((spec, index) => ({
          productId: product.id,
          name: spec.name,
          price: spec.price,
          priceAdjustment: 0,
          sortOrder: index,
          isDefault: index === 0
        }))
      })
    }

    // Create product addons
    if (data.addons && data.addons.length > 0) {
      await tx.productAddon.createMany({
        data: data.addons.map(addon => ({
          productId: product.id,
          addonId: addon.addonId,
          priceOverride: addon.price
        }))
      })
    }

    // Create BOM items and calculate cost
    if (data.bomItems && data.bomItems.length > 0) {
      await tx.bOMItem.createMany({
        data: data.bomItems.map(bom => ({
          productId: product.id,
          inventoryId: bom.inventoryId,
          quantity: bom.quantity,
          unit: bom.unit || '个'
        }))
      })

      // Calculate and update cost
      const cost = await calculateProductCost(product.id)
      await tx.product.update({
        where: { id: product.id },
        data: { costPrice: cost }
      })
    }

    return product
  })
}

// Update product
export async function updateProduct(productId: string, data: Partial<CreateProductData>) {
  console.log('ProductService.updateProduct called:', productId, data)
  return prisma.$transaction(async (tx) => {
    // Update product basic info
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId
    if (data.image !== undefined) updateData.image = data.image
    if (data.status !== undefined) updateData.status = data.status
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags)

    const product = await tx.product.update({
      where: { id: productId },
      data: updateData
    })

    // Update specs if provided
    if (data.specs) {
      await tx.spec.deleteMany({ where: { productId } })
      await tx.spec.createMany({
        data: data.specs.map((spec, index) => ({
          productId,
          name: String(spec.name),
          price: Math.floor(Number(spec.price)),
          priceAdjustment: 0,
          sortOrder: index,
          isDefault: index === 0
        }))
      })
    }

    // Update addons if provided
    if (data.addons) {
      await tx.productAddon.deleteMany({ where: { productId } })
      await tx.productAddon.createMany({
        data: data.addons.map(addon => ({
          productId,
          addonId: addon.addonId,
          priceOverride: addon.price
        }))
      })
    }

    // Update BOM if provided
    if (data.bomItems) {
      await tx.bOMItem.deleteMany({ where: { productId } })
      await tx.bOMItem.createMany({
        data: data.bomItems.map(bom => ({
          productId,
          inventoryId: bom.inventoryId,
          quantity: bom.quantity,
          unit: bom.unit || '个'
        }))
      })

      // Recalculate cost
      const cost = await calculateProductCost(productId)
      await tx.product.update({
        where: { id: productId },
        data: { costPrice: cost }
      })
    }

    return product
  })
}

// Update product BOM only (recipe)
export async function updateProductBom(productId: string, bomItems: { inventoryId: string; quantity: number }[]) {
  // Delete existing BOM items
  await prisma.bOMItem.deleteMany({ where: { productId } })

  // Create new BOM items with cost info
  if (bomItems && bomItems.length > 0) {
    // Fetch inventory data for cost calculation
    const inventoryIds = bomItems.map(b => b.inventoryId)
    const inventories = await prisma.inventory.findMany({
      where: { id: { in: inventoryIds } }
    })
    const invMap = Object.fromEntries(inventories.map(i => [i.id, i]))

    await prisma.bOMItem.createMany({
      data: bomItems.map(bom => {
        const inv = invMap[bom.inventoryId]
        const inventoryType = inv?.type || 'raw_material'
        const costPerUnit = inv?.avgCost || 0
        const totalCost = Math.round(bom.quantity * costPerUnit)
        return {
          productId,
          inventoryId: bom.inventoryId,
          quantity: bom.quantity,
          unit: inv?.unit || '个',
          costPerUnit,
          totalCost,
          inventoryType
        }
      })
    })
  }

  // Recalculate cost
  const cost = await calculateProductCost(productId)
  await prisma.product.update({
    where: { id: productId },
    data: { costPrice: cost }
  })

  // Return updated product with BOM
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      bomItems: {
        include: { inventory: true }
      }
    }
  })
}

// Soft delete product
export async function deleteProduct(productId: string) {
  return prisma.product.update({
    where: { id: productId },
    data: {
      deletedAt: new Date(),
      status: 'inactive'
    }
  })
}

// Restore deleted product
export async function restoreProduct(productId: string) {
  return prisma.product.update({
    where: { id: productId },
    data: {
      deletedAt: null,
      status: 'active'
    }
  })
}

// Get products for POS (simplified data for offline cache)
export async function getProductsForPOS(storeId: string) {
  const products = await prisma.product.findMany({
    where: {
      storeId,
      status: 'active',
      deletedAt: null
    },
    include: {
      category: { select: { id: true, name: true } },
      specs: {
        where: { productId: { not: undefined } },
        orderBy: { isDefault: 'desc' }
      },
      addons: {
        include: {
          addon: true
        }
      }
    },
    orderBy: { name: 'asc' }
  })

  // Transform to POS-friendly format
  return products.map((p: any) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    image: p.image,
    categoryId: p.category?.id,
    categoryName: p.category?.name,
    costPrice: p.costPrice,
    tags: JSON.parse(p.tags || '[]'),
    updatedAt: p.updatedAt?.toISOString() || null,
    specs: (p.specs || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      isDefault: s.isDefault,
      updatedAt: s.updatedAt?.toISOString() || null
    })),
    addons: (p.addons || []).map((pa: any) => ({
      id: pa.addon.id,
      name: pa.addon.name,
      price: pa.priceOverride || pa.addon.price,
      isFree: pa.addon.isFree,
      updatedAt: pa.addon.updatedAt?.toISOString() || null
    }))
  }))
}

// Get latest product update timestamp (for POS sync detection)
export async function getLatestProductUpdate(storeId: string) {
  const result = await prisma.product.aggregate({
    where: {
      storeId,
      status: 'active',
      deletedAt: null
    },
    _count: true,
    _max: {
      updatedAt: true
    }
  })

  return {
    count: result._count,
    updatedAt: result._max.updatedAt
  }
}

// Batch update product status
export async function batchUpdateStatus(productIds: string[], status: string) {
  return prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: { status }
  })
}

// Recalculate all products cost
export async function recalculateAllCosts(storeId: string) {
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    include: { bomItems: { include: { inventory: true } } }
  })

  const results = []
  for (const product of products) {
    const cost = await calculateProductCost(product.id)
    await prisma.product.update({
      where: { id: product.id },
      data: { costPrice: cost }
    })
    results.push({ id: product.id, name: product.name, costPrice: cost })
  }

  return results
}

// Get product cost detail
export async function getProductCostDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      specs: { orderBy: { isDefault: 'desc' } },
      bomItems: {
        include: { inventory: true }
      }
    }
  })

  if (!product) return null

  // Recalculate BOM costs
  const bomItems = await Promise.all(product.bomItems.map(async (item) => {
    const inv = item.inventory

    // For semi_finished items, use getInventoryCostBreakdown recursively
    if (inv?.type === 'semi_finished' && inv.processRecipeId) {
      const breakdown = await getInventoryCostBreakdown(inv.id, item.quantity)
      return {
        id: item.id,
        inventoryId: item.inventoryId,
        name: inv.name || '',
        quantity: item.quantity,
        unit: item.unit,
        costPerUnit: breakdown.cost / (item.quantity || 1),
        totalCost: breakdown.cost,
        type: 'semi_finished',
        inventory: inv ? {
          id: inv.id,
          name: inv.name,
          unit: inv.unit,
          currentStock: inv.currentStock,
          avgCost: inv.avgCost,
          concentrateRatio: inv.concentrateRatio
        } : null,
        costBreakdown: breakdown.breakdown ? {
          processRecipeName: breakdown.processRecipeName,
          breakdown: breakdown.breakdown
        } : undefined
      }
    }

    // For raw materials, calculate directly
    const costPerUnit = inv?.avgCost || 0
    const ratio = inv?.concentrateRatio || 1
    const safeRatio = ratio === 0 ? 1 : ratio
    const itemUnit = (item.unit || inv?.unit || '个').toLowerCase()
    const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit)

    let unitCost = 0
    if (isPerPiece) {
      unitCost = costPerUnit
    } else {
      // Unit conversion: kg/L -> g/ml (divide by 1000)
      // Then apply concentrateRatio (divide by ratio for diluted/concentrated items)
      unitCost = costPerUnit / 1000 / safeRatio
    }

    const totalCost = Math.round(item.quantity * unitCost)

    return {
      id: item.id,
      inventoryId: item.inventoryId,
      name: inv?.name || '',
      quantity: item.quantity,
      unit: item.unit,
      costPerUnit: Math.round(unitCost * 10000) / 10000,
      totalCost,
      type: 'raw_material',
      inventory: inv ? {
        id: inv.id,
        name: inv.name,
        unit: inv.unit,
        currentStock: inv.currentStock,
        avgCost: inv.avgCost,
        concentrateRatio: inv.concentrateRatio
      } : null
    }
  }))

  const costPrice = bomItems.reduce((sum, item) => sum + item.totalCost, 0)
  const defaultSpec = product.specs.find(s => s.isDefault) || product.specs[0]
  const sellingPrice = defaultSpec?.price || 0
  const margin = sellingPrice - costPrice
  const marginRate = sellingPrice > 0 ? Math.round(margin / sellingPrice * 10000) / 100 : 0

  return {
    productId: product.id,
    productName: product.name,
    productCode: product.code,
    costPrice,
    sellingPrice,
    margin,
    marginRate,
    bomItems
  }
}