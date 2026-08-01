"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInventory = getInventory;
exports.getInventoryById = getInventoryById;
exports.stockIn = stockIn;
exports.stockOut = stockOut;
exports.getLowStockAlerts = getLowStockAlerts;
exports.adjustInventory = adjustInventory;
exports.getInventoryStats = getInventoryStats;
exports.getStockInLogs = getStockInLogs;
exports.getStockOutLogs = getStockOutLogs;
exports.createInventory = createInventory;
exports.updateInventory = updateInventory;
exports.deleteInventory = deleteInventory;
exports.getBatches = getBatches;
exports.getExpiringBatches = getExpiringBatches;
exports.getConsumptionAnalysis = getConsumptionAnalysis;
exports.getAnomalySummary = getAnomalySummary;
const database_1 = __importDefault(require("../config/database"));
// ============================================
// BigInt 序列化辅助函数
// ============================================
function serializeBigInt(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj === 'bigint')
        return Number(obj);
    if (Array.isArray(obj))
        return obj.map(serializeBigInt);
    if (typeof obj === 'object') {
        const result = {};
        for (const key of Object.keys(obj)) {
            result[key] = serializeBigInt(obj[key]);
        }
        return result;
    }
    return obj;
}
// Get inventory items with filtering
async function getInventory(filter) {
    const where = {};
    if (filter.storeId)
        where.storeId = filter.storeId;
    if (filter.categoryId)
        where.category = filter.categoryId;
    if (filter.search) {
        where.OR = [
            { name: { contains: filter.search, mode: 'insensitive' } }
        ];
    }
    // Low stock filter based on safetyStock
    const items = await database_1.default.inventory.findMany({
        where,
        orderBy: { name: 'asc' }
    });
    // Filter low stock using safetyStock threshold
    if (filter.lowStock) {
        return serializeBigInt(items.filter(item => item.currentStock <= item.safetyStock));
    }
    return serializeBigInt(items);
}
// Get single inventory item
async function getInventoryById(inventoryId) {
    const result = await database_1.default.inventory.findUnique({
        where: { id: inventoryId },
        include: {
            stockInLogs: {
                orderBy: { createdAt: 'desc' },
                take: 20
            },
            stockOutLogs: {
                orderBy: { createdAt: 'desc' },
                take: 20
            }
        }
    });
    return serializeBigInt(result);
}
// Stock in operation
async function stockIn(data) {
    const { inventoryId, storeId, quantity, unitCost, note, staffId, supplierId } = data;
    return database_1.default.$transaction(async (tx) => {
        // Get current inventory
        const inventory = await tx.inventory.findUnique({
            where: { id: inventoryId }
        });
        if (!inventory) {
            throw new Error('Inventory not found');
        }
        // Calculate new average cost only if unitCost is provided and positive
        const avgCost = Number(inventory.avgCost);
        let newAvgCost = avgCost;
        if (unitCost && unitCost > 0) {
            const totalCurrentValue = avgCost * inventory.currentStock;
            const totalNewValue = unitCost * quantity;
            newAvgCost = Math.round((totalCurrentValue + totalNewValue) / (inventory.currentStock + quantity));
        }
        // Update inventory
        const updated = await tx.inventory.update({
            where: { id: inventoryId },
            data: {
                currentStock: { increment: quantity },
                avgCost: newAvgCost
            }
        });
        // Create stock in log
        await tx.stockInLog.create({
            data: {
                inventoryId,
                quantity,
                unitCost: unitCost || 0,
                totalAmount: (unitCost || 0) * quantity,
                supplierId,
                staffId,
                note
            }
        });
        return updated;
    });
}
// Stock out operation
async function stockOut(data) {
    const { inventoryId, storeId, quantity, reason, note, staffId, orderId } = data;
    return database_1.default.$transaction(async (tx) => {
        // Get current inventory
        const inventory = await tx.inventory.findUnique({
            where: { id: inventoryId }
        });
        if (!inventory) {
            throw new Error('Inventory not found');
        }
        if (inventory.currentStock < quantity) {
            throw new Error('Insufficient stock');
        }
        // Update inventory
        const updated = await tx.inventory.update({
            where: { id: inventoryId },
            data: {
                currentStock: { decrement: quantity }
            }
        });
        // Create stock out log
        await tx.stockOutLog.create({
            data: {
                inventoryId,
                quantity,
                reason,
                note,
                orderId
            }
        });
        return updated;
    });
}
// Get low stock alerts (using safetyStock as threshold)
async function getLowStockAlerts(storeId) {
    const inventory = await database_1.default.inventory.findMany({
        where: { storeId }
    });
    return inventory
        .filter(item => item.currentStock <= item.safetyStock)
        .map(item => ({
        id: item.id,
        name: item.name,
        currentStock: item.currentStock,
        safetyStock: item.safetyStock,
        avgCost: item.avgCost,
        category: item.category,
        unit: item.unit,
        shortage: item.safetyStock - item.currentStock,
        estimatedRestockCost: Math.round((item.safetyStock - item.currentStock) * Number(item.avgCost))
    }))
        .sort((a, b) => a.shortage - b.shortage);
}
// Adjust inventory (for inventory count correction)
async function adjustInventory(inventoryId, newStock, reason, staffId) {
    return database_1.default.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({
            where: { id: inventoryId }
        });
        if (!inventory) {
            throw new Error('Inventory not found');
        }
        const difference = newStock - inventory.currentStock;
        // Update stock
        const updated = await tx.inventory.update({
            where: { id: inventoryId },
            data: {
                currentStock: newStock
            }
        });
        // Create appropriate log
        if (difference > 0) {
            await tx.stockInLog.create({
                data: {
                    inventoryId,
                    quantity: difference,
                    unitCost: Number(inventory.avgCost),
                    totalAmount: difference * Number(inventory.avgCost),
                    note: `Adjustment: ${reason}`
                }
            });
        }
        else {
            await tx.stockOutLog.create({
                data: {
                    inventoryId,
                    quantity: Math.abs(difference),
                    reason: 'adjust',
                    note: `Adjustment: ${reason}`
                }
            });
        }
        return updated;
    });
}
// Get inventory statistics
async function getInventoryStats(storeId) {
    const items = await database_1.default.inventory.findMany({
        where: { storeId }
    });
    const total = items.length;
    const lowStock = items.filter(i => i.currentStock > 0 && i.currentStock <= i.minStock).length;
    const outOfStock = items.filter(i => i.currentStock === 0).length;
    const totalValue = items.reduce((sum, i) => sum + Math.round(i.currentStock * Number(i.avgCost)), 0);
    const totalItems = items.reduce((sum, i) => sum + i.currentStock, 0);
    return { total, lowStock, outOfStock, totalValue, totalItems };
}
// Get stock in logs
async function getStockInLogs(storeId, inventoryId) {
    const where = {};
    if (inventoryId)
        where.inventoryId = inventoryId;
    const logs = await database_1.default.stockInLog.findMany({
        where,
        include: {
            inventory: { select: { id: true, name: true, unit: true } },
            supplier: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });
    return logs;
}
// Get stock out logs
async function getStockOutLogs(storeId, inventoryId) {
    const where = {};
    if (inventoryId)
        where.inventoryId = inventoryId;
    const logs = await database_1.default.stockOutLog.findMany({
        where,
        include: {
            inventory: { select: { id: true, name: true, unit: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    });
    return logs;
}
// Create inventory item
async function createInventory(data) {
    const result = await database_1.default.inventory.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            category: data.category,
            unit: data.unit,
            avgCost: data.avgCost || 0,
            minStock: data.minStock || 0,
            maxStock: data.maxStock || 0,
            safetyStock: data.safetyStock || 0,
            shelfLife: data.shelfLife || 0,
            concentrateRatio: data.concentrateRatio || 1
        }
    });
    return serializeBigInt(result);
}
// Update inventory item
async function updateInventory(inventoryId, data) {
    const result = await database_1.default.inventory.update({
        where: { id: inventoryId },
        data
    });
    return serializeBigInt(result);
}
// Delete inventory item
async function deleteInventory(inventoryId) {
    // Delete in a transaction to handle foreign key constraints
    return database_1.default.$transaction(async (tx) => {
        // Delete related records first
        await tx.stockInLog.deleteMany({ where: { inventoryId } });
        await tx.stockOutLog.deleteMany({ where: { inventoryId } });
        await tx.batch.deleteMany({ where: { inventoryId } });
        await tx.bOMItem.deleteMany({ where: { inventoryId } });
        await tx.inventoryCountItem.deleteMany({ where: { inventoryId } });
        await tx.processRecipeItem.deleteMany({ where: { inventoryId } });
        // Now delete the inventory item
        return tx.inventory.delete({
            where: { id: inventoryId }
        });
    });
}
// Get batch list
async function getBatches(storeId, inventoryId) {
    const where = { inventoryId };
    if (inventoryId)
        where.inventoryId = inventoryId;
    return database_1.default.batch.findMany({
        where,
        include: {
            inventory: { select: { id: true, name: true, unit: true } }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Get expiring batches (for shelf life alerts)
async function getExpiringBatches(storeId, daysAhead = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
    const inventory = await database_1.default.inventory.findMany({
        where: { storeId, shelfLife: { gt: 0 } }
    });
    const expiringBatches = [];
    for (const inv of inventory) {
        const batches = await database_1.default.batch.findMany({
            where: {
                inventoryId: inv.id,
                status: 'active',
                expiryDate: { lte: cutoffDate }
            },
            include: {
                inventory: { select: { id: true, name: true, unit: true, shelfLife: true } }
            }
        });
        expiringBatches.push(...batches);
    }
    return expiringBatches.sort((a, b) => (a.expiryDate?.getTime() || 0) - (b.expiryDate?.getTime() || 0));
}
/**
 * 分析库存异常：理论消耗 vs 实际消耗
 *
 * 理论消耗 = SUM(BOM用量 × 订单数量) for each material
 * 实际消耗 = SUM(StockOutLog.quantity) for each material
 *
 * 如果 variancePercent > varianceThreshold，标记为异常
 */
async function getConsumptionAnalysis(filter) {
    const { storeId, startDate, endDate, varianceThreshold = 10, // 默认10%阈值
    category } = filter;
    // 获取时间范围内的订单
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            },
            status: { in: ['completed', 'refunded'] }
        },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            bomItems: {
                                include: {
                                    inventory: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    // 计算每个库存物料的理论消耗和实际消耗
    const consumptionMap = new Map();
    // 计算理论消耗
    for (const order of orders) {
        for (const item of order.items) {
            const product = item.product;
            const orderQty = item.quantity;
            for (const bomItem of product.bomItems) {
                const invId = bomItem.inventoryId;
                const theoreticalQty = bomItem.quantity * orderQty;
                const existing = consumptionMap.get(invId) || {
                    theoretical: 0,
                    actual: 0,
                    orderCount: 0,
                    lastOrderDate: null,
                    inventoryName: bomItem.inventory.name,
                    unit: bomItem.inventory.unit,
                    category: bomItem.inventory.category
                };
                existing.theoretical += theoreticalQty;
                existing.orderCount += 1;
                if (!existing.lastOrderDate || order.createdAt > new Date(existing.lastOrderDate)) {
                    existing.lastOrderDate = order.createdAt.toISOString();
                }
                consumptionMap.set(invId, existing);
            }
        }
    }
    // 获取实际消耗（从StockOutLog）
    const stockOutLogs = await database_1.default.stockOutLog.findMany({
        where: {
            inventory: { storeId },
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            },
            reason: { in: ['sold', 'adjust'] }
        },
        include: { inventory: true }
    });
    //累加实际消耗
    for (const log of stockOutLogs) {
        const existing = consumptionMap.get(log.inventoryId) || {
            theoretical: 0,
            actual: 0,
            orderCount: 0,
            lastOrderDate: null,
            inventoryName: log.inventory?.name || 'Unknown',
            unit: log.inventory?.unit || '',
            category: log.inventory?.category || ''
        };
        existing.actual += log.quantity;
        consumptionMap.set(log.inventoryId, existing);
    }
    // 计算差异并标记状态
    const analysisResults = [];
    for (const [inventoryId, data] of consumptionMap) {
        // 跳过没有实际消耗也没有理论消耗的
        if (data.theoretical === 0 && data.actual === 0)
            continue;
        // 如果设定了分类过滤，跳过不匹配的
        if (category && data.category !== category)
            continue;
        const variance = data.actual - data.theoretical;
        const variancePercent = data.theoretical > 0
            ? (Math.abs(variance) / data.theoretical) * 100
            : (data.actual > 0 ? 100 : 0);
        // 判断状态
        let varianceStatus = 'normal';
        if (data.theoretical > 0) {
            if (variancePercent > varianceThreshold * 2) {
                varianceStatus = 'critical';
            }
            else if (variancePercent > varianceThreshold) {
                varianceStatus = 'warning';
            }
        }
        else if (data.actual > 0) {
            varianceStatus = 'critical'; // 有实际消耗但没有理论消耗（可能BOM未配置）
        }
        analysisResults.push({
            inventoryId,
            inventoryName: data.inventoryName,
            unit: data.unit,
            theoreticalConsumption: Math.round(data.theoretical * 100) / 100,
            actualConsumption: Math.round(data.actual * 100) / 100,
            variance: Math.round(variance * 100) / 100,
            variancePercent: Math.round(variancePercent * 10) / 10,
            varianceStatus,
            orderCount: data.orderCount,
            lastOrderDate: data.lastOrderDate
        });
    }
    // 按差异百分比降序排列，异常的排在前面
    return analysisResults.sort((a, b) => b.variancePercent - a.variancePercent);
}
// 获取异常预警汇总
async function getAnomalySummary(filter) {
    const analysis = await getConsumptionAnalysis(filter);
    const summary = {
        total: analysis.length,
        normal: analysis.filter(a => a.varianceStatus === 'normal').length,
        warning: analysis.filter(a => a.varianceStatus === 'warning').length,
        critical: analysis.filter(a => a.varianceStatus === 'critical').length,
        criticalItems: analysis.filter(a => a.varianceStatus === 'critical')
    };
    return summary;
}
//# sourceMappingURL=InventoryService.js.map