import prisma from '../config/database'

// Account types: cash | bank | receivable | payable

export async function getAccounts(storeId: string, type?: string) {
  const where: any = { storeId }
  if (type) where.type = type

  return prisma.financeAccount.findMany({
    where,
    orderBy: { sortOrder: 'asc' }
  })
}

export async function getAccount(id: string) {
  return prisma.financeAccount.findUnique({ where: { id } })
}

export async function createAccount(data: {
  storeId: string
  code: string
  name: string
  type: string
  parentCode?: string
  sortOrder?: number
  initialBalance?: number
}) {
  return prisma.financeAccount.create({
    data: {
      storeId: data.storeId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentCode: data.parentCode,
      sortOrder: data.sortOrder || 0
    }
  })
}

export async function updateAccount(id: string, data: {
  code?: string
  name?: string
  type?: string
  parentCode?: string
  sortOrder?: number
}) {
  return prisma.financeAccount.update({
    where: { id },
    data: {
      ...(data.code && { code: data.code }),
      ...(data.name && { name: data.name }),
      ...(data.type && { type: data.type }),
      ...(data.parentCode !== undefined && { parentCode: data.parentCode }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder })
    }
  })
}

export async function deleteAccount(id: string) {
  return prisma.financeAccount.delete({ where: { id } })
}

// Transfer between accounts
export async function transfer(data: {
  storeId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  note?: string
  date: Date
}) {
  if (data.amount <= 0) {
    throw new Error('Amount must be positive')
  }

  // Get both accounts
  const fromAccount = await prisma.financeAccount.findUnique({ where: { id: data.fromAccountId } })
  const toAccount = await prisma.financeAccount.findUnique({ where: { id: data.toAccountId } })

  if (!fromAccount || !toAccount) {
    throw new Error('Account not found')
  }

  // Create transfer record and update balances in a transaction
  return prisma.$transaction(async (tx) => {
    // Create transfer record
    const transfer = await tx.financeTransfer.create({
      data: {
        storeId: data.storeId,
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        note: data.note,
        date: data.date
      }
    })

    // Update from account balance (decrease)
    await tx.financeAccount.update({
      where: { id: data.fromAccountId },
      data: { balance: { decrement: data.amount } }
    })

    // Update to account balance (increase)
    await tx.financeAccount.update({
      where: { id: data.toAccountId },
      data: { balance: { increment: data.amount } }
    })

    return transfer
  })
}

// Get transfers
export async function getTransfers(storeId: string, options?: {
  fromAccountId?: string
  toAccountId?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { storeId }
  if (options?.fromAccountId) where.fromAccountId = options.fromAccountId
  if (options?.toAccountId) where.toAccountId = options.toAccountId
  if (options?.startDate || options?.endDate) {
    where.date = {}
    if (options.startDate) where.date.gte = options.startDate
    if (options.endDate) where.date.lte = options.endDate
  }

  return prisma.financeTransfer.findMany({
    where,
    include: {
      fromAccount: true,
      toAccount: true
    },
    orderBy: { date: 'desc' }
  })
}

// Seed default accounts for a store
export async function seedDefaultAccounts(storeId: string) {
  const defaults = [
    // Asset accounts (type: asset has sub-types: cash, bank, receivable)
    { code: '1001', name: 'Cash', type: 'cash', sortOrder: 1 },
    { code: '1002', name: 'Bank BCA', type: 'bank', sortOrder: 2 },
    { code: '1003', name: 'Bank Mandiri', type: 'bank', sortOrder: 3 },
    { code: '1004', name: 'Accounts Receivable', type: 'receivable', sortOrder: 4 },
    // Liability accounts (type: liability = payable)
    { code: '2001', name: 'Accounts Payable', type: 'payable', sortOrder: 10 },
    // Revenue
    { code: '4001', name: 'Sales Revenue', type: 'revenue', sortOrder: 20 },
    // Cost of Goods Sold
    { code: '5001', name: 'Cost of Goods Sold', type: 'cogs', sortOrder: 30 },
    // Expenses
    { code: '6001', name: 'Rent Expense', type: 'expense', sortOrder: 40 },
    { code: '6002', name: 'Utilities Expense', type: 'expense', sortOrder: 41 },
    { code: '6003', name: 'Salaries Expense', type: 'expense', sortOrder: 42 },
  ]

  // Check if already seeded
  const existing = await prisma.financeAccount.findMany({
    where: { storeId }
  })

  if (existing.length > 0) {
    return { count: 0, message: 'Already seeded' }
  }

  // Create all accounts with initial balance of 0
  await prisma.financeAccount.createMany({
    data: defaults.map(d => ({ ...d, storeId, balance: 0 }))
  })

  return { count: defaults.length }
}
