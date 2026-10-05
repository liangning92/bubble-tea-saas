"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.posCashRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
exports.posCashRouter = router;
// ==================== CASH EVENTS ====================
// GET /api/pos-cash/events - 获取现金事件列表
router.get('/events', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate, type, shift } = req.query;
        const where = { storeId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        if (type)
            where.type = type;
        if (shift)
            where.shift = shift;
        const events = await database_1.default.cashEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json({ code: 200, data: { list: events } });
    }
    catch (error) {
        console.error('Get cash events error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get cash events' });
    }
});
// POST /api/pos-cash/events - 记录现金事件
router.post('/events', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const staffId = req.user.staffId || '';
        const { type, amount, paymentMethod, orderId, note, shift } = req.body;
        const event = await database_1.default.cashEvent.create({
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
        });
        res.status(201).json({ code: 201, data: event });
    }
    catch (error) {
        console.error('Create cash event error:', error);
        res.status(500).json({ code: 500, message: 'Failed to create cash event' });
    }
});
// GET /api/pos-cash/balance - 获取当前现金余额
router.get('/balance', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const today = (0, dateUtils_1.startOfTodayJakarta)();
        // 获取今日所有现金事件
        const todayEvents = await database_1.default.cashEvent.findMany({
            where: {
                storeId,
                createdAt: { gte: today }
            }
        });
        // 计算零钱袋余额
        let floatBalance = 0;
        let cashIn = 0;
        let cashOut = 0;
        let cashSales = 0;
        todayEvents.forEach(event => {
            switch (event.type) {
                case 'float':
                    floatBalance += event.amount;
                    break;
                case 'cash_sale':
                    cashSales += event.amount;
                    break;
                case 'cash_in':
                    cashIn += event.amount;
                    break;
                case 'cash_out':
                    cashOut += event.amount;
                    break;
            }
        });
        const currentBalance = floatBalance + cashSales + cashIn - cashOut;
        // 获取当前班次
        const currentShift = await database_1.default.shiftSession.findFirst({
            where: { storeId, status: 'open' },
            orderBy: { openedAt: 'desc' }
        });
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
        });
    }
    catch (error) {
        console.error('Get cash balance error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get cash balance' });
    }
});
// GET /api/pos-cash/shifts/current - 获取当前班次详细信息（用于POS交接班弹窗）
router.get('/shifts/current', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        // 计算今日开始时间（使用 Asia/Jakarta 时区，确保跨环境一致性）
        // startOfTodayJakarta() 返回今天 00:00 WIB = 昨天 17:00 UTC
        const today = (0, dateUtils_1.startOfTodayJakarta)();
        // 获取当前打开的班次
        const currentShift = await database_1.default.shiftSession.findFirst({
            where: { storeId, status: 'open' },
            orderBy: { openedAt: 'desc' }
        });
        // 获取今日所有现金事件（使用 WIB 00:00）
        const todayEvents = await database_1.default.cashEvent.findMany({
            where: {
                storeId,
                createdAt: { gte: today }
            }
        });
        // 计算现金汇总
        let todayCashSales = 0;
        let todayCashIns = 0;
        let todayCashOuts = 0;
        todayEvents.forEach(event => {
            switch (event.type) {
                case 'cash_sale':
                    todayCashSales += event.amount;
                    break;
                case 'cash_in':
                    todayCashIns += event.amount;
                    break;
                case 'cash_out':
                    todayCashOuts += event.amount;
                    break;
            }
        });
        // 获取今日订单数量
        const todayOrders = await database_1.default.order.count({
            where: {
                storeId,
                createdAt: { gte: today }
            }
        });
        // 获取今日订单总金额（用于交接班显示）
        const todayOrderAmountResult = await database_1.default.order.aggregate({
            where: {
                storeId,
                createdAt: { gte: today }
            },
            _sum: { finalAmount: true }
        });
        const todayOrderAmount = todayOrderAmountResult._sum.finalAmount || 0;
        // 获取今日各渠道订单数量
        const channelOrderCounts = await database_1.default.order.groupBy({
            by: ['channelId'],
            where: {
                storeId,
                createdAt: { gte: today }
            },
            _count: { id: true }
        });
        // 获取渠道ID到code的映射
        const channels = await database_1.default.channel.findMany({
            where: { storeId },
            select: { id: true, code: true }
        });
        const channelIdToCode = {};
        channels.forEach(ch => { channelIdToCode[ch.id] = ch.code; });
        // 统计各渠道订单数
        const dineInCount = channelOrderCounts
            .filter(c => channelIdToCode[c.channelId || ''] === 'DINE_IN')
            .reduce((sum, c) => sum + c._count.id, 0);
        const gofoodCount = channelOrderCounts
            .filter(c => channelIdToCode[c.channelId || ''] === 'GOFOOD')
            .reduce((sum, c) => sum + c._count.id, 0);
        const grabCount = channelOrderCounts
            .filter(c => channelIdToCode[c.channelId || ''] === 'GRAB')
            .reduce((sum, c) => sum + c._count.id, 0);
        const shopeeCount = channelOrderCounts
            .filter(c => channelIdToCode[c.channelId || ''] === 'SHOPEE')
            .reduce((sum, c) => sum + c._count.id, 0);
        // 获取今日客户数量（所有订单的堂食人数之和）
        const customerCountResult = await database_1.default.order.aggregate({
            where: { storeId, createdAt: { gte: today } },
            _sum: { customerCount: true }
        });
        const customerCount = customerCountResult._sum.customerCount || 0;
        // 获取今日 QRIS 销售金额
        const todayQrisSales = await database_1.default.order.aggregate({
            where: {
                storeId,
                createdAt: { gte: today },
                paymentMethod: 'qris'
            },
            _sum: { totalAmount: true }
        });
        // 获取今日挂单数量（只统计当前班次开启后的挂单）
        const suspendedOrders = await database_1.default.order.count({
            where: {
                storeId,
                status: 'suspended',
                createdAt: { gte: currentShift?.openedAt || today }
            }
        });
        // 统计当前班次/今日订单折扣让利稽核（拆分系统自动营销优惠 vs 收银员手动改价折扣）
        const shiftOrders = await database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: currentShift?.openedAt || today },
                status: { not: 'cancelled' },
                discountAmount: { gt: 0 }
            },
            select: {
                discountAmount: true,
                note: true
            }
        });
        let totalDiscount = 0;
        let autoPromotionDiscount = 0;
        let manualDiscount = 0;
        let promotionOrderCount = 0;
        let manualDiscountOrderCount = 0;
        shiftOrders.forEach(ord => {
            const d = ord.discountAmount || 0;
            totalDiscount += d;
            if (ord.note && ord.note.includes('[自动优惠:')) {
                autoPromotionDiscount += d;
                promotionOrderCount++;
            }
            else {
                manualDiscount += d;
                manualDiscountOrderCount++;
            }
        });
        // 计算期望现金
        const expectedCash = currentShift
            ? currentShift.openFloat + todayCashSales + todayCashIns - todayCashOuts
            : 0;
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
                qrisSales: todayQrisSales._sum.totalAmount || 0,
                // 新增：折扣让利稽核指标
                totalDiscount,
                autoPromotionDiscount,
                manualDiscount,
                promotionOrderCount,
                manualDiscountOrderCount
            }
        });
    }
    catch (error) {
        console.error('Get current shift error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get current shift' });
    }
});
// ==================== SHIFT SESSIONS ====================
// GET /api/pos-cash/shifts - 获取班次列表
router.get('/shifts', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const where = { storeId };
        if (startDate || endDate) {
            where.openedAt = {};
            if (startDate)
                where.openedAt.gte = new Date(startDate);
            if (endDate)
                where.openedAt.lte = new Date(endDate);
        }
        const shifts = await database_1.default.shiftSession.findMany({
            where,
            orderBy: { openedAt: 'desc' },
            take: 50
        });
        res.json({ code: 200, data: { list: shifts } });
    }
    catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get shifts' });
    }
});
// POST /api/pos-cash/shifts/open - 开班
router.post('/shifts/open', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const staffId = req.user.staffId || '';
        const { openFloat, shift } = req.body;
        // 检查是否有未关闭的班次
        const openShift = await database_1.default.shiftSession.findFirst({
            where: { storeId, status: 'open' }
        });
        if (openShift) {
            return res.status(400).json({ code: 400, message: 'There is already an open shift' });
        }
        const session = await database_1.default.shiftSession.create({
            data: {
                storeId,
                staffId,
                shift: shift || 'morning',
                openFloat: Math.round(openFloat),
                status: 'open'
            }
        });
        // 同时记录开班零钱事件
        await database_1.default.cashEvent.create({
            data: {
                storeId,
                staffId,
                type: 'float',
                amount: Math.round(openFloat),
                shift: shift || 'morning',
                note: '开班零钱'
            }
        });
        res.status(201).json({ code: 201, data: session });
    }
    catch (error) {
        console.error('Open shift error:', error);
        res.status(500).json({ code: 500, message: 'Failed to open shift' });
    }
});
// POST /api/pos-cash/shifts/close - 交班
router.post('/shifts/close', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager', 'cashier'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const staffId = req.user.staffId || '';
        const { actualCash, closeNote, nextStaffId } = req.body;
        const shiftConfig = await database_1.default.config.findFirst({
            where: { storeId, key: 'shiftSettings' },
            select: { value: true }
        });
        let shiftSettings = {};
        try {
            shiftSettings = shiftConfig?.value ? JSON.parse(shiftConfig.value) : {};
        }
        catch { }
        if (shiftSettings.requireSupervisorConfirm && !['admin', 'manager'].includes(req.user.role)) {
            return res.status(403).json({ code: 403, message: 'SUPERVISOR_REQUIRED' });
        }
        if (shiftSettings.requireReconciliation && (typeof actualCash !== 'number' || !Number.isFinite(actualCash) || actualCash < 0)) {
            return res.status(400).json({ code: 400, message: 'SHIFT_RECONCILIATION_REQUIRED' });
        }
        // 获取当前打开的班次
        const currentShift = await database_1.default.shiftSession.findFirst({
            where: { storeId, status: 'open' }
        });
        if (!currentShift) {
            return res.status(400).json({ code: 400, message: 'No open shift found' });
        }
        // 计算期望现金
        const today = (0, dateUtils_1.startOfTodayJakarta)();
        const shiftEvents = await database_1.default.cashEvent.findMany({
            where: {
                storeId,
                shift: currentShift.shift,
                createdAt: { gte: today }
            }
        });
        let expectedCash = currentShift.openFloat;
        shiftEvents.forEach(event => {
            if (event.type === 'cash_sale')
                expectedCash += event.amount;
            if (event.type === 'cash_in')
                expectedCash += event.amount;
            if (event.type === 'cash_out')
                expectedCash -= event.amount;
        });
        const difference = actualCash !== undefined ? actualCash - expectedCash : null;
        const differenceLimit = Number(shiftSettings.cashDifferenceLimit) || 0;
        if 