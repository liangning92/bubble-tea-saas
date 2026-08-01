"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketingROI = getMarketingROI;
exports.getCampaignAnalytics = getCampaignAnalytics;
exports.getMarketingSummary = getMarketingSummary;
exports.trackCampaignImpression = trackCampaignImpression;
const database_1 = __importDefault(require("../config/database"));
async function getMarketingROI(storeId, dateRange) {
    const campaigns = await database_1.default.campaign.findMany({
        where: { storeId },
        include: { coupons: { include: { memberCoupons: true } } }
    });
    const now = new Date();
    const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : now;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalCouponsIssued = 0;
    let totalCouponsUsed = 0;
    const campaignStats = campaigns.map(c => {
        const couponsIssued = c.coupons.length;
        const couponsUsed = c.coupons.reduce((sum, co) => sum + co.usedCount, 0);
        // cost = actual discount given (coupon value * usage)
        const cost = c.coupons.reduce((sum, co) => sum + (co.usedCount * co.value), 0);
        // revenue = estimated order value using minOrder as proxy for avg order value
        const revenue = c.coupons.reduce((sum, co) => {
            const avgOrderValue = co.minOrder > 0 ? co.minOrder : co.value * 5; // fallback estimate
            return sum + (co.usedCount * avgOrderValue);
        }, 0);
        totalCouponsIssued += couponsIssued;
        totalCouponsUsed += couponsUsed;
        totalRevenue += revenue;
        totalCost += cost;
        const roi = cost > 0 ? ((revenue - cost) / cost * 100).toFixed(1) : 'N/A';
        return {
            campaignId: c.id,
            campaignName: c.name,
            campaignType: c.type,
            status: c.status,
            couponsIssued,
            couponsUsed,
            revenue,
            cost,
            roi: roi + '%'
        };
    });
    const totalROI = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(1) : 'N/A';
    return {
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        summary: {
            totalCampaigns: campaigns.length,
            totalCouponsIssued,
            totalCouponsUsed,
            totalRevenue,
            totalCost,
            totalROI: totalROI + '%'
        },
        campaigns: campaignStats
    };
}
async function getCampaignAnalytics(campaignId, dateRange) {
    const campaign = await database_1.default.campaign.findUnique({
        where: { id: campaignId },
        include: {
            coupons: {
                include: { memberCoupons: true }
            },
            campaignAnalytics: true
        }
    });
    if (!campaign)
        return null;
    const analytics = campaign.campaignAnalytics || [];
    const totalIssued = campaign.coupons.length;
    const totalUsed = campaign.coupons.reduce((sum, c) => sum + c.usedCount, 0);
    return {
        campaign,
        totalIssued,
        totalUsed,
        usageRate: totalIssued > 0 ? ((totalUsed / totalIssued) * 100).toFixed(1) + '%' : '0%',
        dailyAnalytics: analytics
    };
}
async function getMarketingSummary(storeId) {
    const [campaigns, coupons, members, activeMembers] = await Promise.all([
        database_1.default.campaign.count({ where: { storeId } }),
        database_1.default.coupon.count({ where: { storeId } }),
        database_1.default.member.count({ where: { storeId } }),
        database_1.default.member.count({ where: { storeId, status: 'active' } })
    ]);
    return {
        totalCampaigns: campaigns,
        totalCoupons: coupons,
        totalMembers: members,
        activeMembers,
        conversionRate: members > 0 ? ((activeMembers / members) * 100).toFixed(1) + '%' : '0%'
    };
}
async function trackCampaignImpression(campaignId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await database_1.default.campaignAnalytics.findFirst({
        where: { campaignId, date: today }
    });
    if (existing) {
        return database_1.default.campaignAnalytics.update({
            where: { id: existing.id },
            data: { impressions: { increment: 1 } }
        });
    }
    else {
        return database_1.default.campaignAnalytics.create({
            data: { campaignId, date: today, impressions: 1 }
        });
    }
}
//# sourceMappingURL=MarketingAnalyticsService.js.map