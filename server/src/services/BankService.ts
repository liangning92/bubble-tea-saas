import prisma from '../config/database'

// Bank Accounts
export async function getBankAccounts(storeId: string) {
  return prisma.bankAccount.findMany({
    where: { storeId },
    include: {
      transactions: {
        orderBy: { date: 'desc' },
        take: 10
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getBankAccount(id: string) {
  return prisma.bankAccount.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { date: 'desc' }
      }
    }
  })
}

export async function createBankAccount(data: {
  storeId: string
  name: string
  bank: string
  accountNo: string
  balance?: number
}) {
  return prisma.bankAccount.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      bank: data.bank,
      accountNo: data.accountNo,
      balance: data.balance || 0
    }
  })
}

export async function updateBankAccount(id: string, data: {
  name?: string
  bank?: string
  accountNo?: string
  balance?: number
}) {
  return prisma.bankAccount.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.bank && { bank: data.bank }),
      ...(data.accountNo && { accountNo: data.accountNo }),
      ...(data.balance !== undefined && { balance: data.balance })
    }
  })
}

export async function deleteBankAccount(id: string) {
  return prisma.bankAccount.delete({ where: { id } })
}

// Bank Transactions
export async function getBankTransactions(storeId: string, options?: {
  bankAccountId?: string
  type?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { storeId }
  if (options?.bankAccountId) where.bankAccountId = options.bankAccountId
  if (options?.type) where.type = options.type
  if (options?.startDate || options?.endDate) {
    where.date = {}
    if (options.startDate) where.date.gte = options.startDate
    if (options.endDate) where.date.lte = options.endDate
  }

  return prisma.bankTransaction.findMany({
    where,
    include: { bankAccount: true },
    orderBy: { date: 'desc' }
  })
}

export async function createBankTransaction(data: {
  storeId: string
  bankAccountId: string
  type: string
  amount: number
  counterparty: string
  note?: string
  date: Date
}) {
  // Validate counterparty - must be meaningful name (min 2 chars, not just numbers/symbols)
  if (!data.counterparty || data.counterparty.trim().length < 2) {
    throw new Error('Counterparty name must be at least 2 characters')
  }

  // Check for valid counterparty format (should contain at least one letter)
  if (!/[a-zA-Z]/.test(data.counterparty)) {
    throw new Error('Counterparty name must contain at least one letter')
  }

  // Validate amount is positive
  if (data.amount <= 0) {
    throw new Error('Transaction amount must be greater than 0')
  }

  // Create transaction
  const transaction = await prisma.bankTransaction.create({
    data: {
      storeId: data.storeId,
      bankAccountId: data.bankAccountId,
      type: data.type,
      amount: data.amount,
      counterparty: data.counterparty,
      note: data.note,
      date: data.date
    }
  })

  // Update account balance
  const account = await prisma.bankAccount.findUnique({
    where: { id: data.bankAccountId }
  })
  if (account) {
    const balanceChange = data.type === 'transfer_in' ? data.amount : -data.amount
    await prisma.bankAccount.update({
      where: { id: data.bankAccountId },
      data: { balance: account.balance + balanceChange }
    })
  }

  return transaction
}

export async function deleteBankTransaction(id: string) {
  const transaction = await prisma.bankTransaction.findUnique({ where: { id } })
  if (transaction) {
    // Reverse the balance change
    const account = await prisma.bankAccount.findUnique({
      where: { id: transaction.bankAccountId }
    })
    if (account) {
      const balanceChange = transaction.type === 'transfer_in'
        ? -transaction.amount
        : transaction.amount
      await prisma.bankAccount.update({
        where: { id: transaction.bankAccountId },
        data: { balance: account.balance + balanceChange }
      })
    }
  }

  return prisma.bankTransaction.delete({ where: { id } })
}