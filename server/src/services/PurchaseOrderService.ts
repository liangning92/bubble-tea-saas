import prisma from '../config/database';
import { calculateProductCost } from './ProductService';
import { convertQuantity, validatePackage } from '../utils/inventoryUnits';
import { randomUUID, createHash } from 'crypto';
export interface PurchaseOrderFilter {
    storeId?: string;
    supplierId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
}
export class PurchaseOrderError extends Error {
    constructor(message: string, public statusCode = 409) { super(message); }
}
const include = { supplier: { select: { id: true, name: true } }, items: true };
async function view(order: any, db: any = prisma) {
    if (!order)
        return null;
    const inventory = await db.inventory.findMany({ where: { storeId: order.storeId, id: { in: order.items.map((i: any) => i.inventoryId) } }, select: { id: true, name: true, unit: true } });
    return { ...order, items: order.items.map((i: any) => ({ ...i, inventory: inventory.find((m: any) => m.id === i.inventoryId) })) };
}
export async function getPurchaseOrders(filter: PurchaseOrderFilter) {
    const where: any = { storeId: filter.storeId };
    if (filter.supplierId)
        where.supplierId = filter.supplierId;
    if (filter.status === 'awaiting_receipt')
        where.status = { in: ['pending', 'approved', 'awaiting_receipt'] };
    else if (filter.status)
        where.status = filter.status;
    if (filter.startDate || filter.endDate)
        where.createdAt = { gte: filter.startDate, lte: filter.endDate };
    const orders = await prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' } });
    return Promise.all(orders.map(o => view(o)));
}
export async function getPurchaseOrderById(orderId: string) { return view(await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include })); }
export async function getPendingPurchaseOrders(storeId: string) { return getPurchaseOrders({ storeId, status: 'awaiting_receipt' }); }
export async function createPurchaseOrder(data: {
    storeId: string;
    supplierId?: string;
    expectedDate?: Date;
    note?: string;
    source?: string;
    onlineOrderNumber?: string;
    createdBy?: string;
    requestId?: string;
    items: {
        inventoryId: string;
        quantity: number;
        unitCost: number;
        inputUnit?: string;
    }[];
}) {
    const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const replay = async (db: any) => {
        if (!data.requestId)
            return null;
        const prior = await db.purchaseOrder.findUnique({ where: { requestId: data.requestId }, include });
        if (!prior)
            return null;
        if (prior.storeId !== data.storeId || prior.requestFingerprint !== fingerprint)
            throw new PurchaseOrderError('PURCHASE_IDEMPOTENCY_CONFLICT');
        return view(prior, db);
    };
    try {
        return await prisma.$transaction(async (tx) => {
            const previous = await replay(tx);
            if (previous)
                return previous;
            if (data.supplierId && !await tx.supplier.findFirst({ where: { id: data.supplierId, storeId: data.storeId, isActive: true } }))
                throw new PurchaseOrderError('Supplier does not belong to this store', 400);
            if (!data.items.length || new Set(data.items.map(i => i.inventoryId)).size !== data.items.length)
                throw new PurchaseOrderError('Duplicate or empty purchase items', 400);
            const items = [];
            let totalAmount = 0;
            for (const item of data.items) {
                const inventory = await tx.inventory.findFirst({ where: { id: item.inventoryId, storeId: data.storeId } });
                if (!inventory)
                    throw new PurchaseOrderError('Inventory does not belong to this store', 400);
                if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0)
                    throw new PurchaseOrderError('Invalid quantity or cost', 400);
                const saved = await tx.config.findUnique({ where: { storeId_key: { storeId: data.storeId, key: `inventoryPackage:${inventory.id}` } } });
                const pack = saved ? validatePackage(JSON.parse(saved.value), inventory.unit) : null;
                const inputUnit = item.inputUnit || inventory.unit;
                const quantity = convertQuantity(item.quantity, inputUnit, inventory.unit, pack);
                const amount = Math.round(item.quantity * item.unitCost);
                totalAmount += amount;
                const unitCost = Math.round(amount / quantity);
                if (quantity <= 0 || !Number.isSafeInteger(totalAmount) || totalAmount > 2147483647 || !Number.isSafeInteger(unitCost) || unitCost > 2147483647)
                    throw new PurchaseOrderError('Invalid purchase amount', 400);
                items.push({ inventoryId: item.inventoryId, quantity, unitCost, inputQuantity: item.quantity, inputUnit, inputUnitCost: item.unitCost, packageSnapshot: JSON.stringify(pack) });
            }
            const order = await tx.purchaseOrder.create({ data: { storeId: data.storeId, supplierId: data.supplierId || null, orderNumber: `PO-${randomUUID()}`, source: data.source || 'admin', status: data.source === 'online' ? 'awaiting_receipt' : 'pending', onlineOrderNumber: data.onlineOrderNumber, createdBy: data.createdBy, requestId: data.requestId, requestFingerprint: fingerprint, expectedDate: data.expectedDate, note: data.note, totalAmount, items: { create: items } }, include });
            return view(order, tx);
        });
    }
    catch (error: any) {
        if (error.code === 'P2002') {
            const previous = await replay(prisma);
            if (previous)
                return previous;
        }
        throw error;
    }
}
async function scopedOrder(tx: any, orderId: string, storeId?: string) {
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, ...(storeId !== undefined ? { storeId } : {}) }, include: { items: { orderBy: { inventoryId: 'asc' } } } });
    if (!order)
        throw new PurchaseOrderError('Purchase order not found', 404);
    return order;
}
export async function updatePurchaseOrderStatus(orderId: string, status: string, storeId?: string) {
    if (status !== 'approved')
        throw new PurchaseOrderError('Use receive or cancel to finish a purchase order', 400);
    return prisma.$transaction(async (tx) => { const order = await scopedOrder(tx, orderId, storeId); const changed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'approved' } }); if (!changed.count)
        throw new PurchaseOrderError('Only pending orders can be approved'); return tx.purchaseOrder.findUnique({ where: { id: order.id } }); });
}
export async function receivePurchaseOrder(orderId: string, staffId: string, storeId?: string) {
    return prisma.$transaction(async (tx) => {
        const order = await scopedOrder(tx, orderId, storeId);
        if (order.status === 'received')
            return order;
        const claimed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: { in: ['pending', 'approved', 'awaiting_receipt'] } }, data: { status: 'received', receivedDate: new Date(), receivedBy: staffId } });
        if (!claimed.count)
            throw new PurchaseOrderError('Purchase order is already received or cancelled');
        for (const item of order.items) {
            const inventory = await tx.inventory.findFirst({ where: { id: item.inventoryId, storeId: order.storeId } });
            if (!inventory)
                throw new PurchaseOrderError('Inventory does not belong to this store', 400);
            const quantity = item.quantity;
            if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0)
                throw new PurchaseOrderError('Invalid purchase quantity or cost', 400);
            const totalAmount = item.inputQuantity !== null && item.inputUnitCost !== null ? Math.round(item.inputQuantity * item.inputUnitCost) : Math.round(quantity * item.unitCost);
            const newStock = inventory.currentStock + quantity;
            const newAvgCost = Math.round((Math.max(0, inventory.currentStock) * Number(inventory.avgCost) + totalAmount) / (Math.max(0, inventory.currentStock) + quantity));
            if (!Number.isFinite(newStock) || !Number.isSafeInteger(newAvgCost) || newAvgCost < 0 || newAvgCost > 2147483647)
                throw new PurchaseOrderError('Invalid inventory balance', 400);
            const changed = await tx.inventory.updateMany({ where: { id: inventory.id, storeId: order.storeId, currentStock: inventory.currentStock, avgCost: inventory.avgCost }, data: { currentStock: { increment: quantity }, avgCost: newAvgCost } });
            if (!changed.count)
                throw new PurchaseOrderError('Inventory changed during receiving; retry this order');
            await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: quantity } });
            const batch = await tx.batch.create({ data: { inventoryId: item.inventoryId, batchNumber: `PO-${order.id}-${item.id}`, quantity, unitCost: item.unitCost, status: 'active' } });
            await tx.stockInLog.create({ data: { inventoryId: item.inventoryId, purchaseOrderId: order.id, batchId: batch.id, quantity, unitCost: item.unitCost, totalAmount, supplierId: order.supplierId, staffId, note: JSON.stringify({ version: 1, kind: 'receipt', purchaseOrderId: order.id, orderNumber: order.orderNumber, ledgerUnit: inventory.unit, ledgerQuantity: quantity, inputQuantity: item.inputQuantity ?? quantity, inputUnit: item.inputUnit ?? inventory.unit, inputUnitCost: item.inputUnitCost ?? item.unitCost }) } });
        }
        const rows = await tx.bOMItem.findMany({ where: { inventoryId: { in: order.items.map((i: any) => i.inventoryId) } }, select: { productId: true } });
        for (const productId of [...new Set(rows.map(i => i.productId))])
            await tx.product.update({ where: { id: productId }, data: { costPrice: await calculateProductCost(productId, tx) } });
        return tx.purchaseOrder.findUnique({ where: { id: order.id }, include });
    });
}
export async function cancelPurchaseOrder(orderId: string, reason: string, storeId?: string) { return prisma.$transaction(async (tx) => { const order = await scopedOrder(tx, orderId, storeId); const changed = await tx.purchaseOrder.updateMany({ where: { id: order.id, status: { in: ['pending', 'approved', 'awaiting_receipt'] } }, data: { status: 'cancelled', note: reason } }); if (!changed.count)
    throw new PurchaseOrderError('Received or cancelled orders cannot be cancelled'); return tx.purchaseOrder.findUnique({ where: { id: order.id } }); }); }
