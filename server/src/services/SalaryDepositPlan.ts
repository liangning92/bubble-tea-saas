import { Prisma } from '@prisma/client'
import prisma from '../config/database'
import { calculateMonthlyDeduction, DepositInputError } from './DepositService'

type Database = Prisma.TransactionClient
export async function salaryDepositPlan(staffId: string, period: string, db: Database = prisma) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new DepositInputError('Invalid payroll month')
  const [year, month] = period.split('-').map(Number)
  const end = new Date(Date.UTC(year, month, 1) - 7 * 3600000)
  const deposits = await db.staffDeposit.findMany({ where: { staffId, status: 'active', startDate: { lt: end } }, include: { depositRule: true, deductionLogs: true } })
  const linkedIds = deposits.flatMap(d => d.deductionLogs.flatMap(log => log.salaryId ? [log.salaryId] : []))
  const posted = linkedIds.length ? await db.salary.findMany({ where: { id: { in: linkedIds }, staffId, month: period, status: 'paid' }, select: { id: true } }) : []
  const postedIds = new Set(posted.map(s => s.id))
  const items: Array<{staffDepositId: string; ruleName: string; amount: number; amountMinor: number}> = []
  for (const deposit of deposits) {
    if (deposit.deductionLogs.some(log => log.salaryId && postedIds.has(log.salaryId))) continue
    const due = await calculateMonthlyDeduction(deposit)
    if (due.shouldDeduct && due.amount > 0) items.push({staffDepositId:deposit.id, ruleName:deposit.depositRule.name, amount:Math.round(due.amount/100), amountMinor:due.amount})
  }
  return items
}

export function sameDepositPlan(a: Array<{staffDepositId: string; amountMinor: number}>, b: Array<{staffDepositId: string; amountMinor: number}>) {
  const normalized = (items: typeof a) => JSON.stringify(items.map(i => [i.staffDepositId, i.amountMinor]).sort((x,y) => String(x[0]).localeCompare(String(y[0]))))
  return normalized(a) === normalized(b)
}

// Input deduction includes the supplied deposit plan. Add omitted required deposits;
// preserve the non-deposit portion and reject stale/altered nonempty plans.
export async function normalizeSalaryDeposits(db: Database, staffId: string, month: string, deduction: number, supplied: Array<{staffDepositId: string; amountMinor: number}>) {
  const expected = await salaryDepositPlan(staffId, month, db)
  if (supplied.length && !sameDepositPlan(supplied, expected)) throw new DepositInputError('SALARY_DEPOSIT_RECALC_REQUIRED')
  const oldAmount = supplied.reduce((sum,i) => sum + Math.round(i.amountMinor/100),0)
  if (deduction < oldAmount) throw new DepositInputError('Deposit plan exceeds payroll deductions')
  return {items:expected, deduction:deduction-oldAmount+expected.reduce((sum,i)=>sum+i.amount,0)}
}
