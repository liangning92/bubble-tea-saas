import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 库存物料数据
const inventoryData = [
  // 小料类
  { name: '珍珠 (Tapioca)', category: '小料', unit: 'g', stock: 5000, cost: 15000, safety: 1000 },
  { name: '椰果 (Coconut)', category: '小料', unit: 'g', stock: 3000, cost: 12000, safety: 500 },
  { name: '布丁 (Pudding)', category: '小料', unit: '个', stock: 100, cost: 2000, safety: 20 },
  { name: '芋圆 (Taro Ball)', category: '小料', unit: 'g', stock: 2000, cost: 18000, safety: 300 },
  { name: '红豆 (Red Bean)', category: '小料', unit: 'g', stock: 2000, cost: 10000, safety: 300 },
  { name: '波霸 (Boba)', category: '小料', unit: 'g', stock: 4000, cost: 14000, safety: 800 },

  // 茶叶类
  { name: '红茶茶汤', category: '茶叶', unit: 'ml', stock: 10000, cost: 5, safety: 2000 },
  { name: '绿茶茶汤', category: '茶叶', unit: 'ml', stock: 8000, cost: 5, safety: 1500 },
  { name: '乌龙茶汤', category: '茶叶', unit: 'ml', stock: 6000, cost: 6, safety: 1000 },
  { name: '茉莉绿茶', category: '茶叶', unit: 'ml', stock: 7000, cost: 5, safety: 1500 },

  // 奶类
  { name: '鲜牛奶', category: '奶类', unit: 'ml', stock: 10000, cost: 8, safety: 2000 },
  { name: '奶精粉', category: '奶类', unit: 'g', stock: 3000, cost: 25, safety: 500 },
  { name: '淡奶油', category: '奶类', unit: 'ml', stock: 2000, cost: 15, safety: 500 },

  // 糖浆/调味
  { name: '果糖', category: '糖浆', unit: 'ml', stock: 5000, cost: 3, safety: 1000 },
  { name: '焦糖糖浆', category: '糖浆', unit: 'ml', stock: 2000, cost: 20, safety: 500 },
  { name: '香草糖浆', category: '糖浆', unit: 'ml', stock: 1500, cost: 25, safety: 300 },
  { name: '榛果糖浆', category: '糖浆', unit: 'ml', stock: 1500, cost: 25, safety: 300 },

  // 冰沙原料
  { name: '芒果果肉', category: '冰沙', unit: 'g', stock: 3000, cost: 30, safety: 500 },
  { name: '草莓果肉', category: '冰沙', unit: 'g', stock: 2000, cost: 35, safety: 400 },
  { name: '蓝莓果肉', category: '冰沙', unit: 'g', stock: 2000, cost: 40, safety: 400 },
  { name: '百香果肉', category: '冰沙', unit: 'g', stock: 1500, cost: 25, safety: 300 },
  { name: '泰国冰糖浆', category: '冰沙', unit: 'ml', stock: 3000, cost: 8, safety: 500 },

  // 杯/包装
  { name: '饮料杯(中)', category: '包装', unit: '个', stock: 500, cost: 800, safety: 100 },
  { name: '饮料杯(大)', category: '包装', unit: '个', stock: 400, cost: 1000, safety: 100 },
  { name: '吸管', category: '包装', unit: '支', stock: 1000, cost: 200, safety: 200 },
  { name: '杯盖', category: '包装', unit: '个', stock: 500, cost: 300, safety: 100 },
]

// 产品配方 BOM 数据
const bomData = {
  'Es Krim (Original/Matcha)': [
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 30 },
  ],
  'Red Bean Matcha Sundae': [
    { name: '红豆', qty: 40 },
    { name: '绿茶茶汤', qty: 150 },
    { name: '鲜牛奶', qty: 100 },
  ],
  'Brown Sugar Pearl Sundae': [
    { name: '珍珠', qty: 40 },
    { name: '焦糖糖浆', qty: 30 },
    { name: '奶精粉', qty: 30 },
  ],
  'Mango Ice Smoothie Snow Top': [
    { name: '芒果果肉', qty: 100 },
    { name: '泰国冰糖浆', qty: 50 },
  ],
  'Chocolate Oreo Sundae': [
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 25 },
  ],
  'Coffee Smoothie Snow Top': [
    { name: '奶精粉', qty: 25 },
    { name: '果糖', qty: 30 },
  ],
  'Boba MilkShake': [
    { name: '珍珠', qty: 50 },
    { name: '奶精粉', qty: 35 },
    { name: '果糖', qty: 35 },
  ],
  'Strawberry MilkShake': [
    { name: '草莓果肉', qty: 80 },
    { name: '鲜牛奶', qty: 120 },
  ],
  'Matcha MilkShake': [
    { name: '绿茶茶汤', qty: 100 },
    { name: '鲜牛奶', qty: 100 },
  ],
  'Blueberry Sundae': [
    { name: '蓝莓果肉', qty: 80 },
    { name: '果糖', qty: 25 },
  ],
  'Ice Fresh Passion Fruit Tea': [
    { name: '百香果肉', qty: 50 },
    { name: '果糖', qty: 40 },
    { name: '绿茶茶汤', qty: 200 },
  ],
  'Six Grapes Fruit Tea': [
    { name: '果糖', qty: 50 },
    { name: '绿茶茶汤', qty: 150 },
  ],
  'Blueberry Seed Tea': [
    { name: '蓝莓果肉', qty: 60 },
    { name: '果糖', qty: 35 },
    { name: '绿茶茶汤', qty: 200 },
  ],
  'Lemon Black Tea': [
    { name: '果糖', qty: 40 },
    { name: '红茶茶汤', qty: 250 },
  ],
  'Grape Lemon Tea': [
    { name: '果糖', qty: 45 },
    { name: '红茶茶汤', qty: 200 },
  ],
  'Fresh-Squeezed Lemonade': [
    { name: '果糖', qty: 50 },
    { name: '绿茶茶汤', qty: 150 },
  ],
  'Passion Fruit Pearl & Jelly Tea': [
    { name: '百香果肉', qty: 40 },
    { name: '珍珠', qty: 30 },
    { name: '椰果', qty: 20 },
    { name: '果糖', qty: 40 },
    { name: '绿茶茶汤', qty: 200 },
  ],
  'Mango Smoothies with Coconut Jelly': [
    { name: '芒果果肉', qty: 100 },
    { name: '椰果', qty: 30 },
    { name: '泰国冰糖浆', qty: 40 },
  ],
  'Fresh Raspberry Oranges': [
    { name: '果糖', qty: 50 },
    { name: '绿茶茶汤', qty: 150 },
  ],
  'Super Fruit Bucket (Peach/Passion Fruit)': [
    { name: '百香果肉', qty: 60 },
    { name: '果糖', qty: 60 },
    { name: '绿茶茶汤', qty: 200 },
  ],
  'Sweet and Sour Plum': [
    { name: '果糖', qty: 40 },
    { name: '红茶茶汤', qty: 200 },
  ],
  'Australia Orange Juice': [
    { name: '果糖', qty: 30 },
    { name: '红茶茶汤', qty: 250 },
  ],
  'Iced Americano Coffee': [
    { name: '奶精粉', qty: 20 },
    { name: '果糖', qty: 25 },
  ],
  'Coffee Latte': [
    { name: '奶精粉', qty: 25 },
    { name: '果糖', qty: 30 },
    { name: '鲜牛奶', qty: 80 },
  ],
  'Cappuccino': [
    { name: '奶精粉', qty: 25 },
    { name: '果糖', qty: 25 },
    { name: '淡奶油', qty: 30 },
  ],
  'Coconut Jelly Milk Tea': [
    { name: '椰果', qty: 40 },
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 35 },
    { name: '红茶茶汤', qty: 200 },
  ],
  'Super Milk Tea Bucket (Pilih 3 Topping)': [
    { name: '珍珠', qty: 50 },
    { name: '椰果', qty: 30 },
    { name: '布丁', qty: 1 },
    { name: '奶精粉', qty: 35 },
    { name: '果糖', qty: 40 },
    { name: '红茶茶汤', qty: 250 },
  ],
  'Brown Sugar Pearl Milk Tea': [
    { name: '珍珠', qty: 50 },
    { name: '焦糖糖浆', qty: 40 },
    { name: '奶精粉', qty: 30 },
    { name: '红茶茶汤', qty: 200 },
  ],
  'Super Grass Jelly Milk Tea': [
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 35 },
    { name: '乌龙茶汤', qty: 200 },
  ],
  'Peach Oolong Milk Tea': [
    { name: '果糖', qty: 35 },
    { name: '乌龙茶汤', qty: 200 },
    { name: '奶精粉', qty: 25 },
  ],
  'Original Milk Tea': [
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 35 },
    { name: '红茶茶汤', qty: 200 },
  ],
  'Milk Tea dengan 2 Topping': [
    { name: '珍珠', qty: 40 },
    { name: '椰果', qty: 25 },
    { name: '奶精粉', qty: 30 },
    { name: '果糖', qty: 35 },
    { name: '红茶茶汤', qty: 200 },
  ],
}

async function main() {
  console.log('📦 开始导入库存和配方数据...\n')

  // 获取 store
  const store = await prisma.store.findFirst()
  if (!store) {
    console.error('❌ 未找到 store，请先运行 seed.ts')
    process.exit(1)
  }
  console.log('📍 Store:', store.name)

  // 1. 创建库存物料
  console.log('\n📦 导入库存物料...')
  const inventoryMap = new Map<string, any>()

  for (const item of inventoryData) {
    const inv = await prisma.inventory.create({
      data: {
        storeId: store.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        currentStock: item.stock,
        avgCost: item.cost,
        safetyStock: item.safety,
        type: item.category === '包装' ? 'finished_goods' : 'raw_material'
      }
    })
    inventoryMap.set(item.name, inv)
    console.log(`  ✓ ${item.name} (${item.category})`)
  }
  console.log(`\n  共创建 ${inventoryData.length} 个物料`)

  // 2. 获取所有商品
  console.log('\n🧋 导入产品配方...')
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    include: { specs: true }
  })

  let bomCount = 0
  for (const product of products) {
    const bomItems = bomData[product.name]
    if (!bomItems) {
      console.log(`  ⚠ ${product.name} - 无配方数据`)
      continue
    }

    // 计算 BOM 成本
    let bomCost = 0
    const bomRecords = []

    for (const bom of bomItems) {
      const inv = inventoryMap.get(bom.name)
      if (!inv) {
        console.log(`    ⚠ 物料 ${bom.name} 不存在`)
        continue
      }
      const cost = (inv.avgCost * bom.qty) / 1000 // 转换单位
      bomCost += cost
      bomRecords.push({
        inventoryId: inv.id,
        quantity: bom.qty,
        unit: inv.unit,
        costPerUnit: inv.avgCost / 1000,
        totalCost: cost
      })
    }

    // 创建 BOM 记录
    if (bomRecords.length > 0) {
      await prisma.bOMItem.deleteMany({
        where: { productId: product.id }
      })

      for (const record of bomRecords) {
        await prisma.bOMItem.create({
          data: {
            productId: product.id,
            inventoryId: record.inventoryId,
            quantity: record.quantity,
            unit: record.unit,
            costPerUnit: record.costPerUnit,
            totalCost: Math.round(record.totalCost)
          }
        })
      }

      // 更新产品成本
      await prisma.product.update({
        where: { id: product.id },
        data: { costPrice: Math.round(bomCost) }
      })

      bomCount++
      console.log(`  ✓ ${product.name} - BOM成本 Rp ${Math.round(bomCost)}`)
    }
  }

  console.log('\n' + '═'.repeat(50))
  console.log('✅ 导入完成!')
  console.log(`   物料数量: ${inventoryData.length}`)
  console.log(`   配方数量: ${bomCount}`)
  console.log('═'.repeat(50) + '\n')
}

main()
  .catch((e) => {
    console.error('❌ 导入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })