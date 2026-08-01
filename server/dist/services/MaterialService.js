"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVENTORY_CATEGORIES = exports.INVENTORY_TYPE_LABELS = exports.INVENTORY_TYPES = void 0;
exports.getInventoryList = getInventoryList;
exports.getInventoryDetail = getInventoryDetail;
exports.createInventory = createInventory;
exports.updateInventory = updateInventory;
exports.checkLowStockAlerts = checkLowStockAlerts;
exports.checkExpiryAlerts = checkExpiryAlerts;
exports.calculateRestockSuggestions = calculateRestockSuggestions;
exports.executeProcessing = executeProcessing;
exports.getProcessingHistory = getProcessingHistory;
exports.getProcessingLogDetail = getProcessingLogDetail;
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
// ============================================
// 原料分类类型
// ============================================
exports.INVENTORY_TYPES = {
    RAW_MATERIAL: 'raw_material', // 原料(毛料) - 直接采购使用
    SEMI_FINISHED: 'semi_finished', // 加工原料(半成品) - 需要加工
    FINISHED_GOODS: 'finished_goods' // 成品 - 直接销售
};
exports.INVENTORY_TYPE_LABELS = {
    [exports.INVENTORY_TYPES.RAW_MATERIAL]: '原料(毛料)',
    [exports.INVENTORY_TYPES.SEMI_FINISHED]: '加工原料(半成品)',
    [exports.INVENTORY_TYPES.FINISHED_GOODS]: '成品'
};
exports.INVENTORY_CATEGORIES = {
    TEA: '茶叶',
    MILK: '奶类',
    SUGAR: '糖类',
    TOPPING: '小料',
    SYRUP: '调味糖浆',
    SUPPLIES: '耗材',
    OTHER: '其他'
};
// ============================================
// 获取原料列表（带分类筛选）
// ============================================
async function getInventoryList(storeId, type) {
    const where = { storeId };
    if (type)
        where.type = type;
    const result = await database_1.default.inventory.findMany({
        where,
        orderBy: [
            { category: 'asc' },
            { name: 'asc' }
        ]
    });
    return serializeBigInt(result);
}
// ============================================
// 获取单个原料详情（含批次）
// ============================================
async function getInventoryDetail(id) {
    const result = await database_1.default.inventory.findUnique({
        where: { id },
        include: {
            batches: {
                where: { status: 'active' },
                orderBy: { expiryDate: 'asc' }
            }
        }
    });
    return serializeBigInt(result);
}
// ============================================
// 创建原料
// ============================================
async function createInventory(data) {
    return database_1.default.inventory.create({
        data: {
            storeId: data.storeId,
            name: data.name,
            category: data.category,
            type: data.type || 'raw_material',
            unit: data.unit,
            avgCost: data.avgCost || 0,
            concentrateRatio: data.concentrateRatio || 1,
            safetyStock: data.safetyStock || 0,
            minStock: data.minStock || 0,
            maxStock: data.maxStock || 0,
            shelfLife: data.shelfLife || 0,
            processRecipeId: data.processRecipeId || null
        }
    });
}
// ============================================
// 更新原料
// ============================================
async function updateInventory(id, data) {
    return database_1.default.inventory.update({
        where: { id },
        data
    });
}
// ============================================
// 库存预警检查
// ============================================
async function checkLowStockAlerts(storeId) {
    const inventory = await database_1.default.inventory.findMany({
        where: { storeId }
    });
    return inventory.filter(inv => {
        if (inv.safetyStock > 0 && inv.currentStock <= inv.safetyStock) {
            return true;
        }
        if (inv.minStock > 0 && inv.currentStock <= inv.minStock) {
            return true;
        }
        return false;
    }).map(inv => ({
        id: inv.id,
        name: inv.name,
        category: inv.category,
        type: inv.type,
        unit: inv.unit,
        currentStock: inv.currentStock,
        safetyStock: inv.safetyStock,
        minStock: inv.minStock,
        avgCost: inv.avgCost
    }));
}
// ============================================
// 过期预警检查
// ============================================
async function checkExpiryAlerts(storeId, daysAhead = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysAhead);
    const batches = await database_1.default.batch.findMany({
        where: {
            inventory: { storeId },
            status: 'active',
            expiryDate: {
                lte: futureDate,
                gte: now
            }
        },
        include: {
            inventory: { select: { id: true, name: true, unit: true } }
        },
        orderBy: { expiryDate: 'asc' }
    });
    return batches.map(batch => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        inventoryId: batch.inventoryId,
        inventoryName: batch.inventory.name,
        quantity: batch.quantity,
        unit: batch.inventory.unit,
        expiryDate: batch.expiryDate,
        daysUntilExpiry: Math.ceil((new Date(batch.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }));
}
// ============================================
// 计算补货建议
// ============================================
async function calculateRestockSuggestions(storeId, daysAhead = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const orders = await database_1.default.order.findMany({
        where: {
            storeId,
            status: 'completed',
            createdAt: { gte: startDate }
        },
        include: { items: true }
    });
    if (orders.length === 0)
        return [];
    const productSales = {};
    for (const order of orders) {
        for (const item of order.items) {
            if (!productSales[item.productId]) {
                productSales[item.productId] = { productId: item.productId, quantity: 0 };
            }
            productSales[item.productId].quantity += item.quantity;
        }
    }
    const materialUsage = {};
    for (const sale of Object.values(productSales)) {
        const bomItems = await database_1.default.bOMItem.findMany({
            where: { productId: sale.productId },
            include: { inventory: true }
        });
        const dailyQty = sale.quantity / 30;
        for (const bom of bomItems) {
            const inv = bom.inventory;
            if (!inv)
                continue;
            const ratio = inv.concentrateRatio || 1;
            const safeRatio = ratio === 0 ? 1 : ratio;
            const itemUnit = bom.unit || inv.unit || '个';
            const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit);
            let usagePerProduct = bom.quantity * dailyQty;
            if (!isPerPiece) {
                usagePerProduct = usagePerProduct / safeRatio;
            }
            if (!materialUsage[inv.id]) {
                materialUsage[inv.id] = {
                    inventoryId: inv.id,
                    name: inv.name,
                    unit: inv.unit,
                    dailyUsage: 0
                };
            }
            materialUsage[inv.id].dailyUsage += usagePerProduct;
        }
    }
    const suggestions = [];
    for (const usage of Object.values(materialUsage)) {
        const inv = await database_1.default.inventory.findUnique({ where: { id: usage.inventoryId } });
        if (!inv)
            continue;
        const neededQty = usage.dailyUsage * daysAhead;
        const currentStock = inv.currentStock;
        if (currentStock < neededQty) {
            const suggestQty = Math.ceil(neededQty - currentStock);
            suggestions.push({
                inventoryId: inv.id,
                name: inv.name,
                category: inv.category,
                unit: inv.unit,
                currentStock: Math.round(currentStock * 100) / 100,
                dailyUsage: Math.round(usage.dailyUsage * 100) / 100,
                suggestQty,
                suggestCost: suggestQty * Number(inv.avgCost || 0)
            });
        }
    }
    return suggestions.sort((a, b) => b.suggestCost - a.suggestCost);
}
// ============================================
// 执行加工配方
// ============================================
async function executeProcessing(recipeId, staffId, multiplier = 1, note) {
    const recipe = await database_1.default.processRecipe.findUnique({
        where: { id: recipeId },
        include: {
            items: { include: { inventory: true } },
            store: { select: { id: true } },
            outputInventory: true // 产出半成品库存
        }
    });
    if (!recipe)
        throw new Error('Recipe not found');
    if (!recipe.outputInventory)
        throw new Error('Recipe has no output inventory configured');
    const inputItems = [];
    let totalInputCost = 0;
    // 计算投入成本
    for (const input of recipe.items.filter(i => i.type === 'input')) {
        const inv = input.inventory;
        if (!inv)
            continue;
        const deductQty = input.quantity * multiplier;
        const ratio = inv.concentrateRatio || 1;
        const safeRatio = ratio === 0 ? 1 : ratio;
        const itemUnit = (inv.unit || '个').toLowerCase();
        const isPerPiece = ['个', '支', '卷', 'pce', '件', '张'].includes(itemUnit);
        let unitCost = Number(inv.avgCost || 0);
        if (!isPerPiece) {
            // kg/L：先 ÷1000 转换为 g/ml，再 ÷concentrateRatio
            unitCost = unitCost / 1000 / safeRatio;
        }
        // 个/件等：直接使用，不需要转换
        const cost = Number(deductQty) * unitCost;
        totalInputCost += cost;
        inputItems.push({
            inventoryId: inv.id,
            name: inv.name,
            unit: itemUnit,
            quantity: deductQty,
            unitCost: Math.round(Number(unitCost)),
            cost: Math.round(Number(cost))
        });
    }
    // 计算产出总量
    let totalOutputQty = 0;
    for (const output of recipe.items.filter(i => i.type === 'output')) {
        totalOutputQty += output.quantity * multiplier;
    }
    const outputUnitCost = totalOutputQty > 0 ? Math.round(totalInputCost / totalOutputQty) : 0;
    // 构建产出记录（使用 outputInventory）
    const outputItems = [{
            inventoryId: recipe.outputInventory.id,
            name: recipe.outputInventory.name,
            unit: recipe.outputUnit,
            quantity: totalOutputQty,
            unitCost: outputUnitCost,
            cost: totalInputCost
        }];
    // 事务执行
    return database_1.default.$transaction(async (tx) => {
        // 扣减投入原料
        for (const input of recipe.items.filter(i => i.type === 'input')) {
            if (!input.inventoryId)
                continue;
            const deductQty = input.quantity * multiplier;
            await tx.inventory.update({
                where: { id: input.inventoryId },
                data: { currentStock: { decrement: deductQty } }
            });
            await tx.stockOutLog.create({
                data: {
                    inventoryId: input.inventoryId,
                    quantity: deductQty,
                    reason: 'process',
                    note: `加工: ${recipe.name} x${multiplier}`
                }
            });
        }
        // 添加产出到 outputInventory
        await tx.inventory.update({
            where: { id: recipe.outputInventory.id },
            data: {
                currentStock: { increment: totalOutputQty },
                avgCost: outputUnitCost
            }
        });
        await tx.stockInLog.create({
            data: {
                inventoryId: recipe.outputInventory.id,
                quantity: totalOutputQty,
                unitCost: outputUnitCost,
                totalAmount: totalInputCost,
                note: `加工产出: ${recipe.name} x${multiplier}`
            }
        });
        // 记录加工日志
        const log = await tx.processingLog.create({
            data: {
                storeId: recipe.store.id,
                recipeId: recipe.id,
                staffId,
                multiplier,
                inputItems: JSON.stringify(inputItems),
                outputItems: JSON.stringify(outputItems),
                totalInputCost,
                totalOutputCost: totalInputCost,
                note
            }
        });
        return {
            id: log.id,
            recipeName: recipe.name,
            multiplier,
            inputItems,
            outputItems,
            totalInputCost,
            totalOutputCost: totalInputCost
        };
    });
}
// ============================================
// 获取加工历史
// ============================================
async function getProcessingHistory(storeId, limit = 50) {
    return database_1.default.processingLog.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}
// ============================================
// 获取加工日志详情
// ============================================
async function getProcessingLogDetail(id) {
    const log = await database_1.default.processingLog.findUnique({
        where: { id }
    });
    if (!log)
        return null;
    return {
        ...log,
        inputItems: JSON.parse(log.inputItems),
        outputItems: JSON.parse(log.outputItems)
    };
}
//# sourceMappingURL=MaterialService.js.map