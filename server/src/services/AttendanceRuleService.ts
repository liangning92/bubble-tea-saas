import { prisma } from '../config/database'

// Get attendance rules for a store
export async function getAttendanceRules(storeId: string) {
  return prisma.attendanceRule.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' }
  })
}

// Get default attendance rule for a store
export async function getDefaultAttendanceRule(storeId: string) {
  return prisma.attendanceRule.findFirst({
    where: { storeId, isDefault: true, isActive: true }
  })
}

// Create attendance rule
export async function createAttendanceRule(data: {
  storeId: string
  name: string
  workStartTime: string
  workEndTime: string
  gracePeriod?: number
  lateDeductionType?: string
  lateDeductionFixed?: number
  lateDeductionDailyRate?: number
  absenceDeductionType?: string
  absenceDeductionFixed?: number
  absenceDeductionDailyRate?: number
  earlyLeaveDeductionType?: string
  earlyLeaveDeductionFixed?: number
  earlyLeaveDeductionDailyRate?: number
  overtimeRate?: number
  overtimeMinHours?: number
  sickLeaveDeductionType?: string
  sickLeaveDeductionFixed?: number
  sickLeaveDeductionDailyRate?: number
  isDefault?: boolean
}) {
  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.attendanceRule.updateMany({
      where: { storeId: data.storeId },
      data: { isDefault: false }
    })
  }

  return prisma.attendanceRule.create({
    data: data as any
  })
}

// Update attendance rule
export async function updateAttendanceRule(id: string, data: Partial<{
  name: string
  workStartTime: string
  workEndTime: string
  gracePeriod: number
  lateDeductionType: string
  lateDeductionFixed: number
  lateDeductionDailyRate: number
  absenceDeductionType: string
  absenceDeductionFixed: number
  absenceDeductionDailyRate: number
  earlyLeaveDeductionType: string
  earlyLeaveDeductionFixed: number
  earlyLeaveDeductionDailyRate: number
  overtimeRate: number
  overtimeMinHours: number
  sickLeaveDeductionType: string
  sickLeaveDeductionFixed: number
  sickLeaveDeductionDailyRate: number
  isActive: boolean
  isDefault: boolean
}>) {
  // If setting as default, unset other defaults
  if (data.isDefault) {
    const rule = await prisma.attendanceRule.findUnique({ where: { id } })
    if (rule) {
      await prisma.attendanceRule.updateMany({
        where: { storeId: rule.storeId, id: { not: id } },
        data: { isDefault: false }
      })
    }
  }

  return prisma.attendanceRule.update({
    where: { id },
    data
  })
}

// Delete attendance rule (soft delete)
export async function deleteAttendanceRule(id: string) {
  return prisma.attendanceRule.update({
    where: { id },
    data: { isActive: false }
  })
}

// Calculate late deduction based on attendance rule
export async function calculateLateDeduction(
  rule: any,
  checkInTime: Date,
  workStartTime: string
): Promise<{ shouldDeduct: boolean; amount: number; type: string }> {
  const [hours, minutes] = workStartTime.split(':').map(Number)
  const workStart = new Date(checkInTime)
  workStart.setHours(hours, minutes, 0, 0)

  const graceEnd = new Date(workStart.getTime() + (rule.gracePeriod || 15) * 60 * 1000)

  if (checkInTime <= graceEnd) {
    return { shouldDeduct: false, amount: 0, type: 'none' }
  }

  if (rule.lateDeductionType === 'fixed') {
    return { shouldDeduct: true, amount: rule.lateDeductionFixed || 0, type: 'fixed' }
  }

  if (rule.lateDeductionType === 'daily_rate') {
    // Daily rate = baseSalary / workingDaysInMonth
    return { shouldDeduct: true, amount: 0, type: 'daily_rate' } // Amount needs baseSalary
  }

  return { shouldDeduct: false, amount: 0, type: 'none' }
}

// Calculate absence deduction
export async function calculateAbsenceDeduction(
  rule: any,
  dailyRate: number
): Promise<{ shouldDeduct: boolean; amount: number; type: string }> {
  if (rule.absenceDeductionType === 'fixed') {
    return { shouldDeduct: true, amount: rule.absenceDeductionFixed || 0, type: 'fixed' }
  }

  if (rule.absenceDeductionType === 'daily_rate') {
    return { shouldDeduct: true, amount: dailyRate, type: 'daily_rate' }
  }

  return { shouldDeduct: false, amount: 0, type: 'none' }
}

// Calculate sick leave deduction
export async function calculateSickLeaveDeduction(
  rule: any,
  dailyRate: number
): Promise<{ shouldDeduct: boolean; amount: number; type: string }> {
  if (rule.sickLeaveDeductionType === 'none') {
    return { shouldDeduct: false, amount: 0, type: 'none' }
  }

  if (rule.sickLeaveDeductionType === 'fixed') {
    return { shouldDeduct: true, amount: rule.sickLeaveDeductionFixed || 0, type: 'fixed' }
  }

  if (rule.sickLeaveDeductionType === 'daily_rate') {
    return { shouldDeduct: true, amount: dailyRate, type: 'daily_rate' }
  }

  return { shouldDeduct: false, amount: 0, type: 'none' }
}

// Calculate overtime pay
export async function calculateOvertimePay(
  rule: any,
  overtimeHours: number,
  hourlyRate: number
): Promise<number> {
  if (overtimeHours < (rule.overtimeMinHours || 1)) {
    return 0
  }

  const rate = rule.overtimeRate || 1.5
  return Math.floor(overtimeHours * hourlyRate * rate)
}
