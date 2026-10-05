import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const phone = process.env.SEED_ADMIN_PHONE?.trim()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!phone || !password) throw new Error('SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD are required')
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw new Error('SEED_ADMIN_PHONE must be a valid phone number')
  if (Buffer.byteLength(password, 'utf8') < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('SEED_ADMIN_PASSWORD must be 10–72 bytes')
  }

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
      phone,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
      storeId: store.id,
    }
  })

  console.log('Created tenant:', tenant.id)
  console.log('Created store:', store.id)
  console.log('Created admin user:', user.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
