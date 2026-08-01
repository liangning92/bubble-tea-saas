"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateStaffPoint = getOrCreateStaffPoint;
exports.getStaffPointBalance = getStaffPointBalance;
exports.getStaffPointBalancesByStore = getStaffPointBalancesByStore;
exports.getStaffPointHistory = getStaffPointHistory;
exports.awardPoints = awardPoints;
exports.redeemPoints = redeemPoints;
exports.adjustPoints = adjustPoints;
exports.processExpiredPoints = processExpiredPoints;
exports.getRewards = getRewards;
exports.createReward = createReward;
exports.updateReward = updateReward;
exports.deleteReward = deleteReward;
exports.createRedemption = createRedemption;
exports.getPendingRedemptions = getPendingRedemptions;
exports.fulfillRedemption = fulfillRedemption;
exports.cancelRedemption = cancelRedemption;
exports.awardPerfectAttendancePoints = awardPerfectAttendancePoints;
exports.awardTrainingPoints = awardTrainingPoints;
exports.awardOvertimePoints = awardOvertimePoints;
const database_1 = require("../config/database");
// Default points values (fallback)
const DEFAULT_POINTS = {
    perfectAttendance: 50,
    goodPerformance: 100,
    completedTraining: 30,
    holidayWork: 20,
    overtimePerHour: 5
};
// Get points rule from database or return defaults
async function getPointsRule(storeId) {
    const rule = await database_1.prisma.staffPointRule.findUnique({
        where: { storeId }
    });
    if (!rule || !rule.isActive) {
        return DEFAULT_POINTS;
    }
    return {
        perfectAttendance: rule.perfectAttendancePoints,
        goodPerformance: rule.goodPerformancePoints,
        completedTraining: rule.completedTrainingPoints,
        holidayWork: rule.holidayWorkPoints,
        overtimePerHour: rule.overtimePerHourPoints
    };
}
// Get or create staff point balance
async function getOrCreateStaffPoint(staffId, storeId) {
    let staffPoint = await database_1.prisma.staffPoint.findUnique({ where: { staffId } });
    if (!staffPoint) {
        staffPoint = await database_1.prisma.staffPoint.create({
            data: { staffId, storeId, balance: 0, totalEarned: 0, totalRedeemed: 0 }
        });
    }
    return staffPoint;
}
// Get point balance for a staff
async function getStaffPointBalance(staffId) {
    const staffPoint = await getOrCreateStaffPoint(staffId, '');
    return {
        balance: staffPoint.balance,
        totalEarned: staffPoint.totalEarned,
        totalRedeemed: staffPoint.totalRedeemed
    };
}
// Get point balances for all staff in a store (batch)
async function getStaffPointBalancesByStore(storeId) {
    // Get all staff for this store
    const staffList = await database_1.prisma.staff.findMany({
        where: { storeId },
        select: { id: true, name: true }
    });
    // Get all staff points for this store in one query
    const staffPoints = await database_1.prisma.staffPoint.findMany({
        where: { staffId: { in: staffList.map(s => s.id) } }
    });
    // Create a map for quick lookup
    const pointsMap = new Map(staffPoints.map(sp => [sp.staffId, sp]));
    // Combine staff list with their points
    return staffList.map(staff => {
        const sp = pointsMap.get(staff.id);
        return {
            staffId: staff.id,
            staffName: staff.name,
            balance: sp?.balance || 0,
            totalEarned: sp?.totalEarned || 0,
            totalRedeemed: sp?.totalRedeemed || 0
        };
    });
}
// Get point history for a staff
async function getStaffPointHistory(staffId, limit = 50) {
    const logs = await database_1.prisma.staffPointLog.findMany({
        where: { staffId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
    return logs;
}
// Award points to a staff
async function awardPoints(data) {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId);
    // Create log entry
    const log = await database_1.prisma.staffPointLog.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            type: 'earn',
            points: data.points,
            reason: data.reason,
            referenceId: data.referenceId,
            note: data.note,
            expiresAt: data.expiresAt,
            createdBy: data.createdBy
        }
    });
    // Update balance
    await database_1.prisma.staffPoint.update({
        where: { staffId: data.staffId },
        data: {
            balance: { increment: data.points },
            totalEarned: { increment: data.points }
        }
    });
    return log;
}
// Redeem points
async function redeemPoints(data) {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId);
    if (staffPoint.balance < data.points) {
        throw new Error('Insufficient points balance');
    }
    // Create log entry (negative points for redeem)
    const log = await database_1.prisma.staffPointLog.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            type: 'redeem',
            points: -data.points,
            reason: data.reason,
            referenceId: data.referenceId,
            note: data.note
        }
    });
    // Update balance
    await database_1.prisma.staffPoint.update({
        where: { staffId: data.staffId },
        data: {
            balance: { decrement: data.points },
            totalRedeemed: { increment: data.points }
        }
    });
    return log;
}
// Manual adjustment (admin)
async function adjustPoints(data) {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId);
    // Create log entry (positive or negative)
    const log = await database_1.prisma.staffPointLog.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            type: 'adjust',
            points: data.points,
            reason: 'manual_adjust',
            note: data.note || data.reason,
            createdBy: data.createdBy
        }
    });
    // Update balance
    const newBalance = staffPoint.balance + data.points;
    await database_1.prisma.staffPoint.update({
        where: { staffId: data.staffId },
        data: {
            balance: newBalance >= 0 ? newBalance : 0,
            totalEarned: data.points > 0 ? staffPoint.totalEarned + data.points : staffPoint.totalEarned,
            totalRedeemed: data.points < 0 ? staffPoint.totalRedeemed + Math.abs(data.points) : staffPoint.totalRedeemed
        }
    });
    return log;
}
// Process expired points
async function processExpiredPoints(storeId) {
    const now = new Date();
    // Find expired point logs that haven't been processed
    const expiredLogs = await database_1.prisma.staffPointLog.findMany({
        where: {
            storeId,
            type: 'earn',
            expiresAt: { lte: now },
            expiredAt: null
        }
    });
    const results = [];
    for (const log of expiredLogs) {
        // Create expire log
        await database_1.prisma.staffPointLog.create({
            data: {
                staffId: log.staffId,
                storeId: log.storeId,
                type: 'expire',
                points: -log.points,
                reason: 'expired',
                referenceId: log.id,
                note: 'Points expired'
            }
        });
        // Update balance
        await database_1.prisma.staffPoint.update({
            where: { staffId: log.staffId },
            data: { balance: { decrement: log.points } }
        });
        // Mark original log as expired
        await database_1.prisma.staffPointLog.update({
            where: { id: log.id },
            data: { expiredAt: now }
        });
        results.push(log.id);
    }
    return results;
}
// Get all rewards
async function getRewards(storeId) {
    return database_1.prisma.staffPointReward.findMany({
        where: { storeId, isActive: true },
        orderBy: { pointsCost: 'asc' }
    });
}
// Create reward
async function createReward(data) {
    return database_1.prisma.staffPointReward.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            type: data.type,
            pointsCost: data.pointsCost,
            value: data.value,
            stock: data.stock
        }
    });
}
// Update reward
async function updateReward(id, data) {
    return database_1.prisma.staffPointReward.update({
        where: { id },
        data
    });
}
// Delete reward
async function deleteReward(id) {
    return database_1.prisma.staffPointReward.update({
        where: { id },
        data: { isActive: false }
    });
}
// Create redemption request
async function createRedemption(data) {
    const staffPoint = await getOrCreateStaffPoint(data.staffId, data.storeId);
    if (staffPoint.balance < data.pointsCost) {
        throw new Error('Insufficient points balance');
    }
    return database_1.prisma.staffPointRedemption.create({
        data: {
            staffId: data.staffId,
            storeId: data.storeId,
            rewardId: data.rewardId,
            pointsCost: data.pointsCost
        }
    });
}
// Get pending redemptions
async function getPendingRedemptions(storeId) {
    return database_1.prisma.staffPointRedemption.findMany({
        where: { storeId, status: 'pending' },
        include: {
            staff: { select: { id: true, name: true, employeeNumber: true } },
            reward: true
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Approve/fulfill redemption
async function fulfillRedemption(id, fulfilledBy, checkStock = true) {
    const redemption = await database_1.prisma.staffPointRedemption.findUnique({
        where: { id },
        include: { reward: true }
    });
    if (!redemption) {
        throw new Error('Redemption not found');
    }
    // Check stock if reward has stock management
    if (checkStock && redemption.reward?.stock !== null && redemption.reward?.stock !== undefined) {
        if (redemption.reward.stock <= 0) {
            throw new Error('Reward is out of stock');
        }
        // Deduct stock
        await database_1.prisma.staffPointReward.update({
            where: { id: redemption.rewardId },
            data: { stock: { decrement: 1 } }
        });
    }
    const updated = await database_1.prisma.staffPointRedemption.update({
        where: { id },
        data: {
            status: 'fulfilled',
            fulfilledAt: new Date(),
            fulfilledBy
        }
    });
    // Deduct points
    await database_1.prisma.staffPoint.update({
        where: { staffId: redemption.staffId },
        data: {
            balance: { decrement: redemption.pointsCost },
            totalRedeemed: { increment: redemption.pointsCost }
        }
    });
    return updated;
}
// Cancel redemption
async function cancelRedemption(id) {
    return database_1.prisma.staffPointRedemption.update({
        where: { id },
        data: { status: 'cancelled' }
    });
}
// Award points for perfect attendance (call at end of month)
async function awardPerfectAttendancePoints(staffId, storeId) {
    const rule = await getPointsRule(storeId);
    return awardPoints({
        staffId,
        storeId,
        points: rule.perfectAttendance,
        reason: 'perfect_attendance',
        note: 'Perfect attendance this month'
    });
}
// Award points for training completion
async function awardTrainingPoints(staffId, storeId, trainingId) {
    const rule = await getPointsRule(storeId);
    return awardPoints({
        staffId,
        storeId,
        points: rule.completedTraining,
        reason: 'training',
        referenceId: trainingId,
        note: 'Completed training'
    });
}
// Award points for overtime
async function awardOvertimePoints(staffId, storeId, hours, referenceId) {
    const rule = await getPointsRule(storeId);
    const points = Math.floor(hours) * rule.overtimePerHour;
    return awardPoints({
        staffId,
        storeId,
        points,
        reason: 'overtime',
        referenceId,
        note: `${hours} hours overtime`
    });
}
//# sourceMappingURL=StaffPointService.js.map