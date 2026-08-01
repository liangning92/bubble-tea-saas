"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPointsRule = getPointsRule;
exports.getOrCreatePointsRule = getOrCreatePointsRule;
exports.upsertPointsRule = upsertPointsRule;
exports.calculatePoints = calculatePoints;
exports.parseTierMultiplier = parseTierMultiplier;
const database_1 = __importDefault(require("../config/database"));
// Get points rule for store
async function getPointsRule(storeId) {
    return database_1.default.pointsRule.findUnique({
        where: { storeId }
    });
}
// Get or create default points rule
async function getOrCreatePointsRule(storeId) {
    let rule = await database_1.default.pointsRule.findUnique({
        where: { storeId }
    });
    if (!rule) {
        rule = await database_1.default.pointsRule.create({
            data: {
                storeId,
                pointsPerRupiah: 10000,
                minPurchase: 0,
                birthdayMultiplier: 2.0,
                tierMultiplier: JSON.stringify({ bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }),
                isActive: true
            }
        });
    }
    return rule;
}
// Upsert points rule
async function upsertPointsRule(data) {
    const existing = await database_1.default.pointsRule.findUnique({
        where: { storeId: data.storeId }
    });
    if (existing) {
        return database_1.default.pointsRule.update({
            where: { id: existing.id },
            data: {
                pointsPerRupiah: data.pointsPerRupiah ?? existing.pointsPerRupiah,
                minPurchase: data.minPurchase ?? existing.minPurchase,
                birthdayMultiplier: data.birthdayMultiplier ?? existing.birthdayMultiplier,
                tierMultiplier: data.tierMultiplier ?? existing.tierMultiplier,
                isActive: data.isActive ?? existing.isActive
            }
        });
    }
    else {
        return database_1.default.pointsRule.create({
            data: {
                storeId: data.storeId,
                pointsPerRupiah: data.pointsPerRupiah ?? 10000,
                minPurchase: data.minPurchase ?? 0,
                birthdayMultiplier: data.birthdayMultiplier ?? 2.0,
                tierMultiplier: data.tierMultiplier ?? JSON.stringify({ bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }),
                isActive: data.isActive ?? true
            }
        });
    }
}
// Calculate points earned for a purchase
function calculatePoints(amount, options) {
    const { rule, member } = options;
    // Check minimum purchase
    if (amount < rule.minPurchase) {
        return 0;
    }
    // Base points: amount / pointsPerRupiah
    let points = Math.floor(amount / rule.pointsPerRupiah);
    // Apply birthday multiplier
    if (member.birthday) {
        const today = new Date();
        const birthMonth = member.birthday.getMonth();
        const birthDay = member.birthday.getDate();
        if (today.getMonth() === birthMonth && today.getDate() === birthDay) {
            points = Math.floor(points * rule.birthdayMultiplier);
        }
    }
    // Apply tier multiplier
    const tierMultipliers = JSON.parse(rule.tierMultiplier);
    const tierMultiplier = tierMultipliers[member.level] || 1;
    points = Math.floor(points * tierMultiplier);
    return points;
}
// Parse tier multiplier JSON
function parseTierMultiplier(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return { bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 };
    }
}
//# sourceMappingURL=PointsRuleService.js.map