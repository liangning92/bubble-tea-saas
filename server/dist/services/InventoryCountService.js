"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInventoryCounts = getInventoryCounts;
exports.getInventoryCountById = getInventoryCountById;
exports.createInventoryCount = createInventoryCount;
exports.updateCountItem = updateCountItem;
exports.completeInventoryCount = completeInventoryCount;
exports.cancelInventoryCount = cancelInventoryCount;
const database_1 = __importDefault(require("../config/database"));
// Get inventory counts
async function getInventoryCounts(storeId) {
    return database_1.default.inventoryCount.findMany({
        where: { storeId },
        include: {
            items: {
                include: {
                    inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}
// Get single inventory count
async function getInventoryCountById(countId) {
    return database_1.default.inventoryCount.findUnique({
        where: { id: countId },
        include: {
            items: {
                include: {
                    inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
                }
            }
        }
    });
}
// Create inventory count (initiate count)
async function createInventoryCount(data) {
    const inventoryItems = await database_1.default.inventory.findMany({
        where: { storeId: data.storeId },
        select: { id: true, currentStock: true }
    });
    return database_1.default.inventoryCount.create({
        data: {
            storeId: data.storeId,
            period: data.period,
            startDate: data.startDate,
            endDate: data.endDate,
            notes: data.notes,
            status: 'in_progress',
            items: {
                create: inventoryItems.map(item => ({
                    inventoryId: item.id,
                    systemQty: item.currentStock
                }))
            }
        },
        include: {
            items: {
                include: {
                    inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
                }
            }
        }
    });
}
// Update count item (record actual count)
async function updateCountItem(countItemId, countedQty, countedBy, note) {
    const item = await database_1.default.inventoryCountItem.findUnique({
        where: { id: countItemId },
        include: { inventoryCount: true }
    });
    if (!item)
        throw new Error('Count item not found');
    if (item.inventoryCount.status !== 'in_progress')
        throw new Error('Count is not in progress');
    const variance = countedQty - item.systemQty;
    return database_1.default.inventoryCountItem.update({
        where: { id: countItemId },
        data: {
            countedQty,
            variance,
            countedAt: new Date(),
            countedBy,
            note
        }
    });
}
// Complete inventory count (apply adjustments)
async function completeInventoryCount(countId, staffId) {
    const count = await database_1.default.inventoryCount.findUnique({
        where: { id: countId },
        include: { items: true }
    });
    if (!count)
        throw new Error('Inventory count not found');
    if (count.status !== 'in_progress')
        throw new Error('Count is not in progress');
    return database_1.default.$transaction(async (tx) => {
        await tx.inventoryCount.update({
            where: { id: countId },
            data: { status: 'completed' }
        });
        for (const item of count.items) {
            if (item.countedQty !== null && item.variance !== 0) {
                await tx.inventory.update({
                    where: { id: item.inventoryId },
                    data: { currentStock: item.countedQty }
                });
                if (item.variance > 0) {
                    await tx.stockInLog.create({
                        data: {
                            inventoryId: item.inventoryId,
                            quantity: item.variance,
                            unitCost: 0,
                            totalAmount: 0,
                            note: `Inventory count: ${item.note || 'Adjustment'}`
                        }
                    });
                }
                else if (item.variance < 0) {
                    await tx.stockOutLog.create({
                        data: {
                            inventoryId: item.inventoryId,
                            quantity: Math.abs(item.variance),
                            reason: 'adjust',
                            note: `Inventory count: ${item.note || 'Adjustment'}`
                        }
                    });
                }
            }
        }
        return count;
    });
}
// Cancel inventory count
async function cancelInventoryCount(countId) {
    return database_1.default.inventoryCount.update({
        where: { id: countId },
        data: { status: 'cancelled' }
    });
}
//# sourceMappingURL=InventoryCountService.js.map