"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaign = createCampaign;
exports.getActiveCampaigns = getActiveCampaigns;
exports.getCampaign = getCampaign;
exports.updateCampaign = updateCampaign;
exports.deleteCampaign = deleteCampaign;
exports.createCoupon = createCoupon;
exports.getAllCoupons = getAllCoupons;
exports.getCoupon = getCoupon;
exports.updateCoupon = updateCoupon;
exports.deleteCoupon = deleteCoupon;
exports.generateMemberCoupon = generateMemberCoupon;
exports.checkBirthdayCampaign = checkBirthdayCampaign;
exports.checkReactivationCampaign = checkReactivationCampaign;
exports.checkPointsExpiring = checkPointsExpiring;
exports.triggerWelcomeCampaign = triggerWelcomeCampaign;
exports.getMemberCoupons = getMemberCoupons;
exports.redeemCoupon = redeemCoupon;
exports.getCampaignStats = getCampaignStats;
exports.runAutomationChecks = runAutomationChecks;
exports.checkSeasonalCampaigns = checkSeasonalCampaigns;
exports.checkPointsExpiringCampaign = checkPointsExpiringCampaign;
exports.checkWelcomeCampaign = checkWelcomeCampaign;
exports.checkSeasonalCampaign = checkSeasonalCampaign;
exports.runCampaignAutomation = runCampaignAutomation;
exports.runCampaignAutomationLegacy = runCampaignAutomationLegacy;
const database_1 = __importDefault(require("../config/database"));
const dateUtils_1 = require("../utils/dateUtils");
const MessageService_1 = require("./MessageService");
// Create marketing campaign
async function createCampaign(data) {
    return database_1.default.campaign.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            description: data.description,
            type: data.type,
            triggerType: data.triggerType,
            startDate: data.startDate,
            endDate: data.endDate,
            conditions: JSON.stringify(data.conditions || {}),
            actions: JSON.stringify(data.actions || {}),
            status: 'active'
        }
    });
}
// Get active campaigns
async function getActiveCampaigns(storeId) {
    const now = new Date();
    return database_1.default.campaign.findMany({
        where: {
            storeId,
            status: 'active',
            startDate: { lte: now },
            OR: [
                { endDate: null },
                { endDate: { gte: now } }
            ]
        }
    });
}
// Get single campaign
async function getCampaign(id) {
    return database_1.default.campaign.findUnique({ where: { id } });
}
// Update campaign
async function updateCampaign(id, data) {
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = data.name;
    if (data.description !== undefined)
        updateData.description = data.description;
    if (data.type !== undefined)
        updateData.type = data.type;
    if (data.triggerType !== undefined)
        updateData.triggerType = data.triggerType;
    if (data.status !== undefined)
        updateData.status = data.status;
    if (data.startDate !== undefined)
        updateData.startDate = data.startDate;
    if (data.endDate !== undefined)
        updateData.endDate = data.endDate;
    if (data.conditions !== undefined)
        updateData.conditions = JSON.stringify(data.conditions);
    if (data.actions !== undefined)
        updateData.actions = JSON.stringify(data.actions);
    return database_1.default.campaign.update({ where: { id }, data: updateData });
}
// Delete campaign
async function deleteCampaign(id) {
    return database_1.default.campaign.delete({ where: { id } });
}
// Create coupon
async function createCoupon(data) {
    return database_1.default.coupon.create({
        data: {
            storeId: data.storeId,
            campaignId: data.campaignId,
            code: data.code,
            type: data.type,
            value: data.value,
            minOrder: data.minOrder || 0,
            maxDiscount: data.maxDiscount || 0,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            usageLimit: data.usageLimit || 0
        }
    });
}
// Get all coupons for a store
async function getAllCoupons(storeId) {
    return database_1.default.coupon.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' }
    });
}
// Get single coupon
async function getCoupon(id) {
    return database_1.default.coupon.findUnique({
        where: { id },
        include: { memberCoupons: true }
    });
}
// Update coupon
async function updateCoupon(id, data) {
    const updateData = {};
    if (data.code !== undefined)
        updateData.code = data.code;
    if (data.type !== undefined)
        updateData.type = data.type;
    if (data.value !== undefined)
        updateData.value = data.value;
    if (data.minOrder !== undefined)
        updateData.minOrder = data.minOrder;
    if (data.maxDiscount !== undefined)
        updateData.maxDiscount = data.maxDiscount;
    if (data.validFrom !== undefined)
        updateData.validFrom = data.validFrom;
    if (data.validUntil !== undefined)
        updateData.validUntil = data.validUntil;
    if (data.usageLimit !== undefined)
        updateData.usageLimit = data.usageLimit;
    if (data.status !== undefined)
        updateData.status = data.status;
    return database_1.default.coupon.update({ where: { id }, data: updateData });
}
// Delete coupon
async function deleteCoupon(id) {
    return database_1.default.coupon.delete({ where: { id } });
}
// Generate coupon for member
async function generateMemberCoupon(memberId, couponId) {
    return database_1.default.memberCoupon.create({
        data: {
            memberId,
            couponId,
            status: 'unused'
        }
    });
}
// Check and trigger birthday campaign
async function checkBirthdayCampaign(storeId) {
    const today = new Date();
    const todayStr = today.toISOString().slice(5, 10); // MM-DD
    // Find members with birthday today
    const members = await database_1.default.member.findMany({
        where: {
            storeId,
            birthday: { not: null },
            status: 'active'
        }
    });
    const birthdayMembers = members.filter(m => {
        if (!m.birthday)
            return false;
        const birthMonthDay = m.birthday.toISOString().slice(5, 10);
        return birthMonthDay === todayStr;
    });
    // Get birthday campaign
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId,
            type: 'birthday',
            status: 'active'
        }
    });
    if (!campaign || !birthdayMembers.length)
        return { triggered: 0 };
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    if (!couponId)
        return { triggered: 0 };
    // Generate coupons for birthday members
    let count = 0;
    let messagesSent = 0;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    for (const member of birthdayMembers) {
        await generateMemberCoupon(member.id, couponId);
        count++;
        // Send notification message if template configured
        if (messageTemplateId) {
            const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'birthday', channelType, messageTemplateId);
            if (result.success)
                messagesSent++;
        }
    }
    return { triggered: count, messagesSent, campaignId: campaign.id };
}
// Check and trigger reactivation campaign (30 days inactive)
async function checkReactivationCampaign(storeId) {
    const thirtyDaysAgo = (0, dateUtils_1.subDays)(new Date(), 30);
    const members = await database_1.default.member.findMany({
        where: {
            storeId,
            status: 'active',
            lastVisit: { lt: thirtyDaysAgo }
        }
    });
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId,
            type: 'reactivation',
            status: 'active'
        }
    });
    if (!campaign || !members.length)
        return { triggered: 0 };
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    if (!couponId)
        return { triggered: 0 };
    let count = 0;
    let messagesSent = 0;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    for (const member of members) {
        // Check if already received this campaign recently
        const existing = await database_1.default.memberCoupon.findFirst({
            where: {
                memberId: member.id,
                couponId,
                createdAt: { gte: (0, dateUtils_1.subDays)(new Date(), 60) }
            }
        });
        if (!existing) {
            await generateMemberCoupon(member.id, couponId);
            count++;
            // Send notification message if template configured
            if (messageTemplateId) {
                const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'reactivation', channelType, messageTemplateId);
                if (result.success)
                    messagesSent++;
            }
        }
    }
    return { triggered: count, messagesSent, campaignId: campaign.id };
}
// Check points expiring (14 days before)
async function checkPointsExpiring(storeId) {
    // Get configured rule for minPoints threshold
    const rule = await database_1.default.pointsExpiryRule.findUnique({ where: { storeId } });
    const minPoints = rule?.minPointsToExpire ?? 100;
    const members = await database_1.default.member.findMany({
        where: {
            storeId,
            status: 'active',
            points: { gt: minPoints }
        }
    });
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId,
            type: 'points_expiring',
            status: 'active'
        }
    });
    if (!campaign)
        return { notified: 0 };
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    const thresholdDays = actions.thresholdDays || 14;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    let count = 0;
    let messagesSent = 0;
    for (const member of members) {
        // Find points that will expire
        const expiringPoints = await database_1.default.pointLog.findMany({
            where: {
                memberId: member.id,
                type: 'earn',
                createdAt: {
                    gte: (0, dateUtils_1.subDays)(new Date(), 365),
                    lt: (0, dateUtils_1.subDays)(new Date(), 365 - thresholdDays)
                }
            }
        });
        // Calculate total points earned in that period
        const totalEarned = expiringPoints.reduce((sum, log) => sum + log.points, 0);
        if (totalEarned > 1000) {
            await generateMemberCoupon(member.id, couponId);
            count++;
            // Send notification message if template configured
            if (messageTemplateId) {
                const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'points_expiring', channelType, messageTemplateId);
                if (result.success)
                    messagesSent++;
            }
        }
    }
    return { notified: count, messagesSent, campaignId: campaign.id };
}
// Trigger welcome campaign for new members
async function triggerWelcomeCampaign(memberId) {
    const member = await database_1.default.member.findUnique({
        where: { id: memberId }
    });
    if (!member)
        return { triggered: false };
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId: member.storeId,
            type: 'welcome',
            status: 'active'
        }
    });
    if (!campaign)
        return { triggered: false };
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    if (couponId) {
        await generateMemberCoupon(memberId, couponId);
        // Send welcome message if template configured
        let messageSent = false;
        if (messageTemplateId) {
            const result = await (0, MessageService_1.sendMessageToMember)(member.storeId, memberId, 'welcome', channelType, messageTemplateId);
            messageSent = result.success;
        }
        return { triggered: true, messageSent, campaignId: campaign.id };
    }
    return { triggered: false };
}
// Get member's available coupons
async function getMemberCoupons(memberId) {
    const now = new Date();
    return database_1.default.memberCoupon.findMany({
        where: {
            memberId,
            status: 'unused',
            coupon: {
                validFrom: { lte: now },
                validUntil: { gte: now },
                status: 'active'
            }
        },
        include: { coupon: true }
    });
}
// Redeem coupon
async function redeemCoupon(memberCouponId, orderId) {
    const memberCoupon = await database_1.default.memberCoupon.findUnique({
        where: { id: memberCouponId },
        include: { coupon: true }
    });
    if (!memberCoupon)
        throw new Error('Coupon not found');
    if (memberCoupon.status !== 'unused')
        throw new Error('Coupon already used or expired');
    // Update coupon usage
    await database_1.default.coupon.update({
        where: { id: memberCoupon.couponId },
        data: { usedCount: { increment: 1 } }
    });
    // Update member coupon
    return database_1.default.memberCoupon.update({
        where: { id: memberCouponId },
        data: {
            usedAt: new Date(),
            orderId,
            status: 'used'
        }
    });
}
// Get campaign statistics
async function getCampaignStats(campaignId) {
    const [campaign, coupons] = await Promise.all([
        database_1.default.campaign.findUnique({ where: { id: campaignId } }),
        database_1.default.coupon.findMany({
            where: { campaignId },
            include: { memberCoupons: true }
        })
    ]);
    if (!campaign)
        return null;
    const totalIssued = coupons.reduce((sum, c) => sum + c.usedCount, 0);
    const totalValue = coupons.reduce((sum, c) => sum + (c.value * c.usedCount), 0);
    return {
        campaignId,
        campaignName: campaign.name,
        couponsIssued: coupons.length,
        couponsUsed: totalIssued,
        totalValue,
        status: campaign.status
    };
}
// Run all automation checks (called by scheduler)
async function runAutomationChecks(storeId) {
    const results = {
        birthday: await checkBirthdayCampaign(storeId),
        reactivation: await checkReactivationCampaign(storeId),
        pointsExpiring: await checkPointsExpiring(storeId)
    };
    return results;
}
// Get seasonal campaigns (Ramadan, etc.)
async function checkSeasonalCampaigns(storeId) {
    const now = new Date();
    const month = now.getMonth();
    // Ramadan is typically around March-April (months 2-3)
    // Check if current month is within Ramadan period
    const isRamadan = month >= 2 && month <= 3;
    if (!isRamadan)
        return { triggered: 0 };
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId,
            type: 'seasonal',
            status: 'active'
        }
    });
    if (!campaign)
        return { triggered: 0 };
    // Apply seasonal discount to all active members
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    if (!couponId)
        return { triggered: 0 };
    const members = await database_1.default.member.findMany({
        where: { storeId, status: 'active' }
    });
    let count = 0;
    let messagesSent = 0;
    for (const member of members) {
        await generateMemberCoupon(member.id, couponId);
        count++;
        // Send notification message if template configured
        if (messageTemplateId) {
            const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'seasonal', channelType, messageTemplateId);
            if (result.success)
                messagesSent++;
        }
    }
    return { triggered: count, messagesSent, campaignId: campaign.id };
}
// Check points expiring with campaign wrapper
async function checkPointsExpiringCampaign(storeId) {
    return checkPointsExpiring(storeId);
}
// Check welcome campaign for new members (registered but never purchased)
async function checkWelcomeCampaign(storeId) {
    const sevenDaysAgo = (0, dateUtils_1.subDays)(new Date(), 7);
    const members = await database_1.default.member.findMany({
        where: {
            storeId,
            status: 'active',
            lastVisit: null,
            createdAt: { lt: sevenDaysAgo }
        }
    });
    const campaign = await database_1.default.campaign.findFirst({
        where: {
            storeId,
            type: 'welcome',
            status: 'active'
        }
    });
    if (!campaign || !members.length)
        return { triggered: 0 };
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    if (!couponId)
        return { triggered: 0 };
    let count = 0;
    let messagesSent = 0;
    for (const member of members) {
        await generateMemberCoupon(member.id, couponId);
        count++;
        if (messageTemplateId) {
            const result = await (0, MessageService_1.sendMessageToMember)(storeId, member.id, 'welcome', channelType, messageTemplateId);
            if (result.success)
                messagesSent++;
        }
    }
    return { triggered: count, messagesSent, campaignId: campaign.id };
}
// Check seasonal campaign (wrapper for existing function)
async function checkSeasonalCampaign(storeId) {
    return checkSeasonalCampaigns(storeId);
}
// ============================================
// New Configurable Automation (using TriggerConditions and CampaignActions)
// ============================================
const TriggerEngine_1 = require("./TriggerEngine");
const ActionExecutor_1 = require("./ActionExecutor");
// Run automation for a specific campaign using new condition/action system
async function runCampaignAutomation(campaignId) {
    const campaign = await database_1.default.campaign.findUnique({
        where: { id: campaignId },
        include: {
            triggerConditions: { orderBy: { sortOrder: 'asc' } },
            campaignActions: { orderBy: { sortOrder: 'asc' } }
        }
    });
    if (!campaign) {
        return { success: false, reason: 'Campaign not found' };
    }
    if (campaign.status !== 'active') {
        return { success: false, reason: 'Campaign is not active' };
    }
    // Check date range
    const now = new Date();
    if (campaign.startDate > now) {
        return { success: false, reason: 'Campaign has not started yet' };
    }
    if (campaign.endDate && campaign.endDate < now) {
        return { success: false, reason: 'Campaign has ended' };
    }
    // Get conditions and actions from new tables
    const conditions = campaign.triggerConditions.map(c => ({
        conditionKey: c.conditionKey,
        operator: c.operator,
        value: c.value,
        logicalOperator: c.logicalOperator
    }));
    const actions = campaign.campaignActions.map(a => ({
        actionKey: a.actionKey,
        config: a.config,
        sortOrder: a.sortOrder
    }));
    // Find matching members
    const allMembers = await (0, TriggerEngine_1.findMatchingMembers)(campaign.storeId, conditions);
    let matchedCount = 0;
    let executedCount = 0;
    let failedCount = 0;
    for (const member of allMembers) {
        const ctx = {
            member: {
                id: member.id,
                name: member.name,
                phone: member.phone,
                level: member.level,
                points: member.points,
                totalSpent: member.totalSpent,
                birthday: member.birthday,
                lastVisit: member.lastVisit,
                status: member.status,
                createdAt: member.createdAt
            },
            campaign: {
                id: campaign.id,
                storeId: campaign.storeId,
                name: campaign.name
            }
        };
        if ((0, TriggerEngine_1.memberMatchesConditions)(conditions, ctx)) {
            matchedCount++;
            const actionCtx = {
                memberId: member.id,
                storeId: campaign.storeId,
                campaignName: campaign.name
            };
            const result = await (0, ActionExecutor_1.executeCampaignActions)(actions, actionCtx);
            executedCount += result.executed;
            failedCount += result.failed;
        }
    }
    return {
        success: true,
        matchedCount,
        executedCount,
        failedCount,
        campaignId: campaign.id
    };
}
// Legacy support: Run automation using old JSON format (for backwards compatibility)
async function runCampaignAutomationLegacy(campaignId) {
    const campaign = await database_1.default.campaign.findUnique({
        where: { id: campaignId }
    });
    if (!campaign) {
        return { success: false, reason: 'Campaign not found' };
    }
    const actions = JSON.parse(campaign.actions || '{}');
    const couponId = actions.couponId;
    const messageTemplateId = actions.messageTemplateId || null;
    const channelType = actions.channelType || 'sms';
    if (!couponId && !messageTemplateId) {
        return { success: false, reason: 'No actions configured' };
    }
    // Get matching members based on campaign type
    const today = new Date();
    const todayStr = today.toISOString().slice(5, 10);
    let members = [];
    switch (campaign.type) {
        case 'birthday':
            const allMembers = await database_1.default.member.findMany({
                where: { storeId: campaign.storeId, status: 'active', birthday: { not: null } }
            });
            members = allMembers.filter(m => {
                if (!m.birthday)
                    return false;
                return m.birthday.toISOString().slice(5, 10) === todayStr;
            });
            break;
        case 'reactivation':
            const thirtyDaysAgo = (0, dateUtils_1.subDays)(new Date(), 30);
            members = await database_1.default.member.findMany({
                where: {
                    storeId: campaign.storeId,
                    status: 'active',
                    lastVisit: { lt: thirtyDaysAgo }
                }
            });
            break;
        default:
            // For other types without specific logic, use all active members
            members = await database_1.default.member.findMany({
                where: { storeId: campaign.storeId, status: 'active' }
            });
    }
    let count = 0;
    let messagesSent = 0;
    for (const member of members) {
        if (couponId) {
            await generateMemberCoupon(member.id, couponId);
            count++;
        }
        if (messageTemplateId) {
            const result = await (0, MessageService_1.sendMessageToMember)(campaign.storeId, member.id, campaign.type, channelType, messageTemplateId);
            if (result.success)
                messagesSent++;
        }
    }
    return {
        success: true,
        triggered: count,
        messagesSent,
        campaignId: campaign.id
    };
}
//# sourceMappingURL=MarketingAutomationService.js.map