"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTierBenefits = getTierBenefits;
exports.getTierBenefitById = getTierBenefitById;
exports.getTierBenefitByLevel = getTierBenefitByLevel;
exports.upsertTierBenefit = upsertTierBenefit;
exports.updateTierBenefit = updateTierBenefit;
exports.deleteTierBenefit = deleteTierBenefit;
exports.getPointsRateMultiplier = getPointsRateMultiplier;
exports.calculateTierUpgrade = calculateTierUpgrade;
const database_1 = __importDefault(require("../config/database"));
const DEFAULT_TIERS = ['bronze', 'silver', 'gold', 'diamond'];
async function getTierBenefits(storeId) {
    return database_1.default.tierBenefit.findMany({
        where: { storeId },
        orderBy: [
            { level: 'asc' }
        ]
    });
}
async function getTierBenefitById(id) {
    return database_1.default.tierBenefit.findUnique({ where: { id } });
}
async function getTierBenefitByLevel(storeId, level) {
    return database_1.default.tierBenefit.findUnique({
        where: { storeId_level: { storeId, level } }
    });
}
async function upsertTierBenefit(data) {
    const existing = await database_1.default.tierBenefit.findUnique({
        where: { storeId_level: { storeId: data.storeId, level: data.level } }
    });
    const benefitData = {
        storeId: data.storeId,
        level: data.level,
        pointsRate: data.pointsRate ?? 1.0,
        discountPercent: data.discountPercent ?? 0,
        freeDeliveryThreshold: data.freeDeliveryThreshold ?? 0,
        pointsToUpgrade: data.pointsToUpgrade ?? null,
        description: data.description ?? null
    };
    if (data.birthdayReward) {
        benefitData.birthdayReward = JSON.stringify(data.birthdayReward);
    }
    if (existing) {
        return database_1.default.tierBenefit.update({
            where: { id: existing.id },
            data: benefitData
        });
    }
    else {
        return database_1.default.tierBenefit.create({ data: benefitData });
    }
}
async function updateTierBenefit(id, data) {
    const updateData = {};
    if (data.pointsRate !== undefined)
        updateData.pointsRate = data.pointsRate;
    if (data.birthdayReward !== undefined)
        updateData.birthdayReward = JSON.stringify(data.birthdayReward);
    if (data.discountPercent !== undefined)
        updateData.discountPercent = data.discountPercent;
    if (data.freeDeliveryThreshold !== undefined)
        updateData.freeDeliveryThreshold = data.freeDeliveryThreshold;
    if (data.pointsToUpgrade !== undefined)
        updateData.pointsToUpgrade = data.pointsToUpgrade;
    if (data.description !== undefined)
        updateData.description = data.description;
    return database_1.default.tierBenefit.update({ where: { id }, data: updateData });
}
async function deleteTierBenefit(id) {
    return database_1.default.tierBenefit.delete({ where: { id } });
}
async function getPointsRateMultiplier(storeId, level) {
    const benefit = await getTierBenefitByLevel(storeId, level);
    return benefit?.pointsRate ?? 1.0;
}
async function calculateTierUpgrade(storeId, memberId) {
    const member = await database_1.default.member.findUnique({ where: { id: memberId } });
    if (!member)
        return null;
    const tiers = ['bronze', 'silver', 'gold', 'diamond'];
    const currentIndex = tiers.indexOf(member.level);
    const benefits = await getTierBenefits(storeId);
    const nextTier = tiers[currentIndex + 1];
    if (!nextTier)
        return { currentLevel: member.level, isTopTier: true };
    const nextBenefit = benefits.find(b => b.level === nextTier);
    const currentBenefit = benefits.find(b => b.level === member.level);
    return {
        currentLevel: member.level,
        nextLevel: nextTier,
        pointsNeeded: nextBenefit?.pointsToUpgrade ?? null,
        pointsRate: currentBenefit?.pointsRate ?? 1.0,
        nextPointsRate: nextBenefit?.pointsRate ?? 1.0
    };
}
//# sourceMappingURL=TierBenefitService.js.map