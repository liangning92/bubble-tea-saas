import { prisma } from '../config/database'

// Points earning rules
const POINTS_CONFIG = {
  perfectAttendance: 50,      // No late/absence in month
  goodPerformance: 100,       // Good performance review
  completedTraining: 30,      // Completed a training
  holidayWork: 20,            // Working on holiday
  overtimePerHour: 5          // Per hour over 8h
}

// Get or create staff point balance
export async function getOrCreateStaffPoint(staffId: string, storeId: string) {
  let staffPoint = await prisma.staffPoint.findUnique({ where: { staffId } })

  if (!staffPoint) {
    staffPoint = await prisma.staffPoint.create({
      data: { staffId, storeId, balance: 0, totalEarned: 0, totalRedeemed: 0 }
    })
  }

  return staffPoint
}

// Get point balance for a staff
export async function getStaffPointBalance(staffId: string) {
  const staffPoint = await getOrCreateStaffPoint(staffId, '')
  return {
    balance: staffPoint.balance,
    totalEarned: staffPoint.totalEarned,
    totalRedeemed: staffPoint.totalRedeemed
  }
}

// Get point balances for all staff in a store (batch)
export async function getStaffPointBalancesByStore(storeId: string) {
  // Get all staff for this store
  const staffList = await prisma.staff.findMany({
    where: { storeId },
    select: { id: true, name: true }
  })

  // Get all staff points for this store in one query
  const staffPoints = await prisma.staffPoint.findMany({
    where: { staffId: { in: staffList.map(s => s.id) } }
  })

  // Create a map for quick lookup
  const pointsMap = new Map(staffPoints.map(sp => [sp.staffId, sp]))

  // Combine staff list with their points
  return staffList.map(staff => {
    const sp = pointsMap.get(staff.id)
    return {
      staffId: staff.id,
      staffName: staff.name,
      balance: sp?.balance || 0,
      totalEarned: sp?.totalEarned || 0,
      totalRedeemed: sp?.totalRedeemed || 0
    }
  })
}

// Get point history for a staff
export async function getStaffPointHistory(staffId: string, limit = 50) {
  const logs = await prisma.staffPointLog.findMany({
    where: { staffId },
    orderBy: { createdAt: 'desc' },
    take: limit
  })
  return logs
}

// Award points to a staff
export async function awardPoints(data: {
  staffId: string
  storeId: string
  points: number
  reason: string
  referenceId?: string
  note?: string
  createdBy?: string
  expiresAt?: Date
}) {
  const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId)

  // Create log entry
  const log = await prisma.staffPointLog.create({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      type: 'earn',
      points: data.points,
      reason: data.reason,
      referenceId: data.referenceId,
      note: data.note,
      expiresAt: data.expiresAt,
      createdBy: data.createdBy
    }
  })

  // Update balance
  await prisma.staffPoint.update({
    where: { staffId: data.staffId },
    data: {
      balance: { increment: data.points },
      totalEarned: { increment: data.points }
    }
  })

  return log
}

// Redeem points
export async function redeemPoints(data: {
  staffId: string
  storeId: string
  points: number
  reason: string
  referenceId?: string
  note?: string
}) {
  const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId)

  if (staffPoint.balance < data.points) {
    throw new Error('Insufficient points balance')
  }

  // Create log entry (negative points for redeem)
  const log = await prisma.staffPointLog.create({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      type: 'redeem',
      points: -data.points,
      reason: data.reason,
      referenceId: data.referenceId,
      note: data.note
    }
  })

  // Update balance
  await prisma.staffPoint.update({
    where: { staffId: data.staffId },
    data: {
      balance: { decrement: data.points },
      totalRedeemed: { increment: data.points }
    }
  })

  return log
}

// Manual adjustment (admin)
export async function adjustPoints(data: {
  staffId: string
  storeId: string
  points: number
  reason: string
  note?: string
  createdBy: string
}) {
  const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId)

  // Create log entry (positive or negative)
  const log = await prisma.staffPointLog.create({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      type: 'adjust',
      points: data.points,
      reason: 'manual_adjust',
      note: data.note || data.reason,
      createdBy: data.createdBy
    }
  })

  // Update balance
  const newBalance = staffPoint.balance + data.points
  await prisma.staffPoint.update({
    where: { staffId: data.staffId },
    data: {
      balance: newBalance >= 0 ? newBalance : 0,
      totalEarned: data.points > 0 ? staffPoint.totalEarned + data.points : staffPoint.totalEarned,
      totalRedeemed: data.points < 0 ? staffPoint.totalRedeemed + Math.abs(data.points) : staffPoint.totalRedeemed
    }
  })

  return log
}

// Process expired points
export async function processExpiredPoints(storeId: string) {
  const now = new Date()

  // Find expired point logs that haven't been processed
  const expiredLogs = await prisma.staffPointLog.findMany({
    where: {
      storeId,
      type: 'earn',
      expiresAt: { lte: now },
      expiredAt: null
    }
  })

  const results = []
  for (const log of expiredLogs) {
    // Create expire log
    await prisma.staffPointLog.create({
      data: {
        staffId: log.staffId,
        storeId: log.storeId,
        type: 'expire',
        points: -log.points,
        reason: 'expired',
        referenceId: log.id,
        note: 'Points expired'
      }
    })

    // Update balance
    await prisma.staffPoint.update({
      where: { staffId: log.staffId },
      data: { balance: { decrement: log.points } }
    })

    // Mark original log as expired
    await prisma.staffPointLog.update({
      where: { id: log.id },
      data: { expiredAt: now }
    })

    results.push(log.id)
  }

  return results
}

// Get all rewards
export async function getRewards(storeId: string) {
  return prisma.staffPointReward.findMany({
    where: { storeId, isActive: true },
    orderBy: { pointsCost: 'asc' }
  })
}

// Create reward
export async function createReward(data: {
  storeId: string
  name: string
  type: string
  pointsCost: number
  value?: string
  stock?: number
}) {
  return prisma.staffPointReward.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      type: data.type,
      pointsCost: data.pointsCost,
      value: data.value,
      stock: data.stock
    }
  })
}

// Update reward
export async function updateReward(id: string, data: Partial<{
  name: string
  type: string
  pointsCost: number
  value: string
  isActive: boolean
  stock: number
}>) {
  return prisma.staffPointReward.update({
    where: { id },
    data
  })
}

// Delete reward
export async function deleteReward(id: string) {
  return prisma.staffPointReward.update({
    where: { id },
    data: { isActive: false }
  })
}

// Create redemption request
export async function createRedemption(data: {
  staffId: string
  storeId: string
  rewardId: string
  pointsCost: number
}) {
  const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId)

  if (staffPoint.balance < data.pointsCost) {
    throw new Error('Insufficient points balance')
  }

  return prisma.staffPointRedemption.create({
    data: {
      staffId: data.staffId,
      storeId: data.storeId,
      rewardId: data.rewardId,
      pointsCost: data.pointsCost
    }
  })
}

// Get pending redemptions
export async function getPendingRedemptions(storeId: string) {
  return prisma.staffPointRedemption.findMany({
    where: { storeId, status: 'pending' },
    include: {
      staff: { select: { id: true, name: true, employeeNumber: true } },
      reward: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Approve/fulfill redemption
export async function fulfillRedemption(id: string, fulfilledBy: string) {
  const redemption = await prisma.staffPointRedemption.update({
    where: { id },
    data: {
      status: 'fulfilled',
      fulfilledAt: new Date(),
      fulfilledBy
    }
  })

  // Deduct points
  await prisma.staffPoint.update({
    where: { staffId: redemption.staffId },
    data: {
      balance: { decrement: redemption.pointsCost },
      totalRedeemed: { increment: redemption.pointsCost }
    }
  })

  return redemption
}

// Cancel redemption
export async function cancelRedemption(id: string) {
  return prisma.staffPointRedemption.update({
    where: { id },
    data: { status: 'cancelled' }
  })
}

// Award points for perfect attendance (call at end of month)
export async function awardPerfectAttendancePoints(staffId: string, storeId: string) {
  return awardPoints({
    staffId,
    storeId,
    points: POINTS_CONFIG.perfectAttendance,
    reason: 'perfect_attendance',
    note: 'Perfect attendance this month'
  })
}

// Award points for training completion
export async function awardTrainingPoints(staffId: string, storeId: string, trainingId: string) {
  return awardPoints({
    staffId,
    storeId,
    points: POINTS_CONFIG.completedTraining,
    reason: 'training',
    referenceId: trainingId,
    note: 'Completed training'
  })
}

// Award points for overtime
export async function awardOvertimePoints(staffId: string, storeId: string, hours: number, referenceId?: string) {
  const points = Math.floor(hours) * POINTS_CONFIG.overtimePerHour
  return awardPoints({
    staffId,
    storeId,
    points,
    reason: 'overtime',
    referenceId,
    note: `${hours} hours overtime`
  })
}