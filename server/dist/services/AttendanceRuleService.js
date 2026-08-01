"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceRules = getAttendanceRules;
exports.getDefaultAttendanceRule = getDefaultAttendanceRule;
exports.createAttendanceRule = createAttendanceRule;
exports.updateAttendanceRule = updateAttendanceRule;
exports.deleteAttendanceRule = deleteAttendanceRule;
exports.calculateLateDeduction = calculateLateDeduction;
exports.calculateAbsenceDeduction = calculateAbsenceDeduction;
exports.calculateSickLeaveDeduction = calculateSickLeaveDeduction;
exports.calculateOvertimePay = calculateOvertimePay;
const database_1 = require("../config/database");
// Get attendance rules for a store
async function getAttendanceRules(storeId) {
    return database_1.prisma.attendanceRule.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' }
    });
}
// Get default attendance rule for a store
async function getDefaultAttendanceRule(storeId) {
    return database_1.prisma.attendanceRule.findFirst({
        where: { storeId, isDefault: true, isActive: true }
    });
}
// Create attendance rule
async function createAttendanceRule(data) {
    // If setting as default, unset other defaults
    if (data.isDefault) {
        await database_1.prisma.attendanceRule.updateMany({
            where: { storeId: data.storeId },
            data: { isDefault: false }
        });
    }
    return database_1.prisma.attendanceRule.create({
        data: data
    });
}
// Update attendance rule
async function updateAttendanceRule(id, data) {
    // If setting as default, unset other defaults
    if (data.isDefault) {
        const rule = await database_1.prisma.attendanceRule.findUnique({ where: { id } });
        if (rule) {
            await database_1.prisma.attendanceRule.updateMany({
                where: { storeId: rule.storeId, id: { not: id } },
                data: { isDefault: false }
            });
        }
    }
    return database_1.prisma.attendanceRule.update({
        where: { id },
        data
    });
}
// Delete attendance rule (soft delete)
async function deleteAttendanceRule(id) {
    return database_1.prisma.attendanceRule.update({
        where: { id },
        data: { isActive: false }
    });
}
// Calculate late deduction based on attendance rule
async function calculateLateDeduction(rule, checkInTime, workStartTime) {
    const [hours, minutes] = workStartTime.split(':').map(Number);
    const workStart = new Date(checkInTime);
    workStart.setHours(hours, minutes, 0, 0);
    const graceEnd = new Date(workStart.getTime() + (rule.gracePeriod || 15) * 60 * 1000);
    if (checkInTime <= graceEnd) {
        return { shouldDeduct: false, amount: 0, type: 'none' };
    }
    if (rule.lateDeductionType === 'fixed') {
        return { shouldDeduct: true, amount: rule.lateDeductionFixed || 0, type: 'fixed' };
    }
    if (rule.lateDeductionType === 'daily_rate') {
        // Daily rate = baseSalary / workingDaysInMonth
        return { shouldDeduct: true, amount: 0, type: 'daily_rate' }; // Amount needs baseSalary
    }
    return { shouldDeduct: false, amount: 0, type: 'none' };
}
// Calculate absence deduction
async function calculateAbsenceDeduction(rule, dailyRate) {
    if (rule.absenceDeductionType === 'fixed') {
        return { shouldDeduct: true, amount: rule.absenceDeductionFixed || 0, type: 'fixed' };
    }
    if (rule.absenceDeductionType === 'daily_rate') {
        return { shouldDeduct: true, amount: dailyRate, type: 'daily_rate' };
    }
    return { shouldDeduct: false, amount: 0, type: 'none' };
}
// Calculate sick leave deduction
async function calculateSickLeaveDeduction(rule, dailyRate) {
    if (rule.sickLeaveDeductionType === 'none') {
        return { shouldDeduct: false, amount: 0, type: 'none' };
    }
    if (rule.sickLeaveDeductionType === 'fixed') {
        return { shouldDeduct: true, amount: rule.sickLeaveDeductionFixed || 0, type: 'fixed' };
    }
    if (rule.sickLeaveDeductionType === 'daily_rate') {
        return { shouldDeduct: true, amount: dailyRate, type: 'daily_rate' };
    }
    return { shouldDeduct: false, amount: 0, type: 'none' };
}
// Calculate overtime pay
async function calculateOvertimePay(rule, overtimeHours, hourlyRate) {
    if (overtimeHours < (rule.overtimeMinHours || 1)) {
        return 0;
    }
    const rate = rule.overtimeRate || 1.5;
    return Math.floor(overtimeHours * hourlyRate * rate);
}
//# sourceMappingURL=AttendanceRuleService.js.map