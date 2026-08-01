"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMembers = getMembers;
exports.getMemberById = getMemberById;
exports.getMemberByPhone = getMemberByPhone;
exports.createMember = createMember;
exports.updateMember = updateMember;
exports.earnPoints = earnPoints;
exports.redeemPoints = redeemPoints;
exports.adjustPoints = adjustPoints;
exports.checkLevelUpgrade = checkLevelUpgrade;
exports.getMemberStats = getMemberStats;
exports.getRFMAnalysis = getRFMAnalysis;
const database_1 = __importDefault(require("../config/database"));
const TierBenefitService_1 = require("./TierBenefitService");
// Get members with filtering
async function getMembers(filter) {
    const where = {};
    if (filter.storeId)
        where.storeId = filter.storeId;
    if (filter.level)
        where.level = filter.level;
    if (filter.search) {
        where.OR = [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { phone: { contains: filter.search, mode: 'insensitive' } }
        ];
    }
    return database_1.default.member.findMany({
        where,
        include: {
            store: { select: { id: true, name: true } },
            pointLogs: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Get member by ID
async function getMemberById(memberId) {
    return database_1.default.member.findUnique({
        where: { id: memberId },
        include: {
            store: true,
            pointLogs: {
                orderBy: { createdAt: 'desc' },
                take: 50
            },
            orders: {
                orderBy: { createdAt: 'desc' },
                take: 20
            }
        }
    });
}
// Get member by phone
async function getMemberByPhone(phone) {
    return database_1.default.member.findFirst({
        where: { phone },
        include: {
            store: { select: { id: true, name: true } }
        }
    });
}
// Create member
async function createMember(data) {
    // Check if phone already exists
    const existing = await database_1.default.member.findFirst({
        where: { phone: data.phone }
    });
    if (existing) {
        throw new Error('Phone number already registered');
    }
    return database_1.default.member.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            phone: data.phone,
            email: data.email,
            birthday: data.birthday,
            level: data.level || 'bronze',
            points: 0,
            totalSpent: 0,
            status: 'active'
        }
    });
}
// Update member
async function updateMember(memberId, data) {
    return database_1.default.member.update({
        where: { id: memberId },
        data
    });
}
// Earn points
async function earnPoints(memberId, points, note, orderId) {
    const member = await database_1.default.member.update({
        where: { id: memberId },
        data: {
            points: { increment: points },
            lastVisit: new Date()
        }
    });
    await database_1.default.pointLog.create({
        data: {
            memberId,
            type: 'earn',
            points,
            note,
            orderId
        }
    });
    // Check for level upgrade
    await checkLevelUpgrade(memberId);
    return member;
}
// Redeem points
async function redeemPoints(memberId, points, note, orderId) {
    const member = await database_1.default.member.findUnique({
        where: { id: memberId }
    });
    if (!member || member.points < points) {
        throw new Error('Insufficient points');
    }
    const updated = await database_1.default.member.update({
        where: { id: memberId },
        data: {
            points: { decrement: points }
        }
    });
    await database_1.default.pointLog.create({
        data: {
            memberId,
            type: 'redeem',
            points: -points,
            note,
            orderId
        }
    });
    return updated;
}
// Adjust points (admin)
async function adjustPoints(memberId, points, note) {
    const member = await database_1.default.member.update({
        where: { id: memberId },
        data: {
            points: { increment: points }
        }
    });
    await database_1.default.pointLog.create({
        data: {
            memberId,
            type: 'adjust',
            points,
            note
        }
    });
    return member;
}
// Check and upgrade member level based on totalSpent (using TierBenefit configuration)
async function checkLevelUpgrade(memberId) {
    const member = await database_1.default.member.findUnique({
        where: { id: memberId }
    });
    if (!member)
        return member;
    // Get threshold from TierBenefit config (descending order: diamond > gold > silver > bronze)
    const tierThresholds = [
        { level: 'diamond', threshold: 0 },
        { level: 'gold', threshold: 0 },
        { level: 'silver', threshold: 0 },
        { level: 'bronze', threshold: 0 }
    ];
    try {
        // Fetch thresholds from TierBenefit table
        const diamond = await (0, TierBenefitService_1.getTierBenefitByLevel)(member.storeId, 'diamond');
        const gold = await (0, TierBenefitService_1.getTierBenefitByLevel)(member.storeId, 'gold');
        const silver = await (0, TierBenefitService_1.getTierBenefitByLevel)(member.storeId, 'silver');
        if (diamond?.pointsToUpgrade)
            tierThresholds[0].threshold = diamond.pointsToUpgrade;
        if (gold?.pointsToUpgrade)
            tierThresholds[1].threshold = gold.pointsToUpgrade;
        if (silver?.pointsToUpgrade)
            tierThresholds[2].threshold = silver.pointsToUpgrade;
    }
    catch (e) {
        // Fallback to default thresholds if TierBenefit not configured
        tierThresholds[0].threshold = 5000000; // diamond
        tierThresholds[1].threshold = 2000000; // gold
        tierThresholds[2].threshold = 500000; // silver
    }
    // Determine new level based on thresholds (descending order)
    let newLevel = 'bronze';
    if (member.totalSpent >= tierThresholds[0].threshold)
        newLevel = 'diamond';
    else if (member.totalSpent >= tierThresholds[1].threshold)
        newLevel = 'gold';
    else if (member.totalSpent >= tierThresholds[2].threshold)
        newLevel = 'silver';
    if (newLevel !== member.level) {
        await database_1.default.member.update({
            where: { id: memberId },
            data: { level: newLevel }
        });
    }
    return member;
}
// Get member statistics
async function getMemberStats(storeId) {
    const [total, bronze, silver, gold, diamond] = await Promise.all([
        database_1.default.member.count({ where: { storeId } }),
        database_1.default.member.count({ where: { storeId, level: 'bronze' } }),
        database_1.default.member.count({ where: { storeId, level: 'silver' } }),
        database_1.default.member.count({ where: { storeId, level: 'gold' } }),
        database_1.default.member.count({ where: { storeId, level: 'diamond' } })
    ]);
    // Get recent activity
    const recentLogs = await database_1.default.pointLog.findMany({
        where: {
            member: { storeId }
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
            member: { select: { name: true, phone: true } }
        }
    });
    return {
        total,
        byLevel: { bronze, silver, gold, diamond },
        recentActivity: recentLogs
    };
}
// RFM Analysis (Recency, Frequency, Monetary)
async function getRFMAnalysis(storeId) {
    const members = await database_1.default.member.findMany({
        where: { storeId },
        include: {
            orders: {
                select: {
                    createdAt: true,
                    finalAmount: true
                }
            }
        }
    });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return members.map(member => {
        const recentOrders = member.orders.filter(o => o.createdAt >= thirtyDaysAgo);
        const allOrders = member.orders.filter(o => o.createdAt >= ninetyDaysAgo);
        const lastOrder = member.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const recency = lastOrder
            ? Math.floor((now.getTime() - new Date(lastOrder.createdAt).getTime()) / (24 * 60 * 60 * 1000))
            : 999;
        const frequency = allOrders.length;
        const monetary = allOrders.reduce((sum, o) => sum + o.finalAmount, 0);
        let segment = 'inactive';
        if (recency <= 7 && frequency >= 4)
            segment = 'champions';
        else if (recency <= 14 && frequency >= 2)
            segment = 'loyal';
        else if (recency <= 30 && frequency >= 1)
            segment = 'active';
        else if (recency <= 60)
            segment = 'atRisk';
        else if (recency > 60)
            segment = 'lost';
        return {
            id: member.id,
            name: member.name,
            phone: member.phone,
            level: member.level,
            recency,
            frequency,
            monetary,
            segment
        };
    });
}
//# sourceMappingURL=MemberService.js.map