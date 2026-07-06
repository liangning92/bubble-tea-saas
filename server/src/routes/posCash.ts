import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'
import { startOfTodayJakarta } from '../utils/dateUtils'

const router = Router()

// ==================== CASH EVENTS ====================

// GET /api/pos-cash/events - 获取现金事件列表
router.get('/events', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate, type, shift } = req.query

    const where: any = { storeId }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate as string)
      if (endDate) where.createdAt.lte = new Date(endDate as string)
    }
    if (type) where.type = type
    if (shift) where.shift = shift

    const events = await prisma.cashEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    res.json({ code: 200, data: { list: events } })
  } catch (error) {
    console.error('Get cash events error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get cash events' })
  }
})

// POST /api/pos-cash/events - 记录现金事件
router.post('/events', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const staffId = req.user!.staffId || ''
    const { type, amount, paymentMethod, orderId, note, shift } = req.body

    console.log('[POS-CASH] Creating cash event:', {
      storeId,
      staffId,
      type,
      amount,
      paymentMethod,
      orderId,
      userStoreId: req.user!.storeId,
      userRole: req.user!.role
    })

    const event = await prisma.cashEvent.create({
      data: {
        storeId,
        staffId,
        type,
        amount: Math.round(amount),
        paymentMethod,
        orderId,
        note,
        shift
      }
    })

    console.log('[POS-CASH] Cash event created:', event)
    res.status(201).json({ code: 201, data: event })
  } catch (error) {
    console.error('Create cash event error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create cash event' })
  }
})

// GET /api/pos-cash/balance - 获取当前现金余额
router.get('/balance', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const today = startOfTodayJakarta()

    // 获取今日所有现金事件
    const todayEvents = await prisma.cashEvent.findMany({
      where: {
        storeId,
        createdAt: { gte: today }
      }
    })

    // 计算零钱袋余额
    let floatBalance = 0
    let cashIn = 0
    let cashOut = 0
    let cashSales = 0

    todayEvents.forEach(event => {
      switch (event.type) {
        case 'float':
          floatBalance += event.amount
          break
        case 'cash_sale':
          cashSales += event.amount
          break
        case 'cash_in':
          cashIn += event.amount
          break
        case 'cash_out':
          cashOut += event.amount
          break
      }
    })

    const currentBalance = floatBalance + cashSales + cashIn - cashOut

    // 获取当前班次
    const currentShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' },
      orderBy: { openedAt: 'desc' }
    })

    res.json({
      code: 200,
      data: {
        currentBalance,
        todayCashSales: cashSales,
        todayCashIns: cashIn,
        todayCashOuts: cashOut,
        openFloat: currentShift?.openFloat || 0,
        shift: currentShift
      }
    })
  } catch (error) {
    console.error('Get cash balance error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get cash balance' })
  }
})

// GET /api/pos-cash/shifts/current - 获取当前班次详细信息（用于POS交接班弹窗）
router.get('/shifts/current', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    console.log('[POS-CASH] shifts/current called with storeId:', storeId, 'user:', req.user!.role)

    // 计算今日开始时间（使用 Asia/Jakarta 时区，确保跨环境一致性）
    // startOfTodayJakarta() 返回今天 00:00 WIB = 昨天 17:00 UTC
    const today = startOfTodayJakarta()

    // 获取当前打开的班次
    const currentShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' },
      orderBy: { openedAt: 'desc' }
    })

    // 获取今日所有现金事件（使用 WIB 00:00）
    const todayEvents = await prisma.cashEvent.findMany({
      where: {
        storeId,
        createdAt: { gte: today }
      }
    })

    // 计算现金汇总
    let todayCashSales = 0
    let todayCashIns = 0
    let todayCashOuts = 0

    todayEvents.forEach(event => {
      switch (event.type) {
        case 'cash_sale': todayCashSales += event.amount; break
        case 'cash_in': todayCashIns += event.amount; break
        case 'cash_out': todayCashOuts += event.amount; break
      }
    })

    // 获取今日订单数量
    const todayOrders = await prisma.order.count({
      where: {
        storeId,
        createdAt: { gte: today }
      }
    })

    // 获取今日订单总金额（用于交接班显示）
    const todayOrderAmountResult = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: today }
      },
      _sum: { finalAmount: true }
    })
    const todayOrderAmount = todayOrderAmountResult._sum.finalAmount || 0

    // 获取今日各渠道订单数量
    const channelOrderCounts = await prisma.order.groupBy({
      by: ['channelId'],
      where: {
        storeId,
        createdAt: { gte: today }
      },
      _count: { id: true }
    })

    // 获取渠道ID到code的映射
    const channels = await prisma.channel.findMany({
      where: { storeId },
      select: { id: true, code: true }
    })
    const channelIdToCode: Record<string, string> = {}
    channels.forEach(ch => { channelIdToCode[ch.id] = ch.code })

    // 统计各渠道订单数
    const dineInCount = channelOrderCounts
      .filter(c => channelIdToCode[c.channelId || ''] === 'DINE_IN')
      .reduce((sum, c) => sum + c._count.id, 0)
    const gofoodCount = channelOrderCounts
      .filter(c => channelIdToCode[c.channelId || ''] === 'GOFOOD')
      .reduce((sum, c) => sum + c._count.id, 0)
    const grabCount = channelOrderCounts
      .filter(c => channelIdToCode[c.channelId || ''] === 'GRAB')
      .reduce((sum, c) => sum + c._count.id, 0)
    const shopeeCount = channelOrderCounts
      .filter(c => channelIdToCode[c.channelId || ''] === 'SHOPEE')
      .reduce((sum, c) => sum + c._count.id, 0)

    // 获取今日客户数量（所有订单的堂食人数之和）
    const customerCountResult = await prisma.order.aggregate({
      where: { storeId, createdAt: { gte: today } },
      _sum: { customerCount: true }
    })
    const customerCount = customerCountResult._sum.customerCount || 0

    // 获取今日 QRIS 销售金额
    const todayQrisSales = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: today },
        paymentMethod: 'qris'
      },
      _sum: { totalAmount: true }
    })

    // 获取挂单数量
    const suspendedOrders = await prisma.order.count({
      where: {
        storeId,
        status: 'suspended'
      }
    })

    // 计算期望现金
    const expectedCash = currentShift
      ? currentShift.openFloat + todayCashSales + todayCashIns - todayCashOuts
      : 0

    res.json({
      code: 200,
      data: {
        hasOpenShift: !!currentShift,
        shift: currentShift,
        openFloat: currentShift?.openFloat || 0,
        todayCashSales,
        todayCashIns,
        todayCashOuts,
        expectedCash,
        currentBalance: expectedCash, // 当前余额 = 期望现金
        todayOrderCount: todayOrders,
        todayOrderAmount, // 今日订单总金额
        suspendedOrderCount: suspendedOrders,
        // 新增：渠道订单统计
        dineInCount,
        gofoodCount,
        grabCount,
        shopeeCount,
        // 新增：客户数和QRIS销售
        customerCount,
        qrisSales: todayQrisSales._sum.totalAmount || 0
      }
    })
  } catch (error) {
    console.error('Get current shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get current shift' })
  }
})

// ==================== SHIFT SESSIONS ====================

// GET /api/pos-cash/shifts - 获取班次列表
router.get('/shifts', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const where: any = { storeId }
    if (startDate || endDate) {
      where.openedAt = {}
      if (startDate) where.openedAt.gte = new Date(startDate as string)
      if (endDate) where.openedAt.lte = new Date(endDate as string)
    }

    const shifts = await prisma.shiftSession.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: 50
    })

    res.json({ code: 200, data: { list: shifts } })
  } catch (error) {
    console.error('Get shifts error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shifts' })
  }
})

// POST /api/pos-cash/shifts/open - 开班
router.post('/shifts/open', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const staffId = req.user!.staffId || ''
    const { openFloat, shift } = req.body

    console.log('[POS-CASH] shift/open called:', { storeId, staffId, openFloat, shift, userRole: req.user!.role })

    // 检查是否有未关闭的班次
    const openShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' }
    })

    if (openShift) {
      return res.status(400).json({ code: 400, message: 'There is already an open shift' })
    }

    const session = await prisma.shiftSession.create({
      data: {
        storeId,
        staffId,
        shift: shift || 'morning',
        openFloat: Math.round(openFloat),
        status: 'open'
      }
    })

    // 同时记录开班零钱事件
    await prisma.cashEvent.create({
      data: {
        storeId,
        staffId,
        type: 'float',
        amount: Math.round(openFloat),
        shift: shift || 'morning',
        note: '开班零钱'
      }
    })

    res.status(201).json({ code: 201, data: session })
  } catch (error) {
    console.error('Open shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to open shift' })
  }
})

// POST /api/pos-cash/shifts/close - 交班
router.post('/shifts/close', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const staffId = req.user!.staffId || ''
    const { actualCash, closeNote, nextStaffId } = req.body

    // 获取当前打开的班次
    const currentShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' }
    })

    if (!currentShift) {
      return res.status(400).json({ code: 400, message: 'No open shift found' })
    }

    // 计算期望现金
    const today = startOfTodayJakarta()

    const shiftEvents = await prisma.cashEvent.findMany({
      where: {
        storeId,
        shift: currentShift.shift,
        createdAt: { gte: today }
      }
    })

    let expectedCash = currentShift.openFloat
    shiftEvents.forEach(event => {
      if (event.type === 'cash_sale') expectedCash += event.amount
      if (event.type === 'cash_in') expectedCash += event.amount
      if (event.type === 'cash_out') expectedCash -= event.amount
    })

    const difference = actualCash !== undefined ? actualCash - expectedCash : null

    const session = await prisma.shiftSession.update({
      where: { id: currentShift.id },
      data: {
        status: 'closed',
        actualCash: actualCash ? Math.round(actualCash) : null,
        expectedCash,
        cashDifference: difference,
        closeNote,
        nextStaffId,
        closedAt: new Date()
      }
    })

    // 记录交班事件
    await prisma.cashEvent.create({
      data: {
        storeId,
        staffId,
        type: 'close_shift',
        amount: actualCash || 0,
        shift: currentShift.shift,
        note: `交班 - 差异: ${difference !== null ? difference : 'N/A'}`
      }
    })

    res.json({ code: 200, data: session })
  } catch (error) {
    console.error('Close shift error:', error)
    res.status(500).json({ code: 500, message: 'Failed to close shift' })
  }
})

// ==================== CASH SUMMARY ====================

// GET /api/pos-cash/summary - 获取现金汇总
router.get('/summary', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { date, shift } = req.query

    const where: any = { storeId }
    if (date) where.date = date as string
    if (shift) where.shift = shift as string

    const summaries = await prisma.cashSummary.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 30
    })

    res.json({ code: 200, data: { list: summaries } })
  } catch (error) {
    console.error('Get cash summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get cash summary' })
  }
})

// POST /api/pos-cash/summary - 生成每日现金汇总
router.post('/summary', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { date, shift, staffId } = req.body

    // 获取该班次的现金事件
    const targetDate = date || new Date().toISOString().split('T')[0]
    const startOfDay = new Date(targetDate + 'T00:00:00.000Z')
    const endOfDay = new Date(targetDate + 'T23:59:59.999Z')
    const events = await prisma.cashEvent.findMany({
      where: {
        storeId,
        shift,
        createdAt: { gte: startOfDay, lte: endOfDay }
      }
    })

    let openFloat = 0, cashSales = 0, cashIns = 0, cashOuts = 0

    events.forEach(event => {
      switch (event.type) {
        case 'float': openFloat = event.amount; break
        case 'cash_sale': cashSales += event.amount; break
        case 'cash_in': cashIns += event.amount; break
        case 'cash_out': cashOuts += event.amount; break
      }
    })

    const expectedCash = openFloat + cashSales + cashIns - cashOuts

    const summary = await prisma.cashSummary.upsert({
      where: {
        storeId_date_shift: {
          storeId,
          date: date || new Date().toISOString().split('T')[0],
          shift: shift || 'morning'
        }
      },
      create: {
        storeId,
        date: date || new Date().toISOString().split('T')[0],
        shift: shift || 'morning',
        openFloat,
        cashSales,
        cashIns,
        cashOuts,
        expectedCash,
        staffId
      },
      update: {
        openFloat,
        cashSales,
        cashIns,
        cashOuts,
        expectedCash,
        staffId
      }
    })

    res.json({ code: 200, data: summary })
  } catch (error) {
    console.error('Create cash summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create cash summary' })
  }
})

// GET /api/pos-cash/today - 获取今日现金情况
router.get('/today', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const today = new Date().toISOString().split('T')[0]

    // 获取今日所有班次的汇总
    const summaries = await prisma.cashSummary.findMany({
      where: { storeId, date: today }
    })

    // 获取今日所有现金事件
    const todayStart = startOfTodayJakarta()

    const events = await prisma.cashEvent.findMany({
      where: {
        storeId,
        createdAt: { gte: todayStart }
      }
    })

    // 计算今日总计
    let totalCashSales = 0
    let totalCashIns = 0
    let totalCashOuts = 0
    let totalOpenFloat = 0

    events.forEach(event => {
      switch (event.type) {
        case 'float': totalOpenFloat += event.amount; break
        case 'cash_sale': totalCashSales += event.amount; break
        case 'cash_in': totalCashIns += event.amount; break
        case 'cash_out': totalCashOuts += event.amount; break
      }
    })

    const expectedCash = totalOpenFloat + totalCashSales + totalCashIns - totalCashOuts

    // 获取当前打开的班次
    const openShift = await prisma.shiftSession.findFirst({
      where: { storeId, status: 'open' }
    })

    res.json({
      code: 200,
      data: {
        date: today,
        summaries,
        totals: {
          openFloat: totalOpenFloat,
          cashSales: totalCashSales,
          cashIns: totalCashIns,
          cashOuts: totalCashOuts,
          expectedCash
        },
        openShift
      }
    })
  } catch (error) {
    console.error('Get today cash error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get today cash' })
  }
})

// GET /api/pos-cash/summary - 获取交接班汇总数据
router.get('/summary', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const today = startOfTodayJakarta()

    // 获取今日所有事件
    const todayEvents = await prisma.cashEvent.findMany({
      where: { storeId, createdAt: { gte: today } }
    })

    // 计算现金数据
    let openFloat = 0
    let cashSales = 0
    let cashIn = 0
    let cashOut = 0
    let qrisSales = 0
    let debitSales = 0

    todayEvents.forEach(event => {
      switch (event.type) {
        case 'float': openFloat += event.amount; break
        case 'cash_sale': cashSales += event.amount; break
        case 'cash_in': cashIn += event.amount; break
        case 'cash_out': cashOut += event.amount; break
      }
      if (event.paymentMethod === 'qris') qrisSales += event.amount
      if (event.paymentMethod === 'debit') debitSales += event.amount
    })

    // 获取今日订单统计（按渠道）
    const todayOrders = await prisma.order.findMany({
      where: {
        storeId,
        createdAt: { gte: today },
        status: { not: 'cancelled' }
      }
    })

    let orderCount = todayOrders.length
    let customerCount = 0
    let dineInCount = 0
    let gofoodCount = 0
    let grabCount = 0
    let shopeeCount = 0

    todayOrders.forEach(order => {
      customerCount += (order as any).customerCount || 1
      switch (order.channelId) {
        case 'dine_in': dineInCount++; break
        case 'gofood': gofoodCount++; break
        case 'grab': grabCount++; break
        case 'shopee': shopeeCount++; break
      }
    })

    // 获取挂单数量（从POS端 localStorage，POS端处理）

    // 计算期末现金
    const closeCash = openFloat + cashSales + cashIn - cashOut

    res.json({
      code: 200,
      data: {
        orderCount,
        customerCount,
        cashSales,
        qrisSales,
        debitSales,
        cashIn,
        cashOut,
        openFloat,
        closeCash,
        dineInCount,
        gofoodCount,
        grabCount,
        shopeeCount
      }
    })
  } catch (error) {
    console.error('Get shift summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift summary' })
  }
})

export { router as posCashRouter }