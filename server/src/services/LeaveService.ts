import { formatDate } from '../utils/dateUtils'
import prisma from '../config/database'

export interface LeaveApplication {
  staffId: string
  storeId: string
  leaveType: string
  startDate: Date
  endDate: Date
  totalDays: number
  reason?: string
  halfDay?: boolean
  contactPhone?: string
  attachmentUrl?: string
}

export interface LeaveBalanceUpdate {
  staffId: string
  year: number
  annualLeave?: number
  sickLeave?: number
  unpaidLeave?: number
  broughtForward?: number
}

// Apply for leave
export async function applyLeave(data: LeaveApplication, autoInitBalance: boolean = true) {
  const { staffId, leaveType, totalDays, startDate, endDate } = data

  const configuredType = await prisma.leaveType.findUnique({ where: { storeId_code: { storeId: data.storeId, code: leaveType } } })
  const deductBalance = configuredType?.deductBalance ?? ['annual', 'sick'].includes(leaveType)
  // Get current year
  const year = Number(formatDate(startDate).slice(0, 4))

  // Check leave balance for paid leave types
  if (deductBalance) {
    let balance = await getLeaveBalance(staffId, year)

    // If no balance and auto-init is enabled, create one automatically
    if (!balance && autoInitBalance) {
      const staff = await prisma.staff.findUnique({ where: { id: staffId } })
      if (staff?.hireDate) {
        balance = await initializeLeaveBalanceForStaff(staffId, new Date(staff.hireDate))
      }
    }

    if (!balance) {
      throw new Error('Leave balance not initialized. Please contact HR.')
    }

    if (leaveType !== 'sick') {
      const available = balance.annualLeave + balance.broughtForward - balance.usedLeave
      if (totalDays > available) {
        throw new Error(`Insufficient annual leave. Available: ${available} days`)
      }
    } else if (leaveType === 'sick') {
      const available = balance.sickLeave - balance.usedSick
      if (totalDays > available) {
        throw new Error(`Insufficient sick leave. Available: ${available} days`)
      }
    }
  }

  if (Number(formatDate(endDate).slice(0, 4)) !== year) throw new Error('Submit a separate leave application for each calendar year')
  return prisma.$transaction(async tx => {
    const key = `leave.period.${staffId}.${year}`
    await tx.config.upsert({ where: { storeId_key: { storeId: data.storeId, key } }, create: { storeId: data.storeId, key, category: 'staff', value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
    const active = await tx.leave.findMany({ where: { staffId, status: { in: ['pending', 'approved'] }, startDate: { lt: new Date(`${year + 1}-01-01T00:00:00+07:00`) }, endDate: { gte: new Date(`${year}-01-01T00:00:00+07:00`) } } })
    if (active.some(leave => leave.startDate <= endDate && leave.endDate >= startDate)) throw new Error('Selected dates overlap an existing leave application')
    if (configuredType?.maxDaysPerYear != null && active.filter(leave => leave.leaveType === leaveType).reduce((sum, leave) => sum + leave.totalDays, 0) + totalDays > configuredType.maxDaysPerYear) throw new Error('Leave exceeds the configured yearly limit')
  // Create leave application
  return tx.leave.create({
    data: {
      staffId,
      storeId: data.storeId,
      leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalDays,
      reason: data.reason,
      halfDay: data.halfDay || false,
      contactPhone: data.contactPhone,
      attachmentUrl: data.attachmentUrl,
      status: 'pending'
    },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } }
    }
  })
  })
}

// Approve leave
export async function approveLeave(leaveId: string, approverId: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.status !== 'pending') throw new Error('Leave is not pending')

  const configuredType = await prisma.leaveType.findUnique({ where: { storeId_code: { storeId: leave.storeId, code: leave.leaveType } } })
  const deductBalance = configuredType?.deductBalance ?? ['annual', 'sick'].includes(leave.leaveType)
  const year = Number(formatDate(leave.startDate).slice(0, 4))

  // Use transaction to ensure atomicity: update status and deduct balance together
  return prisma.$transaction(async (tx) => {
    // Update leave status
    const changed = await tx.leave.updateMany({
      where: { id: leaveId, status: 'pending' },
      data: {
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date()
      }
    })

    if (changed.count !== 1) throw new Error('Leave is no longer pending')
    // Deduct leave balance within transaction
    const balance = await tx.leaveBalance.findUnique({
      where: { staffId_year: { staffId: leave.staffId, year } }
    })

    if (!balance && deductBalance) throw new Error('Leave balance is not initialized')
    if (balance) {
      const updateData: any = {}
      if (deductBalance && leave.leaveType !== 'sick') {
        if (balance.usedLeave + leave.totalDays > balance.annualLeave + balance.broughtForward) throw new Error('Insufficient annual leave balance')
        updateData.usedLeave = balance.usedLeave + leave.totalDays
      } else if (deductBalance && leave.leaveType === 'sick') {
        if (balance.usedSick + leave.totalDays > balance.sickLeave) throw new Error('Insufficient sick leave balance')
        updateData.usedSick = balance.usedSick + leave.totalDays
      }

      if (Object.keys(updateData).length > 0) {
        const used = await tx.leaveBalance.updateMany({ where: { id: balance.id, usedLeave: balance.usedLeave, usedSick: balance.usedSick }, data: updateData })
        if (used.count !== 1) throw new Error('Leave balance changed; reload before retrying')
      }
    }

    return tx.leave.findUniqueOrThrow({ where: { id: leaveId } })
  })
}

// Reject leave
export async function rejectLeave(leaveId: string, approverId: string, reason: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.status !== 'pending') throw new Error('Leave is not pending')

  const changed = await prisma.leave.updateMany({ where: { id: leaveId, status: 'pending' }, data: { status: 'rejected', approvedBy: approverId, approvedAt: new Date(), rejectionReason: reason } })
  if (changed.count !== 1) throw new Error('Leave is no longer pending')
  return prisma.leave.findUniqueOrThrow({ where: { id: leaveId } })
}

// Cancel leave (by staff)
export async function cancelLeave(leaveId: string, staffId: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.staffId !== staffId) throw new Error('Not authorized')
  if (leave.status !== 'pending') throw new Error('Only pending leaves can be cancelled')

  const changed = await prisma.leave.updateMany({ where: { id: leaveId, staffId, status: 'pending' }, data: { status: 'cancelled' } })
  if (changed.count !== 1) throw new Error('Leave is no longer pending')
  return prisma.leave.findUniqueOrThrow({ where: { id: leaveId } })
}

// Get leave balance
export async function getLeaveBalance(staffId: string, year: number) {
  let balance = await prisma.leaveBalance.findUnique({
    where: { staffId_year: { staffId, year } }
  })

  // If no balance record exists, create one with defaults
  if (!balance) {
    balance = await prisma.leaveBalance.create({
      data: {
        staffId,
        year,
        annualLeave: 0,
        sickLeave: 0,
        unpaidLeave: 0,
        usedLeave: 0,
        usedSick: 0,
        broughtForward: 0
      }
    })
  }

  return balance
}

// Auto-initialize leave balance for new staff based on hire date
export async function initializeLeaveBalanceForStaff(staffId: string, hireDate: Date) {
  const currentYear = new Date().getFullYear()
  const yearsEmployed = currentYear - hireDate.getFullYear()

  // Calculate annual leave based on employment years (Indonesian standard):
  // 0-1 years: 12 days
  // 1-5 years: 12 days
  // >5 years: can be more (simplified to 15 days)
  let annualLeave = 12
  if (yearsEmployed >= 5) {
    annualLeave = 15
  }

  // Sick leave is usually 14 days per year (Indonesian standard)
  const sickLeave = 14

  // Create or update balance for current year
  let balance = await prisma.leaveBalance.findUnique({
    where: { staffId_year: { staffId, year: currentYear } }
  })

  if (balance) {
    // If balance exists but annual/sick were 0, update them
    if (balance.annualLeave === 0) {
      return prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { annualLeave, sickLeave }
      })
    }
    return balance
  }

  return prisma.leaveBalance.create({
    data: {
      staffId,
      year: currentYear,
      annualLeave,
      sickLeave,
      unpaidLeave: 0,
      broughtForward: 0,
      usedLeave: 0,
      usedSick: 0
    }
  })
}

// Set/update leave balance (admin)
export async function setLeaveBalance(staffId: string, data: LeaveBalanceUpdate) {
  const { year, ...balanceData } = data

  let balance = await prisma.leaveBalance.findUnique({
    where: { staffId_year: { staffId, year } }
  })

  if (balance) {
    return prisma.leaveBalance.update({
      where: { id: balance.id },
      data: balanceData
    })
  } else {
    return prisma.leaveBalance.create({
      data: {
        staffId,
        year,
        annualLeave: balanceData.annualLeave || 0,
        sickLeave: balanceData.sickLeave || 0,
        unpaidLeave: balanceData.unpaidLeave || 0,
        broughtForward: balanceData.broughtForward || 0,
        usedLeave: 0,
        usedSick: 0
      }
    })
  }
}

// Deduct leave balance (called within transaction)
async function deductLeaveBalance(staffId: string, year: number, leaveType: string, days: number) {
  const balance = await prisma.leaveBalance.findUnique({
    where: { staffId_year: { staffId, year } }
  })

  if (!balance) return

  // Check sufficient balance before deducting
  if (leaveType === 'annual') {
    const available = balance.annualLeave + balance.broughtForward - balance.usedLeave
    if (available < days) {
      throw new Error(`Insufficient annual leave balance: requested ${days}, available ${available}`)
    }
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { usedLeave: balance.usedLeave + days }
    })
  } else if (leaveType === 'sick') {
    const available = balance.sickLeave - balance.usedSick
    if (available < days) {
      throw new Error(`Insufficient sick leave balance: requested ${days}, available ${available}`)
    }
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { usedSick: balance.usedSick + days }
    })
  }
}

// Get staff leaves
export async function getStaffLeaves(staffId: string, options?: {
  status?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { staffId }
  if (options?.status) where.status = options.status
  if (options?.startDate || options?.endDate) {
    where.startDate = {}
    if (options.startDate) where.startDate.gte = options.startDate
    if (options.endDate) where.endDate.lte = options.endDate
  }

  return prisma.leave.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  })
}

// Get store leaves
export async function getStoreLeaves(storeId: string, options?: {
  status?: string
  staffId?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = { storeId }
  if (options?.status) where.status = options.status
  if (options?.staffId) where.staffId = options.staffId
  if (options?.startDate || options?.endDate) {
    where.startDate = {}
    if (options.startDate) where.startDate.gte = options.startDate
    if (options.endDate) where.endDate.lte = options.endDate
  }

  return prisma.leave.findMany({
    where,
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get leave by ID
export async function getLeaveById(leaveId: string) {
  return prisma.leave.findUnique({
    where: { id: leaveId },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true, storeId: true } }
    }
  })
}

// Get approved leaves for a date range (for schedule linkage)
export async function getApprovedLeavesInRange(storeId: string, startDate: Date, endDate: Date) {
  return prisma.leave.findMany({
    where: {
      storeId,
      status: 'approved',
      OR: [
        {
          // Leave starts within range
          startDate: { gte: startDate, lte: endDate }
        },
        {
          // Leave ends within range
          endDate: { gte: startDate, lte: endDate }
        },
        {
          // Leave spans entire range
          AND: [
            { startDate: { lte: startDate } },
            { endDate: { gte: endDate } }
          ]
        }
      ]
    },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } }
    },
    orderBy: { startDate: 'asc' }
  })
}

// Check if staff has approved leave on a specific date
export async function hasApprovedLeaveOnDate(staffId: string, date: Date): Promise<boolean> {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const leave = await prisma.leave.findFirst({
    where: {
      staffId,
      status: 'approved',
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay }
    }
  })

  return !!leave
}

// Get leave info for a specific date (for display on schedule)
export async function getLeaveInfoForDate(staffId: string, date: Date) {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  return prisma.leave.findFirst({
    where: {
      staffId,
      status: 'approved',
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay }
    },
    include: {
      staff: { select: { id: true, name: true } }
    }
  })
}