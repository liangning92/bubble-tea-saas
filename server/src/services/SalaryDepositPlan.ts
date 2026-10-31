import { Prisma } from '@prisma/client'
import prisma from '../config/database'
import { calculateMonthlyDeduction, DepositInputError } from './DepositService'
import { businessDate } from './ProbationService'
import { hasLeftEmployment } from './DepositLifecycle'
import { isPayrollEmployee } from './StaffIdentityService'

type Database = Prisma.TransactionClient
const policyKey = 'staff.deposit.onboardingRule'
async function onboardingDeposit(db: Database, staff: any) {
  if (!staff?.hireDate || !await isPayrollEmployee(db, staff)) return null
  const policy = await db.config.findUnique({ where: { storeId_key: { storeId: staff.storeId, key: policyKey } } })
  // An explicitly configured store policy never depends on per-employee setup.
  if (!policy) return null
  const id = JSON.parse(policy.value)?.depositRuleId
  if (!id) return null
  const rule = await db.depositRule.findUnique({ where: { id } })
  if (!rule || rule.storeId !== staff.storeId || !rule.isActive || rule.deductionType !== 'one_time') throw new DepositInputError('ONBOARDING_DEPOSIT_RULE_REQUIRED')
  return { id: `onboarding-${staff.id}-${rule.id}`, staffId: staff.id, storeId: staff.storeId,
    depositRuleId: rule.id, depositRule: rule, totalAmount: rule.depositAmount,
    deductedAmount: 0, refundedAmount: 0, deductionCount: 0, status: 'active', startDate: staff.hireDate, deductionLogs: [] }
}
export async function ensureOnboardingDeposit(db: Database, staff: any) {
  const draft = await onboardingDeposit(db, staff)
  if (!draft || staff.terminationDate) return
  const key = `staff.deposit.onboarding.${staff.id}`
  await db.config.upsert({ where: { storeId_key: { storeId: staff.storeId, key } }, create: { storeId: staff.storeId, key, category: 'staff', value: draft.id }, update: { category: 'staff' } })
  const existing = await db.staffDeposit.findFirst({ where: { staffId: staff.id, depositRule: { deductionType: 'one_time' } } })
  if (!existing) {
    const { depositRule, deductionLogs, ...data } = draft
    await db.staffDeposit.create({ data })
  }
}
export async function salaryDepositPlan(staffId: string, period: string, db: Database = prisma, availablePay = Infinity) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new DepositInputError('Invalid payroll month')
  const [year, month] = period.split('-').map(Number)
  const end = new Date(Date.UTC(year, month, 1) - 7 * 3600000)
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (hasLeftEmployment(staff) || (staff?.terminationDate && businessDate(staff.terminationDate).slice(0,7) <= period)) return []
  const deposits: any[] = await db.staffDeposit.findMany({ where: { staffId, status: 'active', startDate: { lt: end } }, include: { depositRule: true, deductionLogs: true } })
  const existingOneTime = await db.staffDeposit.findFirst({ where: { staffId, depositRule: { deductionType: 'one_time' } } })
  if (!existingOneTime) { const draft = await onboardingDeposit(db, staff); if (draft && draft.startDate < end) deposits.push(draft) }
  const linkedIds = deposits.flatMap(d => d.deductionLogs.flatMap((log: any) => log.salaryId ? [log.salaryId] : []))
  const posted = linkedIds.length ? await db.salary.findMany({ where: { id: { in: linkedIds }, staffId, month: period, status: 'paid' }, select: { id: true } }) : []
  const postedIds = new Set(posted.map(s => s.id))
  const items: Array<{staffDepositId: string; ruleName: string; amount: number; amountMinor: number}> = []
  let budget = Math.max(0, Math.floor(availablePay))
  for (const deposit of deposits) {
    if (deposit.deductionLogs.some((log: any) => log.salaryId && postedIds.has(log.salaryId))) continue
    let due = await calculateMonthlyDeduction(deposit)
    if (deposit.depositRule.deductionType === 'one_time') {
      const firstMonth = businessDate(staff?.hireDate || deposit.startDate).slice(0, 7)
      // Leaving cancels any uncollected balance, regardless of trial status.
      if (period < firstMonth || staff?.status==='resigned' || (staff?.terminationDate && (businessDate(staff.terminationDate).slice(0, 7) <= period || businessDate(staff.terminationDate)<businessDate(new Date())))) continue
      const pending = await db.salary.findMany({ where: { staffId, status: 'pending', month: { lt: period } }, select: { id: true } })
      let reserved = 0
      for (const salary of pending) {
        const row = await db.config.findUnique({ where: { storeId_key: { storeId: deposit.storeId, key: `salary.depositPlan.${salary.id}` } } })
        if (row) reserved += JSON.parse(row.value).filter((i: any) => i.staffDepositId === deposit.id).reduce((sum: number, i: any) => sum + i.amountMinor, 0)
      }
      // No second full charge while first-month wages are unpaid. Only a known
      // shortfall after a first-month allocation/collection carries forward.
      if (period > firstMonth && deposit.deductedAmount === 0 && reserved === 0) {
        const firstSalary = await db.salary.findFirst({where:{staffId,month:firstMonth},select:{id:true}})
        const allocation = firstSalary && await db.config.findUnique({where:{storeId_key:{storeId:deposit.storeId,key:`salary.depositPlan.${firstSalary.id}`}}})
        // A saved empty allocation means the first wage had no funds available;
        // its entire outstanding deposit still carries forward after that month.
        if (!allocation) continue
      }
      due = { shouldDeduct: true, amount: Math.max(0, deposit.totalAmount - deposit.deductedAmount - reserved) }
    }
    const amount = Math.min(budget, Math.round(due.amount / 100))
    if (due.shouldDeduct && amount > 0) {
      items.push({ staffDepositId: deposit.id, ruleName: deposit.depositRule.name, amount, amountMinor: amount * 100 })
      budget -= amount
    }
  }
  return items
}
export async function salaryRefundPlan(staffId: string, period: string, db: Database = prisma) {
  const staff = await db.staff.findUnique({ where: { id: staffId } })
  if (!staff?.terminationDate || businessDate(staff.terminationDate).slice(0, 7) !== period) return { items: [], amount: 0 }
  const deposits = await db.staffDeposit.findMany({ where: { staffId, status: { not: 'refunded' } }, include: { depositRule: true } })
  const items = deposits.filter(d => d.deductedAmount > d.refundedAmount).map(d => ({ staffDepositId: d.id, ruleName: d.depositRule.name, amountMinor: d.deductedAmount - d.refundedAmount }))
  return { items, amount: items.reduce((sum, i) => sum + Math.round(i.amountMinor / 100), 0) }
}
export function sameDepositPlan(a: Array<{staffDepositId: string; amountMinor: number}>, b: Array<{staffDepositId: string; amountMinor: number}>) {
  const normalized = (items: typeof a) => JSON.stringify(items.map(i => [i.staffDepositId, i.amountMinor]).sort((x,y) => String(x[0]).localeCompare(String(y[0]))))
  return normalized(a) === normalized(b)
}
export async function normalizeSalaryDeposits(db: Database, staffId: string, month: string, deduction: number, supplied: Array<{staffDepositId: string; amountMinor: number}>, gross = Infinity) {
  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } })
  await ensureOnboardingDeposit(db, staff)
  const oldAmount = supplied.reduce((sum,i) => sum + Math.round(i.amountMinor/100),0)
  if (deduction < oldAmount) throw new DepositInputError('Deposit plan exceeds payroll deductions')
  const other = deduction - oldAmount
  const expected = await salaryDepositPlan(staffId, month, db, gross - other)
  if (supplied.length && !sameDepositPlan(supplied, expected)) throw new DepositInputError('SALARY_DEPOSIT_RECALC_REQUIRED')
  return { items: expected, deduction: other + expected.reduce((sum,i)=>sum+i.amount,0) }
}
