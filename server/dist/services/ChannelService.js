"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannelWithStats = getChannelWithStats;
exports.getChannelOrders = getChannelOrders;
exports.getAllChannelsWithStats = getAllChannelsWithStats;
exports.getCommissionSummary = getCommissionSummary;
exports.getChannelPriceList = getChannelPriceList;
exports.bulkUpdateChannelPrices = bulkUpdateChannelPrices;
exports.applyChannelPriceAdjustment = applyChannelPriceAdjustment;
const database_1 = __importDefault(require("../config/database"));
// Get channel with statistics for a date range
async function getChannelWithStats(channelId, dateRange) {
    const channel = await database_1.default.channel.findUnique({
        where: { id: channelId }
    });
    if (!channel)
        return null;
    const whereClause = { channelId };
    if (dateRange?.startDate) {
        whereClause.createdAt = { ...whereClause.createdAt, gte: dateRange.startDate };
    }
    if (dateRange?.endDate) {
        whereClause.createdAt = { ...whereClause.createdAt, lte: dateRange.endDate };
    }
    const orders = await database_1.default.order.findMany({
        where: whereClause,
        include: {
            items: true
        }
    });
    const orderCount = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const totalCost = orders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.bomCost, 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const commission = totalRevenue * channel.commission;
    const netRevenue = totalRevenue - commission;
    return {
        channel,
        orderCount,
        totalRevenue,
        totalCost,
        totalProfit,
        avgOrderValue,
        commission,
        netRevenue
    };
}
// Get orders for a specific channel
async function getChannelOrders(channelId, params) {
    const { storeId, status, startDate, endDate, page = 1, pageSize = 50 } = params;
    const where = { channelId };
    if (storeId)
        where.storeId = storeId;
    if (status)
        where.status = status;
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate)
            where.createdAt.gte = startDate;
        if (endDate)
            where.createdAt.lte = endDate;
    }
    const [orders, total] = await Promise.all([
        database_1.default.order.findMany({
            where,
            include: {
                channel: true,
                member: true,
                items: {
                    include: {
                        product: true,
                        spec: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize
        }),
        database_1.default.order.count({ where })
    ]);
    return {
        list: orders,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}
// Get all channels with statistics
async function getAllChannelsWithStats(storeId, dateRange) {
    const channels = await database_1.default.channel.findMany({
        where: { storeId },
        orderBy: { sortOrder: 'asc' }
    });
    const results = [];
    for (const channel of channels) {
        const stats = await getChannelWithStats(channel.id, dateRange);
        if (stats) {
            results.push(stats);
        }
    }
    return results;
}
// Calculate commission summary for all channels
async function getCommissionSummary(storeId, dateRange) {
    const channels = await database_1.default.channel.findMany({
        where: { storeId, commission: { gt: 0 } },
        orderBy: { sortOrder: 'asc' }
    });
    const summaries = [];
    for (const channel of channels) {
        const stats = await getChannelWithStats(channel.id, dateRange);
        if (stats && stats.orderCount > 0) {
            summaries.push({
                channelId: channel.id,
                channelName: channel.name,
                channelCode: channel.code,
                icon: channel.icon || '',
                commission: channel.commission,
                orderCount: stats.orderCount,
                grossRevenue: stats.totalRevenue,
                commissionAmount: stats.commission,
                netRevenue: stats.netRevenue
            });
        }
    }
    return summaries;
}
// Get channel price list with product details
async function getChannelPriceList(channelId) {
    const prices = await database_1.default.productChannelPrice.findMany({
        where: { channelId },
        include: {
            product: {
                include: {
                    specs: true,
                    category: true
                }
            }
        }
    });
    return prices.map(p => ({
        id: p.id,
        productId: p.productId,
        productName: p.product.name,
        productCode: p.product.code,
        category: p.product.category?.name,
        basePrice: p.product.specs.find(s => s.isDefault)?.price || p.product.specs[0]?.price || 0,
        priceAdjustment: p.priceAdjustment,
        finalPrice: Math.round((p.product.specs.find(s => s.isDefault)?.price || 0) * p.priceAdjustment),
        enabled: p.enabled
    }));
}
// Bulk update channel prices
async function bulkUpdateChannelPrices(channelId, updates) {
    const results = [];
    for (const update of updates) {
        const result = await database_1.default.productChannelPrice.upsert({
            where: {
                productId_channelId: {
                    productId: update.productId,
                    channelId
                }
            },
            create: {
                productId: update.productId,
                channelId,
                priceAdjustment: update.priceAdjustment,
                enabled: update.enabled
            },
            update: {
                priceAdjustment: update.priceAdjustment,
                enabled: update.enabled
            }
        });
        results.push(result);
    }
    return results;
}
// Apply percentage adjustment to all products in a channel
async function applyChannelPriceAdjustment(channelId, adjustmentPercent, enabled = true) {
    const products = await database_1.default.product.findMany({
        where: { status: 'active' },
        include: { specs: true }
    });
    const adjustment = adjustmentPercent / 100;
    const results = [];
    for (const product of products) {
        const defaultSpec = product.specs?.find((s) => s.isDefault) || product.specs?.[0];
        if (!defaultSpec)
            continue;
        const basePrice = defaultSpec.price || 0;
        const newAdjustment = 1 + adjustment;
        const result = await database_1.default.productChannelPrice.upsert({
            where: {
                productId_channelId: {
                    productId: product.id,
                    channelId
                }
            },
            create: {
                productId: product.id,
                channelId,
                priceAdjustment: newAdjustment,
                enabled
            },
            update: {
                priceAdjustment: newAdjustment,
                enabled
            }
        });
        results.push(result);
    }
    return results;
}
//# sourceMappingURL=ChannelService.js.map