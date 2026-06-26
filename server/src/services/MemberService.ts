import prisma from '../config/database'
import { getTierBenefitByLevel } from './TierBenefitService'

export interface MemberFilter {
  storeId?: string
  level?: string
  search?: string
}

// Get members with filtering
export async function getMembers(filter: MemberFilter) {
  const where: any = {}

  if (filter.storeId) where.storeId = filter.storeId
  if (filter.level) where.level = filter.level
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { phone: { contains: filter.search, mode: 'insensitive' } }
    ]
  }

  return prisma.member.findMany({
    where,
    include: {
      store: { select: { id: true, name: true } },
      pointLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get member by ID
export async function getMemberById(memberId: string) {
  return prisma.member.findUnique({
    where: { id: memberId },
    include: {
      store: true,
      pointLogs: {
        orderBy: { createdAt: 'desc' },
        take: 50
      },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  })
}

// Get member by phone
export async function getMemberByPhone(phone: string) {
  return prisma.member.findFirst({
    where: { phone },
    include: {
      store: { select: { id: true, name: true } }
    }
  })
}

// Create member
export async function createMember(data: {
  storeId: string
  name: string
  phone: string
  email?: string
  birthday?: Date
  level?: string
}) {
  // Check if phone already exists
  const existing = await prisma.member.findFirst({
    where: { phone: data.phone }
  })

  if (existing) {
    throw new Error('Phone number already registered')
  }

  return prisma.member.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      birthday: data.birthday,
      level: data.level || 'bronze',
      points: 0,
      totalSpent: 0,
      status: 'active'
    }
  })
}

// Update member
export async function updateMember(memberId: string, data: Partial<{
  name: string
  phone: string
  email: string
  birthday: Date
  level: string
  status: string
}>) {
  return prisma.member.update({
    where: { id: memberId },
    data
  })
}

// Earn points
export async function earnPoints(memberId: string, points: number, note: string, orderId?: string) {
  const member = await prisma.member.update({
    where: { id: memberId },
    data: {
      points: { increment: points },
      lastVisit: new Date()
    }
  })

  await prisma.pointLog.create({
    data: {
      memberId,
      type: 'earn',
      points,
      note,
      orderId
    }
  })

  // Check for level upgrade
  await checkLevelUpgrade(memberId)

  return member
}

// Redeem points
export async function redeemPoints(memberId: string, points: number, note: string, orderId?: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId }
  })

  if (!member || member.points < points) {
    throw new Error('Insufficient points')
  }

  const updated = await prisma.member.update({
    where: { id: memberId },
    data: {
      points: { decrement: points }
    }
  })

  await prisma.pointLog.create({
    data: {
      memberId,
      type: 'redeem',
      points: -points,
      note,
      orderId
    }
  })

  return updated
}

// Adjust points (admin)
export async function adjustPoints(memberId: string, points: number, note: string) {
  const member = await prisma.member.update({
    where: { id: memberId },
    data: {
      points: { increment: points }
    }
  })

  await prisma.pointLog.create({
    data: {
      memberId,
      type: 'adjust',
      points,
      note
    }
  })

  return member
}

// Check and upgrade member level based on totalSpent (using TierBenefit configuration)
export async function checkLevelUpgrade(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId }
  })

  if (!member) return member

  // Get threshold from TierBenefit config (descending order: diamond > gold > silver > bronze)
  const tierThresholds = [
    { level: 'diamond', threshold: 0 },
    { level: 'gold', threshold: 0 },
    { level: 'silver', threshold: 0 },
    { level: 'bronze', threshold: 0 }
  ]

  try {
    // Fetch thresholds from TierBenefit table
    const diamond = await getTierBenefitByLevel(member.storeId, 'diamond')
    const gold = await getTierBenefitByLevel(member.storeId, 'gold')
    const silver = await getTierBenefitByLevel(member.storeId, 'silver')

    if (diamond?.pointsToUpgrade) tierThresholds[0].threshold = diamond.pointsToUpgrade
    if (gold?.pointsToUpgrade) tierThresholds[1].threshold = gold.pointsToUpgrade
    if (silver?.pointsToUpgrade) tierThresholds[2].threshold = silver.pointsToUpgrade
  } catch (e) {
    // Fallback to default thresholds if TierBenefit not configured
    tierThresholds[0].threshold = 5000000 // diamond
    tierThresholds[1].threshold = 2000000 // gold
    tierThresholds[2].threshold = 500000  // silver
  }

  // Determine new level based on thresholds (descending order)
  let newLevel = 'bronze'
  if (member.totalSpent >= tierThresholds[0].threshold) newLevel = 'diamond'
  else if (member.totalSpent >= tierThresholds[1].threshold) newLevel = 'gold'
  else if (member.totalSpent >= tierThresholds[2].threshold) newLevel = 'silver'

  if (newLevel !== member.level) {
    await prisma.member.update({
      where: { id: memberId },
      data: { level: newLevel }
    })
  }

  return member
}

// Get member statistics
export async function getMemberStats(storeId: string) {
  const [total, bronze, silver, gold, diamond] = await Promise.all([
    prisma.member.count({ where: { storeId } }),
    prisma.member.count({ where: { storeId, level: 'bronze' } }),
    prisma.member.count({ where: { storeId, level: 'silver' } }),
    prisma.member.count({ where: { storeId, level: 'gold' } }),
    prisma.member.count({ where: { storeId, level: 'diamond' } })
  ])

  // Get recent activity
  const recentLogs = await prisma.pointLog.findMany({
    where: {
      member: { storeId }
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      member: { select: { name: true, phone: true } }
    }
  })

  return {
    total,
    byLevel: { bronze, silver, gold, diamond },
    recentActivity: recentLogs
  }
}

// RFM Analysis (Recency, Frequency, Monetary)
export async function getRFMAnalysis(storeId: string) {
  const members = await prisma.member.findMany({
    where: { storeId },
    include: {
      orders: {
        select: {
          createdAt: true,
          finalAmount: true
        }
      }
    }
  })

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  return members.map(member => {
    const recentOrders = member.orders.filter(o => o.createdAt >= thirtyDaysAgo)
    const allOrders = member.orders.filter(o => o.createdAt >= ninetyDaysAgo)

    const lastOrder = member.orders.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0]

    const recency = lastOrder
      ? Math.floor((now.getTime() - new Date(lastOrder.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      : 999

    const frequency = allOrders.length
    const monetary = allOrders.reduce((sum, o) => sum + o.finalAmount, 0)

    let segment = 'inactive'
    if (recency <= 7 && frequency >= 4) segment = 'champions'
    else if (recency <= 14 && frequency >= 2) segment = 'loyal'
    else if (recency <= 30 && frequency >= 1) segment = 'active'
    else if (recency <= 60) segment = 'atRisk'
    else if (recency > 60) segment = 'lost'

    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      level: member.level,
      recency,
      frequency,
      monetary,
      segment
    }
  })
}