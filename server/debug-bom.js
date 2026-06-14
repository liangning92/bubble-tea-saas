const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const storeId = 'cmq3cn8py0002ylapuoj05pw9'
  console.log('Store ID:', storeId)
  
  const products = await prisma.product.findMany({
    where: { storeId, deletedAt: null },
    take: 3,
    include: { bomItems: true }
  })
  
  for (const p of products) {
    console.log('\n' + p.name + ' (BOMs: ' + p.bomItems.length + ')')
    let total = 0
    for (const item of p.bomItems) {
      const cpu = item.costPerUnit || 0
      const qty = item.quantity || 0
      total += qty * cpu
    }
    console.log('BOM cost:', total)
  }
}

main().finally(() => prisma.$disconnect())
