"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLeave = applyLeave;
exports.approveLeave = approveLeave;
exports.rejectLeave = rejectLeave;
exports.cancelLeave = cancelLeave;
exports.getLeaveBalance = getLeaveBalance;
exports.initializeLeaveBalanceForStaff = initializeLeaveBalanceForStaff;
exports.setLeaveBalance = setLeaveBalance;
exports.getStaffLeaves = getStaffLeaves;
exports.getStoreLeaves = getStoreLeaves;
exports.getLeaveById = getLeaveById;
exports.getApprovedLeavesInRange = getApprovedLeavesInRange;
exports.hasApprovedLeaveOnDate = hasApprovedLeaveOnDate;
exports.getLeaveInfoForDate = getLeaveInfoForDate;
const database_1 = __importDefault(require("../config/database"));
// Apply for leave
async function applyLeave(data, autoInitBalance = true) {
    const { staffId, leaveType, totalDays, startDate, endDate } = data;
    // Get current year
    const year = new Date().getFullYear();
    // Check leave balance for paid leave types
    if (leaveType === 'annual' || leaveType === 'sick') {
        let balance = await getLeaveBalance(staffId, year);
        // If no balance and auto-init is enabled, create one automatically
        if (!balance && autoInitBalance) {
            const staff = await database_1.default.staff.findUnique({ where: { id: staffId } });
            if (staff?.hireDate) {
                balance = await initializeLeaveBalanceForStaff(staffId, new Date(staff.hireDate));
            }
        }
        if (!balance) {
            throw new Error('Leave balance not initialized. Please contact HR.');
        }
        if (leaveType === 'annual') {
            const available = balance.annualLeave + balance.broughtForward - balance.usedLeave;
            if (totalDays > available) {
                throw new Error(`Insufficient annual leave. Available: ${available} days`);
            }
        }
        else if (leaveType === 'sick') {
            const available = balance.sickLeave - balance.usedSick;
            if (totalDays > available) {
                throw new Error(`Insufficient sick leave. Available: ${available} days`);
            }
        }
    }
    // Create leave application
    return database_1.default.leave.create({
        data: {
            staffId,
            storeId: data.storeId,
            leaveType,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalDays,
            reason: data.reason,
            halfDay: data.halfDay || false,
            contactPhone: data.contactPhone,
            attachmentUrl: data.attachmentUrl,
            status: 'pending'
        },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } }
        }
    });
}
// Approve leave
async function approveLeave(leaveId, approverId) {
    const leave = await database_1.default.leave.findUnique({ where: { id: leaveId } });
    if (!leave)
        throw new Error('Leave not found');
    if (leave.status !== 'pending')
        throw new Error('Leave is not pending');
    const year = leave.startDate.getFullYear();
    // Use transaction to ensure atomicity: update status and deduct balance together
    return database_1.default.$transaction(async (tx) => {
        // Update leave status
        const updated = await tx.leave.update({
            where: { id: leaveId },
            data: {
                status: 'approved',
                approvedBy: approverId,
                approvedAt: new Date()
            }
        });
        // Deduct leave balance within transaction
        const balance = await tx.leaveBalance.findUnique({
            where: { staffId_year: { staffId: leave.staffId, year } }
        });
        if (balance) {
            const updateData = {};
            if (leave.leaveType === 'annual') {
                updateData.usedLeave = balance.usedLeave + leave.totalDays;
            }
            else if (leave.leaveType === 'sick') {
                updateData.usedSick = balance.usedSick + leave.totalDays;
            }
            if (Object.keys(updateData).length > 0) {
                await tx.leaveBalance.update({
                    where: { id: balance.id },
                    data: updateData
                });
            }
        }
        return updated;
    });
}
// Reject leave
async function rejectLeave(leaveId, approverId, reason) {
    const leave = await database_1.default.leave.findUnique({ where: { id: leaveId } });
    if (!leave)
        throw new Error('Leave not found');
    if (leave.status !== 'pending')
        throw new Error('Leave is not pending');
    return database_1.default.leave.update({
        where: { id: leaveId },
        data: {
            status: 'rejected',
            approvedBy: approverId,
            approvedAt: new Date(),
            rejectionReason: reason
        }
    });
}
// Cancel leave (by staff)
async function cancelLeave(leaveId, staffId) {
    const leave = await database_1.default.leave.findUnique({ where: { id: leaveId } });
    if (!leave)
        throw new Error('Leave not found');
    if (leave.staffId !== staffId)
        throw new Error('Not authorized');
    if (leave.status !== 'pending')
        throw new Error('Only pending leaves can be cancelled');
    return database_1.default.leave.update({
        where: { id: leaveId },
        data: { status: 'cancelled' }
    });
}
// Get leave balance
async function getLeaveBalance(staffId, year) {
    let balance = await database_1.default.leaveBalance.findUnique({
        where: { staffId_year: { staffId, year } }
    });
    // If no balance record exists, create one with defaults
    if (!balance) {
        balance = await database_1.default.leaveBalance.create({
            data: {
                staffId,
                year,
                annualLeave: 0,
                sickLeave: 0,
                unpaidLeave: 0,
                usedLeave: 0,
                usedSick: 0,
                broughtForward: 0
            }
        });
    }
    return balance;
}
// Auto-initialize leave balance for new staff based on hire date
async function initializeLeaveBalanceForStaff(staffId, hireDate) {
    const currentYear = new Date().getFullYear();
    const yearsEmployed = currentYear - hireDate.getFullYear();
    // Calculate annual leave based on employment years (Indonesian standard):
    // 0-1 years: 12 days
    // 1-5 years: 12 days
    // >5 years: can be more (simplified to 15 days)
    let annualLeave = 12;
    if (yearsEmployed >= 5) {
        annualLeave = 15;
    }
    // Sick leave is usually 14 days per year (Indonesian standard)
    const sickLeave = 14;
    // Create or update balance for current year
    let balance = await database_1.default.leaveBalance.findUnique({
        where: { staffId_year: { staffId, year: currentYear } }
    });
    if (balance) {
        // If balance exists but annual/sick were 0, update them
        if (balance.annualLeave === 0) {
            return database_1.default.leaveBalance.update({
                where: { id: balance.id },
                data: { annualLeave, sickLeave }
            });
        }
        return balance;
    }
    return database_1.default.leaveBalance.create({
        data: {
            staffId,
            year: currentYear,
            annualLeave,
            sickLeave,
            unpaidLeave: 0,
            broughtForward: 0,
            usedLeave: 0,
            usedSick: 0
        }
    });
}
// Set/update leave balance (admin)
async function setLeaveBalance(staffId, data) {
    const { year, ...balanceData } = data;
    let balance = await database_1.default.leaveBalance.findUnique({
        where: { staffId_year: { staffId, year } }
    });
    if (balance) {
        return database_1.default.leaveBalance.update({
            where: { id: balance.id },
            data: balanceData
        });
    }
    else {
        return database_1.default.leaveBalance.create({
            data: {
                staffId,
                year,
                annualLeave: balanceData.annualLeave || 0,
                sickLeave: balanceData.sickLeave || 0,
                unpaidLeave: balanceData.unpaidLeave || 0,
                broughtForward: balanceData.broughtForward || 0,
                usedLeave: 0,
                usedSick: 0
            }
        });
    }
}
// Deduct leave balance (called within transaction)
async function deductLeaveBalance(staffId, year, leaveType, days) {
    const balance = await database_1.default.leaveBalance.findUnique({
        where: { staffId_year: { staffId, year } }
    });
    if (!balance)
        return;
    // Check sufficient balance before deducting
    if (leaveType === 'annual') {
        const available = balance.annualLeave + balance.broughtForward - balance.usedLeave;
        if (available < days) {
            throw new Error(`Insufficient annual leave balance: requested ${days}, available ${available}`);
        }
        await database_1.default.leaveBalance.update({
            where: { id: balance.id },
            data: { usedLeave: balance.usedLeave + days }
        });
    }
    else if (leaveType === 'sick') {
        const available = balance.sickLeave - balance.usedSick;
        if (available < days) {
            throw new Error(`Insufficient sick leave balance: requested ${days}, available ${available}`);
        }
        await database_1.default.leaveBalance.update({
            where: { id: balance.id },
            data: { usedSick: balance.usedSick + days }
        });
    }
}
// Get staff leaves
async function getStaffLeaves(staffId, options) {
    const where = { staffId };
    if (options?.status)
        where.status = options.status;
    if (options?.startDate || options?.endDate) {
        where.startDate = {};
        if (options.startDate)
            where.startDate.gte = options.startDate;
        if (options.endDate)
            where.endDate.lte = options.endDate;
    }
    return database_1.default.leave.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    });
}
// Get store leaves
async function getStoreLeaves(storeId, options) {
    const where = { storeId };
    if (options?.status)
        where.status = options.status;
    if (options?.staffId)
        where.staffId = options.staffId;
    if (options?.startDate || options?.endDate) {
        where.startDate = {};
        if (options.startDate)
            where.startDate.gte = options.startDate;
        if (options.endDate)
            where.endDate.lte = options.endDate;
    }
    return database_1.default.leave.findMany({
        where,
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Get leave by ID
async function getLeaveById(leaveId) {
    return database_1.default.leave.findUnique({
        where: { id: leaveId },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true, storeId: true } }
        }
    });
}
// Get approved leaves for a date range (for schedule linkage)
async function getApprovedLeavesInRange(storeId, startDate, endDate) {
    return database_1.default.leave.findMany({
        where: {
            storeId,
            status: 'approved',
            OR: [
                {
                    // Leave starts within range
                    startDate: { gte: startDate, lte: endDate }
                },
                {
                    // Leave ends within range
                    endDate: { gte: startDate, lte: endDate }
                },
                {
                    // Leave spans entire range
                    AND: [
                        { startDate: { lte: startDate } },
                        { endDate: { gte: endDate } }
                    ]
                }
            ]
        },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } }
        },
        orderBy: { startDate: 'asc' }
    });
}
// Check if staff has approved leave on a specific date
async function hasApprovedLeaveOnDate(staffId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const leave = await database_1.default.leave.findFirst({
        where: {
            staffId,
            status: 'approved',
            startDate: { lte: endOfDay },
            endDate: { gte: startOfDay }
        }
    });
    return !!leave;
}
// Get leave info for a specific date (for display on schedule)
async function getLeaveInfoForDate(staffId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return database_1.default.leave.findFirst({
        where: {
            staffId,
            status: 'approved',
            startDate: { lte: endOfDay },
            endDate: { gte: startOfDay }
        },
        include: {
            staff: { select: { id: true, name: true } }
        }
    });
}
//# sourceMappingURL=LeaveService.js.map