import prisma from '../config/database'

// Get expenses with filtering
export async function getExpenses(storeId: string, options?: {
  type?: string
  category?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { storeId }
  if (options?.type) where.type = options.type
  if (options?.category) where.category = options.category
  if (options?.startDate || options?.endDate) {
    where.date = {}
    if (options.startDate) where.date.gte = options.startDate
    if (options.endDate) where.date.lte = options.endDate
  }

  return prisma.expense.findMany({
    where,
    orderBy: { date: 'desc' }
  })
}

// Get expense summary by category
export async function getExpenseSummary(storeId: string, startDate: Date, endDate: Date) {
  const expenses = await prisma.expense.findMany({
    where: {
      storeId,
      date: { gte: startDate, lte: endDate }
    }
  })

  // Group by category
  const summary: Record<string, number> = {}
  for (const exp of expenses) {
    summary[exp.category] = (summary[exp.category] || 0) + exp.amount
  }

  const total = Object.values(summary).reduce((sum, v) => sum + v, 0)

  return {
    total,
    byCategory: Object.entries(summary).map(([category, amount]) => ({ category, amount })),
    count: expenses.length
  }
}

// Create expense
export async function createExpense(data: {
  storeId: string
  type: string
  category: string
  amount: number
  description: string
  referenceId?: string
  referenceType?: string
}) {
  // Validate amount > 0
  if (!data.amount || data.amount <= 0) {
    throw new Error('Expense amount must be greater than 0')
  }
  return prisma.expense.create({
    data: {
      storeId: data.storeId,
      type: data.type,
      category: data.category,
      amount: data.amount,
      description: data.description,
      referenceId: data.referenceId,
      referenceType: data.referenceType
    }
  })
}

// Delete expense
export async function deleteExpense(expenseId: string) {
  return prisma.expense.delete({ where: { id: expenseId } })
}

// Update expense
export async function updateExpense(expenseId: string, data: {
  type?: string
  category?: string
  amount?: number
  description?: string
  date?: Date
}) {
  // Validate amount > 0 if provided
  if (data.amount !== undefined && data.amount <= 0) {
    throw new Error('Expense amount must be greater than 0')
  }
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(data.type && { type: data.type }),
      ...(data.category && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.date && { date: data.date })
    }
  })
}

// Get expense by ID (for audit)
export async function getExpenseById(expenseId: string) {
  return prisma.expense.findUnique({ where: { id: expenseId } })
}

// Bulk create expenses (for import)
export async function createExpensesBulk(data: Array<{
  storeId: string
  type: string
  category: string
  amount: number
  description: string
  date: Date
}>) {
  // Filter out invalid amounts
  const valid = data.filter(d => d.amount && d.amount > 0)
  if (valid.length === 0) {
    throw new Error('No valid expenses to import')
  }
  return prisma.expense.createMany({
    data: valid.map(d => ({
      storeId: d.storeId,
      type: d.type,
      category: d.category,
      amount: d.amount,
      description: d.description,
      date: d.date
    }))
  })
}
