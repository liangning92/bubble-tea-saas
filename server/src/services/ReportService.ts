import prisma from '../config/database'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from '../utils/dateUtils'
import { getLowStockAlerts } from './BomService'
import { getConsumptionAnalysis } from './InventoryService'

export interface DateRange {
  startDate: Date
  endDate: Date
}

// Dashboard summary
export async function getDashboardSummary(storeId: string, date?: Date) {
  const targetDate = date || new Date()
  const todayStart = startOfDay(targetDate)
  const todayEnd = endOfDay(targetDate)
  const monthStart = startOfMonth(targetDate)
  const monthEnd = endOfMonth(targetDate)

  // Get last 30 days for analysis
  const analysisStart = startOfDay(subDays(targetDate, 30))
  const analysisEnd = endOfDay(targetDate)

  const [todayOrders, monthOrders, todayStaff, lowStockAlerts, consumptionAnomalies] = await Promise.all([
    // Today's orders
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: todayStart, lte: todayEnd },
        status: { not: 'refunded' }
      },
      include: { items: true }
    }),
    // Month's orders
    prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: monthStart, lte: monthEnd },
        status: { not: 'refunded' }
      },
      include: { items: true }
    }),
    // Today's staff attendance (via staff relationship)
    prisma.attendance.findMany({
      where: {
        checkInTime: { gte: todayStart, lte: todayEnd }
      },
      include: { staff: { select: { name: true } } }
    }),
    // Low stock alerts based on consumption forecast
    getLowStockAlerts(storeId, 7),
    // Consumption anomalies (variance > 10%)
    getConsumptionAnalysis({
      storeId,
      startDate: analysisStart.toISOString(),
      endDate: analysisEnd.toISOString(),
      varianceThreshold: 10
    })
  ])

  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.finalAmount, 0)
  const monthRevenue = monthOrders.reduce((sum, o) => sum + o.finalAmount, 0)
  const todayOrderCount = todayOrders.length
  const monthOrderCount = monthOrders.length

  // Calculate today hourly distribution
  const hourlyOrders = new Array(24).fill(0)
  todayOrders.forEach(order => {
    const hour = new Date(order.createdAt).getHours()
    hourlyOrders[hour]++
  })

  // Top selling products today
  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {}
  todayOrders.forEach(order => {
    order.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { name: item.productName, quantity: 0, revenue: 0 }
      }
      productSales[item.productId].quantity += item.quantity
      productSales[item.productId].revenue += item.unitPrice * item.quantity
    })
  })

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // Payment method distribution
  const paymentStats: Record<string, number> = {}
  todayOrders.forEach(order => {
    paymentStats[order.paymentMethod] = (paymentStats[order.paymentMethod] || 0) + order.finalAmount
  })

  // Filter low stock alerts by urgency
  const criticalAlerts = lowStockAlerts.filter(a => a.urgency === 'critical')
  const warningAlerts = lowStockAlerts.filter(a => a.urgency === 'warning')

  // Filter consumption anomalies by status (warning + critical)
  const consumptionAnomalyList = consumptionAnomalies?.filter(a => a.varianceStatus !== 'normal') || []

  return {
    today: {
      orderCount: todayOrderCount,
      revenue: todayRevenue,
      avgOrderValue: todayOrderCount > 0 ? Math.round(todayRevenue / todayOrderCount) : 0,
      hourlyDistribution: hourlyOrders
    },
    month: {
      orderCount: monthOrderCount,
      revenue: monthRevenue,
      avgOrderValue: monthOrderCount > 0 ? Math.round(monthRevenue / monthOrderCount) : 0
    },
    inventory: {
      lowStockCount: lowStockAlerts.length,
      criticalCount: criticalAlerts.length,
      warningCount: warningAlerts.length,
      lowStockItems: lowStockAlerts.slice(0, 5).map(a => ({
        id: a.inventoryId,
        name: a.name,
        currentStock: a.currentStock,
        daysLeft: a.daysUntilStockOut,
        urgency: a.urgency,
        unit: a.unit,
        suggestedReorderQty: a.suggestedReorderQty
      })),
      consumptionAnomalies: consumptionAnomalyList.slice(0, 5).map(a => ({
        id: a.inventoryId,
        name: a.inventoryName,
        theoretical: a.theoreticalConsumption,
        actual: a.actualConsumption,
        variance: a.variance,
        variancePercent: a.variancePercent,
        status: a.varianceStatus,
        unit: a.unit
      }))
    },
    staff: {
      checkedIn: todayStaff.filter(s => s.checkInTime && !s.checkOutTime).length,
      total: todayStaff.length,
      pendingLeave: 0 // Will be filled by separate query if needed
    },
    topProducts,
    paymentStats
  }
}

// Sales report
export async function getSalesReport(storeId: string, dateRange: DateRange) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      status: { not: 'refunded' }
    },
    include: {
      items: true,
      member: { select: { name: true, phone: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Group by date
  const dailySales: Record<string, { orders: number; revenue: number; items: number }> = {}

  orders.forEach(order => {
    const dateKey = new Date(order.createdAt).toISOString().slice(0, 10)
    if (!dailySales[dateKey]) {
      dailySales[dateKey] = { orders: 0, revenue: 0, items: 0 }
    }
    dailySales[dateKey].orders++
    dailySales[dateKey].revenue += order.finalAmount
    dailySales[dateKey].items += order.items.reduce((sum, i) => sum + i.quantity, 0)
  })

  // Product breakdown
  const productSales: Record<string, { name: string; quantity: number; revenue: number; cost: number }> = {}

  orders.forEach(order => {
    order.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { name: item.productName, quantity: 0, revenue: 0, cost: 0 }
      }
      productSales[item.productId].quantity += item.quantity
      productSales[item.productId].revenue += item.unitPrice * item.quantity
      productSales[item.productId].cost += item.bomCost * item.quantity
    })
  })

  return {
    summary: {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.finalAmount, 0),
      totalItems: orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
      avgOrderValue: orders.length > 0
        ? Math.round(orders.reduce((sum, o) => sum + o.finalAmount, 0) / orders.length)
        : 0
    },
    dailySales: Object.entries(dailySales)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    productSales: Object.values(productSales)
      .map(p => ({
        ...p,
        profit: p.revenue - p.cost
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }
}

// Staff performance report
export async function getStaffReport(storeId: string, dateRange: DateRange) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      status: { not: 'refunded' }
    }
  })

  // Get staff names for the staffIds in orders
  const staffIds = [...new Set(orders.map(o => o.staffId))]
  const staffMembers = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true }
  })
  const staffNameMap: Record<string, string> = {}
  staffMembers.forEach(s => { staffNameMap[s.id] = s.name })

  const staffStats: Record<string, { name: string; orderCount: number; revenue: number }> = {}

  orders.forEach(order => {
    const staffId = order.staffId
    if (!staffStats[staffId]) {
      staffStats[staffId] = { name: staffNameMap[staffId] || 'Unknown', orderCount: 0, revenue: 0 }
    }
    staffStats[staffId].orderCount++
    staffStats[staffId].revenue += order.finalAmount
  })

  // Get staff list for attendance lookup
  const staffList = await prisma.staff.findMany({
    where: { storeId },
    select: { id: true, name: true }
  })
  const staffNameById: Record<string, string> = {}
  staffList.forEach(s => { staffNameById[s.id] = s.name })

  // Get attendance for the period (via staff relationship)
  const attendances = await prisma.attendance.findMany({
    where: {
      staffId: { in: staffIds },
      checkInTime: { gte: dateRange.startDate, lte: dateRange.endDate }
    }
  })

  const staffAttendance: Record<string, { name: string; workDays: number; lateDays: number }> = {}

  attendances.forEach(a => {
    if (!staffAttendance[a.staffId]) {
      staffAttendance[a.staffId] = { name: staffNameById[a.staffId] || 'Unknown', workDays: 0, lateDays: 0 }
    }
    staffAttendance[a.staffId].workDays++
    if (a.checkInTime && new Date(a.checkInTime).getHours() > 9) {
      staffAttendance[a.staffId].lateDays++
    }
  })

  return {
    sales: Object.entries(staffStats).map(([id, data]) => ({
      staffId: id,
      ...data
    })),
    attendance: Object.entries(staffAttendance).map(([id, data]) => ({
      staffId: id,
      ...data
    }))
  }
}

// Inventory report
export async function getInventoryReport(storeId: string) {
  const inventory = await prisma.inventory.findMany({
    where: { storeId },
    include: {
      stockInLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      stockOutLogs: { orderBy: { createdAt: 'desc' }, take: 10 }
    },
    orderBy: { name: 'asc' }
  })

  // Calculate value
  const totalValue = inventory.reduce(
    (sum, item) => sum + item.currentStock * item.avgCost,
    0
  )

  // Category breakdown (category is a string field)
  const categoryStats: Record<string, { name: string; items: number; value: number }> = {}

  inventory.forEach(item => {
    const cat = item.category
    if (!categoryStats[cat]) {
      categoryStats[cat] = {
        name: cat,
        items: 0,
        value: 0
      }
    }
    categoryStats[cat].items++
    categoryStats[cat].value += item.currentStock * item.avgCost
  })

  // Low stock items
  const lowStock = inventory.filter(item => item.currentStock <= item.minStock)

  return {
    summary: {
      totalItems: inventory.length,
      totalValue,
      avgItemValue: inventory.length > 0 ? Math.round(totalValue / inventory.length) : 0
    },
    categories: Object.values(categoryStats),
    lowStock,
    outOfStock: inventory.filter(item => item.currentStock === 0)
  }
}

// Member report
export async function getMemberReport(storeId: string) {
  const members = await prisma.member.findMany({
    where: { storeId },
    include: {
      pointLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      orders: { orderBy: { createdAt: 'desc' }, take: 5 }
    }
  })

  // Level distribution
  const levelStats = {
    bronze: members.filter(m => m.level === 'bronze').length,
    silver: members.filter(m => m.level === 'silver').length,
    gold: members.filter(m => m.level === 'gold').length,
    diamond: members.filter(m => m.level === 'diamond').length
  }

  // Points summary
  const totalPoints = members.reduce((sum, m) => sum + m.points, 0)
  const totalSpent = members.reduce((sum, m) => sum + m.totalSpent, 0)

  // Top members by points
  const topMembers = [...members]
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map(m => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      level: m.level,
      points: m.points,
      totalSpent: m.totalSpent
    }))

  // Inactive members (no visit in 30 days)
  const thirtyDaysAgo = subDays(new Date(), 30)
  const inactiveMembers = members.filter(
    m => !m.lastVisit || new Date(m.lastVisit) < thirtyDaysAgo
  )

  return {
    summary: {
      totalMembers: members.length,
      totalPoints,
      totalSpent,
      avgPointsPerMember: members.length > 0 ? Math.round(totalPoints / members.length) : 0
    },
    levelDistribution: levelStats,
    topMembers,
    inactiveCount: inactiveMembers.length
  }
}