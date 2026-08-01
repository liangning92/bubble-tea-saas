"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffManagementRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const StaffManagementService = __importStar(require("../services/StaffManagementService"));
const dateUtils_1 = require("../utils/dateUtils");
const router = (0, express_1.Router)();
exports.staffManagementRouter = router;
// ==================== PERFORMANCE ====================
// GET /api/staff-management/performance
router.get('/performance', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { startDate, endDate } = req.query;
        const result = await StaffManagementService.getStaffPerformance(storeId, startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate ? new Date(endDate) : new Date());
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff performance error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get staff performance' });
    }
});
// GET /api/staff-management/attendance-analytics
router.get('/attendance-analytics', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const result = await StaffManagementService.getAttendanceAnalytics(storeId, month, year);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get attendance analytics error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get attendance analytics' });
    }
});
// ==================== SCHEDULE ====================
// GET /api/staff-management/schedule-coverage
router.get('/schedule-coverage', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const weekStart = req.query.weekStart
            ? new Date(req.query.weekStart)
            : new Date();
        const result = await StaffManagementService.getScheduleCoverage(storeId, weekStart);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get schedule coverage error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get schedule coverage' });
    }
});
// ==================== PAYROLL ====================
// GET /api/staff-management/payroll
router.get('/payroll', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const result = await StaffManagementService.generatePayroll(storeId, month, year);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Generate payroll error:', error);
        res.status(500).json({ code: 500, message: 'Failed to generate payroll' });
    }
});
// ==================== KPI ====================
// GET /api/staff-management/kpi
router.get('/kpi', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const result = await StaffManagementService.getStaffKPIs(storeId, month, year);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get staff KPIs error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get staff KPIs' });
    }
});
// ==================== TURNOVER ====================
// GET /api/staff-management/turnover
router.get('/turnover', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const months = parseInt(req.query.months) || 12;
        const result = await StaffManagementService.getTurnoverRate(storeId, months);
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get turnover rate error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get turnover rate' });
    }
});
// GET /api/staff-management/sales-stats - Get sales performance by staff
router.get('/sales-stats', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { month, year } = req.query;
        const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const startDate = (0, dateUtils_1.startOfMonth)(new Date(targetYear, targetMonth - 1));
        const endDate = (0, dateUtils_1.endOfMonth)(new Date(targetYear, targetMonth - 1));
        // Get all orders for the month
        const orders = await prisma.order.findMany({
            where: {
                storeId,
                createdAt: { gte: startDate, lte: endDate },
                status: { not: 'refunded' }
            }
        });
        // Aggregate by staff
        const staffStats = {};
        for (const order of orders) {
            if (!staffStats[order.staffId]) {
                const staff = await prisma.staff.findUnique({ where: { id: order.staffId } });
                staffStats[order.staffId] = {
                    staffId: order.staffId,
                    name: staff?.name || 'Unknown',
                    orderCount: 0,
                    revenue: 0
                };
            }
            staffStats[order.staffId].orderCount++;
            staffStats[order.staffId].revenue += order.finalAmount;
        }
        const result = Object.values(staffStats).sort((a, b) => b.revenue - a.revenue);
        res.json({
            code: 200,
            data: result,
            month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get sales stats error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get sales stats' });
    }
});
// ==================== TRAINING ====================
// POST /api/staff-management/training
router.post('/training', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { staffId, trainingType, title, date, duration, provider, certificate, notes, attachments, status } = req.body;
        const result = await StaffManagementService.addTrainingRecord({
            staffId,
            storeId: req.user.storeId,
            trainingType,
            title,
            date: new Date(date),
            duration,
            provider,
            certificate,
            notes,
            attachments,
            status
        });
        res.status(201).json({
            code: 201,
            message: 'Training record added',
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Add training record error:', error);
        res.status(500).json({ code: 500, message: 'Failed to add training record' });
    }
});
// PUT /api/staff-management/training/:id
router.put('/training/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { staffId, trainingType, title, date, duration, provider, certificate, notes, attachments, status } = req.body;
        const result = await StaffManagementService.updateTrainingRecord(id, {
            staffId,
            trainingType,
            title,
            date: date ? new Date(date) : undefined,
            duration,
            provider,
            certificate,
            notes,
            attachments,
            status
        });
        res.json({
            code: 200,
            message: 'Training record updated',
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Update training record error:', error);
        res.status(500).json({ code: 500, message: 'Failed to update training record' });
    }
});
// GET /api/staff-management/training/:staffId
router.get('/training/:staffId', auth_1.authenticate, async (req, res) => {
    try {
        const { staffId } = req.params;
        const result = await StaffManagementService.getTrainingRecords(staffId);
        res.json({
            code: 200,
            data: { list: result },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get training records error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get training records' });
    }
});
// GET /api/staff-management/training/all?storeId=xxx - 批量获取所有员工的培训记录
router.get('/training/all', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        // 获取所有员工
        const staffList = await prisma.staff.findMany({
            where: { storeId },
            select: { id: true, name: true }
        });
        const staffMap = Object.fromEntries(staffList.map(s => [s.id, s.name]));
        // 批量获取培训记录
        const trainings = await prisma.training.findMany({
            where: {
                staffId: { in: staffList.map(s => s.id) }
            },
            orderBy: { startDate: 'desc' }
        });
        // 附员工名称
        const result = trainings.map(t => ({
            ...t,
            staffName: staffMap[t.staffId] || 'Unknown'
        }));
        res.json({
            code: 200,
            data: result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get all training records error:', error);
        res.status(500).json({ code: 500, message: 'Failed to get all training records' });
    }
});
// DELETE /api/staff-management/training/:id
router.delete('/training/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.training.delete({
            where: { id }
        });
        res.json({
            code: 200,
            message: 'Training record deleted',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Delete training error:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete training record' });
    }
});
//# sourceMappingURL=staffManagement.js.map