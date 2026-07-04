import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
  transactionOptions: {
    maxWait: 10000,  // 10s max time to wait for a transaction slot
    timeout: 30000   // 30s max time for transaction to complete
  }
})

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

export default prisma