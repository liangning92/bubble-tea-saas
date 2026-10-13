import { Prisma } from '@prisma/client'
import { savedPayrollBasis } from './ProbationService'
import { savedAdjustmentPlan } from './SalaryAdjustmentService'

type DB = Prisma.TransactionClient
export const payslipKey = (id: string) => `salary.payslip.${id}`
export async function readPayslip(db: DB, storeId: string, id: string) {
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: payslipKey(id) } } })
  return row ? JSON.parse(row.value) : null
}
export async function buildPayslip(db: DB, salary: any, staff: any, paidAt: string | null, refund: any = { items: [], amount: 0 }) {
  const basis = await savedPayrollBasis(db, staff.storeId, salary.id)
  const compensation = await savedAdjustmentPlan(staff.storeId, salary.id, db)
  const saved = await db.config.findUnique({ where: { storeId_key: { storeId: staff.storeId, key: `salary.depositPlan.${salary.id}` } } })
  const depositDeductions = saved ? JSON.parse(saved.value) : []
  return { version: 1, salaryId: salary.id, storeId: staff.storeId, staffId: staff.id,
    staffName: staff.name, employeeNumber: staff.employeeNumber, month: salary.month,
    status: salary.status, paidAt, payrollBasis: basis,
    baseSalary: salary.baseSalary, overtimePay: salary.overtime, commissions: salary.commission,
    bonuses: salary.bonus, deductions: salary.deduction, totalSalary: salary.finalAmount,
    compensationRewards: compensation.rewards, compensationPenalties: compensation.penalties, compensationItems: compensation.items,
    depositDeductions, depositDeductionAmount: depositDeductions.reduce((sum: number, i: any) => sum + Math.round(i.amountMinor / 100), 0),
    depositRefundAmount: refund.amount || 0, depositRefunds: refund.items || [], settlementAmount: salary.finalAmount + (refund.amount || 0) }
}
export async function retainPayslip(db: DB, salary: any, staff: any, refund: any) {
  const existing = await readPayslip(db, staff.storeId, salary.id)
  if (existing) return existing
  const snapshot = await buildPayslip(db, salary, staff, new Date().toISOString(), refund)
  await db.config.create({ data: { storeId: staff.storeId, key: payslipKey(salary.id), category: 'staff', value: JSON.stringify(snapshot) } })
  return snapshot
}
