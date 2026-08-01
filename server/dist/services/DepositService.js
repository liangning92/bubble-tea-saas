"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDepositRules = getDepositRules;
exports.createDepositRule = createDepositRule;
exports.updateDepositRule = updateDepositRule;
exports.deleteDepositRule = deleteDepositRule;
exports.getStaffDeposit = getStaffDeposit;
exports.getAllStaffDeposits = getAllStaffDeposits;
exports.createStaffDeposit = createStaffDeposit;
exports.calculateMonthlyDeduction = calculateMonthlyDeduction;
exports.recordDepositDeduction = recordDepositDeduction;
exports.calculateRefundAmount = calculateRefundAmount;
exports.processRefund = processRefund;
const database_1 = require("../config/database");
// Get deposit rules for a store
async function getDepositRules(storeId) {
    return database_1.prisma.depositRule.findMany({
        where: { storeId, isActive: true },
        orderBy: { createdAt: 'desc' }
    });
}
// Create deposit rule
async function createDepositRule(data) {
    return database_1.prisma.depositRule.create({
        data
    });
}
// Update deposit rule
async function updateDepositRule(id, data) {
    return database_1.prisma.depositRule.update({
        where: { id },
        data
    });
}
// Delete deposit rule (soft delete)
async function deleteDepositRule(id) {
    return database_1.prisma.depositRule.update({
        where: { id },
        data: { isActive: false }
    });
}
// Get staff deposit record
async function getStaffDeposit(staffId) {
    return database_1.prisma.staffDeposit.findFirst({
        where: { staffId },
        include: {
            depositRule: true,
            deductionLogs: { orderBy: { createdAt: 'desc' } },
            refundLogs: { orderBy: { createdAt: 'desc' } }
        }
    });
}
// Get all staff deposits for a store
async function getAllStaffDeposits(storeId) {
    return database_1.prisma.staffDeposit.findMany({
        where: { storeId },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } },
            depositRule: true,
            deductionLogs: { orderBy: { createdAt: 'desc' } },
            refundLogs: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Create staff deposit record
async function createStaffDeposit(data) {
    return database_1.prisma.staffDeposit.create({
        data: {
            ...data,
            status: 'active'
        }
    });
}
// Calculate deposit deduction for a month
async function calculateMonthlyDeduction(staffDeposit) {
    const rule = staffDeposit.depositRule;
    if (staffDeposit.status !== 'active') {
        return { shouldDeduct: false, amount: 0 };
    }
    switch (rule.deductionType) {
        case 'one_time':
            // One-time deduction: all in first month
            if (staffDeposit.deductionCount === 0) {
                return { shouldDeduct: true, amount: rule.depositAmount };
            }
            return { shouldDeduct: false, amount: 0 };
        case 'monthly':
            // Monthly deduction until fully paid
            const remaining = rule.depositAmount - staffDeposit.deductedAmount;
            if (remaining <= 0) {
                return { shouldDeduct: false, amount: 0 };
            }
            const monthlyAmount = rule.monthlyAmount || 0;
            return {
                shouldDeduct: true,
                amount: Math.min(monthlyAmount, remaining)
            };
        case 'limited':
            // Limited deductions
            if (staffDeposit.deductionCount >= (rule.maxDeductions || 0)) {
                return { shouldDeduct: false, amount: 0 };
            }
            const limitedRemaining = rule.depositAmount - staffDeposit.deductedAmount;
            if (limitedRemaining <= 0) {
                return { shouldDeduct: false, amount: 0 };
            }
            return {
                shouldDeduct: true,
                amount: Math.min(rule.monthlyAmount || 0, limitedRemaining)
            };
        default:
            return { shouldDeduct: false, amount: 0 };
    }
}
// Record deposit deduction
async function recordDepositDeduction(data) {
    const staffDeposit = await database_1.prisma.staffDeposit.findUnique({
        where: { id: data.staffDepositId },
        include: { depositRule: true }
    });
    if (!staffDeposit)
        throw new Error('Staff deposit not found');
    const newDeductedAmount = staffDeposit.deductedAmount + data.amount;
    const newDeductionCount = staffDeposit.deductionCount + 1;
    const isCompleted = newDeductedAmount >= staffDeposit.depositRule.depositAmount;
    // Create deduction log
    const log = await database_1.prisma.staffDepositDeduction.create({
        data: {
            staffDepositId: data.staffDepositId,
            salaryId: data.salaryId,
            amount: data.amount,
            note: data.note
        }
    });
    // Update staff deposit
    await database_1.prisma.staffDeposit.update({
        where: { id: data.staffDepositId },
        data: {
            deductedAmount: newDeductedAmount,
            deductionCount: newDeductionCount,
            status: isCompleted ? 'completed' : 'active'
        }
    });
    return log;
}
// Calculate refund amount when staff leaves
async function calculateRefundAmount(staffDeposit, terminationDate) {
    const rule = staffDeposit.depositRule;
    const workMonths = getMonthsBetween(staffDeposit.startDate, terminationDate);
    switch (rule.refundType) {
        case 'full':
            // Full refund of remaining deposit
            return rule.depositAmount - staffDeposit.deductedAmount - staffDeposit.refundedAmount;
        case 'prorata': {
            // Pro-rata refund based on months worked
            const prorataPercent = rule.prorataPercent || 0;
            const totalPaid = staffDeposit.deductedAmount + staffDeposit.refundedAmount;
            const refundableAmount = Math.floor(totalPaid * prorataPercent);
            return Math.max(0, refundableAmount - staffDeposit.refundedAmount);
        }
        case 'forfeited':
            // No refund
            return 0;
        case 'none':
            return 0;
        default:
            return 0;
    }
}
// Process refund
async function processRefund(data) {
    const staffDeposit = await database_1.prisma.staffDeposit.findUnique({
        where: { id: data.staffDepositId }
    });
    if (!staffDeposit)
        throw new Error('Staff deposit not found');
    // Create refund log
    const log = await database_1.prisma.staffDepositRefund.create({
        data: {
            staffDepositId: data.staffDepositId,
            amount: data.amount,
            reason: data.reason,
            note: data.note,
            processedBy: data.processedBy
        }
    });
    // Update staff deposit
    const newRefundedAmount = staffDeposit.refundedAmount + data.amount;
    const totalProcessed = staffDeposit.deductedAmount + newRefundedAmount;
    // 只有当总处理金额（已扣 + 已退）>= 总押金时才完全退款
    const newStatus = totalProcessed >= staffDeposit.totalAmount ? 'refunded' : 'active';
    await database_1.prisma.staffDeposit.update({
        where: { id: data.staffDepositId },
        data: {
            refundedAmount: newRefundedAmount,
            status: newStatus,
            endDate: newStatus === 'refunded' ? new Date() : staffDeposit.endDate
        }
    });
    return log;
}
// Helper function to calculate months between dates
function getMonthsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return Math.max(0, months);
}
//# sourceMappingURL=DepositService.js.map