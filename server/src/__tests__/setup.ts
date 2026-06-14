import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma || new PrismaClient()

beforeAll(async () => {
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