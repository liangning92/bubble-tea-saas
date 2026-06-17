import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create tenant first
  const tenant = await prisma.tenant.create({
    data: {
      id: 'test-tenant',
      name: 'Test Company',
    }
  })

  // Create store
  const store = await prisma.store.create({
    data: {
      id: 'test-store',
      name: 'Bubble Tea Store',
      tenantId: tenant.id,
    }
  })

  // Create admin user
  const user = await prisma.user.create({
    data: {
      phone: '081234567890',
      password: 'admin123',
      role: 'admin',
      storeId: store.id,
    }
  })

  console.log('Created tenant:', tenant.id)
  console.log('Created store:', store.id)
  console.log('Created user:', user.phone)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
