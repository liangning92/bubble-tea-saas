import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 标准产品数据 - 从产品名称和价格.docx导入
const standardMenuData = [
  // 1. Es Krim (冰淇淋)
  { category: 'Es Krim', products: [
    { name: 'Es Krim (Original/Matcha)', price: 8000 },
    { name: 'Red Bean Matcha Sundae', price: 16000 },
    { name: 'Brown Sugar Pearl Sundae', price: 16000 },
    { name: 'Mango Ice Smoothie Snow Top', price: 12000 },
    { name: 'Chocolate Oreo Sundae', price: 16000 },
    { name: 'Coffee Smoothie Snow Top', price: 16000 },
    { name: 'Boba MilkShake', price: 16000 },
    { name: 'Strawberry MilkShake', price: 16000 },
    { name: 'Matcha MilkShake', price: 16000 },
    { name: 'Chocolate Oreo Smoothie Snow Top', price: 16000 },
    { name: 'Blueberry Sundae', price: 16000 },
    { name: 'Peach Sundae', price: 16000 },
    { name: 'Strawberry Sundae', price: 16000 },
    { name: 'Super Grass Jelly Sundae', price: 16000 },
  ]},
  // 2. Teh Buah (果茶)
  { category: 'Teh Buah', products: [
    { name: 'Ice Fresh Passion Fruit Tea', price: 10000 },
    { name: 'Six Grapes Fruit Tea', price: 18000 },
    { name: 'Blueberry Seed Tea', price: 16000 },
    { name: 'Lemon Black Tea', price: 12000 },
    { name: 'Grape Lemon Tea', price: 10000 },
    { name: 'Super Fruit Bucket (Orange)', price: 20000 },
    { name: 'Fresh-Squeezed Lemonade', price: 10000 },
    { name: 'Passion Fruit Pearl & Jelly Tea', price: 20000 },
    { name: 'Mango Smoothies with Coconut Jelly', price: 22000 },
    { name: 'Fresh Raspberry Oranges', price: 20000 },
    { name: 'Super Fruit Bucket (Peach/Passion Fruit)', price: 26000 },
    { name: 'Sweet and Sour Plum', price: 10000 },
    { name: 'Australia Orange Juice', price: 10000 },
  ]},
  // 3. Kopi (咖啡)
  { category: 'Kopi', products: [
    { name: 'Iced Americano Coffee', price: 12000 },
    { name: 'Coffee Latte', price: 12000 },
    { name: 'Cappuccino', price: 12000 },
  ]},
  // 4. Teh Susu (奶茶) - 部分有S/M size
  { category: 'Teh Susu', products: [
    { name: 'Coconut Jelly Milk Tea', price: 'dual', prices: [19000, 22000] },
    { name: 'Super Milk Tea Bucket (Pilih 3 Topping)', price: 26000 },
    { name: 'Brown Sugar Pearl Milk Tea', price: 'dual', prices: [19000, 22000] },
    { name: 'Super Grass Jelly Milk Tea', price: 'dual', prices: [19000, 22000] },
    { name: 'Peach Oolong Milk Tea', price: 'dual', prices: [19000, 22000] },
    { name: 'Original Milk Tea', price: 16000 },
    { name: 'Milk Tea dengan 2 Topping', price: 'dual', prices: [19000, 22000] },
  ]},
]

async function generateProductCode(storeId: string): Promise<string> {
  const lastProduct = await prisma.product.findFirst({
    where: { storeId },
    orderBy: { code: 'desc' }
  })
  if (!lastProduct) return 'PROD-001'
  const lastNum = parseInt(lastProduct.code.replace('PROD-', '')) || 0
  return `PROD-${String(lastNum + 1).padStart(3, '0')}`
}

async function main() {
  console.log('🌱 Importing standard menu data...\n')

  // 获取store
  const store = await prisma.store.findFirst()
  if (!store) {
   console.error('❌ No store found! Please run the main seed first.')
    process.exit(1)
  }
  console.log('📦 Store:', store.name, '(' + store.id + ')')

  // 删除现有的categories和products (软删除)
  console.log('\n🗑️  Clearing existing categories and products...')
  const existingCategories = await prisma.category.findMany({
    where: { storeId: store.id },
    include: { products: true }
  })

  for (const cat of existingCategories) {
    // 先删除products (通过cascade或手动)
    await prisma.product.deleteMany({
      where: { categoryId: cat.id }
    })
    // 再删除category
    await prisma.category.delete({ where: { id: cat.id } })
  }
  console.log('   ✓ Deleted', existingCategories.length, 'categories and their products')

  // 创建新的categories和products
  let totalProducts = 0
  let productIndex = 1

  for (const catData of standardMenuData) {
    console.log('\n📁 Category:', catData.category)

    // 创建category
    const category = await prisma.category.create({
      data: {
        storeId: store.id,
        name: catData.category,
        sortOrder: standardMenuData.indexOf(catData) + 1
      }
    })

    // 创建products
    for (const prod of catData.products) {
      const code = `PROD-${String(productIndex).padStart(3, '0')}`
      productIndex++

      const productData: any = {
        storeId: store.id,
        code,
        categoryId: category.id,
        name: prod.name,
        status: 'active',
        tags: JSON.stringify([])
      }

      // 处理价格 - 有些产品有S/M两个规格
      if (prod.price === 'dual' && prod.prices) {
        productData.specs = {
          create: [
            { name: 'Regular', price: prod.prices[0], priceAdjustment: 0, isDefault: true },
            { name: 'Large', price: prod.prices[1], priceAdjustment: prod.prices[1] - prod.prices[0], isDefault: false }
          ]
        }
      } else {
        productData.specs = {
          create: [
            { name: 'Regular', price: prod.price, priceAdjustment: 0, isDefault: true }
          ]
        }
      }

      await prisma.product.create({ data: productData })
      totalProducts++

      const priceDisplay = prod.price === 'dual'
        ? `${(prod.prices as number[])[0]/1000}k / ${(prod.prices as number[])[1]/1000}k`
        : `${(prod.price as number)/1000}k`
      console.log(`   ✓ ${code} - ${prod.name} (${priceDisplay})`)
    }
  }

  console.log('\n' + '═'.repeat(50))
  console.log('✅ Import completed!')
  console.log(`   Categories: ${standardMenuData.length}`)
  console.log(`   Products: ${totalProducts}`)
  console.log('═'.repeat(50) + '\n')
}

main()
  .catch((e) => {
   console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })