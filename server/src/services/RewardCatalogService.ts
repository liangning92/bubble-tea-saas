import prisma from '../config/database'

// Get all rewards for store
export async function getRewards(storeId: string) {
  return prisma.rewardCatalog.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' }
  })
}

// Get active rewards for store
export async function getActiveRewards(storeId: string) {
  const now = new Date()
  return prisma.rewardCatalog.findMany({
    where: {
      storeId,
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now }
    },
    orderBy: { pointsCost: 'asc' }
  })
}

// Get single reward
export async function getReward(id: string) {
  return prisma.rewardCatalog.findUnique({
    where: { id },
    include: { redemptions: true }
  })
}

// Create reward
export async function createReward(data: {
  storeId: string
  name: string
  description?: string
  type: string
  productId?: string
  addonId?: string
  pointsCost: number
  value: number
  stock?: number
  validFrom: Date
  validUntil: Date
  isActive?: boolean
}) {
  return prisma.rewardCatalog.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      description: data.description,
      type: data.type,
      productId: data.productId,
      addonId: data.addonId,
      pointsCost: data.pointsCost,
      value: data.value,
      stock: data.stock,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      isActive: data.isActive ?? true
    }
  })
}

// Update reward
export async function updateReward(id: string, data: Partial<{
  name: string
  description: string
  type: string
  productId: string
  addonId: string
  pointsCost: number
  value: number
  stock: number
  validFrom: Date
  validUntil: Date
  isActive: boolean
}>) {
  return prisma.rewardCatalog.update({
    where: { id },
    data
  })
}

// Delete reward
export async function deleteReward(id: string) {
  return prisma.rewardCatalog.delete({
    where: { id }
  })
}

// Redeem reward for member
export async function redeemReward(memberId: string, rewardId: string, orderId?: string) {
  const reward = await prisma.rewardCatalog.findUnique({
    where: { id: rewardId }
  })

  if (!reward) {
    throw new Error('Reward not found')
  }

  if (!reward.isActive) {
    throw new Error('Reward is not active')
  }

  const now = new Date()
  if (now < reward.validFrom || now > reward.validUntil) {
    throw new Error('Reward is not valid at this time')
  }

  if (reward.stock !== null && reward.stock <= 0) {
    throw new Error('Reward is out of stock')
  }

  // Get member
  const member = await prisma.member.findUnique({
    where: { id: memberId }
  })

  if (!member) {
    throw new Error('Member not found')
  }

  if (member.points < reward.pointsCost) {
    throw new Error('Insufficient points')
  }

  // Use transaction
  const result = await prisma.$transaction(async (tx) => {
    // Deduct points from member
    await tx.member.update({
      where: { id: memberId },
      data: { points: { decrement: reward.pointsCost } }
    })

    // Create point log
    await tx.pointLog.create({
      data: {
        memberId,
        type: 'redeem',
        points: -reward.pointsCost,
        note: `Redeemed: ${reward.name}`,
        orderId
      }
    })

    // Create member reward
    const memberReward = await tx.memberReward.create({
      data: {
        memberId,
        rewardId,
        points: reward.pointsCost,
        orderId,
        status: 'unused',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days expiry
      }
    })

    // Decrement stock if not unlimited
    if (reward.stock !== null) {
      await tx.rewardCatalog.update({
        where: { id: rewardId },
        data: { stock: { decrement: 1 } }
      })
    }

    return memberReward
  })

  return result
}

// Get member's redeemed rewards
export async function getMemberRewards(memberId: string) {
  return prisma.memberReward.findMany({
    where: { memberId },
    include: { reward: true },
    orderBy: { createdAt: 'desc' }
  })
}

// Get member's unused rewards
export async function getMemberUnusedRewards(memberId: string) {
  const now = new Date()
  return prisma.memberReward.findMany({
    where: {
      memberId,
      status: 'unused',
      expiresAt: { gt: now }
    },
    include: { reward: true },
    orderBy: { createdAt: 'desc' }
  })
}

// Mark reward as used
export async function useReward(id: string, orderId: string) {
  return prisma.memberReward.update({
    where: { id },
    data: {
      status: 'used',
      usedAt: new Date(),
      orderId
    }
  })
}

// Check and expire old unused rewards (called by scheduler)
export async function expireOldRewards() {
  const now = new Date()
  const expired = await prisma.memberReward.updateMany({
    where: {
      status: 'unused',
      expiresAt: { lt: now }
    },
    data: { status: 'expired' }
  })
  return expired.count
}
