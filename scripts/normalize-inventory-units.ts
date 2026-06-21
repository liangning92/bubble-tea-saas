/**
 * 库存单位标准化脚本
 *
 * 执行: cd server && npx ts-node ../scripts/normalize-inventory-units.ts
 *
 * 转换规则:
 * - kg → g: currentStock × 1000, avgCost ÷ 1000
 * - L → ml: currentStock × 1000, avgCost ÷ 1000
 * - 支/卷/包/套 → 个
 * - 合并同名+同类型物料 (累加 stock)
 * - 删除 avgCost=0 且 currentStock=0 的无效物料
 */

import prisma from '../src/config/database'

async function normalizeInventoryUnits() {
  console.log('🔄 开始库存单位标准化...\n')

  // 1. 转换 kg → g
  console.log('📦 转换 kg → g...')
  const kgItems = await prisma.inventory.findMany({ where: { unit: 'kg' } })
  for (const item of kgItems) {
    await prisma.inventory.update({
      where: { id: item.id },
      data: {
        currentStock: item.currentStock * 1000,
        avgCost: item.avgCost / 1000
      }
    })
    console.log(`  ✓ ${item.name}: ${item.currentStock}kg → ${item.currentStock * 1000}g, cost: ${item.avgCost} → ${item.avgCost / 1000}`)
  }
  console.log(`  完成: ${kgItems.length} 条记录\n`)

  // 2. 转换 L → ml
  console.log('📦 转换 L → ml...')
  const lItems = await prisma.inventory.findMany({ where: { unit: 'L' } })
  for (const item of lItems) {
    await prisma.inventory.update({
      where: { id: item.id },
      data: {
        currentStock: item.currentStock * 1000,
        avgCost: item.avgCost / 1000
      }
    })
    console.log(`  ✓ ${item.name}: ${item.currentStock}L → ${item.currentStock * 1000}ml, cost: ${item.avgCost} → ${item.avgCost / 1000}`)
  }
  console.log(`  完成: ${lItems.length} 条记录\n`)

  // 3. 转换 支/卷/包/套 → 个
  console.log('📦 转换 支/卷/包/套 → 个...')
  const otherUnits = ['支', '卷', '包', '套']
  for (const unit of otherUnits) {
    const items = await prisma.inventory.findMany({ where: { unit } })
    for (const item of items) {
      await prisma.inventory.update({
        where: { id: item.id },
        data: { unit: '个' }
      })
      console.log(`  ✓ ${item.name}: ${unit} → 个`)
    }
  }
  console.log(`  完成\n`)

  // 4. 合并同名+同类型物料
  console.log('🔗 合并同名+同类型物料...')
  const allItems = await prisma.inventory.findMany()
  const groups: Record<string, typeof allItems> = {}

  for (const item of allItems) {
    const key = `${item.name}|${item.type}`
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  let mergedCount = 0
  for (const [key, items] of Object.entries(groups)) {
    if (items.length > 1) {
      console.log(`\n  合并: ${key}`)
      // 保留第一条，其余合并
      const [primary, ...duplicates] = items
      let totalStock = primary.currentStock
      let totalValue = primary.currentStock * primary.avgCost

      for (const dup of duplicates) {
        totalStock += dup.currentStock
        totalValue += dup.currentStock * dup.avgCost

        // 更新 BOMItem 引用
        await prisma.bOMItem.updateMany({
          where: { inventoryId: dup.id },
          data: { inventoryId: primary.id }
        })

        // 删除重复记录
        await prisma.inventory.delete({ where: { id: dup.id } })
        console.log(`    - 删除重复: ${dup.name} (${dup.id.substring(0, 8)}...)`)
        mergedCount++
      }

      // 更新主记录
      const newAvgCost = totalStock > 0 ? Math.round(totalValue / totalStock) : 0
      await prisma.inventory.update({
        where: { id: primary.id },
        data: {
          currentStock: totalStock,
          avgCost: newAvgCost
        }
      })
      console.log(`    + 合并后: stock=${totalStock}, avgCost=${newAvgCost}`)
    }
  }
  console.log(`\n  完成: 合并了 ${mergedCount} 条重复记录\n`)

  // 5. 删除无效物料 (avgCost=0 且 currentStock=0)
  console.log('🗑️  删除无效物料...')
  const invalidItems = await prisma.inventory.findMany({
    where: {
      currentStock: 0,
      avgCost: 0
    }
  })
  for (const item of invalidItems) {
    // 先删除关联的 BOMItem
    await prisma.bOMItem.deleteMany({ where: { inventoryId: item.id } })
    await prisma.inventory.delete({ where: { id: item.id } })
    console.log(`  ✓ 删除: ${item.name}`)
  }
  console.log(`  完成: 删除 ${invalidItems.length} 条无效记录\n`)

  // 6. 验证结果
  console.log('✅ 验证结果:')
  const distinctUnits = await prisma.$queryRaw<{ unit: string }[]>`
    SELECT DISTINCT unit FROM Inventory ORDER BY unit
  `
  console.log(`  剩余单位: ${distinctUnits.map(u => u.unit).join(', ')}`)

  const totalCount = await prisma.inventory.count()
  console.log(`  总物料数: ${totalCount}`)

  console.log('\n🎉 库存单位标准化完成!')
}

normalizeInventoryUnits()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
