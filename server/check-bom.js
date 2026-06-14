const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const store = await prisma.store.findFirst()
  console.log('Store:', store.name, store.id)

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    take: 3,
    include: { bomItems: true }
  })

  for (const p of products) {
    console.log('\nProduct:', p.name, 'BOM items:', p.bomItems.length)
    let total = 0
    for (const item of p.bomItems) {
      const cpu = item.costPerUnit || 0
      const qty = item.quantity || 0
      total += qty * cpu
    }
    console.log('Total BOM cost:', total)
  }
}

main().finally(() => prisma.$disconnect())
