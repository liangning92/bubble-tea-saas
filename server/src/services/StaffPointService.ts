import { prisma } from '../config/database'
import { Prisma } from '@prisma/client'
import { BusinessInputError } from '../utils/businessDate'

// Default points values (fallback)
const DEFAULT_POINTS = {
  perfectAttendance: 50,
  goodPerformance: 100,
  completedTraining: 30,
  holidayWork: 20,
  overtimePerHour: 5
}

// Get points rule from database or return defaults
async function getPointsRule(storeId: string) {
  const rule = await prisma.staffPointRule.findUnique({
    where: { storeId }
  })
  if (!rule) return DEFAULT_POINTS
  if (!rule.isActive) return { perfectAttendance: 0, goodPerformance: 0, completedTraining: 0, holidayWork: 0, overtimePerHour: 0 }
  return {
    perfectAttendance: rule.perfectAttendancePoints,
    goodPerformance: rule.goodPerformancePoints,
    completedTraining: rule.completedTrainingPoints,
    holidayWork: rule.holidayWorkPoints,
    overtimePerHour: rule.overtimePerHourPoints
  }
}

// Get or create staff point balance
export async function getOrCreateStaffPoint(staffId: string, storeId: string, db: Prisma.TransactionClient = prisma) {
  const staff = await db.staff.findUnique({ where: { id: staffId }, select: { storeId: true } })
  if (!staff || (storeId && storeId !== staff.storeId)) throw new BusinessInputError('Staff store mismatch')
  return db.staffPoint.upsert({ where: { staffId }, create: { staffId, storeId: staff.storeId, balance: 0, totalEarned: 0, totalRedeemed: 0 }, update: { storeId: staff.storeId } })
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
    const sp = pointsMap.get(staff.id) as any
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
  if (!Number.isSafeInteger(data.points) || data.points < 0) throw new BusinessInputError('Points must be non-negative integers')
  return prisma.$transaction(async tx => {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId, tx)
    await tx.staffPoint.update({ where: { staffId: data.staffId }, data: { balance: { increment: data.points }, totalEarned: { increment: data.points } } })
    return tx.staffPointLog.create({ data: { ...data, storeId: staffPoint.storeId, type: 'earn' } })
  })
}

// Redeem points with an atomic balance check and matching history.
export async function redeemPoints(data: { staffId: string; storeId: string; points: number; reason: string; referenceId?: string; note?: string }) {
  if (!Number.isSafeInteger(data.points) || data.points <= 0) throw new BusinessInputError('Points must be positive integers')
  return prisma.$transaction(async tx => {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId, tx)
    const changed = await tx.staffPoint.updateMany({ where: { staffId: data.staffId, balance: { gte: data.points } }, data: { balance: { decrement: data.points }, totalRedeemed: { increment: data.points } } })
    if (changed.count !== 1) throw new BusinessInputError('Insufficient points balance')
    return tx.staffPointLog.create({ data: { ...data, storeId: staffPoint.storeId, type: 'redeem', points: -data.points } })
  })
}

// Manual adjustments preserve the exact amount in the balance and history.
export async function adjustPoints(data: { staffId: string; storeId: string; points: number; reason: string; note?: string; createdBy: string }) {
  if (!Number.isSafeInteger(data.points)) throw new BusinessInputError('Points must be integers')
  return prisma.$transaction(async tx => {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId, tx)
    const changed = await tx.staffPoint.updateMany({ where: { staffId: data.staffId, ...(data.points < 0 ? { balance: { gte: -data.points } } : {}) }, data: { balance: { increment: data.points }, ...(data.points > 0 ? { totalEarned: { increment: data.points } } : { totalRedeemed: { increment: -data.points } }) } })
    if (changed.count !== 1) throw new BusinessInputError('Insufficient points balance')
    return tx.staffPointLog.create({ data: { staffId: data.staffId, storeId: staffPoint.storeId, type: 'adjust', points: data.points, reason: 'manual_adjust', note: data.note || data.reason, createdBy: data.createdBy } })
  })
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
    const applied = await prisma.$transaction(async tx => {
      const staffPoint = await getOrCreateStaffPoint(log.staffId, log.storeId, tx)
      const marked = await tx.staffPointLog.updateMany({ where: { id: log.id, expiredAt: null }, data: { expiredAt: now } })
      if (marked.count !== 1) return false
      const points = Math.max(0, Math.min(staffPoint.balance, log.points))
      const changed = await tx.staffPoint.updateMany({ where: { staffId: log.staffId, balance: { gte: points } }, data: { balance: { decrement: points } } })
      if (changed.count !== 1) throw new BusinessInputError('Points balance changed; retry expiry')
      await tx.staffPointLog.create({ data: { staffId: log.staffId, storeId: log.storeId, type: 'expire', points: -points, reason: 'expired', referenceId: log.id, note: 'Points expired' } })
      return true
    })
    if (!applied) continue

    results.push(log.id)
  }

  return results
}

// Get all rewards
export async function getRewards(storeId: string, includeInactive = false) {
  const archived = includeInactive ? await prisma.config.findMany({ where: { storeId, key: { startsWith: 'staffPointReward.archived:' } }, select: { key: true } }) : []
  return prisma.staffPointReward.findMany({
    where: { storeId, ...(includeInactive ? { id: { notIn: archived.map(row => row.key.slice('staffPointReward.archived:'.length)) } } : { isActive: true }) },
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
  isActive?: boolean
}) {
  return prisma.staffPointReward.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      type: data.type,
      pointsCost: data.pointsCost,
      value: data.value,
      stock: data.stock,
      isActive: data.isActive ?? true
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
  return prisma.$transaction(async tx => {
    const reward = await tx.staffPointReward.update({ where: { id }, data: { isActive: false } })
    const key = `staffPointReward.archived:${id}`
    await tx.config.upsert({ where: { storeId_key: { storeId: reward.storeId, key } }, create: { storeId: reward.storeId, key, value: JSON.stringify({ archivedAt: new Date().toISOString() }), category: 'staff' }, update: {} })
    return reward
  })
}

// Create redemption request
export async function createRedemption(data: {
  staffId: string
  storeId: string
  rewardId: string
  pointsCost: number
}) {
  const reward = await prisma.staffPointReward.findFirst({ where: { id: data.rewardId, storeId: data.storeId, isActive: true } })
  if (!reward || (reward.stock !== null && reward.stock <= 0)) throw new BusinessInputError('Reward is unavailable')
  if (!Number.isSafeInteger(reward.pointsCost) || reward.pointsCost <= 0 || data.pointsCost !== reward.pointsCost) throw new BusinessInputError('Reward points cost has changed')
  const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId)
  if (staffPoint.balance < reward.pointsCost) throw new BusinessInputError('Insufficient points balance')
  return prisma.staffPointRedemption.create({ data: { ...data, pointsCost: reward.pointsCost } })
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
export async function fulfillRedemption(id: string, fulfilledBy: string, checkStock: boolean = true) {
  return prisma.$transaction(async tx => {
    const redemption = await tx.staffPointRedemption.findUnique({ where: { id }, include: { reward: true } })
    if (!redemption || !['pending', 'approved'].includes(redemption.status)) throw new BusinessInputError('Redemption is no longer pending')
    if (!redemption.reward?.isActive || redemption.reward.storeId !== redemption.storeId) throw new BusinessInputError('Reward is unavailable')
    const transition = await tx.staffPointRedemption.updateMany({ where: { id, status: redemption.status }, data: { status: 'fulfilled', fulfilledAt: new Date(), fulfilledBy } })
    if (transition.count !== 1) throw new BusinessInputError('Redemption is no longer pending')
    await getOrCreateStaffPoint(redemption.staffId, redemption.storeId, tx)
    const balance = await tx.staffPoint.updateMany({ where: { staffId: redemption.staffId, balance: { gte: redemption.pointsCost } }, data: { balance: { decrement: redemption.pointsCost }, totalRedeemed: { increment: redemption.pointsCost } } })
    if (balance.count !== 1) throw new BusinessInputError('Insufficient points balance')
    if (checkStock && redemption.reward.stock !== null) {
      const stock = await tx.staffPointReward.updateMany({ where: { id: redemption.rewardId, isActive: true, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } })
      if (stock.count !== 1) throw new BusinessInputError('Reward is out of stock')
    }
    await tx.staffPointLog.create({ data: { staffId: redemption.staffId, storeId: redemption.storeId, type: 'redeem', points: -redemption.pointsCost, reason: 'reward', referenceId: id, createdBy: fulfilledBy } })
    return tx.staffPointRedemption.findUniqueOrThrow({ where: { id } })
  })
}

// Cancellation cannot reverse an already fulfilled redemption.
export async function cancelRedemption(id: string) {
  const changed = await prisma.staffPointRedemption.updateMany({ where: { id, status: { in: ['pending', 'approved'] } }, data: { status: 'cancelled' } })
  if (changed.count !== 1) throw new BusinessInputError('Redemption is no longer pending')
  return prisma.staffPointRedemption.findUniqueOrThrow({ where: { id } })
}

// Award points for perfect attendance (call at end of month)
export async function awardPerfectAttendancePoints(staffId: string, storeId: string) {
  const rule = await getPointsRule(storeId)
  return awardPoints({
    staffId,
    storeId,
    points: rule.perfectAttendance,
    reason: 'perfect_attendance',
    note: 'Perfect attendance this month'
  })
}

// Award points for training completion
export async function awardTrainingPoints(staffId: string, storeId: string, trainingId: string) {
  const rule = await getPointsRule(storeId)
  return awardPoints({
    staffId,
    storeId,
    points: rule.completedTraining,
    reason: 'training',
    referenceId: trainingId,
    note: 'Completed training'
  })
}

// Award points for overtime
export async function awardOvertimePoints(staffId: string, storeId: string, hours: number, referenceId?: string) {
  const rule = await getPointsRule(storeId)
  const points = Math.floor(hours) * rule.overtimePerHour
  return awardPoints({
    staffId,
    storeId,
    points,
    reason: 'overtime',
    referenceId,
    note: `${hours} hours overtime`
  })
}