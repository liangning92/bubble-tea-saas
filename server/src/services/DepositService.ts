import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

export class DepositInputError extends Error {}
const requireAmount = (amount: number) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DepositInputError('Amount must be a positive integer')
}

async function depositReceipt(tx: Prisma.TransactionClient, deposit: { storeId: string }, operation: 'deduct' | 'refund', data: any) {
  if (!data.requestId) return null
  const key = `deposit.intent.${operation}.${data.requestId}`
  const fingerprint = JSON.stringify([data.staffDepositId, data.amount, data.salaryId || null, data.reason || null, data.note || null, data.processedBy || null])
  const receipt = await tx.config.upsert({ where: { storeId_key: { storeId: deposit.storeId, key } },
    create: { storeId: deposit.storeId, key, category: 'staff', value: '{}' }, update: { category: 'staff' } })
  const saved = JSON.parse(receipt.value)
  if (saved.logId && saved.fingerprint !== fingerprint) throw new DepositInputError('Request identity was used for different deposit data')
  return { key, fingerprint, logId: saved.logId as string | undefined }
}

// Get deposit rules for a store
export async function getDepositRules(storeId: string) {
  return prisma.depositRule.findMany({
    where: { storeId, isActive: true },
    orderBy: { createdAt: 'desc' }
  })
}

// Create deposit rule
export async function createDepositRule(data: {
  storeId: string
  name: string
  depositAmount: number
  deductionType: string
  monthlyAmount?: number
  maxDeductions?: number
  refundType: string
  prorataPercent?: number
}) {
  return prisma.depositRule.create({
    data
  })
}

// Update deposit rule
export async function updateDepositRule(id: string, data: Partial<{
  name: string
  depositAmount: number
  deductionType: string
  monthlyAmount: number
  maxDeductions: number
  refundType: string
  prorataPercent: number
  isActive: boolean
}>) {
  const existing = await prisma.depositRule.findUnique({ where: { id } })
  if (!existing) throw new DepositInputError('Deposit rule not found')
  const merged = { ...existing, ...data }
  if (merged.deductionType !== 'one_time') requireAmount(merged.monthlyAmount || 0)
  if (merged.deductionType === 'limited' && (!Number.isInteger(merged.maxDeductions) || (merged.maxDeductions || 0) < 1)) throw new DepositInputError('Maximum deductions is required')
  return prisma.depositRule.update({
    where: { id },
    data
  })
}

// Delete deposit rule (soft delete)
export async function deleteDepositRule(id: string) {
  return prisma.depositRule.update({
    where: { id },
    data: { isActive: false }
  })
}

// Get staff deposit record
export async function getStaffDeposit(staffId: string) {
  return prisma.staffDeposit.findFirst({
    where: { staffId },
    orderBy: { createdAt: 'desc' },
    include: {
      depositRule: true,
      deductionLogs: { orderBy: { createdAt: 'desc' } },
      refundLogs: { orderBy: { createdAt: 'desc' } }
    }
  })
}

// Get all staff deposits for a store
export async function getAllStaffDeposits(storeId: string) {
  return prisma.staffDeposit.findMany({
    where: { storeId },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } },
      depositRule: true,
      deductionLogs: { orderBy: { createdAt: 'desc' } },
      refundLogs: { orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Create staff deposit record
export async function createStaffDeposit(data: {
  staffId: string
  storeId: string
  depositRuleId: string
  totalAmount: number
}) {
  requireAmount(data.totalAmount)
  const [staff, rule] = await Promise.all([
    prisma.staff.findUnique({ where: { id: data.staffId } }),
    prisma.depositRule.findUnique({ where: { id: data.depositRuleId } })
  ])
  if (!staff || staff.storeId !== data.storeId || !rule || rule.storeId !== data.storeId || !rule.isActive) {
    throw new DepositInputError('Staff and active rule must belong to this store')
  }
  return prisma.staffDeposit.create({
    data: {
      ...data,
      status: 'active'
    }
  })
}

// Calculate deposit deduction for a month
export async function calculateMonthlyDeduction(staffDeposit: any) {
  const rule = staffDeposit.depositRule

  if (staffDeposit.status !== 'active') {
    return { shouldDeduct: false, amount: 0 }
  }

  switch (rule.deductionType) {
    case 'one_time':
      // One-time deduction: all in first month
      if (staffDeposit.deductionCount === 0) {
        return { shouldDeduct: staffDeposit.totalAmount > staffDeposit.deductedAmount, amount: Math.max(0, staffDeposit.totalAmount - staffDeposit.deductedAmount) }
      }
      return { shouldDeduct: false, amount: 0 }

    case 'monthly':
      // Monthly deduction until fully paid
      const remaining = staffDeposit.totalAmount - staffDeposit.deductedAmount
      if (remaining <= 0) {
        return { shouldDeduct: false, amount: 0 }
      }
      const monthlyAmount = rule.monthlyAmount || 0
      return {
        shouldDeduct: true,
        amount: Math.min(monthlyAmount, remaining)
      }

    case 'limited':
      // Limited deductions
      if (staffDeposit.deductionCount >= (rule.maxDeductions || 0)) {
        return { shouldDeduct: false, amount: 0 }
      }
      const limitedRemaining = staffDeposit.totalAmount - staffDeposit.deductedAmount
      if (limitedRemaining <= 0) {
        return { shouldDeduct: false, amount: 0 }
      }
      return {
        shouldDeduct: true,
        amount: Math.min(rule.monthlyAmount || 0, limitedRemaining)
      }

    default:
      return { shouldDeduct: false, amount: 0 }
  }
}

// Record deposit deduction
export async function recordDepositDeduction(data: {
  staffDepositId: string
  salaryId?: string
  requestId?: string
  amount: number
  note?: string
}, transaction?: Prisma.TransactionClient) {
  requireAmount(data.amount)
  const apply = async (tx: Prisma.TransactionClient) => {
    const deposit = await tx.staffDeposit.findUnique({ where: { id: data.staffDepositId } })
    if (!deposit) throw new DepositInputError('Staff deposit not found')
    const receipt = await depositReceipt(tx, deposit, 'deduct', data)
    if (receipt?.logId) return tx.staffDepositDeduction.findUniqueOrThrow({ where: { id: receipt.logId } })
    if (deposit.status !== 'active' || data.amount > deposit.totalAmount - deposit.deductedAmount) {
      throw new DepositInputError('Deduction exceeds unpaid deposit or deposit is closed')
    }
    if (data.salaryId) {
      const salary = await tx.salary.findUnique({ where: { id: data.salaryId } })
      if (!salary || salary.staffId !== deposit.staffId) throw new DepositInputError('Salary does not belong to this staff')
    }
    const changed = await tx.staffDeposit.updateMany({
      where: { id: deposit.id, status: 'active', deductedAmount: deposit.deductedAmount, refundedAmount: deposit.refundedAmount },
      data: { deductedAmount: { increment: data.amount }, deductionCount: { increment: 1 },
        status: deposit.deductedAmount + data.amount === deposit.totalAmount ? 'completed' : 'active' }
    })
    if (changed.count !== 1) throw new DepositInputError('Deposit changed; reload before retrying')
    const log = await tx.staffDepositDeduction.create({ data: { staffDepositId: deposit.id, salaryId: data.salaryId, amount: data.amount, note: data.note } })
    if (receipt) await tx.config.update({ where: { storeId_key: { storeId: deposit.storeId, key: receipt.key } }, data: { value: JSON.stringify({ fingerprint: receipt.fingerprint, logId: log.id }) } })
    return log
  }
  return transaction ? apply(transaction) : prisma.$transaction(apply)
}

// Calculate refund amount when staff leaves
export async function calculateRefundAmount(staffDeposit: any, terminationDate: Date) {
  const rule = staffDeposit.depositRule


  switch (rule.refundType) {
    case 'full':
      // Full refund of remaining deposit
      return Math.max(0, staffDeposit.deductedAmount - staffDeposit.refundedAmount)

    case 'prorata': {
      // Pro-rata refund based on months worked
      const value = rule.prorataPercent || 0
      const prorataPercent = Math.min(1, Math.max(0, value > 1 ? value / 100 : value))
      const totalPaid = staffDeposit.deductedAmount
      const refundableAmount = Math.min(totalPaid, Math.floor(totalPaid * prorataPercent))
      return Math.max(0, refundableAmount - staffDeposit.refundedAmount)
    }

    case 'forfeited':
      // No refund
      return 0

    case 'none':
      return 0

    default:
      return 0
  }
}

// Process refund
export async function processRefund(data: {
  staffDepositId: string
  amount: number
  reason: string
  note?: string
  processedBy: string
  requestId?: string
}) {
  requireAmount(data.amount)
  return prisma.$transaction(async tx => {
    const deposit = await tx.staffDeposit.findUnique({ where: { id: data.staffDepositId }, include: { depositRule: true } })
    if (!deposit) throw new DepositInputError('Staff deposit not found')
    const receipt = await depositReceipt(tx, deposit, 'refund', data)
    if (receipt?.logId) return tx.staffDepositRefund.findUniqueOrThrow({ where: { id: receipt.logId } })
    const refundable = await calculateRefundAmount(deposit, new Date())
    if (deposit.status === 'refunded' || data.amount > refundable) throw new DepositInputError('Refund exceeds eligible collected deposit')
    const fullyRefunded = data.amount === refundable
    const changed = await tx.staffDeposit.updateMany({
      where: { id: deposit.id, deductedAmount: deposit.deductedAmount, refundedAmount: deposit.refundedAmount, status: deposit.status },
      data: { refundedAmount: { increment: data.amount }, status: fullyRefunded ? 'refunded' : deposit.status,
        endDate: fullyRefunded ? new Date() : deposit.endDate }
    })
    if (changed.count !== 1) throw new DepositInputError('Deposit changed; reload before retrying')
    const log = await tx.staffDepositRefund.create({ data: { staffDepositId: deposit.id, amount: data.amount, reason: data.reason, note: data.note, processedBy: data.processedBy } })
    if (receipt) await tx.config.update({ where: { storeId_key: { storeId: deposit.storeId, key: receipt.key } }, data: { value: JSON.stringify({ fingerprint: receipt.fingerprint, logId: log.id }) } })
    return log
  })
}
