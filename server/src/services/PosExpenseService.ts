import prisma from '../config/database'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { normalizeExpenseDate, getExpenseCategories, withPurchaseQuantities } from './ExpenseService'
export const posExpenseSchema = z.object({ requestId: z.string().uuid(), category: z.string().min(1).max(100), amount: z.number().int().positive().max(21474836), quantity: z.number().int().positive().max(1000000), description: z.string().trim().min(1).max(2000), date: z.string().optional() }).strict()
const source = 'pos_reimbursement'
type Actor = { id: string; storeId: string }
export async function getPosExpenses(actor: Actor) {
  const expenses = await prisma.expense.findMany({ where: { storeId: actor.storeId, referenceType: source, referenceId: { startsWith: actor.id + ':' } }, orderBy: { createdAt: 'desc' }, take: 100 })
  return (await withPurchaseQuantities(expenses)).map(e => ({ ...e, amount: e.amount / 100 }))
}
export async function createPosExpense(actor: Actor, body: unknown) {
  const input = posExpenseSchema.parse(body)
  const date = normalizeExpenseDate(input.date || new Date())
  const referenceId = actor.id + ':' + input.requestId
  return prisma.$transaction(async tx => {
    await tx.store.update({ where: { id: actor.storeId }, data: { updatedAt: new Date() } })
    const saved = await tx.expense.findFirst({ where: { storeId: actor.storeId, referenceType: source, referenceId } })
    if (saved) {
      if (saved.amount !== input.amount * 100 || saved.category !== input.category || saved.description !== input.description) throw Error('POS_EXPENSE_REQUEST_CONFLICT')
      const audit = await tx.financeAuditLog.findFirst({ where: { storeId: actor.storeId, entityType: 'expense', entityId: saved.id, action: 'create' } })
      if (!audit?.newValue || JSON.parse(audit.newValue).quantity !== input.quantity) throw Error('POS_EXPENSE_REQUEST_CONFLICT')
      return { ...saved, amount: saved.amount / 100, quantity: input.quantity }
    }
    const config = await tx.config.findUnique({where:{storeId_key:{storeId:actor.storeId,key:'expense.categories'}}})
    const categories = config?.value ? JSON.parse(config.value) : await getExpenseCategories(actor.storeId)
    if (!categories.some(c => c.key === input.category && c.posVisible !== false)) throw Error('POS_EXPENSE_CATEGORY_INVALID')
    const expense = await tx.expense.create({ data: { storeId: actor.storeId, type: 'operational', category: input.category, amount: input.amount * 100, description: input.description, date, referenceId, referenceType: source } })
    await tx.financeAuditLog.create({ data: { storeId: actor.storeId, userId: actor.id, action: 'create', entityType: 'expense', entityId: expense.id, description: 'POS daily purchase reimbursement', newValue: JSON.stringify({ ...input, source }) } })
    return { ...expense, amount: input.amount, quantity: input.quantity }
  })
}
export function legacyPosExpenseBody(body: any) { return { requestId: body.requestId || randomUUID(), category: body.category, amount: body.amount, quantity: body.quantity || 1, description: body.description, date: body.date } }

export async function summarizeShiftPurchases(storeId: string, openedAt: Date, closedAt: Date, db: Pick<typeof prisma, 'expense' | 'financeAuditLog'> = prisma, categories?: Awaited<ReturnType<typeof getExpenseCategories>>) {
  const rows = await db.expense.findMany({ where: { storeId, referenceType: source, createdAt: { gte: openedAt, lt: closedAt } }, orderBy: { createdAt: 'asc' } })
  categories = categories || await getExpenseCategories(storeId)
  const items = (await withPurchaseQuantities(rows, db)).map(e => ({ id: e.id, category: categories!.find(c => c.key === e.category)?.label || e.category, quantity: e.quantity ?? null, amount: e.amount / 100, description: e.description }))
  return { total: items.reduce((sum, e) => sum + e.amount, 0), count: items.length, items, windowStart: openedAt.toISOString(), windowEnd: closedAt.toISOString(), source: 'pos_reimbursement', currency: 'IDR', recordedOnly: true }
}
