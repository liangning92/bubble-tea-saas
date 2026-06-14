import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixBomCosts() {
  console.log('修复BOM成本...')
  
  const bomItems = await prisma.bOMItem.findMany({
    include: { inventory: true }
  })
  
  let fixed = 0
  for (const item of bomItems) {
    const inv = item.inventory
    if (!inv) continue
    
    // costPerUnit 应该等于 inventory.avgCost
    const newCostPerUnit = inv.avgCost || 0
    const newTotalCost = Math.round((item.quantity || 0) * newCostPerUnit)
    
    if (item.costPerUnit !== newCostPerUnit || item.totalCost !== newTotalCost) {
      await prisma.bOMItem.update({
        where: { id: item.id },
        data: {
          costPerUnit: newCostPerUnit,
          totalCost: newTotalCost
        }
      })
      fixed++
    }
  }
  
  console.log(`修复了 ${fixed} 条BOM记录`)
}

fixBomCosts()
  .catch(console.error)
  .finally(() => prisma.$disconnect())