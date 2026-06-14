import { prisma } from '../config/database'

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
        return { shouldDeduct: true, amount: rule.depositAmount }
      }
      return { shouldDeduct: false, amount: 0 }

    case 'monthly':
      // Monthly deduction until fully paid
      const remaining = rule.depositAmount - staffDeposit.deductedAmount
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
      const limitedRemaining = rule.depositAmount - staffDeposit.deductedAmount
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
  amount: number
  note?: string
}) {
  const staffDeposit = await prisma.staffDeposit.findUnique({
    where: { id: data.staffDepositId },
    include: { depositRule: true }
  })

  if (!staffDeposit) throw new Error('Staff deposit not found')

  const newDeductedAmount = staffDeposit.deductedAmount + data.amount
  const newDeductionCount = staffDeposit.deductionCount + 1
  const isCompleted = newDeductedAmount >= staffDeposit.depositRule.depositAmount

  // Create deduction log
  const log = await prisma.staffDepositDeduction.create({
    data: {
      staffDepositId: data.staffDepositId,
      salaryId: data.salaryId,
      amount: data.amount,
      note: data.note
    }
  })

  // Update staff deposit
  await prisma.staffDeposit.update({
    where: { id: data.staffDepositId },
    data: {
      deductedAmount: newDeductedAmount,
      deductionCount: newDeductionCount,
      status: isCompleted ? 'completed' : 'active'
    }
  })

  return log
}

// Calculate refund amount when staff leaves
export async function calculateRefundAmount(staffDeposit: any, terminationDate: Date) {
  const rule = staffDeposit.depositRule
  const workMonths = getMonthsBetween(staffDeposit.startDate, terminationDate)

  switch (rule.refundType) {
    case 'full':
      // Full refund of remaining deposit
      return rule.depositAmount - staffDeposit.deductedAmount - staffDeposit.refundedAmount

    case 'prorata': {
      // Pro-rata refund based on months worked
      const prorataPercent = rule.prorataPercent || 0
      const totalPaid = staffDeposit.deductedAmount + staffDeposit.refundedAmount
      const refundableAmount = Math.floor(totalPaid * prorataPercent)
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
}) {
  const staffDeposit = await prisma.staffDeposit.findUnique({
    where: { id: data.staffDepositId }
  })

  if (!staffDeposit) throw new Error('Staff deposit not found')

  // Create refund log
  const log = await prisma.staffDepositRefund.create({
    data: {
      staffDepositId: data.staffDepositId,
      amount: data.amount,
      reason: data.reason,
      note: data.note,
      processedBy: data.processedBy
    }
  })

  // Update staff deposit
  const newRefundedAmount = staffDeposit.refundedAmount + data.amount
  const totalProcessed = staffDeposit.deductedAmount + newRefundedAmount
  // 只有当总处理金额（已扣 + 已退）>= 总押金时才完全退款
  const newStatus = totalProcessed >= staffDeposit.totalAmount ? 'refunded' : 'active'

  await prisma.staffDeposit.update({
    where: { id: data.staffDepositId },
    data: {
      refundedAmount: newRefundedAmount,
      status: newStatus,
      endDate: newStatus === 'refunded' ? new Date() : staffDeposit.endDate
    }
  })

  return log
}

// Helper function to calculate months between dates
function getMonthsBetween(startDate: Date, endDate: Date): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(0, months)
}
