import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll } from '@jest/globals'
import { randomBytes } from 'crypto'

declare global {
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma || new PrismaClient()

export function createTestCredentials() {
  const phoneSuffix = String(randomBytes(6).readUIntBE(0, 6) % 10_000_000_000).padStart(10, '0')
  return {
    phone: `08${phoneSuffix}`,
    password: randomBytes(18).toString('base64url')
  }
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL || ''
  if (process.env.NODE_ENV !== 'test' || !/(?:test|_test|\/tmp\/|:memory:)/i.test(databaseUrl)) {
    throw new Error('Refusing to clear database: tests require NODE_ENV=test and an isolated test database URL (name it *_test or use a temporary database).')
  }

  // Clean up test data before running tests
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.pointLog.deleteMany({})
  await prisma.member.deleteMany({})
  await prisma.stockOutLog.deleteMany({})
  await prisma.stockInLog.deleteMany({})
  await prisma.bOMItem.deleteMany({})
  await prisma.inventory.deleteMany({})
  await prisma.productAddon.deleteMany({})
  await prisma.spec.deleteMany({})
  await prisma.product.deleteMany({})
  await prisma.category.deleteMany({})
  await prisma.schedule.deleteMany({})
  await prisma.attendance.deleteMany({})
  await prisma.salary.deleteMany({})
  await prisma.staff.deleteMany({})
  await prisma.config.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.store.deleteMany({})
  await prisma.tenant.deleteMany({})
})

afterAll(async () => {
  await prisma.$disconnect()
})

export { prisma }
