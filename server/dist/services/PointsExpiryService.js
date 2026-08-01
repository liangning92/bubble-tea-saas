"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPointsExpiryRule = getPointsExpiryRule;
exports.upsertPointsExpiryRule = upsertPointsExpiryRule;
exports.updatePointsExpiryRule = updatePointsExpiryRule;
exports.processPointsExpiry = processPointsExpiry;
exports.getExpiringPoints = getExpiringPoints;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const MessageService_1 = require("./MessageService");
async function getPointsExpiryRule(storeId) {
    return database_1.default.pointsExpiryRule.findUnique({
        where: { storeId }
    });
}
async function upsertPointsExpiryRule(data) {
    const existing = await database_1.default.pointsExpiryRule.findUnique({
        where: { storeId: data.storeId }
    });
    const ruleData = {
        storeId: data.storeId,
        enabled: data.enabled ?? true,
        expiryMonths: data.expiryMonths ?? 12,
        minPointsToExpire: data.minPointsToExpire ?? 100,
        notificationDays: data.notificationDays ?? 14
    };
    if (existing) {
        return database_1.default.pointsExpiryRule.update({
            where: { id: existing.id },
            data: ruleData
        });
    }
    else {
        return database_1.default.pointsExpiryRule.create({ data: ruleData });
    }
}
async function updatePointsExpiryRule(id, data) {
    const updateData = {};
    if (data.enabled !== undefined)
        updateData.enabled = data.enabled;
    if (data.expiryMonths !== undefined)
        updateData.expiryMonths = data.expiryMonths;
    if (data.minPointsToExpire !== undefined)
        updateData.minPointsToExpire = data.minPointsToExpire;
    if (data.notificationDays !== undefined)
        updateData.notificationDays = data.notificationDays;
    return database_1.default.pointsExpiryRule.update({ where: { id }, data: updateData });
}
async function processPointsExpiry(storeId) {
    const rule = await getPointsExpiryRule(storeId);
    if (!rule || !rule.enabled)
        return { processed: 0, expired: 0, messagesSent: 0 };
    const expiryDate = (0, dateUtils_1.subMonths)(new Date(), rule.expiryMonths);
    const members = await database_1.default.member.findMany({
        where: { storeId, status: 'active', points: { gt: rule.minPointsToExpire } }
    });
    let expiredCount = 0;
    let processedCount = 0;
    let messagesSent = 0;
    // Get message template for expiry notification
    const expiryTemplate = await database_1.default.messageTemplate.findFirst({
        where: { storeId, type: 'points_expiring', enabled: true }
    });
    // Use transaction to ensure atomic updates
    await database_1.default.$transaction(async (tx) => {
        for (const member of members) {
            // Find points earned before expiry date that haven't been expired yet
            const oldPoints = await tx.pointLog.findMany({
                where: {
                    memberId: member.id,
                    type: 'earn',
                    createdAt: { lt: expiryDate }
                }
            });
            const alreadyExpired = await tx.pointLog.findFirst({
                where: {
                    memberId: member.id,
                    type: 'expire',
                    createdAt: { gte: expiryDate }
                }
            });
            if (oldPoints.length > 0 && !alreadyExpired) {
                const totalExpiring = oldPoints.reduce((sum, p) => sum + p.points, 0);
                if (totalExpiring >= rule.minPointsToExpire) {
                    // Create expire log
                    await tx.pointLog.create({
                        data: {
                            memberId: member.id,
                            type: 'expire',
                            points: -totalExpiring,
                            note: `Points expired after ${rule.expiryMonths} months`
                        }
                    });
                    // Deduct from member
                    await tx.member.update({
                        where: { id: member.id },
                        data: { points: { decrement: totalExpiring } }
                    });
                    // Send expiry notification if template configured
                    if (expiryTemplate) {
                        try {
                            const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'points_expiring', 'sms', expiryTemplate.id);
                            if (result.success)
                                messagesSent++;
                        }
                        catch (e) {
                            console.error('Failed to send expiry notification:', e);
                        }
                    }
                    expiredCount++;
                }
            }
            processedCount++;
        }
    });
    return { processed: processedCount, expired: expiredCount, messagesSent };
}
async function getExpiringPoints(storeId, memberId) {
    const rule = await getPointsExpiryRule(storeId);
    if (!rule)
        return { expiringPoints: 0, expiryDate: null };
    const expiryDate = (0, dateUtils_1.subMonths)(new Date(), rule.expiryMonths);
    const oldPoints = await database_1.default.pointLog.findMany({
        where: {
            memberId,
            type: 'earn',
            createdAt: { lt: expiryDate }
        }
    });
    const totalExpiring = oldPoints.reduce((sum, p) => sum + p.points, 0);
    return {
        expiringPoints: totalExpiring,
        expiryDate: expiryDate.toISOString()
    };
}
//# sourceMappingURL=PointsExpiryService.js.map