"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketingChannelWithStats = getMarketingChannelWithStats;
exports.getAllMarketingChannelsWithStats = getAllMarketingChannelsWithStats;
exports.getMarketingChannelSummary = getMarketingChannelSummary;
exports.getMembersByChannel = getMembersByChannel;
exports.getChannelAttributionReport = getChannelAttributionReport;
const database_1 = __importDefault(require("../config/database"));
// Get marketing channel with statistics
async function getMarketingChannelWithStats(channelId, dateRange) {
    const channel = await database_1.default.marketingChannel.findUnique({
        where: { id: channelId },
        include: {
            _count: {
                select: {
                    members: true,
                    memberChannels: true
                }
            }
        }
    });
    if (!channel)
        return null;
    // Build where clause for orders based on date range
    const orderWhereClause = {};
    if (dateRange?.startDate) {
        orderWhereClause.createdAt = { gte: dateRange.startDate };
    }
    if (dateRange?.endDate) {
        orderWhereClause.createdAt = { ...orderWhereClause.createdAt, lte: dateRange.endDate };
    }
    // Get member IDs for this channel
    const memberChannels = await database_1.default.memberChannel.findMany({
        where: { channelId },
        select: { memberId: true }
    });
    const memberIds = memberChannels.map(mc => mc.memberId);
    // Get orders from members attributed to this channel
    const orders = await database_1.default.order.findMany({
        where: {
            memberId: { in: memberIds },
            ...orderWhereClause
        },
        include: { items: true }
    });
    const orderCount = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const totalCost = orders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + (item.bomCost || 0), 0), 0);
    const netRevenue = totalRevenue - (totalRevenue * channel.commission);
    return {
        ...channel,
        stats: {
            orderCount,
            totalRevenue,
            totalCost,
            netRevenue,
            memberCount: channel._count.members
        }
    };
}
// Get all marketing channels with statistics
async function getAllMarketingChannelsWithStats(storeId, dateRange) {
    const channels = await database_1.default.marketingChannel.findMany({
        where: { storeId },
        orderBy: { sortOrder: 'asc' },
        include: {
            _count: {
                select: {
                    members: true,
                    memberChannels: true
                }
            }
        }
    });
    const results = [];
    for (const channel of channels) {
        const memberChannels = await database_1.default.memberChannel.findMany({
            where: { channelId: channel.id },
            select: { memberId: true }
        });
        const memberIds = memberChannels.map(mc => mc.memberId);
        // Build where clause for orders
        const orderWhereClause = { memberId: { in: memberIds } };
        if (dateRange?.startDate) {
            orderWhereClause.createdAt = { gte: dateRange.startDate };
        }
        if (dateRange?.endDate) {
            orderWhereClause.createdAt = { lte: dateRange.endDate };
        }
        const orders = await database_1.default.order.findMany({
            where: orderWhereClause,
            include: { items: true }
        });
        const orderCount = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0);
        const totalCost = orders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + (item.bomCost || 0), 0), 0);
        const netRevenue = totalRevenue - (totalRevenue * channel.commission);
        results.push({
            ...channel,
            stats: {
                orderCount,
                totalRevenue,
                totalCost,
                netRevenue,
                memberCount: channel._count.members
            }
        });
    }
    return results;
}
// Get summary statistics for all channels
async function getMarketingChannelSummary(storeId, dateRange) {
    const channels = await database_1.default.marketingChannel.findMany({
        where: { storeId },
        select: { id: true, name: true, code: true, type: true, status: true }
    });
    let totalMembers = 0;
    for (const channel of channels) {
        const memberChannels = await database_1.default.memberChannel.findMany({
            where: { channelId: channel.id },
            select: { memberId: true }
        });
        totalMembers += memberChannels.length;
    }
    return {
        totalChannels: channels.length,
        activeChannels: channels.filter(c => c.status === 'active').length,
        totalMembers
        // Note: totalOrders, totalRevenue, totalCommission require direct order-channel linkage
        // which is not yet implemented. Orders link to Channel (operational), not MarketingChannel.
    };
}
// Get members by channel
async function getMembersByChannel(channelId, options) {
    const { page = 1, pageSize = 50, status } = options || {};
    const whereClause = { channelId };
    if (status) {
        whereClause.member = { status };
    }
    const [memberChannels, total] = await Promise.all([
        database_1.default.memberChannel.findMany({
            where: whereClause,
            include: {
                member: true
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        database_1.default.memberChannel.count({ where: whereClause })
    ]);
    return {
        list: memberChannels.map(mc => ({
            id: mc.id,
            memberId: mc.member.id,
            memberName: mc.member.name,
            memberPhone: mc.member.phone,
            memberStatus: mc.member.status,
            firstOrderId: mc.firstOrderId,
            createdAt: mc.createdAt
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}
// Attribution report: how members discovered the store
async function getChannelAttributionReport(storeId, dateRange) {
    const channels = await database_1.default.marketingChannel.findMany({
        where: { storeId },
        include: {
            _count: {
                select: {
                    members: true,
                    memberChannels: true
                }
            }
        }
    });
    const totalMembers = await database_1.default.member.count({
        where: { storeId }
    });
    return channels.map(ch => ({
        channelId: ch.id,
        channelName: ch.name,
        channelCode: ch.code,
        channelType: ch.type,
        memberCount: ch._count.members,
        percentage: totalMembers > 0 ? ((ch._count.members / totalMembers) * 100).toFixed(1) : '0'
    }));
}
//# sourceMappingURL=MarketingChannelService.js.map