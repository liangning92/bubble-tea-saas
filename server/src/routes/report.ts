import { Router } from 'express'
import { z } from 'zod'
import prisma from '../config/database'
import { authenticate, AuthRequest } from '../middlewares/auth'

const router = Router()

// GET /api/reports/revenue
router.get('/revenue', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, startDate, endDate, groupBy } = req.query

    const where: any = {
      status: { in: ['completed', 'refunded'] }
    }
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true }
    })

    // Calculate revenue
    let totalRevenue = 0
    let totalRefund = 0
    let totalDiscount = 0
    let totalOrders = orders.filter(o => o.status === 'completed').length
    const paymentMethodStats: Record<string, { count: number; amount: number }> = {}
    const productStats: Record<string, { name: string; quantity: number; revenue: number }> = {}

    orders.forEach(order => {
      if (order.status === 'completed') {
        totalRevenue += order.finalAmount
        totalDiscount += order.discountAmount
      } else if (order.status === 'refunded') {
        totalRefund += order.finalAmount
      }

      // Payment method stats
      if (!paymentMethodStats[order.paymentMethod]) {
        paymentMethodStats[order.paymentMethod] = { count: 0, amount: 0 }
      }
      paymentMethodStats[order.paymentMethod].count++
      paymentMethodStats[order.paymentMethod].amount += order.finalAmount

      // Product stats
      order.items.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = { name: item.productName, quantity: 0, revenue: 0 }
        }
        productStats[item.productId].quantity += item.quantity
        productStats[item.productId].revenue += item.unitPrice * item.quantity
      })
    })

    // Top products
    const topProducts = Object.entries(productStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    res.json({
      code: 200,
      data: {
        summary: {
          totalRevenue,
          totalRefund,
          netRevenue: totalRevenue - totalRefund,
          totalDiscount,
          totalOrders,
          averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
        },
        paymentMethods: Object.entries(paymentMethodStats).map(([method, stats]) => ({
          method,
          ...stats
        })),
        topProducts,
        period: { startDate, endDate }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get revenue report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get revenue report' })
  }
})

// GET /api/reports/daily
router.get('/daily', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, startDate, endDate } = req.query

    const where: any = {
      status: 'completed'
    }
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    // Group by day
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    const dailyStats: Record<string, { date: string; orders: number; revenue: number }> = {}

    orders.forEach(order => {
      const date = order.createdAt.toISOString().slice(0, 10)
      if (!dailyStats[date]) {
        dailyStats[date] = { date, orders: 0, revenue: 0 }
      }
      dailyStats[date].orders++
      dailyStats[date].revenue += order.finalAmount
    })

    const result = Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))

    res.json({
      code: 200,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get daily report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get daily report' })
  }
})

// GET /api/reports/hourly
router.get('/hourly', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, date } = req.query

    const where: any = {
      status: 'completed',
      createdAt: {
        gte: new Date((date as string) || new Date().toISOString().slice(0, 10)),
        lt: new Date(new Date((date as string) || new Date().toISOString().slice(0, 10)).getTime() + 24 * 60 * 60 * 1000)
      }
    }
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const orders = await prisma.order.findMany({ where })

    const hourlyStats: { hour: number; orders: number; revenue: number }[] = []
    for (let i = 0; i < 24; i++) {
      hourlyStats.push({ hour: i, orders: 0, revenue: 0 })
    }

    orders.forEach(order => {
      const hour = order.createdAt.getHours()
      hourlyStats[hour].orders++
      hourlyStats[hour].revenue += order.finalAmount
    })

    res.json({
      code: 200,
      data: hourlyStats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get hourly report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get hourly report' })
  }
})

// GET /api/reports/inventory
router.get('/inventory', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        stockInLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        stockOutLogs: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    })

    const stats = inventory.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentStock: item.currentStock,
      avgCost: item.avgCost,
      totalValue: item.currentStock * item.avgCost,
      safetyStock: item.safetyStock,
      isLowStock: item.currentStock <= item.safetyStock,
      lastIn: item.stockInLogs[0] || null,
      lastOut: item.stockOutLogs[0] || null
    }))

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get inventory report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get inventory report' })
  }
})

// GET /api/reports/staff
router.get('/staff', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, month } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const staff = await prisma.staff.findMany({
      where,
      include: {
        user: { select: { phone: true } },
        attendances: true,
        salaries: true
      }
    })

    const stats = staff.map(s => {
      const presentDays = s.attendances.filter(a => a.checkOutTime).length
      const lateDays = s.attendances.filter(a => a.status === 'late').length
      const totalSalary = s.salaries.reduce((sum, sal) => sum + sal.finalAmount, 0)

      return {
        id: s.id,
        name: s.name,
        employeeNumber: s.employeeNumber,
        position: s.position,
        phone: s.user.phone,
        presentDays,
        lateDays,
        totalSalary,
        status: s.status
      }
    })

    res.json({
      code: 200,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get staff report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get staff report' })
  }
})

// GET /api/reports/dashboard
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // ============ 今日数据 ============
    const todayOrders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'completed',
        createdAt: { gte: today }
      },
      include: { items: true }
    })

    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.finalAmount, 0)
    const todayCost = todayOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.bomCost, 0), 0)
    const todayProfit = todayRevenue - todayCost

    // ============ 昨日数据（对比）============
    const yesterdayOrders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'completed',
        createdAt: { gte: yesterday, lt: today }
      }
    })
    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + o.finalAmount, 0)

    // ============ 本月数据 ============
    const monthOrders = await prisma.order.findMany({
      where: {
        storeId,
        status: 'completed',
        createdAt: { gte: thisMonth }
      },
      include: { items: true }
    })
    const monthRevenue = monthOrders.reduce((sum, o) => sum + o.finalAmount, 0)
    const monthCost = monthOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.bomCost, 0), 0)
    const monthProfit = monthRevenue - monthCost

    // ============ 库存预警 ============
    const allInventory = await prisma.inventory.findMany({
      where: { storeId }
    })
    const lowStockItems = allInventory
      .filter(i => i.currentStock <= i.safetyStock)
      .map(i => ({
        id: i.id,
        name: i.name,
        currentStock: i.currentStock,
        unit: i.unit,
        safetyStock: i.safetyStock
      }))

    // ============ 员工情况 ============
    const staffList = await prisma.staff.findMany({
      where: { storeId }
    })
    const totalStaff = staffList.length

    const todayAttendance = await prisma.attendance.count({
      where: {
        checkInTime: { gte: today }
      }
    })

    // 待审批请假
    const pendingLeave = await prisma.leave.count({
      where: {
        storeId,
        status: 'pending'
      }
    })

    // ============ 会员情况 ============
    const todayNewMembers = await prisma.member.count({
      where: {
        storeId,
        createdAt: { gte: today }
      }
    })

    const todayMemberOrders = todayOrders.filter(o => o.memberId).length
    const memberRatio = todayOrders.length > 0
      ? Math.round(todayMemberOrders / todayOrders.length * 100)
      : 0

    // ============ 热销产品TOP5 ============
    const productStats: Record<string, { name: string; quantity: number }> = {}
    todayOrders.forEach(order => {
      order.items.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = { name: item.productName, quantity: 0 }
        }
        productStats[item.productId].quantity += item.quantity
      })
    })
    const topProducts = Object.entries(productStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)

    // ============ 月度目标进度 ============
    const revenueGoal = await prisma.config.findFirst({
      where: { storeId, key: 'monthlyRevenueGoal' }
    })
    const goalValue = revenueGoal ? parseInt(revenueGoal.value) : 0
    const goalProgress = goalValue > 0 ? Math.min(100, Math.round(monthRevenue / goalValue * 100)) : 0

    // ============ 最近订单 ============
    const recentOrders = await prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    res.json({
      code: 200,
      data: {
        today: {
          orders: todayOrders.length,
          revenue: todayRevenue,
          cost: todayCost,
          profit: todayProfit,
          averageOrder: todayOrders.length > 0
            ? Math.round(todayRevenue / todayOrders.length)
            : 0,
          compareWithYesterday: {
            revenueChange: yesterdayRevenue > 0
              ? Math.round((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100)
              : 0,
            ordersChange: yesterdayOrders.length > 0
              ? Math.round((todayOrders.length - yesterdayOrders.length) / yesterdayOrders.length * 100)
              : 0
          }
        },
        thisMonth: {
          orders: monthOrders.length,
          revenue: monthRevenue,
          cost: monthCost,
          profit: monthProfit,
          goalProgress
        },
        inventory: {
          lowStockCount: lowStockItems.length,
          lowStockItems
        },
        staff: {
          checkedIn: todayAttendance,
          total: totalStaff,
          pendingLeave
        },
        member: {
          newMembers: todayNewMembers,
          ratio: memberRatio
        },
        topProducts,
        recentOrders: recentOrders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          staffName: '', // 需要关联staff表
          finalAmount: o.finalAmount,
          paymentMethod: o.paymentMethod,
          status: o.status,
          createdAt: o.createdAt
        })),
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Get dashboard error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get dashboard data' })
  }
})

// GET /api/reports/channels - 获取所有渠道的统计数据
router.get('/channels', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, startDate, endDate } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const dateWhere: any = {}
    if (startDate || endDate) {
      if (startDate) dateWhere.gte = new Date(startDate as string)
      if (endDate) dateWhere.lte = new Date(endDate as string)
    }
    if (Object.keys(dateWhere).length > 0) {
      where.createdAt = dateWhere
    }

    // Get all channels
    const channels = await prisma.channel.findMany({
      where: { storeId: where.storeId },
      orderBy: { sortOrder: 'asc' }
    })

    // Get order stats per channel
    const channelStats = []
    for (const channel of channels) {
      const orders = await prisma.order.findMany({
        where: { ...where, channelId: channel.id, status: 'completed' },
        include: { items: true }
      })

      const orderCount = orders.length
      const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0)
      const totalCost = orders.reduce((sum, o) =>
        sum + o.items.reduce((itemSum, item) => itemSum + item.bomCost, 0), 0)
      const totalProfit = totalRevenue - totalCost
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

      channelStats.push({
        channelId: channel.id,
        channelName: channel.name,
        channelCode: channel.code,
        icon: channel.icon || '',
        commission: channel.commission,
        orderCount,
        totalRevenue,
        totalCost,
        totalProfit,
        avgOrderValue,
        commissionAmount: totalRevenue * channel.commission,
        netRevenue: totalRevenue * (1 - channel.commission)
      })
    }

    res.json({
      code: 200,
      data: { list: channelStats },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel reports error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel reports' })
  }
})

// GET /api/reports/channels/:id - 获取单个渠道的详细统计
router.get('/channels/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { startDate, endDate } = req.query

    const channel = await prisma.channel.findUnique({ where: { id } })
    if (!channel) {
      return res.status(404).json({ code: 404, message: 'Channel not found' })
    }

    const where: any = { channelId: id, status: 'completed' }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true }
    })

    const orderCount = orders.length
    const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0)
    const totalCost = orders.reduce((sum, o) =>
      sum + o.items.reduce((itemSum, item) => itemSum + item.bomCost, 0), 0)
    const totalProfit = totalRevenue - totalCost
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

    // Top products for this channel
    const productStats: Record<string, { name: string; quantity: number; revenue: number }> = {}
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = { name: item.productName, quantity: 0, revenue: 0 }
        }
        productStats[item.productId].quantity += item.quantity
        productStats[item.productId].revenue += item.unitPrice * item.quantity
      })
    })
    const topProducts = Object.entries(productStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    res.json({
      code: 200,
      data: {
        channel,
        stats: {
          orderCount,
          totalRevenue,
          totalCost,
          totalProfit,
          avgOrderValue,
          commissionAmount: totalRevenue * channel.commission,
          netRevenue: totalRevenue * (1 - channel.commission)
        },
        topProducts
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get channel report error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get channel report' })
  }
})

// GET /api/reports/commissions - 获取佣金汇总
router.get('/commissions', authenticate, async (req: AuthRequest, res) => {
  try {
    const { storeId, startDate, endDate } = req.query

    const where: any = {}
    if (storeId) where.storeId = storeId as string
    else if (req.user!.role === 'staff' || req.user!.role === 'cashier') {
      where.storeId = req.user!.storeId
    }

    const dateWhere: any = {}
    if (startDate || endDate) {
      if (startDate) dateWhere.gte = new Date(startDate as string)
      if (endDate) dateWhere.lte = new Date(endDate as string)
    }
    if (Object.keys(dateWhere).length > 0) {
      where.createdAt = dateWhere
    }

    // Get channels with commission > 0
    const channels = await prisma.channel.findMany({
      where: { ...where, commission: { gt: 0 } },
      orderBy: { sortOrder: 'asc' }
    })

    const summaries = []
    for (const channel of channels) {
      const orders = await prisma.order.findMany({
        where: { ...where, channelId: channel.id, status: 'completed' }
      })

      const orderCount = orders.length
      const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0)
      const commissionAmount = totalRevenue * channel.commission

      summaries.push({
        channelId: channel.id,
        channelName: channel.name,
        channelCode: channel.code,
        icon: channel.icon || '',
        commissionRate: channel.commission,
        orderCount,
        grossRevenue: totalRevenue,
        commissionAmount,
        netRevenue: totalRevenue - commissionAmount
      })
    }

    const totalCommission = summaries.reduce((sum, s) => sum + s.commissionAmount, 0)

    res.json({
      code: 200,
      data: {
        list: summaries,
        totalCommission,
        summary: {
          totalGrossRevenue: summaries.reduce((sum, s) => sum + s.grossRevenue, 0),
          totalNetRevenue: summaries.reduce((sum, s) => sum + s.netRevenue, 0)
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Get commissions error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get commissions' })
  }
})

export { router as reportRouter }