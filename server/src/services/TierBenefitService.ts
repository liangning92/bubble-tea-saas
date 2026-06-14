import prisma from '../config/database'

const DEFAULT_TIERS = ['bronze', 'silver', 'gold', 'diamond']

export async function getTierBenefits(storeId: string) {
  return prisma.tierBenefit.findMany({
    where: { storeId },
    orderBy: [
      { level: 'asc' }
    ]
  })
}

export async function getTierBenefitById(id: string) {
  return prisma.tierBenefit.findUnique({ where: { id } })
}

export async function getTierBenefitByLevel(storeId: string, level: string) {
  return prisma.tierBenefit.findUnique({
    where: { storeId_level: { storeId, level } }
  })
}

export async function upsertTierBenefit(data: {
  storeId: string
  level: string
  pointsRate?: number
  birthdayReward?: any
  discountPercent?: number
  freeDeliveryThreshold?: number
  pointsToUpgrade?: number
  description?: string
}) {
  const existing = await prisma.tierBenefit.findUnique({
    where: { storeId_level: { storeId: data.storeId, level: data.level } }
  })

  const benefitData: any = {
    storeId: data.storeId,
    level: data.level,
    pointsRate: data.pointsRate ?? 1.0,
    discountPercent: data.discountPercent ?? 0,
    freeDeliveryThreshold: data.freeDeliveryThreshold ?? 0,
    pointsToUpgrade: data.pointsToUpgrade ?? null,
    description: data.description ?? null
  }
  if (data.birthdayReward) {
    benefitData.birthdayReward = JSON.stringify(data.birthdayReward)
  }

  if (existing) {
    return prisma.tierBenefit.update({
      where: { id: existing.id },
      data: benefitData
    })
  } else {
    return prisma.tierBenefit.create({ data: benefitData })
  }
}

export async function updateTierBenefit(id: string, data: any) {
  const updateData: any = {}
  if (data.pointsRate !== undefined) updateData.pointsRate = data.pointsRate
  if (data.birthdayReward !== undefined) updateData.birthdayReward = JSON.stringify(data.birthdayReward)
  if (data.discountPercent !== undefined) updateData.discountPercent = data.discountPercent
  if (data.freeDeliveryThreshold !== undefined) updateData.freeDeliveryThreshold = data.freeDeliveryThreshold
  if (data.pointsToUpgrade !== undefined) updateData.pointsToUpgrade = data.pointsToUpgrade
  if (data.description !== undefined) updateData.description = data.description

  return prisma.tierBenefit.update({ where: { id }, data: updateData })
}

export async function deleteTierBenefit(id: string) {
  return prisma.tierBenefit.delete({ where: { id } })
}

export async function getPointsRateMultiplier(storeId: string, level: string): Promise<number> {
  const benefit = await getTierBenefitByLevel(storeId, level)
  return benefit?.pointsRate ?? 1.0
}

export async function calculateTierUpgrade(storeId: string, memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) return null

  const tiers = ['bronze', 'silver', 'gold', 'diamond']
  const currentIndex = tiers.indexOf(member.level)

  const benefits = await getTierBenefits(storeId)
  const nextTier = tiers[currentIndex + 1]
  if (!nextTier) return { currentLevel: member.level, isTopTier: true }

  const nextBenefit = benefits.find(b => b.level === nextTier)
  const currentBenefit = benefits.find(b => b.level === member.level)

  return {
    currentLevel: member.level,
    nextLevel: nextTier,
    pointsNeeded: nextBenefit?.pointsToUpgrade ?? null,
    pointsRate: currentBenefit?.pointsRate ?? 1.0,
    nextPointsRate: nextBenefit?.pointsRate ?? 1.0
  }
}