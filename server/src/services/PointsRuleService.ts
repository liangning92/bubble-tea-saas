import prisma from '../config/database'

// Get points rule for store
export async function getPointsRule(storeId: string) {
  return prisma.pointsRule.findUnique({
    where: { storeId }
  })
}

// Get or create default points rule
export async function getOrCreatePointsRule(storeId: string) {
  let rule = await prisma.pointsRule.findUnique({
    where: { storeId }
  })

  if (!rule) {
    rule = await prisma.pointsRule.create({
      data: {
        storeId,
        pointsPerRupiah: 10000,
        minPurchase: 0,
        birthdayMultiplier: 2.0,
        tierMultiplier: JSON.stringify({ bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }),
        isActive: true
      }
    })
  }

  return rule
}

// Upsert points rule
export async function upsertPointsRule(data: {
  storeId: string
  pointsPerRupiah?: number
  minPurchase?: number
  birthdayMultiplier?: number
  tierMultiplier?: string
  isActive?: boolean
}) {
  const existing = await prisma.pointsRule.findUnique({
    where: { storeId: data.storeId }
  })

  if (existing) {
    return prisma.pointsRule.update({
      where: { id: existing.id },
      data: {
        pointsPerRupiah: data.pointsPerRupiah ?? existing.pointsPerRupiah,
        minPurchase: data.minPurchase ?? existing.minPurchase,
        birthdayMultiplier: data.birthdayMultiplier ?? existing.birthdayMultiplier,
        tierMultiplier: data.tierMultiplier ?? existing.tierMultiplier,
        isActive: data.isActive ?? existing.isActive
      }
    })
  } else {
    return prisma.pointsRule.create({
      data: {
        storeId: data.storeId,
        pointsPerRupiah: data.pointsPerRupiah ?? 10000,
        minPurchase: data.minPurchase ?? 0,
        birthdayMultiplier: data.birthdayMultiplier ?? 2.0,
        tierMultiplier: data.tierMultiplier ?? JSON.stringify({ bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }),
        isActive: data.isActive ?? true
      }
    })
  }
}

// Calculate points earned for a purchase
export function calculatePoints(
  amount: number,
  options: {
    rule: {
      pointsPerRupiah: number
      minPurchase: number
      birthdayMultiplier: number
      tierMultiplier: string
    }
    member: {
      birthday: Date | null
      level: string
    }
  }
): number {
  const { rule, member } = options

  // Check minimum purchase
  if (amount < rule.minPurchase) {
    return 0
  }

  // Base points: amount / pointsPerRupiah
  let points = Math.floor(amount / rule.pointsPerRupiah)

  // Apply birthday multiplier
  if (member.birthday) {
    const today = new Date()
    const birthMonth = member.birthday.getMonth()
    const birthDay = member.birthday.getDate()
    if (today.getMonth() === birthMonth && today.getDate() === birthDay) {
      points = Math.floor(points * rule.birthdayMultiplier)
    }
  }

  // Apply tier multiplier
  const tierMultipliers = JSON.parse(rule.tierMultiplier)
  const tierMultiplier = tierMultipliers[member.level] || 1
  points = Math.floor(points * tierMultiplier)

  return points
}

// Parse tier multiplier JSON
export function parseTierMultiplier(json: string): Record<string, number> {
  try {
    return JSON.parse(json)
  } catch {
    return { bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }
  }
}
