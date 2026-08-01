"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRewards = getRewards;
exports.getActiveRewards = getActiveRewards;
exports.getReward = getReward;
exports.createReward = createReward;
exports.updateReward = updateReward;
exports.deleteReward = deleteReward;
exports.redeemReward = redeemReward;
exports.getMemberRewards = getMemberRewards;
exports.getMemberUnusedRewards = getMemberUnusedRewards;
exports.useReward = useReward;
exports.expireOldRewards = expireOldRewards;
const database_1 = __importDefault(require("../config/database"));
// Get all rewards for store
async function getRewards(storeId) {
    return database_1.default.rewardCatalog.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' }
    });
}
// Get active rewards for store
async function getActiveRewards(storeId) {
    const now = new Date();
    return database_1.default.rewardCatalog.findMany({
        where: {
            storeId,
            isActive: true,
            validFrom: { lte: now },
            validUntil: { gte: now }
        },
        orderBy: { pointsCost: 'asc' }
    });
}
// Get single reward
async function getReward(id) {
    return database_1.default.rewardCatalog.findUnique({
        where: { id },
        include: { redemptions: true }
    });
}
// Create reward
async function createReward(data) {
    return database_1.default.rewardCatalog.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            description: data.description,
            type: data.type,
            productId: data.productId,
            addonId: data.addonId,
            pointsCost: data.pointsCost,
            value: data.value,
            stock: data.stock,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            isActive: data.isActive ?? true
        }
    });
}
// Update reward
async function updateReward(id, data) {
    return database_1.default.rewardCatalog.update({
        where: { id },
        data
    });
}
// Delete reward
async function deleteReward(id) {
    return database_1.default.rewardCatalog.delete({
        where: { id }
    });
}
// Redeem reward for member
async function redeemReward(memberId, rewardId, orderId) {
    const reward = await database_1.default.rewardCatalog.findUnique({
        where: { id: rewardId }
    });
    if (!reward) {
        throw new Error('Reward not found');
    }
    if (!reward.isActive) {
        throw new Error('Reward is not active');
    }
    const now = new Date();
    if (now < reward.validFrom || now > reward.validUntil) {
        throw new Error('Reward is not valid at this time');
    }
    if (reward.stock !== null && reward.stock <= 0) {
        throw new Error('Reward is out of stock');
    }
    // Get member
    const member = await database_1.default.member.findUnique({
        where: { id: memberId }
    });
    if (!member) {
        throw new Error('Member not found');
    }
    if (member.points < reward.pointsCost) {
        throw new Error('Insufficient points');
    }
    // Use transaction
    const result = await database_1.default.$transaction(async (tx) => {
        // Deduct points from member
        await tx.member.update({
            where: { id: memberId },
            data: { points: { decrement: reward.pointsCost } }
        });
        // Create point log
        await tx.pointLog.create({
            data: {
                memberId,
                type: 'redeem',
                points: -reward.pointsCost,
                note: `Redeemed: ${reward.name}`,
                orderId
            }
        });
        // Create member reward
        const memberReward = await tx.memberReward.create({
            data: {
                memberId,
                rewardId,
                points: reward.pointsCost,
                orderId,
                status: 'unused',
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days expiry
            }
        });
        // Decrement stock if not unlimited
        if (reward.stock !== null) {
            await tx.rewardCatalog.update({
                where: { id: rewardId },
                data: { stock: { decrement: 1 } }
            });
        }
        return memberReward;
    });
    return result;
}
// Get member's redeemed rewards
async function getMemberRewards(memberId) {
    return database_1.default.memberReward.findMany({
        where: { memberId },
        include: { reward: true },
        orderBy: { createdAt: 'desc' }
    });
}
// Get member's unused rewards
async function getMemberUnusedRewards(memberId) {
    const now = new Date();
    return database_1.default.memberReward.findMany({
        where: {
            memberId,
            status: 'unused',
            expiresAt: { gt: now }
        },
        include: { reward: true },
        orderBy: { createdAt: 'desc' }
    });
}
// Mark reward as used
async function useReward(id, orderId) {
    return database_1.default.memberReward.update({
        where: { id },
        data: {
            status: 'used',
            usedAt: new Date(),
            orderId
        }
    });
}
// Check and expire old unused rewards (called by scheduler)
async function expireOldRewards() {
    const now = new Date();
    const expired = await database_1.default.memberReward.updateMany({
        where: {
            status: 'unused',
            expiresAt: { lt: now }
        },
        data: { status: 'expired' }
    });
    return expired.count;
}
//# sourceMappingURL=RewardCatalogService.js.map