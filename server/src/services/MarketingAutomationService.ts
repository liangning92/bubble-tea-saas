import prisma from '../config/database'
import { subDays, addDays, startOfDay, endOfDay } from '../utils/dateUtils'
import { sendMessageToMember } from './MessageService'

export interface CampaignTrigger {
  type: 'birthday' | 'reactivation' | 'loyalty' | 'seasonal' | 'welcome' | 'points_expiring'
  memberId?: string
  storeId: string
}

// Create marketing campaign
export async function createCampaign(data: {
  storeId: string
  name: string
  description?: string
  type: string
  triggerType: 'automatic' | 'manual' | 'scheduled'
  startDate: Date
  endDate?: Date
  conditions?: any
  actions?: any
}) {
  return prisma.campaign.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      description: data.description,
      type: data.type,
      triggerType: data.triggerType,
      startDate: data.startDate,
      endDate: data.endDate,
      conditions: JSON.stringify(data.conditions || {}),
      actions: JSON.stringify(data.actions || {}),
      status: 'active'
    }
  })
}

// Get active campaigns
export async function getActiveCampaigns(storeId: string) {
  const now = new Date()
  return prisma.campaign.findMany({
    where: {
      storeId,
      status: 'active',
      startDate: { lte: now },
      OR: [
        { endDate: null },
        { endDate: { gte: now } }
      ]
    }
  })
}

// Get single campaign
export async function getCampaign(id: string) {
  return prisma.campaign.findUnique({ where: { id } })
}

// Update campaign
export async function updateCampaign(id: string, data: {
  name?: string
  description?: string
  type?: string
  triggerType?: string
  status?: string
  startDate?: Date
  endDate?: Date
  conditions?: any
  actions?: any
}) {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.type !== undefined) updateData.type = data.type
  if (data.triggerType !== undefined) updateData.triggerType = data.triggerType
  if (data.status !== undefined) updateData.status = data.status
  if (data.startDate !== undefined) updateData.startDate = data.startDate
  if (data.endDate !== undefined) updateData.endDate = data.endDate
  if (data.conditions !== undefined) updateData.conditions = JSON.stringify(data.conditions)
  if (data.actions !== undefined) updateData.actions = JSON.stringify(data.actions)

  return prisma.campaign.update({ where: { id }, data: updateData })
}

// Delete campaign
export async function deleteCampaign(id: string) {
  return prisma.campaign.delete({ where: { id } })
}

// Create coupon
export async function createCoupon(data: {
  storeId: string
  campaignId?: string
  code: string
  type: 'discount_percent' | 'discount_fixed' | 'free_product' | 'free_delivery'
  value: number
  minOrder?: number
  maxDiscount?: number
  validFrom: Date
  validUntil: Date
  usageLimit?: number
}) {
  return prisma.coupon.create({
    data: {
      storeId: data.storeId,
      campaignId: data.campaignId,
      code: data.code,
      type: data.type,
      value: data.value,
      minOrder: data.minOrder || 0,
      maxDiscount: data.maxDiscount || 0,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      usageLimit: data.usageLimit || 0
    }
  })
}

// Get all coupons for a store
export async function getAllCoupons(storeId: string) {
  return prisma.coupon.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' }
  })
}

// Get single coupon
export async function getCoupon(id: string) {
  return prisma.coupon.findUnique({
    where: { id },
    include: { memberCoupons: true }
  })
}

// Update coupon
export async function updateCoupon(id: string, data: {
  code?: string
  type?: string
  value?: number
  minOrder?: number
  maxDiscount?: number
  validFrom?: Date
  validUntil?: Date
  usageLimit?: number
  status?: string
}) {
  const updateData: any = {}
  if (data.code !== undefined) updateData.code = data.code
  if (data.type !== undefined) updateData.type = data.type
  if (data.value !== undefined) updateData.value = data.value
  if (data.minOrder !== undefined) updateData.minOrder = data.minOrder
  if (data.maxDiscount !== undefined) updateData.maxDiscount = data.maxDiscount
  if (data.validFrom !== undefined) updateData.validFrom = data.validFrom
  if (data.validUntil !== undefined) updateData.validUntil = data.validUntil
  if (data.usageLimit !== undefined) updateData.usageLimit = data.usageLimit
  if (data.status !== undefined) updateData.status = data.status

  return prisma.coupon.update({ where: { id }, data: updateData })
}

// Delete coupon
export async function deleteCoupon(id: string) {
  return prisma.coupon.delete({ where: { id } })
}

// Generate coupon for member
export async function generateMemberCoupon(memberId: string, couponId: string) {
  return prisma.memberCoupon.create({
    data: {
      memberId,
      couponId,
      status: 'unused'
    }
  })
}

// Check and trigger birthday campaign
export async function checkBirthdayCampaign(storeId: string) {
  const today = new Date()
  const todayStr = today.toISOString().slice(5, 10) // MM-DD

  // Find members with birthday today
  const members = await prisma.member.findMany({
    where: {
      storeId,
      birthday: { not: null },
      status: 'active'
    }
  })

  const birthdayMembers = members.filter(m => {
    if (!m.birthday) return false
    const birthMonthDay = m.birthday.toISOString().slice(5, 10)
    return birthMonthDay === todayStr
  })

  // Get birthday campaign
  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId,
      type: 'birthday',
      status: 'active'
    }
  })

  if (!campaign || !birthdayMembers.length) return { triggered: 0 }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId

  if (!couponId) return { triggered: 0 }

  // Generate coupons for birthday members
  let count = 0
  let messagesSent = 0
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  for (const member of birthdayMembers) {
    await generateMemberCoupon(member.id, couponId)
    count++

    // Send notification message if template configured
    if (messageTemplateId) {
      const result = await sendMessageToMember(storeId, member.id, 'birthday', channelType, messageTemplateId)
      if (result.success) messagesSent++
    }
  }

  return { triggered: count, messagesSent, campaignId: campaign.id }
}

// Check and trigger reactivation campaign (30 days inactive)
export async function checkReactivationCampaign(storeId: string) {
  const thirtyDaysAgo = subDays(new Date(), 30)

  const members = await prisma.member.findMany({
    where: {
      storeId,
      status: 'active',
      lastVisit: { lt: thirtyDaysAgo }
    }
  })

  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId,
      type: 'reactivation',
      status: 'active'
    }
  })

  if (!campaign || !members.length) return { triggered: 0 }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId

  if (!couponId) return { triggered: 0 }

  let count = 0
  let messagesSent = 0
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  for (const member of members) {
    // Check if already received this campaign recently
    const existing = await prisma.memberCoupon.findFirst({
      where: {
        memberId: member.id,
        couponId,
        createdAt: { gte: subDays(new Date(), 60) }
      }
    })

    if (!existing) {
      await generateMemberCoupon(member.id, couponId)
      count++

      // Send notification message if template configured
      if (messageTemplateId) {
        const result = await sendMessageToMember(storeId, member.id, 'reactivation', channelType, messageTemplateId)
        if (result.success) messagesSent++
      }
    }
  }

  return { triggered: count, messagesSent, campaignId: campaign.id }
}

// Check points expiring (14 days before)
export async function checkPointsExpiring(storeId: string) {
  // Get configured rule for minPoints threshold
  const rule = await prisma.pointsExpiryRule.findUnique({ where: { storeId } })
  const minPoints = rule?.minPointsToExpire ?? 100

  const members = await prisma.member.findMany({
    where: {
      storeId,
      status: 'active',
      points: { gt: minPoints }
    }
  })

  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId,
      type: 'points_expiring',
      status: 'active'
    }
  })

  if (!campaign) return { notified: 0 }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId
  const thresholdDays = actions.thresholdDays || 14
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  let count = 0
  let messagesSent = 0
  for (const member of members) {
    // Find points that will expire
    const expiringPoints = await prisma.pointLog.findMany({
      where: {
        memberId: member.id,
        type: 'earn',
        createdAt: {
          gte: subDays(new Date(), 365),
          lt: subDays(new Date(), 365 - thresholdDays)
        }
      }
    })

    // Calculate total points earned in that period
    const totalEarned = expiringPoints.reduce((sum, log) => sum + log.points, 0)

    if (totalEarned > 1000) {
      await generateMemberCoupon(member.id, couponId)
      count++

      // Send notification message if template configured
      if (messageTemplateId) {
        const result = await sendMessageToMember(storeId, member.id, 'points_expiring', channelType, messageTemplateId)
        if (result.success) messagesSent++
      }
    }
  }

  return { notified: count, messagesSent, campaignId: campaign.id }
}

// Trigger welcome campaign for new members
export async function triggerWelcomeCampaign(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId }
  })

  if (!member) return { triggered: false }

  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId: member.storeId,
      type: 'welcome',
      status: 'active'
    }
  })

  if (!campaign) return { triggered: false }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  if (couponId) {
    await generateMemberCoupon(memberId, couponId)

    // Send welcome message if template configured
    let messageSent = false
    if (messageTemplateId) {
      const result = await sendMessageToMember(member.storeId, memberId, 'welcome', channelType, messageTemplateId)
      messageSent = result.success
    }

    return { triggered: true, messageSent, campaignId: campaign.id }
  }

  return { triggered: false }
}

// Get member's available coupons
export async function getMemberCoupons(memberId: string) {
  const now = new Date()
  return prisma.memberCoupon.findMany({
    where: {
      memberId,
      status: 'unused',
      coupon: {
        validFrom: { lte: now },
        validUntil: { gte: now },
        status: 'active'
      }
    },
    include: { coupon: true }
  })
}

// Redeem coupon
export async function redeemCoupon(memberCouponId: string, orderId?: string) {
  const memberCoupon = await prisma.memberCoupon.findUnique({
    where: { id: memberCouponId },
    include: { coupon: true }
  })

  if (!memberCoupon) throw new Error('Coupon not found')
  if (memberCoupon.status !== 'unused') throw new Error('Coupon already used or expired')

  // Update coupon usage
  await prisma.coupon.update({
    where: { id: memberCoupon.couponId },
    data: { usedCount: { increment: 1 } }
  })

  // Update member coupon
  return prisma.memberCoupon.update({
    where: { id: memberCouponId },
    data: {
      usedAt: new Date(),
      orderId,
      status: 'used'
    }
  })
}

// Get campaign statistics
export async function getCampaignStats(campaignId: string) {
  const [campaign, coupons] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.coupon.findMany({
      where: { campaignId },
      include: { memberCoupons: true }
    })
  ])

  if (!campaign) return null

  const totalIssued = coupons.reduce((sum, c) => sum + c.usedCount, 0)
  const totalValue = coupons.reduce((sum, c) => sum + (c.value * c.usedCount), 0)

  return {
    campaignId,
    campaignName: campaign.name,
    couponsIssued: coupons.length,
    couponsUsed: totalIssued,
    totalValue,
    status: campaign.status
  }
}

// Run all automation checks (called by scheduler)
export async function runAutomationChecks(storeId: string) {
  const results = {
    birthday: await checkBirthdayCampaign(storeId),
    reactivation: await checkReactivationCampaign(storeId),
    pointsExpiring: await checkPointsExpiring(storeId)
  }

  return results
}

// Get seasonal campaigns (Ramadan, etc.)
export async function checkSeasonalCampaigns(storeId: string) {
  const now = new Date()
  const month = now.getMonth()

  // Ramadan is typically around March-April (months 2-3)
  // Check if current month is within Ramadan period
  const isRamadan = month >= 2 && month <= 3

  if (!isRamadan) return { triggered: 0 }

  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId,
      type: 'seasonal',
      status: 'active'
    }
  })

  if (!campaign) return { triggered: 0 }

  // Apply seasonal discount to all active members
  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  if (!couponId) return { triggered: 0 }

  const members = await prisma.member.findMany({
    where: { storeId, status: 'active' }
  })

  let count = 0
  let messagesSent = 0
  for (const member of members) {
    await generateMemberCoupon(member.id, couponId)
    count++

    // Send notification message if template configured
    if (messageTemplateId) {
      const result = await sendMessageToMember(storeId, member.id, 'seasonal', channelType, messageTemplateId)
      if (result.success) messagesSent++
    }
  }

  return { triggered: count, messagesSent, campaignId: campaign.id }
}

// Check points expiring with campaign wrapper
export async function checkPointsExpiringCampaign(storeId: string) {
  return checkPointsExpiring(storeId)
}

// Check welcome campaign for new members (registered but never purchased)
export async function checkWelcomeCampaign(storeId: string) {
  const sevenDaysAgo = subDays(new Date(), 7)

  const members = await prisma.member.findMany({
    where: {
      storeId,
      status: 'active',
      lastVisit: null,
      createdAt: { lt: sevenDaysAgo }
    }
  })

  const campaign = await prisma.campaign.findFirst({
    where: {
      storeId,
      type: 'welcome',
      status: 'active'
    }
  })

  if (!campaign || !members.length) return { triggered: 0 }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  if (!couponId) return { triggered: 0 }

  let count = 0
  let messagesSent = 0
  for (const member of members) {
    await generateMemberCoupon(member.id, couponId)
    count++

    if (messageTemplateId) {
      const result = await sendMessageToMember(storeId, member.id, 'welcome', channelType, messageTemplateId)
      if (result.success) messagesSent++
    }
  }

  return { triggered: count, messagesSent, campaignId: campaign.id }
}

// Check seasonal campaign (wrapper for existing function)
export async function checkSeasonalCampaign(storeId: string) {
  return checkSeasonalCampaigns(storeId)
}

// ============================================
// New Configurable Automation (using TriggerConditions and CampaignActions)
// ============================================

import { findMatchingMembers, memberMatchesConditions, ConditionContext } from './TriggerEngine'
import { executeCampaignActions, ActionContext } from './ActionExecutor'

// Run automation for a specific campaign using new condition/action system
export async function runCampaignAutomation(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      triggerConditions: { orderBy: { sortOrder: 'asc' } },
      campaignActions: { orderBy: { sortOrder: 'asc' } }
    }
  })

  if (!campaign) {
    return { success: false, reason: 'Campaign not found' }
  }

  if (campaign.status !== 'active') {
    return { success: false, reason: 'Campaign is not active' }
  }

  // Check date range
  const now = new Date()
  if (campaign.startDate > now) {
    return { success: false, reason: 'Campaign has not started yet' }
  }
  if (campaign.endDate && campaign.endDate < now) {
    return { success: false, reason: 'Campaign has ended' }
  }

  // Get conditions and actions from new tables
  const conditions = campaign.triggerConditions.map(c => ({
    conditionKey: c.conditionKey,
    operator: c.operator,
    value: c.value,
    logicalOperator: c.logicalOperator
  }))

  const actions = campaign.campaignActions.map(a => ({
    actionKey: a.actionKey,
    config: a.config,
    sortOrder: a.sortOrder
  }))

  // Find matching members
  const allMembers = await findMatchingMembers(campaign.storeId, conditions)

  let matchedCount = 0
  let executedCount = 0
  let failedCount = 0

  for (const member of allMembers) {
    const ctx: ConditionContext = {
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        level: member.level,
        points: member.points,
        totalSpent: member.totalSpent,
        birthday: member.birthday,
        lastVisit: member.lastVisit,
        status: member.status,
        createdAt: member.createdAt
      },
      campaign: {
        id: campaign.id,
        storeId: campaign.storeId,
        name: campaign.name
      }
    }

    if (memberMatchesConditions(conditions, ctx)) {
      matchedCount++

      const actionCtx: ActionContext = {
        memberId: member.id,
        storeId: campaign.storeId,
        campaignName: campaign.name
      }

      const result = await executeCampaignActions(actions, actionCtx)
      executedCount += result.executed
      failedCount += result.failed
    }
  }

  return {
    success: true,
    matchedCount,
    executedCount,
    failedCount,
    campaignId: campaign.id
  }
}

// Legacy support: Run automation using old JSON format (for backwards compatibility)
export async function runCampaignAutomationLegacy(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId }
  })

  if (!campaign) {
    return { success: false, reason: 'Campaign not found' }
  }

  const actions = JSON.parse(campaign.actions || '{}')
  const couponId = actions.couponId
  const messageTemplateId = actions.messageTemplateId || null
  const channelType = actions.channelType || 'sms'

  if (!couponId && !messageTemplateId) {
    return { success: false, reason: 'No actions configured' }
  }

  // Get matching members based on campaign type
  const today = new Date()
  const todayStr = today.toISOString().slice(5, 10)

  let members: any[] = []

  switch (campaign.type) {
    case 'birthday':
      const allMembers = await prisma.member.findMany({
        where: { storeId: campaign.storeId, status: 'active', birthday: { not: null } }
      })
      members = allMembers.filter(m => {
        if (!m.birthday) return false
        return m.birthday.toISOString().slice(5, 10) === todayStr
      })
      break

    case 'reactivation':
      const thirtyDaysAgo = subDays(new Date(), 30)
      members = await prisma.member.findMany({
        where: {
          storeId: campaign.storeId,
          status: 'active',
          lastVisit: { lt: thirtyDaysAgo }
        }
      })
      break

    default:
      // For other types without specific logic, use all active members
      members = await prisma.member.findMany({
        where: { storeId: campaign.storeId, status: 'active' }
      })
  }

  let count = 0
  let messagesSent = 0

  for (const member of members) {
    if (couponId) {
      await generateMemberCoupon(member.id, couponId)
      count++
    }

    if (messageTemplateId) {
      const result = await sendMessageToMember(campaign.storeId, member.id, campaign.type, channelType, messageTemplateId)
      if (result.success) messagesSent++
    }
  }

  return {
    success: true,
    triggered: count,
    messagesSent,
    campaignId: campaign.id
  }
}