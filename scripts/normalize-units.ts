/**
 * normalize-units.ts
 * 
 * 数据清洗脚本：将 kg → g, L → ml，统一库存单位
 * 
 * 使用方式: npx ts-node scripts/normalize-units.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(60))
  console.log('库存单位统一清洗脚本')
  console.log('='.repeat(60))

  // ========== 第一步：kg → g 转换 ==========
  console.log('\n📦 第一步：kg → g 转换')
  console.log('-'.repeat(40))

  const kgItems = await prisma.inventory.findMany({
    where: { unit: 'kg' }
  })
  console.log(`找到 ${kgItems.length} 条 kg 记录`)

  let kgConverted = 0
  for (const item of kgItems) {
    const oldCost = item.avgCost
    const oldStock = item.currentStock

    // kg → g: 单价 / 1000, 库存 * 1000
    const newCost = oldCost / 1000
    const newStock = oldStock * 1000

    await prisma.inventory.update({
      where: { id: item.id },
      data: {
        unit: 'g',
        avgCost: newCost,
        currentStock: newStock
      }
    })
    kgConverted++
    console.log(`  ✓ ${item.name}: ${oldStock}kg → ${newStock}g, 均价 ${oldCost} → ${newCost}`)
  }
  console.log(`✅ kg → g 转换完成: ${kgConverted} 条`)

  // ========== 第二步：L → ml 转换 ==========
  console.log('\n📦 第二步：L → ml 转换')
  console.log('-'.repeat(40))

  const lItems = await prisma.inventory.findMany({
    where: { unit: 'L' }
  })
  console.log(`找到 ${lItems.length} 条 L 记录`)

  let lConverted = 0
  for (const item of lItems) {
    const oldCost = item.avgCost
    const oldStock = item.currentStock

    // L → ml: 单价 / 1000, 库存 * 1000
    const newCost = oldCost / 1000
    const newStock = oldStock * 1000

    await prisma.inventory.update({
      where: { id: item.id },
      data: {
        unit: 'ml',
        avgCost: newCost,
        currentStock: newStock
      }
    })
    lConverted++
    console.log(`  ✓ ${item.name}: ${oldStock}L → ${newStock}ml, 均价 ${oldCost} → ${newCost}`)
  }
  console.log(`✅ L → ml 转换完成: ${lConverted} 条`)

  // ========== 第三步：合并同名物料（保留 id 最小 + avgCost 有效的） ==========
  console.log('\n🔗 第三步：合并同名物料（保留最小 id + avgCost 有效的）')
  console.log('-'.repeat(40))

  // 找出所有有问题的同名物料（单位已经是 g/ml/个/pcs/支/卷等统一后的）
  const duplicates = await prisma.$queryRaw<Array<{ name: string; count: number }>>`
    SELECT name, COUNT(*) as count
    FROM Inventory
    GROUP BY name
    HAVING COUNT(*) > 1
  `
  console.log(`找到 ${duplicates.length} 组同名物料`)

  let mergedCount = 0
  let skippedCount = 0

  for (const dup of duplicates) {
    const items = await prisma.inventory.findMany({
      where: { name: dup.name },
      orderBy: { id: 'asc' }
    })

    // 优先保留 avgCost > 0 的；都无效则保留 id 最小的
    const validItems = items.filter(i => i.avgCost > 0 && i.currentStock > 0)
    const invalidItems = items.filter(i => i.avgCost === 0 && i.currentStock === 0)

    if (validItems.length === 0 && invalidItems.length <= 1) {
      // 全为无效且只有一条，无需处理
      continue
    }

    if (validItems.length === 0) {
      // 全无效，只保留 id 最小的
      const keep = items[0]
      const toDelete = items.slice(1)
      for (const item of toDelete) {
        try {
          await deleteInventorySafely(item.id)
          mergedCount++
          console.log(`  ✓ 删除无效重复: ${item.name}(id=${item.id}) → 已删除（库存=0,均价=0）`)
        } catch {
          skippedCount++
          console.log(`  ⚠ 跳过删除: ${item.name}(id=${item.id})，仍有关联数据`)
        }
      }
      continue
    }

    // 保留第一个有效的
    const keep = validItems[0]
    const toProcess = [...validItems.slice(1), ...invalidItems]

    for (const item of toProcess) {
      try {
        // 更新 BOMItem 引用
        await prisma.bOMItem.updateMany({
          where: { inventoryId: item.id },
          data: { inventoryId: keep.id }
        })

        // 累加库存到保留项
        await prisma.inventory.update({
          where: { id: keep.id },
          data: {
            currentStock: { increment: item.currentStock }
          }
        })

        // 删除被合并的物料
        await deleteInventorySafely(item.id)
        mergedCount++
        console.log(`  ✓ 合并: ${item.name}(id=${item.id}) → ${keep.name}(id=${keep.id}), 库存: +${item.currentStock}`)
      } catch {
        skippedCount++
        console.log(`  ⚠ 跳过: ${item.name}(id=${item.id})，有其他关联数据`)
      }
    }
  }
  console.log(`✅ 合并完成: ${mergedCount} 条成功, ${skippedCount} 条跳过`)

  // ========== 第四步：删除无效物料（avgCost=0 且 currentStock=0） ==========
  console.log('\n🗑️ 第四步：删除无效物料（avgCost=0 且 currentStock=0）')
  console.log('-'.repeat(40))

  const invalidMaterials = await prisma.inventory.findMany({
    where: {
      type: 'raw_material',
      avgCost: 0,
      currentStock: 0
    }
  })
  console.log(`找到 ${invalidMaterials.length} 条无效 raw_material`)

  let deletedCount = 0
  let deleteSkipped = 0
  for (const item of invalidMaterials) {
    try {
      // 先清理 BOMItem（如果还有的话）
      await prisma.bOMItem.deleteMany({
        where: { inventoryId: item.id }
      })

      await deleteInventorySafely(item.id)
      deletedCount++
      console.log(`  ✓ 删除: ${item.name}(id=${item.id})`)
    } catch {
      deleteSkipped++
      console.log(`  ⚠ 跳过删除: ${item.name}(id=${item.id})，有其他关联数据`)
    }
  }
  console.log(`✅ 删除无效物料完成: ${deletedCount} 条成功, ${deleteSkipped} 条跳过`)

  // ========== 第五步：打印清洗报告 ==========
  console.log('\n' + '='.repeat(60))
  console.log('清洗报告')
  console.log('='.repeat(60))
  console.log(`  kg → g 转换:   ${kgConverted} 条`)
  console.log(`  L → ml 转换:   ${lConverted} 条`)
  console.log(`  合并/删除重复: ${mergedCount} 条成功, ${skippedCount} 条跳过`)
  console.log(`  删除无效物料: ${deletedCount} 条成功, ${deleteSkipped} 条跳过`)

  // 最终单位统计
  const finalUnits = await prisma.inventory.findMany({
    select: { unit: true },
    distinct: ['unit']
  })
  console.log(`\n📊 最终单位列表: ${finalUnits.map(u => u.unit).sort().join(', ')}`)

  console.log('\n✅ 清洗完成！')
}

/**
 * 安全删除库存（先清理所有关联，再删除）
 */
async function deleteInventorySafely(inventoryId: string): Promise<void> {
  // 按依赖顺序清理关联表
  await prisma.bOMItem.deleteMany({ where: { inventoryId } })
  await prisma.batch.deleteMany({ where: { inventoryId } })
  await prisma.stockInLog.deleteMany({ where: { inventoryId } })
  await prisma.stockOutLog.deleteMany({ where: { inventoryId } })
  await prisma.inventoryCountItem.deleteMany({ where: { inventoryId } })
  
  // ProcessRecipeItem 需要特殊处理（input/output type）
  const recipeItems = await prisma.processRecipeItem.findMany({
    where: { inventoryId }
  })
  if (recipeItems.length > 0) {
    throw new Error('Cannot delete: referenced by ProcessRecipeItem')
  }

  await prisma.inventory.delete({ where: { id: inventoryId } })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
