"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRevenueByChannel = getRevenueByChannel;
exports.getRevenueSummary = getRevenueSummary;
exports.compareRevenue = compareRevenue;
exports.getDailyRevenue = getDailyRevenue;
const database_1 = __importDefault(require("../config/database"));
const date_fns_1 = require("date-fns");
// Channel revenue by date range
async function getRevenueByChannel(storeId, startDate, endDate) {
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            status: { in: ['completed', 'paid'] },
            createdAt: {
                gte: startDate,
                lte: endDate
            }
        },
        include: { channel: true }
    });
    // Group by channel
    const channelMap = {};
    for (const order of orders) {
        const channelName = order.channel?.name || order.channelId || 'POS';
        if (!channelMap[channelName]) {
            channelMap[channelName] = { revenue: 0, orders: 0 };
        }
        channelMap[channelName].revenue += order.totalAmount || 0;
        channelMap[channelName].orders += 1;
    }
    return Object.entries(channelMap).map(([channel, data]) => ({
        channel,
        revenue: data.revenue,
        orders: data.orders,
        avgOrderValue: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0
    }));
}
// Get revenue summary by time period
async function getRevenueSummary(storeId, startDate, endDate) {
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            status: { in: ['completed', 'paid'] },
            createdAt: {
                gte: startDate,
                lte: endDate
            }
        }
    });
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    return {
        revenue: totalRevenue,
        orders: totalOrders,
        avgOrderValue
    };
}
// Compare revenue between two periods
async function compareRevenue(storeId, currentStart, currentEnd, previousStart, previousEnd) {
    const [current, previous] = await Promise.all([
        getRevenueSummary(storeId, currentStart, currentEnd),
        getRevenueSummary(storeId, previousStart, previousEnd)
    ]);
    const revenueChange = previous.revenue > 0
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;
    const ordersChange = previous.orders > 0
        ? ((current.orders - previous.orders) / previous.orders) * 100
        : 0;
    return {
        current,
        previous,
        revenueChange: Math.round(revenueChange * 10) / 10,
        ordersChange: Math.round(ordersChange * 10) / 10
    };
}
// Get daily revenue trend
async function getDailyRevenue(storeId, startDate, endDate) {
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            status: { in: ['completed', 'paid'] },
            createdAt: {
                gte: startDate,
                lte: endDate
            }
        }
    });
    // Group by date
    const dailyMap = {};
    for (const order of orders) {
        const dateStr = (0, date_fns_1.format)(order.createdAt, 'yyyy-MM-dd');
        if (!dailyMap[dateStr]) {
            dailyMap[dateStr] = { revenue: 0, orders: 0 };
        }
        dailyMap[dateStr].revenue += order.totalAmount || 0;
        dailyMap[dateStr].orders += 1;
    }
    return Object.entries(dailyMap)
        .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
        avgOrderValue: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0
    }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
//# sourceMappingURL=RevenueService.js.map