import { parseDateBoundary } from '../utils/businessDate'
import { calculateShiftCash, cashWarningFor, CASH_WARNING_PREFIX } from '../services/ShiftCashReconciliation'
import { manualReceiptsSchema } from '../services/ShiftManualReceipts'
import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import prisma from '../config/database'
import { getExpenseCategories } from '../services/ExpenseService'
import { summarizeShiftPurchases } from '../services/PosExpenseService'
import { loadShiftSummaryEvidence } from '../services/ShiftSummaryEvidence'
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
      if (startDate) where.createdAt.gte = parseDateBoundary(startDate as string)
      if (endDate) where.createdAt.lte = parseDateBoundary(endDate as string, true)
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

    res.status(201).json({ code: 201, data: event })
  } catch (error) {
    console.error('Create cash event error:', error)
    res.status(500).json({ code: 500, message: 'Failed to create cash event' })
  }
})

// Current-session records are provisional evidence, never financial reconciliation.
for (const path of ['/balance', '/shifts/current']) {
  router.get(path, authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
    try {
      const data = await loadShiftSummaryEvidence(prisma, req.user!.storeId)
      const purchaseExpenses = data.shift ? await summarizeShiftPurchases(req.user!.storeId, data.shift.openedAt, new Date()) : null
      const cashReconciliation = data.shift ? await calculateShiftCash(prisma, req.user!.storeId, data.shift, new Date(data.summaryEvidence.windowEnd)) : null
      res.json({ code: 200, data: { ...data, purchaseExpenses, cashReconciliation } })
    } catch (error) {
      console.error('Get shift evidence error:', error)
      res.status(500).json({ code: 500, message: 'Failed to get shift evidence' })
    }
  })
}

// ==================== SHIFT SESSIONS ====================

// GET /api/pos-cash/shifts - 获取班次列表
router.get('/shifts', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const { startDate, endDate } = req.query

    const where: any = { storeId }
    if (startDate || endDate) {
      where.openedAt = {}
      if (startDate) where.openedAt.gte = parseDateBoundary(startDate as string)
      if (endDate) where.openedAt.lte = parseDateBoundary(endDate as string, true)
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

// Reprints read the immutable closed-session purchase snapshot, never re-record cash or costs.
router.get('/shifts/:id/handover', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.shiftSession.findFirst({ where: { id: req.params.id, storeId: req.user!.storeId, status: 'closed' } })
    if (!session) return res.status(404).json({ code: 404, message: 'SHIFT_HANDOVER_NOT_FOUND' })
    const snapshot = await prisma.config.findUnique({ where: { storeId_key: { storeId: req.user!.storeId, key: 'pos.shift.purchase:' + session.id } } })
    const reportRow = await prisma.config.findUnique({where:{storeId_key:{storeId:req.user!.storeId,key:'pos.shift.report:'+session.id}}})
    const report = reportRow ? JSON.parse(reportRow.value) : null
    res.json({ code: 200, data: { ...session, expectedCash:report?.expectedCash ?? null, cashDifference:report?.cashDifference ?? null, purchaseExpenses: snapshot ? JSON.parse(snapshot.value) : null, report } })
  } catch (e) { next(e) }
})

// POST /api/pos-cash/shifts/open - 开班
router.post('/shifts/open', authenticate, authorize('admin', 'manager', 'cashier'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const staffId = req.user!.staffId || ''
    const { openFloat, shift } = req.body


    if (!storeId || typeof shift !== 'string' || !Number.isFinite(openFloat) || openFloat <= 0) {
      return res.status(400).json({ code: 400, message: 'INVALID_SHIFT_INPUT' })
    }
    if (shift === 'off') return res.status(409).json({ code: 409, message: 'SHIFT_DISABLED' })
    const configuredShift = await prisma.shift.findFirst({ where: { storeId, key: shift, isActive: true } })
    if (!configuredShift) {
      return res.status(409).json({ code: 409, message: 'SHIFT_DISABLED' })
    }

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
        shift,
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
        shift,
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
    const parsedReceipts = req.body.manualReceipts === undefined ? null : manualReceiptsSchema.safeParse(req.body.manualReceipts)
    if (parsedReceipts && !parsedReceipts.success) return res.status(400).json({code:400,message:'SHIFT_MANUAL_RECEIPTS_INVALID'})
    const manualReceipts = parsedReceipts?.success ? parsedReceipts.data : null
    if (!Number.isSafeInteger(actualCash) || actualCash < 0 || actualCash > 2147483647) return res.status(400).json({code:400,message:'SHIFT_RECONCILIATION_REQUIRED'})

    const shiftConfig = await prisma.config.findFirst({
      where: { storeId, key: 'shiftSettings' },
      select: { value: true }
    })
    let shiftSettings: any = {}
    try { shiftSettings = shiftConfig?.value ? JSON.parse(shiftConfig.value) : {} } catch {}
    if (shiftSettings.requireSupervisorConfirm && !['admin', 'manager'].includes(req.user!.role)) {
      return res.status(403).json({ code: 403, message: 'SUPERVISOR_REQUIRED' })
    }

    // 获取当前打开的班次
    const openSessions = await prisma.shiftSession.findMany({
      where: { storeId, status: 'open' }
    })

    if (openSessions.length > 1) return res.status(409).json({code:409,message:'SHIFT_SESSIONS_OVERLAP'})
    const currentShift = openSessions[0]
    if (!currentShift) {
      return res.status(400).json({ code: 400, message: 'No open shift found' })
    }

    // Capture one closing boundary; estimates are never certified reconciliation.
    const closedAt = new Date()

    const categories = await getExpenseCategories(storeId)
    const result = await prisma.$transaction(async tx => {
      await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } })
      const captured = await loadShiftSummaryEvidence(tx, storeId, closedAt, currentShift)
      const evidence = captured.summaryEvidence
      const cashReconciliation = await calculateShiftCash(tx, storeId, currentShift, closedAt)
      const recordedBalance = cashReconciliation.expectedCash
      const expectedCash = cashReconciliation.expectedCash
      const cashWarning = cashWarningFor(currentShift.id, actualCash, cashReconciliation, closedAt)
      const difference = cashWarning?.difference || 0
      const purchaseExpenses = await summarizeShiftPurchases(storeId, currentShift.openedAt, closedAt, tx, categories)
      // The recorded formula is frozen in the report; cash discrepancy is informational and never blocks closing.
      const changed = await tx.shiftSession.updateMany({ where: { id: currentShift.id, status: 'open' }, data: { status: 'closed', actualCash, ...(Number.isSafeInteger(recordedBalance) && recordedBalance >= -2147483648 && recordedBalance <= 2147483647 ? {expectedCash:recordedBalance} : {}), cashDifference: Number.isSafeInteger(difference) && difference >= -2147483648 && difference <= 2147483647 ? difference : null, closeNote, nextStaffId, closedAt } })
      if (changed.count !== 1) throw Error('SHIFT_ALREADY_CLOSED')
      const session = await tx.shiftSession.findUniqueOrThrow({ where: { id: currentShift.id } })
      await tx.cashEvent.create({ data: { storeId, staffId, type: 'close_shift', amount: actualCash, shift: currentShift.shift, note: `交班 - 差异: ${difference !== null ? difference : 'N/A'}` } })
      await tx.config.create({ data: { storeId, key: 'pos.shift.purchase:' + session.id, category: 'shift_report', value: JSON.stringify(purchaseExpenses) } })
      const [cashier,shift] = await Promise.all([tx.staff.findFirst({where:{id:staffId,storeId},select:{name:true}}),tx.shift.findFirst({where:{storeId,key:currentShift.shift},select:{name:true,nameZh:true,nameId:true}})])
      const report = {version:1,cashReconciliation,manualReceipts,manualReceiptsSource:manualReceipts ? 'manual_handover' : null,reportedBy:req.user!.id,reportKind:'handover',sessionId:session.id,cashierName:cashier?.name || null,shiftType:session.shift,shiftNames:shift,openedAt:session.openedAt,closedAt:session.closedAt,openFloat:session.openFloat,actualCash,summaryEvidence:evidence,recordedBalance,expectedCash,cashDifference:difference,purchaseExpenses,summaryItems:shiftSettings.summaryItems || {}}
      await tx.config.create({data:{storeId,key:'pos.shift.report:'+session.id,category:'shift_report',value:JSON.stringify(report)}})
      if (cashWarning) await tx.config.create({data:{storeId,key:CASH_WARNING_PREFIX+session.id,category:'shift_report',value:JSON.stringify(cashWarning)}})
      return { ...session, expectedCash, cashDifference:difference, purchaseExpenses, report, cashWarning }
    })
    res.json({ code: 200, data: result })
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
    let totalDiscount = 0
    let autoPromotionDiscount = 0
    let manualDiscount = 0
    let promotionOrderCount = 0
    let manualDiscountOrderCount = 0

    todayOrders.forEach(order => {
      customerCount += (order as any).customerCount || 1
      switch (order.channelId) {
        case 'dine_in': dineInCount++; break
        case 'gofood': gofoodCount++; break
        case 'grab': grabCount++; break
        case 'shopee': shopeeCount++; break
      }

      const discount = order.discountAmount || 0
      if (discount > 0) {
        totalDiscount += discount
        const note = order.note || ''
        if (note.includes('[自动优惠:') || note.includes('自动优惠')) {
          autoPromotionDiscount += discount
          promotionOrderCount++
        } else {
          manualDiscount += discount
          manualDiscountOrderCount++
        }
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
        shopeeCount,
        totalDiscount,
        autoPromotionDiscount,
        manualDiscount,
        promotionOrderCount,
        manualDiscountOrderCount
      }
    })
  } catch (error) {
    console.error('Get shift summary error:', error)
    res.status(500).json({ code: 500, message: 'Failed to get shift summary' })
  }
})

export { router as posCashRouter }
