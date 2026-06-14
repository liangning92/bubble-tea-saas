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
export async function applyLeave(data: LeaveApplication) {
  const { staffId, leaveType, totalDays, startDate, endDate } = data

  // Get current year
  const year = new Date().getFullYear()

  // Check leave balance for paid leave types
  if (leaveType === 'annual' || leaveType === 'sick') {
    const balance = await getLeaveBalance(staffId, year)
    if (!balance) {
      throw new Error('Leave balance not initialized. Please contact HR.')
    }

    if (leaveType === 'annual') {
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

  // Create leave application
  return prisma.leave.create({
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
}

// Approve leave
export async function approveLeave(leaveId: string, approverId: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.status !== 'pending') throw new Error('Leave is not pending')

  const year = leave.startDate.getFullYear()

  // Use transaction to ensure atomicity: update status and deduct balance together
  return prisma.$transaction(async (tx) => {
    // Update leave status
    const updated = await tx.leave.update({
      where: { id: leaveId },
      data: {
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date()
      }
    })

    // Deduct leave balance within transaction
    const balance = await tx.leaveBalance.findUnique({
      where: { staffId_year: { staffId: leave.staffId, year } }
    })

    if (balance) {
      const updateData: any = {}
      if (leave.leaveType === 'annual') {
        updateData.usedLeave = balance.usedLeave + leave.totalDays
      } else if (leave.leaveType === 'sick') {
        updateData.usedSick = balance.usedSick + leave.totalDays
      }

      if (Object.keys(updateData).length > 0) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: updateData
        })
      }
    }

    return updated
  })
}

// Reject leave
export async function rejectLeave(leaveId: string, approverId: string, reason: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.status !== 'pending') throw new Error('Leave is not pending')

  return prisma.leave.update({
    where: { id: leaveId },
    data: {
      status: 'rejected',
      approvedBy: approverId,
      approvedAt: new Date(),
      rejectionReason: reason
    }
  })
}

// Cancel leave (by staff)
export async function cancelLeave(leaveId: string, staffId: string) {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('Leave not found')
  if (leave.staffId !== staffId) throw new Error('Not authorized')
  if (leave.status !== 'pending') throw new Error('Only pending leaves can be cancelled')

  return prisma.leave.update({
    where: { id: leaveId },
    data: { status: 'cancelled' }
  })
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