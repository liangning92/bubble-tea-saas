import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar';
import prisma from '../config/database';
import { inventoryForecast } from './InventoryForecastService';
import { getInventoryAlertConfig } from './InventoryAlertConfigService';
import { availableBatches } from './InventoryBatchService';
import { startOfDay, addDays, endOfDay, formatDate } from '../utils/dateUtils';
import { employeeConsumption, checkClosedConsumptionDays, classifyEmployeeConsumption } from './EmployeeConsumptionService';
import { createHash } from 'crypto';
const CATEGORY = 'inventory_alert_events';
export type InventoryAlertType = 'low_stock' | 'out_of_stock' | 'arrival_shortage' | 'purchase_overdue' | 'excessive_loss' | 'count_variance' | 'expiry_batch' | 'expiry_missing' | 'overstock' | 'stagnant_stock' | 'consumption_variance' | 'data_incomplete';
export interface InventoryAlertEvent {
    id: string;
    type: InventoryAlertType;
    resourceId: string;
    severity: 'info' | 'warning' | 'critical';
    status: 'open' | 'handled' | 'resolved';
    active: boolean;
    detail: any;
    firstSeen: string;
    lastSeen: string;
    resolvedAt?: string;
    handledAt?: string;
    handledBy?: string;
    handleNote?: string;
}
type Candidate = Pick<InventoryAlertEvent, 'type' | 'resourceId' | 'severity' | 'detail'>;
const keyFor = (type: string, resource: string) => 'inventoryAlert:' + createHash('sha256').update(type + ':' + resource).digest('hex');
const rank = { info: 0, warning: 1, critical: 2 };
export async function calculateInventoryAlerts(storeId: string, now = new Date()): Promise<Candidate[]> {
    const {startOfDay,addDays,endOfDay,formatDate}=await inventoryBusinessCalendar(storeId);
    const settings = await getInventoryAlertConfig(storeId), forecasts = await inventoryForecast(storeId, 30, now);
    const inventory = await prisma.inventory.findMany({ where: { storeId }, include: { batches: { where: { status: 'active', quantity: { gt: 0 } } } } });
    const orders = await prisma.purchaseOrder.findMany({ where: { storeId, status: { in: ['pending', 'approved', 'awaiting_receipt'] } }, include: { items: true } });
    const candidates: Candidate[] = [];
    const add = (type: InventoryAlertType, resourceId: string, severity: Candidate['severity'], detail: any) => candidates.push({ type, resourceId, severity, detail });
    for (const row of forecasts) {
        const material = inventory.find(m => m.id === row.inventoryId)!;
        const detail = { ...row, inventoryName: row.name };
        if (settings.enableLowStockAlert) {
            if (row.currentStock <= 0)
                add('out_of_stock', row.inventoryId, 'critical', detail);
            else if (row.currentStock <= row.effectiveSafetyStock)
                add('low_stock', row.inventoryId, row.daysUntilStockOut !== null && row.daysUntilStockOut <= settings.lowStockCriticalDays ? 'critical' : 'warning', detail);
        }
        if (settings.enablePurchaseAlert && row.dailyUsage > 0 && row.currentStock > 0) {
            const arrivals = orders.flatMap(order => order.items.filter(item => item.inventoryId === row.inventoryId && order.expectedDate).map(item => ({ purchaseOrderId: order.id, orderNumber: order.onlineOrderNumber || order.orderNumber, quantity: item.quantity, date: endOfDay(order.expectedDate!) }))).filter(a => a.date > now).sort((a, b) => a.date.getTime() - b.date.getTime());
            let balance = row.currentStock, at = now, shortage: any = null;
            for (const arrival of arrivals) {
                const usage = row.dailyUsage * (arrival.date.getTime() - at.getTime()) / 86400000;
                if (balance < usage && !shortage)
                    shortage = { ...arrival, projectedShortage: usage - balance };
                balance += arrival.quantity - usage;
                at = arrival.date;
            }
            if (shortage)
                add('arrival_shortage', row.inventoryId, 'critical', { ...detail, ...shortage, expectedDate: shortage.date.toISOString() });
        }
        if (settings.enableLossAlert && row.lossPercent !== null && row.lossUsage > 0 && row.lossPercent >= settings.lossWarningPercent)
            add('excessive_loss', row.inventoryId, row.lossPercent >= settings.lossCriticalPercent ? 'critical' : 'warning', detail);
        if (settings.enableOverstockAlert) {
            if (row.dailyUsage > 0 && row.currentStock > row.dailyUsage * settings.overstockDays)
                add('overstock', row.inventoryId, 'warning', { ...detail, maxStock: row.dailyUsage * settings.overstockDays });
            const tracking = await prisma.config.findUnique({ where: { storeId_key: { storeId, key: 'employee_inventory_flow_started_at' } } });
            const since = row.lastUsageAt ? new Date(row.lastUsageAt) : tracking ? new Date(tracking.value) : material.createdAt;
            if (row.currentStock > 0 && since < addDays(startOfDay(now), -settings.stagnantDays))
                add('stagnant_stock', row.inventoryId, 'warning', { ...detail, lastUsageAt: row.lastUsageAt, stagnantDays: settings.stagnantDays });
        }
        if (settings.enableDataAlert && row.noUsageHistory && row.currentStock > 0)
            add('data_incomplete', row.inventoryId + ':history', 'info', { ...detail, reason: 'no_history' });
        if (settings.enableExpiryAlert) {
            const batches = availableBatches(material.batches, material.currentStock).filter(b => b.quantity > 0);
            for (const batch of batches) {
                const batchDetail = { ...detail, batchId: batch.id, batchNumber: batch.batchNumber, quantity: batch.quantity, expiryDate: batch.expiryDate?.toISOString() || null };
                if (batch.expiryDate && batch.expiryDate <= endOfDay(addDays(now, settings.expiryWarningDays)))
                    add('expiry_batch', batch.id, batch.expiryDate < now ? 'critical' : 'warning', batchDetail);
                else if (!batch.expiryDate && material.shelfLife > 0)
                    add('expiry_missing', batch.id, 'info', batchDetail);
            }
            const untracked = Math.max(0, material.currentStock - batches.reduce((sum, b) => sum + b.quantity, 0));
            if (material.shelfLife > 0 && untracked > 1e-9)
                add('expiry_missing', row.inventoryId, 'info', { ...detail, quantity: untracked, batchId: null, expiryDate: null });
        }
    }
    if (settings.enablePurchaseAlert)
        for (const order of orders)
            if (order.expectedDate && endOfDay(order.expectedDate) < now)
                add('purchase_overdue', order.id, 'warning', { purchaseOrderId: order.id, orderNumber: order.onlineOrderNumber || order.orderNumber, expectedDate: endOfDay(order.expectedDate).toISOString(), items: order.items.map(i => ({ quantity: i.quantity, name: inventory.find(m => m.id === i.inventoryId)?.name || i.inventoryId })) });
    if (settings.enableCountVarianceAlert) {
        const counts = await prisma.inventoryCount.findMany({ where: { storeId, status: 'pending_review' }, include: { items: { include: { inventory: { select: { name: true, unit: true } } } } } });
        for (const count of counts)
            for (const item of count.items) {
                if (item.variance === null || !item.variance)
                    continue;
                const percent = item.systemQty === 0 ? null : Math.abs(item.variance) / Math.abs(item.systemQty) * 100;
                if (percent === null || percent >= settings.countVarianceWarningPercent)
                    add('count_variance', item.id, percent !== null && percent >= settings.countVarianceCriticalPercent ? 'critical' : 'warning', { inventoryId: item.inventoryId, inventoryName: item.inventory.name, unit: item.inventory.unit, countId: count.id, systemQty: item.systemQty, countedQty: item.countedQty, variance: item.variance, variancePercent: percent, note: item.note });
            }
    }
    if (settings.enableConsumptionAlert) {
        const stored = await prisma.consumptionAlert.findMany({ where: { storeId, status: { in: ['normal', 'warning', 'critical'] } }, orderBy: { businessDate: 'desc' } });
        for (const alert of stored) {
            const detail = JSON.parse(alert.detail), classification = classifyEmployeeConsumption(detail.theoreticalConsumption, detail.actualConsumption, settings.varianceWarningPercent, settings.varianceCriticalPercent, true, detail.varianceStatus === 'unavailable');
            if (['warning', 'critical'].includes(classification.varianceStatus))
                add('consumption_variance', alert.id, classification.varianceStatus as 'warning' | 'critical', { ...detail, ...classification, businessDate: alert.businessDate, missingOut: detail.theoreticalConsumption > 0 && detail.actualConsumption === 0 });
        }
    }
    if (settings.enableDataAlert) {
        const yesterday = formatDate(addDays(startOfDay(now), -1)), report = await employeeConsumption({ storeId, startDate: yesterday, endDate: yesterday });
        for (const row of report.list)
            if (row.varianceStatus === 'unavailable' && !row.partialPeriod)
                add('data_incomplete', row.inventoryId + ':recipe', 'info', { ...row, reason: 'recipe_incomplete' });
    }
    return candidates;
}
export async function refreshInventoryAlerts(storeId: string, now = new Date()) {
    const candidates = await calculateInventoryAlerts(storeId, now);
    // Serialize event reconciliation and acknowledgement without nested Prisma connection reads.
    return prisma.$transaction(async (tx) => {
        await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } });
        const current = await tx.config.findMany({ where: { storeId, category: CATEGORY } });
        const seen = new Set<string>();
        for (const candidate of candidates) {
            const key = keyFor(candidate.type, candidate.resourceId);
            seen.add(key);
            const record = current.find(row => row.key === key);
            let previous: InventoryAlertEvent | undefined;
            try {
                previous = record ? JSON.parse(record.value) : undefined;
            }
            catch { }
            const reopen = !previous?.active || rank[candidate.severity] > rank[previous.severity];
            const event: InventoryAlertEvent = { ...previous, ...candidate, id: key, active: true, status: reopen ? 'open' : previous?.status === 'handled' ? 'handled' : 'open', firstSeen: previous?.firstSeen || now.toISOString(), lastSeen: now.toISOString(), ...(reopen ? { handledAt: undefined, handledBy: undefined, handleNote: undefined, resolvedAt: undefined } : {}) };
            await tx.config.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, category: CATEGORY, value: JSON.stringify(event) }, update: { value: JSON.stringify(event) } });
        }
        for (const record of current)
            if (!seen.has(record.key)) {
                const event: InventoryAlertEvent = JSON.parse(record.value);
                if (event.active)
                    await tx.config.update({ where: { id: record.id }, data: { value: JSON.stringify({ ...event, active: false, status: 'resolved', resolvedAt: now.toISOString(), lastSeen: now.toISOString() }) } });
            }
        await tx.config.upsert({ where: { storeId_key: { storeId, key: 'inventory_alert_center_checked_at' } }, create: { storeId, key: 'inventory_alert_center_checked_at', category: 'inventory', value: now.toISOString() }, update: { value: now.toISOString() } });
        return listInventoryAlerts(storeId, tx);
    }, { timeout: 60000 });
}
export async function listInventoryAlerts(storeId: string, db: any = prisma) {
    const records = await db.config.findMany({ where: { storeId, category: CATEGORY } });
    const list: InventoryAlertEvent[] = records.map((record: any) => JSON.parse(record.value));
    list.sort((a, b) => rank[b.severity] - rank[a.severity] || b.lastSeen.localeCompare(a.lastSeen));
    return { list, count: list.filter(a => a.active && a.status === 'open').length, criticalCount: list.filter(a => a.active && a.status === 'open' && a.severity === 'critical').length };
}
export async function handleInventoryAlert(storeId: string, id: string, actor: string, note: string) {
    if (!note.trim())
        throw Error('ALERT_HANDLE_NOTE_REQUIRED');
    return prisma.$transaction(async (tx) => {
        await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } });
        const record = await tx.config.findFirst({ where: { storeId, key: id, category: CATEGORY } });
        if (!record)
            throw Error('ALERT_NOT_FOUND');
        const event: InventoryAlertEvent = JSON.parse(record.value);
        if (!event.active)
            throw Error('ALERT_ALREADY_RESOLVED');
        if (event.status === 'handled')
            return event;
        const updated = { ...event, status: 'handled' as const, handledBy: actor, handledAt: new Date().toISOString(), handleNote: note.trim() };
        await tx.config.update({ where: { id: record.id }, data: { value: JSON.stringify(updated) } });
        return updated;
    });
}
let checking = false;
export async function checkInventoryAlertCenters(now = new Date()) {
    if (checking)
        return;
    checking = true;
    try {
        await checkClosedConsumptionDays(now);
        for (const store of await prisma.store.findMany({ select: { id: true } })) {
            try {
                const {formatDate}=await inventoryBusinessCalendar(store.id);
                const settings = await getInventoryAlertConfig(store.id), previous = await prisma.config.findUnique({ where: { storeId_key: { storeId: store.id, key: 'inventory_alert_center_checked_at' } } }), last = previous ? new Date(previous.value) : null;
                if (!last || !Number.isFinite(last.getTime()) || formatDate(last) !== formatDate(now) || now.getTime() - last.getTime() >= settings.autoCheckIntervalHours * 3600000)
                    await refreshInventoryAlerts(store.id, now);
            }
            catch (error) {
                console.error('[Inventory alerts]', store.id, error);
            }
        }
    }
    finally {
        checking = false;
    }
}
export function startInventoryAlertScheduler() { void checkInventoryAlertCenters(); const timer = setInterval(() => void checkInventoryAlertCenters(), 15 * 60 * 1000); timer.unref(); return timer; }
