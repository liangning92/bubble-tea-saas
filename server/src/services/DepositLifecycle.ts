import { formatDate } from '../utils/dateUtils'

export function hasLeftEmployment(staff: {status?: string; terminationDate?: Date | null} | null | undefined) {
  return staff?.status === 'resigned' || !!(staff?.terminationDate && formatDate(staff.terminationDate) < formatDate(new Date()))
}

// Departure releases uncollected obligations, not money that has been paid back.
// Derive this for existing records too, retaining the original target and logs.
export function depositLifecycle<T extends {status: string; totalAmount: number; deductedAmount: number; refundedAmount: number}>(deposit: T, staff: Parameters<typeof hasLeftEmployment>[0]) {
  const released = hasLeftEmployment(staff)
  return {...deposit, status: released && deposit.status !== 'refunded' ? 'released' : deposit.status,
    remainingAmount: released ? 0 : Math.max(0, deposit.totalAmount - deposit.deductedAmount),
    releasedAmount: released ? Math.max(0, deposit.totalAmount - deposit.deductedAmount) : 0,
    refundableAmount: Math.max(0, deposit.deductedAmount - deposit.refundedAmount)}
}
