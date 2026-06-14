import prisma from '../config/database'
import { sendMessageToMember } from './MessageService'

export async function createReferralCampaign(data: {
  storeId: string
  name: string
  description?: string
  startDate: Date
  endDate?: Date
  inviterReward: { type: string; value: number }
  rewardeeReward: { type: string; value: number }
  minOrderAmount?: number
  maxUsageCount?: number
  referralCode: string
  conditions?: any
}) {
  return prisma.referralCampaign.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      inviterReward: JSON.stringify(data.inviterReward),
      rewardeeReward: JSON.stringify(data.rewardeeReward),
      minOrderAmount: data.minOrderAmount || 0,
      maxUsageCount: data.maxUsageCount || 0,
      referralCode: data.referralCode,
      conditions: data.conditions ? JSON.stringify(data.conditions) : null
    }
  })
}

export async function getReferralCampaigns(storeId: string) {
  return prisma.referralCampaign.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getReferralCampaign(id: string) {
  return prisma.referralCampaign.findUnique({
    where: { id },
    include: { logs: { include: { inviterMember: true, rewardeeMember: true } } }
  })
}

export async function updateReferralCampaign(id: string, data: any) {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.status !== undefined) updateData.status = data.status
  if (data.startDate !== undefined) updateData.startDate = data.startDate
  if (data.endDate !== undefined) updateData.endDate = data.endDate
  if (data.inviterReward !== undefined) updateData.inviterReward = JSON.stringify(data.inviterReward)
  if (data.rewardeeReward !== undefined) updateData.rewardeeReward = JSON.stringify(data.rewardeeReward)
  if (data.minOrderAmount !== undefined) updateData.minOrderAmount = data.minOrderAmount
  if (data.maxUsageCount !== undefined) updateData.maxUsageCount = data.maxUsageCount

  return prisma.referralCampaign.update({ where: { id }, data: updateData })
}

export async function deleteReferralCampaign(id: string) {
  return prisma.referralCampaign.delete({ where: { id } })
}

export async function applyReferralCode(memberId: string, code: string) {
  // Find the inviter by their referral code
  const inviter = await prisma.member.findUnique({
    where: { referralCode: code }
  })

  const campaign = await prisma.referralCampaign.findUnique({
    where: { referralCode: code }
  })
  if (!campaign) throw new Error('Invalid referral code')
  if (campaign.status !== 'active') throw new Error('Referral campaign is not active')

  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) throw new Error('Member not found')
  if (member.referredBy) throw new Error('Member already used a referral code')

  // Update member with referral info (store campaign ID and inviter's member ID)
  await prisma.member.update({
    where: { id: memberId },
    data: {
      referredBy: campaign.id,
      referredByMemberId: inviter?.id || null
    }
  })

  return { success: true, campaignId: campaign.id, inviterId: inviter?.id }
}

export async function getReferralStats(campaignId: string) {
  const logs = await prisma.referralLog.findMany({
    where: { referralCampaignId: campaignId },
    include: { inviterMember: true, rewardeeMember: true }
  })

  return {
    totalReferrals: logs.length,
    fulfilledInviterRewards: logs.filter(l => l.inviterRewardStatus === 'fulfilled').length,
    fulfilledRewardeeRewards: logs.filter(l => l.rewardeeRewardStatus === 'fulfilled').length,
    logs
  }
}

export async function processReferralRewards(logId: string) {
  return prisma.referralLog.update({
    where: { id: logId },
    data: {
      inviterRewardStatus: 'fulfilled',
      rewardeeRewardStatus: 'fulfilled'
    }
  })
}

// Process referral rewards when order is completed
export async function processOrderReferralRewards(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { member: true }
  })

  if (!order || !order.memberId || !order.member?.referredBy) {
    return { processed: false, reason: 'No referral to process' }
  }

  const campaign = await prisma.referralCampaign.findUnique({
    where: { id: order.member.referredBy }
  })

  if (!campaign || campaign.status !== 'active') {
    return { processed: false, reason: 'Campaign not active' }
  }

  // Check if already processed
  const existingLog = await prisma.referralLog.findFirst({
    where: {
      referralCampaignId: campaign.id,
      rewardeeMemberId: order.memberId,
      orderId: orderId
    }
  })

  if (existingLog) {
    return { processed: false, reason: 'Already processed' }
  }

  // Parse rewards
  const inviterReward = JSON.parse(campaign.inviterReward || '{}')
  const rewardeeReward = JSON.parse(campaign.rewardeeReward || '{}')

  const inviterMemberId = order.member.referredByMemberId || ''

  // Create referral log
  const referralLog = await prisma.referralLog.create({
    data: {
      referralCampaignId: campaign.id,
      inviterMemberId: inviterMemberId,
      rewardeeMemberId: order.memberId,
      orderId: orderId,
      inviterRewardStatus: 'pending',
      rewardeeRewardStatus: 'pending'
    }
  })

  // Award rewards to inviter
  if (inviterMemberId && inviterReward.type === 'points') {
    await prisma.member.update({
      where: { id: inviterMemberId },
      data: { points: { increment: inviterReward.value } }
    })
    await prisma.pointLog.create({
      data: {
        memberId: inviterMemberId,
        type: 'earn',
        points: inviterReward.value,
        orderId: orderId,
        note: `Referral reward from ${order.member.name}`
      }
    })
  }

  // Award rewards to rewardee (new member)
  if (rewardeeReward.type === 'points') {
    await prisma.member.update({
      where: { id: order.memberId },
      data: { points: { increment: rewardeeReward.value } }
    })
    await prisma.pointLog.create({
      data: {
        memberId: order.memberId,
        type: 'earn',
        points: rewardeeReward.value,
        orderId: orderId,
        note: `Welcome bonus from referral`
      }
    })
  }

  // Update log status to fulfilled
  await prisma.referralLog.update({
    where: { id: referralLog.id },
    data: {
      inviterRewardStatus: 'fulfilled',
      rewardeeRewardStatus: 'fulfilled'
    }
  })

  // Send notification to inviter
  if (inviterMemberId) {
    try {
      const inviterTemplate = await prisma.messageTemplate.findFirst({
        where: {
          storeId: order.storeId,
          type: 'referral',
          enabled: true
        }
      })
      if (inviterTemplate) {
        await sendMessageToMember(
          order.storeId,
          inviterMemberId,
          'referral',
          'sms',
          inviterTemplate.id
        )
      }
    } catch (e) {
      console.error('Failed to send referral notification:', e)
    }
  }

  return {
    processed: true,
    referralLogId: referralLog.id,
    inviterReward,
    rewardeeReward
  }
}