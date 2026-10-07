import prisma from '../config/database'
import { BusinessInputError as ExpenseInputError, parseBusinessDate } from '../utils/businessDate'
export { BusinessInputError as ExpenseInputError } from '../utils/businessDate'
export const normalizeExpenseDate = parseBusinessDate

function validateAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
    throw new ExpenseInputError('Expense amount must be a positive integer within the supported range')
  }
}

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

  return withPurchaseQuantities(await prisma.expense.findMany({ where, orderBy: { date: 'desc' } }))
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
  date: Date | string
  referenceId?: string
  referenceType?: string
}) {
  validateAmount(data.amount)
  return prisma.expense.create({
    data: {
      storeId: data.storeId,
      type: data.type,
      category: data.category,
      amount: data.amount,
      description: data.description,
      date: normalizeExpenseDate(data.date),
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
  date?: Date | string
}) {
  if (data.amount !== undefined) validateAmount(data.amount)
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(data.type && { type: data.type }),
      ...(data.category && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.date !== undefined && { date: normalizeExpenseDate(data.date) })
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
  date: Date | string
}>) {
  for (const item of data) validateAmount(item.amount)
  const valid = data
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
      date: normalizeExpenseDate(d.date)
    }))
  })
}

// Default expense categories
const DEFAULT_EXPENSE_CATEGORIES = [
  { key: 'rent', label: '', labelZh: '租金', labelEn: 'Rent', color: 'text-purple-600', bgColor: 'bg-purple-100', isDefault: true },
  { key: 'utilities', label: '', labelZh: '水电费', labelEn: 'Utilities', color: 'text-blue-600', bgColor: 'bg-blue-100', isDefault: true },
  { key: 'supplies', label: '', labelZh: '用品', labelEn: 'Supplies', color: 'text-green-600', bgColor: 'bg-green-100', isDefault: true },
  { key: 'salary', label: '', labelZh: '工资', labelEn: 'Salary', color: 'text-orange-600', bgColor: 'bg-orange-100', isDefault: true },
  { key: 'reimbursement', label: '', labelZh: '报销', labelEn: 'Reimbursement', color: 'text-pink-600', bgColor: 'bg-pink-100', isDefault: true },
  { key: 'other', label: '', labelZh: '其他', labelEn: 'Other', color: 'text-gray-600', bgColor: 'bg-gray-100', isDefault: true }
]

// Get expense categories from Config or defaults
export async function getExpenseCategories(storeId: string) {
  try {
    const config = await prisma.config.findUnique({
      where: { storeId_key: { storeId, key: 'expense.categories' } }
    })
    if (config && config.value) {
      return JSON.parse(config.value)
    }
  } catch {}
  return DEFAULT_EXPENSE_CATEGORIES
}

// Save expense categories to Config
export async function saveExpenseCategories(storeId: string, categories: any[]) {
  await prisma.config.upsert({
    where: { storeId_key: { storeId, key: 'expense.categories' } },
    update: { value: JSON.stringify(categories) },
    create: {
      storeId,
      key: 'expense.categories',
      value: JSON.stringify(categories),
      category: 'expense'
    }
  })
  return categories
}

// POS purchase quantity is persisted atomically in the creation audit, without changing legacy money/DB schemas.
export async function withPurchaseQuantities<T extends { id: string; storeId: string; referenceType: string | null }>(expenses: T[], db: Pick<typeof prisma, 'financeAuditLog'> = prisma): Promise<(T & { quantity?: number })[]> {
  const purchases = expenses.filter(e => e.referenceType === 'pos_reimbursement')
  if (!purchases.length) return expenses
  const logs = await db.financeAuditLog.findMany({ where: { storeId: { in: [...new Set(purchases.map(e => e.storeId))] }, entityType: 'expense', action: 'create', entityId: { in: purchases.map(e => e.id) } }, select: { entityId: true, newValue: true } })
  const quantities = new Map(logs.map(log => { try { return [log.entityId, JSON.parse(log.newValue || '{}').quantity] as const } catch { return [log.entityId, undefined] as const } }))
  return expenses.map(e => ({ ...e, ...(quantities.has(e.id) ? { quantity: quantities.get(e.id) } : {}) }))
}
