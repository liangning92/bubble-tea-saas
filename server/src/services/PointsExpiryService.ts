import prisma from '../config/database'
import { subMonths } from '../utils/dateUtils'
import { sendMessageToMember } from './MessageService'

export async function getPointsExpiryRule(storeId: string) {
  return prisma.pointsExpiryRule.findUnique({
    where: { storeId }
  })
}

export async function upsertPointsExpiryRule(data: {
  storeId: string
  enabled?: boolean
  expiryMonths?: number
  minPointsToExpire?: number
  notificationDays?: number
}) {
  const existing = await prisma.pointsExpiryRule.findUnique({
    where: { storeId: data.storeId }
  })

  const ruleData = {
    storeId: data.storeId,
    enabled: data.enabled ?? true,
    expiryMonths: data.expiryMonths ?? 12,
    minPointsToExpire: data.minPointsToExpire ?? 100,
    notificationDays: data.notificationDays ?? 14
  }

  if (existing) {
    return prisma.pointsExpiryRule.update({
      where: { id: existing.id },
      data: ruleData
    })
  } else {
    return prisma.pointsExpiryRule.create({ data: ruleData })
  }
}

export async function updatePointsExpiryRule(id: string, data: any) {
  const updateData: any = {}
  if (data.enabled !== undefined) updateData.enabled = data.enabled
  if (data.expiryMonths !== undefined) updateData.expiryMonths = data.expiryMonths
  if (data.minPointsToExpire !== undefined) updateData.minPointsToExpire = data.minPointsToExpire
  if (data.notificationDays !== undefined) updateData.notificationDays = data.notificationDays

  return prisma.pointsExpiryRule.update({ where: { id }, data: updateData })
}

export async function processPointsExpiry(storeId: string) {
  const rule = await getPointsExpiryRule(storeId)
  if (!rule || !rule.enabled) return { processed: 0, expired: 0, messagesSent: 0 }

  const expiryDate = subMonths(new Date(), rule.expiryMonths)
  const members = await prisma.member.findMany({
    where: { storeId, status: 'active', points: { gt: rule.minPointsToExpire } }
  })

  let expiredCount = 0
  let processedCount = 0
  let messagesSent = 0

  // Get message template for expiry notification
  const expiryTemplate = await prisma.messageTemplate.findFirst({
    where: { storeId, type: 'points_expiring', enabled: true }
  })

  // Use transaction to ensure atomic updates
  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      // Find points earned before expiry date that haven't been expired yet
      const oldPoints = await tx.pointLog.findMany({
        where: {
          memberId: member.id,
          type: 'earn',
          createdAt: { lt: expiryDate }
        }
      })

      const alreadyExpired = await tx.pointLog.findFirst({
        where: {
          memberId: member.id,
          type: 'expire',
          createdAt: { gte: expiryDate }
        }
      })

      if (oldPoints.length > 0 && !alreadyExpired) {
        const totalExpiring = oldPoints.reduce((sum, p) => sum + p.points, 0)
        if (totalExpiring >= rule.minPointsToExpire) {
          // Create expire log
          await tx.pointLog.create({
            data: {
              memberId: member.id,
              type: 'expire',
              points: -totalExpiring,
              note: `Points expired after ${rule.expiryMonths} months`
            }
          })

          // Deduct from member
          await tx.member.update({
            where: { id: member.id },
            data: { points: { decrement: totalExpiring } }
          })

          // Send expiry notification if template configured
          if (expiryTemplate) {
            try {
              const result = await sendMessageToMember(storeId, member.id, 'points_expiring', 'sms', expiryTemplate.id)
              if (result.success) messagesSent++
            } catch (e) {
              console.error('Failed to send expiry notification:', e)
            }
          }

          expiredCount++
        }
      }
      processedCount++
    }
  })

  return { processed: processedCount, expired: expiredCount, messagesSent }
}

export async function getExpiringPoints(storeId: string, memberId: string) {
  const rule = await getPointsExpiryRule(storeId)
  if (!rule) return { expiringPoints: 0, expiryDate: null }

  const expiryDate = subMonths(new Date(), rule.expiryMonths)

  const oldPoints = await prisma.pointLog.findMany({
    where: {
      memberId,
      type: 'earn',
      createdAt: { lt: expiryDate }
    }
  })

  const totalExpiring = oldPoints.reduce((sum, p) => sum + p.points, 0)

  return {
    expiringPoints: totalExpiring,
    expiryDate: expiryDate.toISOString()
  }
}