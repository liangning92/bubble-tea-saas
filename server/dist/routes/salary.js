"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.salaryRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
exports.salaryRouter = router;
// GET /api/salaries
router.get('/', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const storeId = req.user.storeId;
        const { month, staffId, status } = req.query;
        const where = {};
        if (month)
            where.month = month;
        if (status)
            where.status = status;
        if (staffId)
            where.staffId = staffId;
        // Get staff for this store first
        const staffList = await database_1.default.staff.findMany({
            where: { storeId },
            select: { id: true }
        });
        where.staffId = { in: staffList.map(s => s.id) };
        const salaries = await database_1.default.salary.findMany({
            where,
            include: { staff: { include: { user: true } } },
            orderBy: { month: 'desc' }
        });
        res.json({ code: 200, data: { list: salaries } });
    }
    catch (error) {
        console.error('Get salaries error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to get salaries' });
    }
});
// POST /api/salaries
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const { staffId, month, baseSalary, overtime, commission, bonus, deduction, status } = req.body;
        const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0);
        const salary = await database_1.default.salary.create({
            data: {
                staffId,
                month,
                baseSalary,
                overtime: overtime || 0,
                commission: commission || 0,
                bonus: bonus || 0,
                deduction: deduction || 0,
                finalAmount,
                status: status || 'pending'
            }
        });
        res.status(201).json({ code: 201, data: salary });
    }
    catch (error) {
        console.error('Create salary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to create salary' });
    }
});
// PUT /api/salaries/:id
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { baseSalary, overtime, commission, bonus, deduction, status } = req.body;
        const finalAmount = baseSalary + (overtime || 0) + (commission || 0) + (bonus || 0) - (deduction || 0);
        const salary = await database_1.default.salary.update({
            where: { id: req.params.id },
            data: {
                baseSalary,
                overtime: overtime || 0,
                commission: commission || 0,
                bonus: bonus || 0,
                deduction: deduction || 0,
                finalAmount,
                status: status || 'pending'
            }
        });
        res.json({ code: 200, data: salary });
    }
    catch (error) {
        console.error('Update salary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' });
    }
});
// PUT /api/salaries/:id/mark-paid
router.put('/:id/mark-paid', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        const salary = await database_1.default.salary.update({
            where: { id: req.params.id },
            data: { status: 'paid' }
        });
        res.json({ code: 200, data: salary });
    }
    catch (error) {
        console.error('Mark paid error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to update salary' });
    }
});
// DELETE /api/salaries/:id
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), async (req, res) => {
    try {
        await database_1.default.salary.delete({ where: { id: req.params.id } });
        res.json({ code: 200, message: 'Salary deleted' });
    }
    catch (error) {
        console.error('Delete salary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to delete salary' });
    }
});
// GET /api/salaries/calculate/:staffId
router.get('/calculate/:staffId', auth_1.authenticate, (0, auth_1.authorize)('admin', 'manager'), async (req, res) => {
    try {
        const { staffId } = req.params;
        const { month } = req.query; // format: YYYY-MM
        if (!month || !staffId) {
            res.status(400).json({ code: 400, message: 'staffId and month are required' });
            return;
        }
        // Get staff info
        const staff = await database_1.default.staff.findUnique({
            where: { id: staffId },
            select: { name: true }
        });
        if (!staff) {
            res.status(404).json({ code: 404, message: 'Staff not found' });
            return;
        }
        // Get attendance for the month
        const startDate = new Date(`${month}-01`);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
        const attendanceRecords = await database_1.default.attendance.findMany({
            where: {
                staffId,
                checkInTime: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
        // Calculate work days
        const totalDays = endDate.getDate();
        const workDays = attendanceRecords.filter(a => a.status === 'present' || a.status === 'late').length;
        const lateDays = attendanceRecords.filter(a => a.status === 'late').length;
        const absentDays = attendanceRecords.filter(a => a.status === 'absent').length;
        // Get approved overtime hours
        const overtimeRequests = await database_1.default.overtimeRequest.findMany({
            where: {
                staffId,
                status: 'approved',
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
        const totalOvertimeHours = overtimeRequests.reduce((sum, req) => sum + (req.hours || 0), 0);
        // Get approved leave (paid leave) - leaveType 'annual' is paid
        const leaveRecords = await database_1.default.leave.findMany({
            where: {
                staffId,
                status: 'approved',
                startDate: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
        const paidLeaveDays = leaveRecords.filter(l => l.leaveType === 'annual').reduce((sum, l) => {
            const start = new Date(l.startDate);
            const end = new Date(l.endDate);
            return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }, 0);
        // Calculate salary - using default 0 for baseSalary as it's not in schema
        const baseSalary = 0;
        const dailyRate = baseSalary / totalDays;
        const attendanceDeduction = absentDays * dailyRate;
        const lateDeduction = lateDays * dailyRate * 0.1; // 10% fine for late
        const overtimePay = totalOvertimeHours * (dailyRate / 8) * 1.5; // 1.5x overtime rate
        const deduction = attendanceDeduction + lateDeduction;
        const finalAmount = baseSalary + overtimePay - deduction;
        res.json({
            code: 200,
            data: {
                staffName: staff.name,
                month,
                baseSalary,
                workDays,
                paidLeaveDays,
                lateDays,
                absentDays,
                totalOvertimeHours,
                overtimePay,
                deduction: Math.round(deduction),
                finalAmount: Math.round(finalAmount)
            }
        });
    }
    catch (error) {
        console.error('Calculate salary error:', error);
        res.status(500).json({ code: 500, message: error.message || 'Failed to calculate salary' });
    }
});
//# sourceMappingURL=salary.js.map