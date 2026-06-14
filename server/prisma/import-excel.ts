import { PrismaClient } from '@prisma/client'
import * as xlsx from 'xlsx'

const prisma = new PrismaClient()

// 库存分类映射
const categoryMap: Record<string, string> = {
  'Lainnya': '其他',
  '基础原料': '基础原料',
  '中间加工品': '半成品',
  '其他': '其他'
}

async function main() {
  console.log('📦 从 Excel 导入库存和配方...\n')

  const workbook = xlsx.readFile('/Users/liangning/Desktop/Claude_Work/database_export.xlsx')

  // 获取 store
  const store = await prisma.store.findFirst()
  if (!store) {
    console.error('❌ 未找到 store')
    process.exit(1)
  }
  console.log('📍 Store:', store.name)

  // 1. 导入库存
  console.log('\n📦 导入库存...')
  const inventorySheet = workbook.Sheets['Inventory']
  const inventoryData = xlsx.utils.sheet_to_json(inventorySheet) as any[]

  const inventoryMap = new Map<string, any>() // name -> new inventory

  for (const item of inventoryData) {
    // 跳过 stock 为 0 或 cost 为 0 的项目
    if (item.stock === 0 && item.costPerUnit === 0) continue

    // 解析名称 (可能有中英文混合)
    const nameParts = (item.name || '').split(' ')
    const chineseName = nameParts[0] || item.name
    const category = categoryMap[item.category] || item.category || '其他'

    try {
      const inv = await prisma.inventory.create({
        data: {
          storeId: store.id,
          name: chineseName,
          category: category,
          unit: item.unit || 'g',
          currentStock: item.stock || 0,
          avgCost: Math.round((item.costPerUnit || 0) * 100), // 转为分
          safetyStock: item.safeStock || 0,
          type: category === '半成品' ? 'semi_finished' : 'raw_material'
        }
      })
      inventoryMap.set(item.name, inv)
      console.log(`  ✓ ${chineseName} (${category})`)
    } catch (e) {
      console.log(`  ⚠ ${item.name} 导入失败`)
    }
  }
  console.log(`\n  共导入 ${inventoryMap.size} 个库存`)

  // 2. 导入产品 (从 Product 表)
  console.log('\n🧋 导入产品...')
  const productSheet = workbook.Sheets['Product']
  const productData = xlsx.utils.sheet_to_json(productSheet) as any[]

  // 获取现有分类
  const categories = await prisma.category.findMany({ where: { storeId: store.id } })
  const categoryByName = new Map(categories.map(c => [c.name, c]))

  // 确保有默认分类
  let defaultCategory = categoryByName.get('其他')
  if (!defaultCategory) {
    defaultCategory = await prisma.category.create({
      data: { storeId: store.id, name: '其他', sortOrder: 99 }
    })
  }

  for (const item of productData) {
    // 查找或创建分类
    const catName = item.category || '其他'
    let category = categoryByName.get(catName)
    if (!category) {
      category = await prisma.category.create({
        data: { storeId: store.id, name: catName, sortOrder: 50 }
      })
      categoryByName.set(catName, category)
    }

    // 生成商品编码
    const count = await prisma.product.count({ where: { storeId: store.id } })
    const code = `PRD-${String(count + 1).padStart(3, '0')}`

    try {
      const product = await prisma.product.create({
        data: {
          storeId: store.id,
          code,
          name: item.name,
          categoryId: category.id,
          status: item.isActive ? 'active' : 'inactive',
          description: item.description || '',
          costPrice: Math.round((item.costPrice || 0) * 100),
          specs: {
            create: [{
              name: '默认',
              price: Math.round((item.sellingPrice || 0) * 100),
              isDefault: true
            }]
          }
        }
      })
      console.log(`  ✓ ${code} - ${item.name} (${catName})`)
    } catch (e) {
      console.log(`  ⚠ ${item.name} 导入失败`)
    }
  }

  // 3. 导入 BOM 配方
  console.log('\n📋 导入配方...')
  const bomSheet = workbook.Sheets['BOMItem']
  const bomData = xlsx.utils.sheet_to_json(bomSheet) as any[]

  // 获取所有产品
  const products = await prisma.product.findMany({ where: { storeId: store.id } })
  const productByName = new Map(products.map(p => [p.name, p]))

  // 按产品名分组 BOM
  const bomByProduct = new Map<string, any[]>()
  for (const bom of bomData) {
    const list = bomByProduct.get(bom.productName) || []
    list.push(bom)
    bomByProduct.set(bom.productName, list)
  }

  // 为每个产品创建 BOM
  for (const [productName, boms] of bomByProduct) {
    const product = productByName.get(productName)
    if (!product) {
      console.log(`  ⚠ 产品不存在: ${productName}`)
      continue
    }

    // 删除旧的 BOM
    await prisma.bOMItem.deleteMany({ where: { productId: product.id } })

    let totalCost = 0
    for (const bom of boms) {
      // 通过 inventoryId 查找 (需要匹配原始ID)
      // 但我们的 inventory 使用新的 ID，所以需要通过名称匹配
      const invName = inventoryData.find((i: any) => i.id === bom.inventoryId)?.name
      let inv = invName ? inventoryMap.get(invName) : null

      if (!inv) continue

      const cost = (bom.costPerUnit || 0) * bom.usageAmount
      totalCost += cost

      await prisma.bOMItem.create({
        data: {
          productId: product.id,
          inventoryId: inv.id,
          quantity: bom.usageAmount,
          unit: bom.unit || 'g',
          costPerUnit: bom.costPerUnit || 0,
          totalCost: Math.round(cost)
        }
      })
    }

    // 更新产品成本
    if (totalCost > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data: { costPrice: Math.round(totalCost) }
      })
    }

    console.log(`  ✓ ${productName} - ${boms.length} 个原料`)
  }

  console.log('\n' + '='.repeat(50))
  console.log('✅ 导入完成!')
  console.log('='.repeat(50) + '\n')
}

main()
  .catch((e) => {
    console.error('❌ 导入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })