"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopeeAdapter = exports.GoFoodAdapter = exports.GrabFoodAdapter = void 0;
exports.getDeliveryOrders = getDeliveryOrders;
exports.getDeliveryOrder = getDeliveryOrder;
exports.createDeliveryOrder = createDeliveryOrder;
exports.updateDeliveryStatus = updateDeliveryStatus;
exports.confirmDeliveryOrder = confirmDeliveryOrder;
exports.startPreparing = startPreparing;
exports.markReady = markReady;
exports.cancelDeliveryOrder = cancelDeliveryOrder;
exports.getDeliveryStats = getDeliveryStats;
exports.getUnifiedOrderInbox = getUnifiedOrderInbox;
const database_1 = __importDefault(require("../config/database"));
// Get all delivery orders for a store
async function getDeliveryOrders(storeId, filters) {
    const where = { storeId };
    if (filters?.platform)
        where.platform = filters.platform;
    if (filters?.status)
        where.status = filters.status;
    if (filters?.date) {
        const startOfDay = new Date(filters.date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filters.date);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt = { gte: startOfDay, lte: endOfDay };
    }
    const orders = await database_1.default.config.findMany({
        where: {
            storeId,
            category: 'delivery_orders'
        }
    });
    return orders
        .map(o => JSON.parse(o.value))
        .filter(o => !filters?.platform || o.platform === filters.platform)
        .filter(o => !filters?.status || o.status === filters.status)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
// Get single delivery order
async function getDeliveryOrder(orderId) {
    const order = await database_1.default.config.findFirst({
        where: {
            id: orderId,
            category: 'delivery_orders'
        }
    });
    return order ? JSON.parse(order.value) : null;
}
// Create delivery order (from platform webhook or manual)
async function createDeliveryOrder(data) {
    const orderId = `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const order = {
        ...data,
        id: orderId,
        status: 'new',
        createdAt: new Date()
    };
    await database_1.default.config.create({
        data: {
            storeId: data.storeId,
            category: 'delivery_orders',
            key: orderId,
            value: JSON.stringify(order)
        }
    });
    return order;
}
// Update delivery order status
async function updateDeliveryStatus(orderId, status, estimatedReadyTime) {
    const order = await database_1.default.config.findFirst({
        where: {
            id: orderId,
            category: 'delivery_orders'
        }
    });
    if (!order) {
        throw new Error('Delivery order not found');
    }
    const orderData = JSON.parse(order.value);
    orderData.status = status;
    if (estimatedReadyTime) {
        orderData.estimatedReadyTime = estimatedReadyTime;
    }
    await database_1.default.config.update({
        where: { id: orderId },
        data: {
            key: orderId,
            value: JSON.stringify(orderData)
        }
    });
    return orderData;
}
// Confirm delivery order
async function confirmDeliveryOrder(orderId, estimatedReadyTime) {
    return updateDeliveryStatus(orderId, 'confirmed', estimatedReadyTime);
}
// Start preparing
async function startPreparing(orderId) {
    return updateDeliveryStatus(orderId, 'preparing');
}
// Mark ready for pickup
async function markReady(orderId) {
    return updateDeliveryStatus(orderId, 'ready');
}
// Cancel delivery order
async function cancelDeliveryOrder(orderId, reason) {
    return updateDeliveryStatus(orderId, 'cancelled');
}
// Get delivery statistics
async function getDeliveryStats(storeId, date) {
    const orders = await getDeliveryOrders(storeId, { date });
    const summary = {
        total: orders.length,
        new: orders.filter(o => o.status === 'new').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        ready: orders.filter(o => o.status === 'ready').length,
        completed: orders.filter(o => ['picked_up', 'delivered'].includes(o.status)).length,
        cancelled: orders.filter(o => o.status === 'cancelled').length,
        totalRevenue: orders
            .filter(o => !['cancelled', 'refunded'].includes(o.status))
            .reduce((sum, o) => sum + o.finalAmount, 0),
        byPlatform: {
            grabfood: orders.filter(o => o.platform === 'grabfood').length,
            gofood: orders.filter(o => o.platform === 'gofood').length,
            shopee: orders.filter(o => o.platform === 'shopee').length,
            direct: orders.filter(o => o.platform === 'direct').length
        }
    };
    return summary;
}
// Mock GrabFood adapter
class GrabFoodAdapter {
    apiKey;
    storeId;
    constructor(apiKey, storeId) {
        this.apiKey = apiKey;
        this.storeId = storeId;
    }
    async fetchOrders() {
        // In production, this would call GrabFood API
        // For now, return empty array (mock)
        return [];
    }
    async confirmOrder(orderId) {
        // In production, call GrabFood API to confirm
        return true;
    }
    async updateStatus(orderId, status) {
        // In production, call GrabFood API to update status
        return true;
    }
    async syncMenu(products) {
        // In production, call GrabFood API to sync menu
        return true;
    }
}
exports.GrabFoodAdapter = GrabFoodAdapter;
// Mock GoFood adapter
class GoFoodAdapter {
    apiKey;
    storeId;
    constructor(apiKey, storeId) {
        this.apiKey = apiKey;
        this.storeId = storeId;
    }
    async fetchOrders() {
        return [];
    }
    async confirmOrder(orderId) {
        return true;
    }
    async updateStatus(orderId, status) {
        return true;
    }
    async syncMenu(products) {
        return true;
    }
}
exports.GoFoodAdapter = GoFoodAdapter;
// Mock ShopeeFood adapter
class ShopeeAdapter {
    apiKey;
    storeId;
    constructor(apiKey, storeId) {
        this.apiKey = apiKey;
        this.storeId = storeId;
    }
    async fetchOrders() {
        return [];
    }
    async confirmOrder(orderId) {
        return true;
    }
    async updateStatus(orderId, status) {
        return true;
    }
    async syncMenu(products) {
        return true;
    }
}
exports.ShopeeAdapter = ShopeeAdapter;
// Unified order inbox - aggregates all platforms
async function getUnifiedOrderInbox(storeId) {
    const [deliveryOrders, posOrders] = await Promise.all([
        getDeliveryOrders(storeId),
        database_1.default.order.findMany({
            where: {
                storeId,
                createdAt: {
                    gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // Last 2 hours
                },
                status: { in: ['pending', 'preparing', 'ready'] }
            }
        })
    ]);
    // Transform POS orders to unified format
    const unifiedPosOrders = posOrders.map(o => ({
        id: `POS-${o.id}`,
        platform: 'direct',
        platformOrderId: o.orderNumber,
        items: [],
        subtotal: o.totalAmount,
        deliveryFee: 0,
        platformFee: 0,
        finalAmount: o.finalAmount,
        customerName: 'Unknown',
        customerPhone: '',
        status: mapPosStatusToDelivery(o.status),
        createdAt: o.createdAt
    }));
    // Combine and sort by creation time
    const allOrders = [
        ...deliveryOrders.map(d => ({ ...d, type: 'delivery' })),
        ...unifiedPosOrders.map(p => ({ ...p, type: 'pos' }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
        orders: allOrders,
        summary: {
            pending: allOrders.filter(o => o.status === 'new').length,
            preparing: allOrders.filter(o => o.status === 'preparing').length,
            ready: allOrders.filter(o => o.status === 'ready').length,
            totalRevenue: allOrders
                .filter(o => !['cancelled', 'refunded'].includes(o.status))
                .reduce((sum, o) => sum + o.finalAmount, 0)
        }
    };
}
function mapPosStatusToDelivery(status) {
    const mapping = {
        pending: 'new',
        preparing: 'preparing',
        ready: 'ready',
        completed: 'delivered'
    };
    return mapping[status] || 'new';
}
//# sourceMappingURL=DeliveryService.js.map