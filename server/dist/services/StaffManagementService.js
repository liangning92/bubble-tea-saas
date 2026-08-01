"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffPerformance = getStaffPerformance;
exports.getAttendanceAnalytics = getAttendanceAnalytics;
exports.getScheduleCoverage = getScheduleCoverage;
exports.generatePayroll = generatePayroll;
exports.addTrainingRecord = addTrainingRecord;
exports.getTrainingRecords = getTrainingRecords;
exports.updateTrainingRecord = updateTrainingRecord;
exports.getStaffKPIs = getStaffKPIs;
exports.getTurnoverRate = getTurnoverRate;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const StaffConfigService_1 = require("./StaffConfigService");
// ==================== STAFF PERFORMANCE ====================
async function getStaffPerformance(storeId, startDate, endDate) {
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            createdAt: { gte: startDate, lte: endDate },
            status: { not: 'refunded' }
        }
    });
    const staffStats = {};
    for (const order of orders) {
        if (!staffStats[order.staffId]) {
            const staff = await database_1.default.staff.findUnique({ where: { id: order.staffId } });
            staffStats[order.staffId] = {
                name: staff?.name || 'Unknown',
                orders: 0,
                revenue: 0
            };
        }
        staffStats[order.staffId].orders++;
        staffStats[order.staffId].revenue += order.finalAmount;
    }
    return Object.entries(staffStats)
        .map(([staffId, data]) => ({
        staffId,
        ...data
    }))
        .sort((a, b) => b.revenue - a.revenue);
}
// ==================== ATTENDANCE ANALYTICS ====================
async function getAttendanceAnalytics(storeId, month, year) {
    const startDate = (0, dateUtils_1.startOfMonth)(new Date(year, month - 1));
    const endDate = (0, dateUtils_1.endOfMonth)(new Date(year, month - 1));
    // 获取当前门店的员工 ID列表
    const staffList = await database_1.default.staff.findMany({
        where: { storeId }
    });
    const staffIds = staffList.map(s => s.id);
    const attendances = await database_1.default.attendance.findMany({
        where: {
            staffId: { in: staffIds },
            checkInTime: { gte: startDate, lte: endDate }
        },
        include: { staff: true }
    });
    // Calculate per staff
    const staffStats = staffList.map(staff => {
        const staffAttendances = attendances.filter(a => a.staffId === staff.id);
        const workDays = staffAttendances.filter(a => a.checkInTime).length;
        const lateDays = staffAttendances.filter(a => {
            if (!a.checkInTime)
                return false;
            const hour = new Date(a.checkInTime).getHours();
            return hour >= 9;
        }).length;
        // Calculate work hours
        let totalWorkHours = 0;
        for (const att of staffAttendances) {
            if (att.checkInTime && att.checkOutTime) {
                const hours = (new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime()) / (1000 * 60 * 60);
                totalWorkHours += hours;
            }
        }
        return {
            staffId: staff.id,
            name: staff.name,
            position: staff.position,
            workDays,
            lateDays,
            onTimeRate: workDays > 0 ? Math.round((workDays - lateDays) / workDays * 100) : 0,
            totalWorkHours: Math.round(totalWorkHours * 10) / 10,
            avgHoursPerDay: workDays > 0 ? Math.round(totalWorkHours / workDays * 10) / 10 : 0
        };
    });
    return staffStats.sort((a, b) => b.workDays - a.workDays);
}
// ==================== SCHEDULE MANAGEMENT ====================
async function getScheduleCoverage(storeId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    // 获取当前门店的员工 ID列表
    const staffList = await database_1.default.staff.findMany({
        where: { storeId, status: 'active' }
    });
    const staffIds = staffList.map(s => s.id);
    const schedules = await database_1.default.schedule.findMany({
        where: {
            staffId: { in: staffIds },
            date: { gte: weekStart, lte: weekEnd }
        },
        include: { staff: true }
    });
    // Check coverage
    const coverage = staffList.map(staff => {
        const schedule = schedules.find(s => s.staffId === staff.id);
        return {
            staffId: staff.id,
            name: staff.name,
            position: staff.position,
            hasSchedule: !!schedule,
            schedule: schedule || null
        };
    });
    const coveredCount = coverage.filter(c => c.hasSchedule).length;
    const totalCount = coverage.length;
    return {
        weekStart: weekStart.toISOString().slice(0, 10),
        coverage: {
            covered: coveredCount,
            total: totalCount,
            rate: totalCount > 0 ? Math.round(coveredCount / totalCount * 100) : 0
        },
        staff: coverage
    };
}
// ==================== PAYROLL ====================
async function generatePayroll(storeId, month, year) {
    const startDate = (0, dateUtils_1.startOfMonth)(new Date(year, month - 1));
    const endDate = (0, dateUtils_1.endOfMonth)(new Date(year, month - 1));
    const staffList = await database_1.default.staff.findMany({
        where: { storeId, status: 'active' }
    });
    // Check if attendance bonus is enabled
    const config = await (0, StaffConfigService_1.getStaffConfig)(storeId);
    const attendanceBonusEnabled = config.attendanceBonus;
    // Get attendance rule for work days calculation
    const attendanceRule = await database_1.default.attendanceRule.findFirst({
        where: { storeId, isActive: true }
    });
    const workDaysPerMonth = 26; // Default working days per month
    const salaries = [];
    for (const staff of staffList) {
        // Get attendance
        const attendances = await database_1.default.attendance.findMany({
            where: {
                staffId: staff.id,
                checkInTime: { gte: startDate, lte: endDate }
            }
        });
        const workDays = attendances.filter(a => a.checkInTime).length;
        // Calculate late days based on rule or default
        const lateDays = attendances.filter(a => {
            if (!a.checkInTime)
                return false;
            if (attendanceRule) {
                const [startHour, startMin] = attendanceRule.workStartTime.split(':').map(Number);
                const gracePeriod = attendanceRule.gracePeriod || 0;
                const checkInTime = new Date(a.checkInTime);
                const lateThreshold = startHour * 60 + startMin + gracePeriod;
                const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
                return checkInMinutes > lateThreshold;
            }
            return new Date(a.checkInTime).getHours() >= 9;
        }).length;
        // Calculate work hours
        let totalHours = 0;
        for (const att of attendances) {
            if (att.checkInTime && att.checkOutTime) {
                totalHours += (new Date(att.checkOutTime).getTime() - new Date(att.checkInTime).getTime()) / (1000 * 60 * 60);
            }
        }
        const regularHours = workDays * 8;
        const overtimeHours = Math.max(0, totalHours - regularHours);
        // Position-based salary
        const positionSalaries = {
            '店长': 5000000,
            '副店长': 4000000,
            '店员': 3500000
        };
        const baseSalary = positionSalaries[staff.position] || 3500000;
        const overtimePay = Math.round(overtimeHours * (baseSalary / 176) * 1.5);
        // Deductions
        let lateDeduction = 0;
        if (attendanceRule && attendanceRule.lateDeductionType === 'fixed' && attendanceRule.lateDeductionFixed) {
            lateDeduction = lateDays * attendanceRule.lateDeductionFixed;
        }
        else {
            lateDeduction = lateDays * 50000; // Default Rp 50,000 per late
        }
        // Attendance bonus: awarded if no late days and worked required days
        let attendanceBonus = 0;
        if (attendanceBonusEnabled && lateDays === 0 && workDays >= workDaysPerMonth - 2) {
            attendanceBonus = 200000; // Rp 200,000 perfect attendance bonus
        }
        const finalSalary = baseSalary + overtimePay + attendanceBonus - lateDeduction;
        salaries.push({
            staffId: staff.id,
            name: staff.name,
            position: staff.position,
            period: `${year}-${month.toString().padStart(2, '0')}`,
            baseSalary,
            workDays,
            lateDays,
            lateDeduction,
            overtimeHours: Math.round(overtimeHours * 10) / 10,
            overtimePay,
            finalSalary
        });
    }
    return salaries;
}
// ==================== TRAINING MANAGEMENT ====================
// Training record - using Prisma Training model with attachments support
async function addTrainingRecord(data) {
    return database_1.default.training.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            trainingType: data.trainingType,
            title: data.title,
            provider: data.provider,
            startDate: data.date,
            duration: data.duration,
            certificate: data.certificate || null,
            notes: data.notes || null,
            attachments: data.attachments || null,
            status: data.status || 'scheduled'
        }
    });
}
async function getTrainingRecords(staffId) {
    const records = await database_1.default.training.findMany({
        where: { staffId },
        orderBy: { startDate: 'desc' }
    });
    return records;
}
async function updateTrainingRecord(id, data) {
    return database_1.default.training.update({
        where: { id },
        data: {
            ...(data.staffId && { staffId: data.staffId }),
            ...(data.trainingType && { trainingType: data.trainingType }),
            ...(data.title && { title: data.title }),
            ...(data.date && { startDate: data.date }),
            ...(data.duration !== undefined && { duration: data.duration }),
            ...(data.provider && { provider: data.provider }),
            ...(data.certificate !== undefined && { certificate: data.certificate || null }),
            ...(data.notes !== undefined && { notes: data.notes || null }),
            ...(data.attachments !== undefined && { attachments: data.attachments }),
            ...(data.status && { status: data.status })
        }
    });
}
// ==================== KPI TRACKING ====================
async function getStaffKPIs(storeId, month, year) {
    const startDate = (0, dateUtils_1.startOfMonth)(new Date(year, month - 1));
    const endDate = (0, dateUtils_1.endOfMonth)(new Date(year, month - 1));
    // 获取当前门店的员工 ID列表
    const staffList = await database_1.default.staff.findMany({
        where: { storeId, status: 'active' }
    });
    const staffIds = staffList.map(s => s.id);
    const [orders, attendances] = await Promise.all([
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: { gte: startDate, lte: endDate },
                status: { not: 'refunded' }
            }
        }),
        database_1.default.attendance.findMany({
            where: {
                staffId: { in: staffIds },
                checkInTime: { gte: startDate, lte: endDate }
            }
        })
    ]);
    return staffList.map(staff => {
        const staffOrders = orders.filter(o => o.staffId === staff.id);
        const staffAttendance = attendances.filter(a => a.staffId === staff.id);
        const workDays = staffAttendance.filter(a => a.checkInTime).length;
        const lateDays = staffAttendance.filter(a => {
            if (!a.checkInTime)
                return false;
            return new Date(a.checkInTime).getHours() >= 9;
        }).length;
        const totalRevenue = staffOrders.reduce((sum, o) => sum + o.finalAmount, 0);
        const avgOrderValue = staffOrders.length > 0
            ? Math.round(totalRevenue / staffOrders.length)
            : 0;
        return {
            staffId: staff.id,
            name: staff.name,
            position: staff.position,
            sales: {
                orderCount: staffOrders.length,
                revenue: totalRevenue,
                avgOrderValue
            },
            attendance: {
                workDays,
                lateDays,
                punctuality: workDays > 0 ? Math.round((workDays - lateDays) / workDays * 100) : 0
            }
        };
    });
}
// ==================== TURNOVER ANALYSIS ====================
async function getTurnoverRate(storeId, months = 12) {
    const startDate = (0, dateUtils_1.subDays)(new Date(), 30 * months);
    const [allStaff, leftStaff] = await Promise.all([
        database_1.default.staff.count({
            where: { storeId }
        }),
        database_1.default.staff.count({
            where: {
                storeId,
                status: 'resigned',
                updatedAt: { gte: startDate }
            }
        })
    ]);
    // Monthly average
    const avgStaff = allStaff;
    const monthlyTurnover = allStaff > 0 ? (leftStaff / months) : 0;
    const turnoverRate = avgStaff > 0 ? Math.round(monthlyTurnover / avgStaff * 100) : 0;
    return {
        period: `${months} months`,
        totalStaff: allStaff,
        leftStaff,
        monthlyAverage: Math.round(monthlyTurnover * 10) / 10,
        turnoverRate
    };
}
//# sourceMappingURL=StaffManagementService.js.map