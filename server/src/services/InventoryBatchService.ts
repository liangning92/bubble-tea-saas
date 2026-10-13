import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { parseDateBoundary } from '../utils/businessDate';
export function receiptBatchDates(manufacturingDate?: string, expiryDate?: string) {
    const manufacturing = manufacturingDate ? parseDateBoundary(manufacturingDate) : null;
    const expiry = expiryDate ? parseDateBoundary(expiryDate, true) : null;
    if (manufacturing && expiry && manufacturing > expiry)
        throw Error('INVALID_BATCH_DATES');
    return { manufacturingDate: manufacturing, expiryDate: expiry };
}
/** Preserve physical stock: reconcile old batch quantities against the existing balance, newest stock remains after FIFO depletion. */
export function availableBatches(batches: any[], stock: number) {
    let available = Math.max(0, stock);
    return [...batches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)).map(batch => { const quantity = Math.min(Math.max(0, batch.quantity), available); available -= quantity; return { ...batch, quantity }; });
}
export async function alignInventoryBatches(tx: any, inventory: any) {
    const batches = await tx.batch.findMany({ where: { inventoryId: inventory.id, status: 'active' }, orderBy: { createdAt: 'desc' } });
    const aligned = availableBatches(batches, inventory.currentStock);
    for (const batch of aligned)
        if (batch.quantity !== batches.find((b: any) => b.id === batch.id)?.quantity)
            await tx.batch.update({ where: { id: batch.id }, data: { quantity: batch.quantity, status: batch.quantity > 0 ? 'active' : 'used' } });
    const untracked = Math.max(0, inventory.currentStock - aligned.reduce((sum, b) => sum + b.quantity, 0));
    if (untracked > 1e-9) {
        const batch = await tx.batch.create({ data: { inventoryId: inventory.id, batchNumber: `BASE-${randomUUID()}`, quantity: untracked, unitCost: Number(inventory.avgCost), status: 'active' } });
        aligned.push(batch);
    }
    return aligned.filter(b => b.quantity > 0);
}
export async function consumeInventoryBatches(tx: any, inventory: any, quantity: number) {
    const batches = await alignInventoryBatches(tx, inventory);
    batches.sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    let remaining = quantity;
    for (const batch of batches) {
        if (remaining <= 1e-9)
            break;
        const used = Math.min(batch.quantity, remaining), balance = Math.max(0, Math.round((batch.quantity - used) * 1e9) / 1e9);
        await tx.batch.update({ where: { id: batch.id }, data: { quantity: balance, status: balance > 0 ? 'active' : 'used' } });
        remaining -= used;
    }
    if (remaining > 1e-7)
        throw Error('BATCH_BALANCE_CHANGED');
}
export async function setBatchExpiry(storeId: string, inventoryId: string, batchId: string | undefined, expiryDate: string, manufacturingDate?: string) {
    if (!expiryDate.trim())
        throw Error('EXPIRY_DATE_REQUIRED');
    const dates = receiptBatchDates(manufacturingDate, expiryDate);
    return prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.findFirst({ where: { id: inventoryId, storeId } });
        if (!inventory)
            throw Error('INVENTORY_NOT_FOUND');
        const locked = await tx.inventory.updateMany({ where: { id: inventory.id, currentStock: inventory.currentStock, updatedAt: inventory.updatedAt }, data: { currentStock: { increment: 0 } } });
        if (locked.count !== 1)
            throw Error('INVENTORY_CONCURRENT_CHANGE_RETRY');
        const existing = await tx.batch.findMany({ where: { inventoryId, status: 'active' }, select: { id: true } });
        const batches = await alignInventoryBatches(tx, inventory);
        const targets = batchId ? batches.filter(b => b.id === batchId) : batches.filter(b => !existing.some((old: any) => old.id === b.id));
        if (!targets.length)
            throw Error('BATCH_NOT_ACTIVE');
        for (const batch of targets)
            await tx.batch.update({ where: { id: batch.id }, data: dates });
        return { updated: targets.length };
    });
}
