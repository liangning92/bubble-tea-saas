import prisma from '../config/database'
import { BusinessInputError, parseBusinessDate } from '../utils/businessDate'
import { endOfDay } from '../utils/dateUtils'
const rewardDate = (value: Date | string, until = false) => {
  const date = parseBusinessDate(value)
  return until && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? endOfDay(date) : date
}

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
async function validateRewardLinks(storeId:string,data:{productId?:string|null;addonId?:string|null}) {
  if(data.productId&&!await prisma.product.findFirst({where:{id:data.productId,storeId}}))throw new BusinessInputError('Reward product does not belong to this store')
  if(data.addonId&&!await prisma.addon.findFirst({where:{id:data.addonId,storeId}}))throw new BusinessInputError('Reward topping does not belong to this store')
}
export async function createReward(data: {
  storeId: string
  name: string
  description?: string
  type: string
  productId?: string | null
  addonId?: string | null
  pointsCost: number
  value: number
  stock?: number
  validFrom: Date | string
  validUntil: Date | string
  isActive?: boolean
}) {
  await validateRewardLinks(data.storeId,data)
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
      validFrom: rewardDate(data.validFrom),
      validUntil: rewardDate(data.validUntil, true),
      isActive: data.isActive ?? true
    }
  })
}

// Update reward
export async function updateReward(id: string, data: Partial<{
  name: string
  description: string
  type: string
  productId: string | null
  addonId: string | null
  pointsCost: number
  value: number
  stock: number
  validFrom: Date | string
  validUntil: Date | string
  isActive: boolean
}>, storeId?:string) {
  const existing=await getReward(id)
  if(!existing||storeId&&existing.storeId!==storeId)throw new BusinessInputError('Reward not found')
  await validateRewardLinks(existing.storeId,data)
  const allowed = ['name','description','type','productId','addonId','pointsCost','value','stock','isActive']
  const changes = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)))
  return prisma.rewardCatalog.update({
    where: { id },
    data: { ...changes, ...(data.validFrom !== undefined && { validFrom: rewardDate(data.validFrom) }), ...(data.validUntil !== undefined && { validUntil: rewardDate(data.validUntil, true) }) }
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
