import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function requiredSeedValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be configured to seed user accounts`)
  return value
}

// Generate product code: PROD-001, PROD-002, ...
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
  console.log('🌱 Seeding database...')

  const seedAccounts = [
    { role: 'admin', phone: requiredSeedValue('SEED_ADMIN_PHONE'), password: requiredSeedValue('SEED_ADMIN_PASSWORD') },
    { role: 'manager', phone: requiredSeedValue('SEED_MANAGER_PHONE'), password: requiredSeedValue('SEED_MANAGER_PASSWORD') },
    { role: 'cashier', phone: requiredSeedValue('SEED_CASHIER_PHONE'), password: requiredSeedValue('SEED_CASHIER_PASSWORD') },
    { role: 'staff', phone: requiredSeedValue('SEED_STAFF_PHONE'), password: requiredSeedValue('SEED_STAFF_PASSWORD') }
  ]
  for (const account of seedAccounts) {
    if (!/^\+?[0-9]{8,15}$/.test(account.phone)) throw new Error(`Invalid phone format for seed role ${account.role}`)
    const minPasswordBytes = account.role === 'admin' ? 10 : 6
    if (Buffer.byteLength(account.password, 'utf8') < minPasswordBytes || Buffer.byteLength(account.password, 'utf8') > 72) {
      throw new Error(`Seed password for ${account.role} must be ${minPasswordBytes}–72 bytes`)
    }
  }

  // Create Tenant
  const tenant = await prisma.tenant.create({
    data: { name: 'Bubble Tea HQ' }
  })
  console.log('✓ Created tenant:', tenant.name)

  // Create Store
  const store = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      name: 'Bubbly Tea Jakarta',
      address: 'Jl. Sudirman No. 123, Jakarta Selatan',
      phone: '+622112345678',
      timezone: 'Asia/Jakarta',
      currency: 'IDR',
      locale: 'id'
    }
  })
  console.log('✓ Created store:', store.name)

  // Create Admin User
  const adminPasswordHash = await bcrypt.hash(seedAccounts[0].password, 12)
  const admin = await prisma.user.create({
    data: {
      phone: seedAccounts[0].phone,
      password: adminPasswordHash,
      role: 'admin',
      storeId: store.id
    }
  })

  await prisma.staff.create({
    data: {
      userId: admin.id,
      storeId: store.id,
      name: 'Administrator',
      employeeNumber: 'EMP0001',
      position: '店长'
    }
  })
  console.log('✓ Created admin user')

  // Create Manager User
  const managerUser = await prisma.user.create({
    data: {
      phone: seedAccounts[1].phone,
      password: await bcrypt.hash(seedAccounts[1].password, 12),
      role: 'manager',
      storeId: store.id
    }
  })

  await prisma.staff.create({
    data: {
      userId: managerUser.id,
      storeId: store.id,
      name: 'Manager Satu',
      employeeNumber: 'EMP0002',
      position: '经理'
    }
  })
  console.log('✓ Created manager')

  // Create Staff Users
  const staffUser1 = await prisma.user.create({
    data: {
      phone: seedAccounts[2].phone,
      password: await bcrypt.hash(seedAccounts[2].password, 12),
      role: 'cashier',
      storeId: store.id
    }
  })

  await prisma.staff.create({
    data: {
      userId: staffUser1.id,
      storeId: store.id,
      name: 'Kasir A',
      employeeNumber: 'EMP0003',
      position: '收银员'
    }
  })

  const staffUser2 = await prisma.user.create({
    data: {
      phone: seedAccounts[3].phone,
      password: await bcrypt.hash(seedAccounts[3].password, 12),
      role: 'staff',
      storeId: store.id
    }
  })

  await prisma.staff.create({
    data: {
      userId: staffUser2.id,
      storeId: store.id,
      name: 'Staff B',
      employeeNumber: 'EMP0004',
      position: '店员'
    }
  })
  console.log('✓ Created staff users')

  // Create Categories
  const categories = await Promise.all([
    prisma.category.create({ data: { storeId: store.id, name: '奶茶', sortOrder: 1 } }),
    prisma.category.create({ data: { storeId: store.id, name: '咖啡', sortOrder: 2 } }),
    prisma.category.create({ data: { storeId: store.id, name: '冰沙', sortOrder: 3 } }),
    prisma.category.create({ data: { storeId: store.id, name: '特调', sortOrder: 4 } })
  ])
  console.log('✓ Created categories:', categories.map(c => c.name).join(', '))

  // Create Addons
  const addons = await Promise.all([
    prisma.addon.create({ data: { storeId: store.id, name: '珍珠', price: 3000, priceAdjustment: 3000 } }),
    prisma.addon.create({ data: { storeId: store.id, name: '椰果', price: 3000, priceAdjustment: 3000 } }),
    prisma.addon.create({ data: { storeId: store.id, name: '布丁', price: 4000, priceAdjustment: 4000 } }),
    prisma.addon.create({ data: { storeId: store.id, name: '芋泥', price: 5000, priceAdjustment: 5000 } }),
    prisma.addon.create({ data: { storeId: store.id, name: '免费加小料', price: 0, priceAdjustment: 0, isFree: true } })
  ])
  console.log('✓ Created addons:', addons.map(a => a.name).join(', '))

  // Create Inventory
  const inventoryItems = await Promise.all([
    prisma.inventory.create({ data: { storeId: store.id, name: '茶叶', category: '茶叶', unit: 'kg', currentStock: 50, avgCost: 150000, safetyStock: 10 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '奶精', category: '奶精', unit: 'kg', currentStock: 30, avgCost: 80000, safetyStock: 5 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '珍珠粉圆', category: '小料', unit: 'kg', currentStock: 20, avgCost: 50000, safetyStock: 3 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '椰果', category: '小料', unit: 'kg', currentStock: 15, avgCost: 60000, safetyStock: 3 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '布丁', category: '小料', unit: '个', currentStock: 100, avgCost: 2000, safetyStock: 20 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '糖浆', category: '糖浆', unit: 'L', currentStock: 20, avgCost: 45000, safetyStock: 5 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '牛奶', category: '奶类', unit: 'L', currentStock: 40, avgCost: 25000, safetyStock: 10 } }),
    prisma.inventory.create({ data: { storeId: store.id, name: '冰块', category: '冰', unit: 'kg', currentStock: 100, avgCost: 5000, safetyStock: 20 } })
  ])
  console.log('✓ Created inventory items:', inventoryItems.length, 'items')

  // Create Products
  const milkTeaCategory = categories[0]
  const [tea, pearl] = inventoryItems

  // Product 1: 招牌奶茶
  const code1 = await generateProductCode(store.id)
  const milkTea = await prisma.product.create({
    data: {
      storeId: store.id,
      code: code1,
      categoryId: milkTeaCategory.id,
      name: '招牌奶茶',
      description: '经典奶茶，香浓丝滑',
      status: 'active',
      tags: JSON.stringify(['hot', 'bestseller']),
      specs: {
        create: [
          { name: '中杯', price: 18000, priceAdjustment: 0, isDefault: true },
          { name: '大杯', price: 22000, priceAdjustment: 4000, isDefault: false }
        ]
      },
      bomItems: {
        create: [
          { inventoryId: tea.id, quantity: 0.05, unit: 'kg' },
          { inventoryId: pearl.id, quantity: 0.03, unit: 'kg' }
        ]
      }
    },
    include: { specs: true }
  })

  for (const spec of milkTea.specs) {
    await prisma.productAddon.createMany({
      data: addons.filter(a => !a.isFree).map(a => ({
        productId: milkTea.id,
        specId: spec.id,
        addonId: a.id
      }))
    })
  }

  // Product 2: 黑糖脏脏奶茶
  const code2 = await generateProductCode(store.id)
  await prisma.product.create({
    data: {
      storeId: store.id,
      code: code2,
      categoryId: milkTeaCategory.id,
      name: '黑糖脏脏奶茶',
      description: '黑糖挂壁，珍珠Q弹',
      status: 'active',
      tags: JSON.stringify(['hot']),
      specs: {
        create: [
          { name: '中杯', price: 22000, priceAdjustment: 0, isDefault: true },
          { name: '大杯', price: 26000, priceAdjustment: 4000, isDefault: false }
        ]
      }
    }
  })

  // Product 3: 芋泥啵啵奶茶
  const code3 = await generateProductCode(store.id)
  await prisma.product.create({
    data: {
      storeId: store.id,
      code: code3,
      categoryId: milkTeaCategory.id,
      name: '芋泥啵啵奶茶',
      description: '绵密芋泥，Q弹珍珠',
      status: 'active',
      tags: JSON.stringify(['new']),
      specs: {
        create: [
          { name: '中杯', price: 24000, priceAdjustment: 0, isDefault: true },
          { name: '大杯', price: 28000, priceAdjustment: 4000, isDefault: false }
        ]
      }
    }
  })

  console.log('✓ Created products')

  // Create Members
  await Promise.all([
    prisma.member.create({
      data: {
        storeId: store.id,
        name: 'John Doe',
        phone: '081298765432',
        level: 'silver',
        points: 500,
        totalSpent: 500000
      }
    }),
    prisma.member.create({
      data: {
        storeId: store.id,
        name: 'Jane Smith',
        phone: '081212345678',
        level: 'gold',
        points: 1500,
        totalSpent: 2000000
      }
    })
  ])
  console.log('✓ Created members')

  // Create Configs
  await prisma.config.createMany({
    data: [
      { storeId: store.id, key: 'pos.default_payment', value: '"cash"', category: 'pos' },
      { storeId: store.id, key: 'pos.receipt_header', value: '"Bubbly Tea Jakarta"', category: 'pos' },
      { storeId: store.id, key: 'pos.offline_mode', value: 'true', category: 'pos' },
      { storeId: store.id, key: 'inventory.low_stock_threshold', value: '20', category: 'inventory' },
      { storeId: store.id, key: 'monthlyRevenueGoal', value: '50000000', category: 'finance' }
    ]
  })
  console.log('✓ Created configs')

  console.log('\n🎉 Database seeded successfully!\n')
  console.log('Seed accounts created. Credentials were read from the runtime environment and were not logged.')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
