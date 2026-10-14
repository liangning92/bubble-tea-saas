import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar';
import prisma from '../config/database';
import { getInventoryAlertConfig } from './InventoryAlertConfigService';
import { FLOW_CUTOVER_KEY, ensureInventoryFlow, ConsumptionMaterial, ConsumptionIssue } from './OrderConsumptionService';
import { parseDateBoundary } from '../utils/businessDate';
import { formatDate, startOfDay, addDays } from '../utils/dateUtils';
export function classifyEmployeeConsumption(theoretical: number, actual: number, warning: number, critical: number, enabled = true, incomplete = false) {
    const variance = Math.round((actual - theoretical) * 1e9) / 1e9;
    const variancePercent = theoretical === 0 ? null : Math.round(Math.abs(variance) / theoretical * 100 * 1e9) / 1e9;
    return { variance, variancePercent, varianceStatus: incomplete ? 'unavailable' : !enabled ? 'normal' : theoretical === 0 ? (actual > 0 ? 'warning' : 'normal') : variancePercent! >= critical ? 'critical' : variancePercent! >= warning ? 'warning' : 'normal', unavailableReason: incomplete ? 'INCOMPLETE_RECIPE' : theoretical === 0 && actual > 0 ? 'ZERO_THEORETICAL_BASELINE' : null };
}
export async function employeeConsumption(filter: {
    storeId: string;
    startDate: string;
    endDate: string;
}, db: any = prisma) {
    const {boundary,startOfDay}=await inventoryBusinessCalendar(filter.storeId,db);
    const start = boundary(filter.startDate), end = boundary(filter.endDate, true);
    if (end < start)
        throw Error('INVALID_ANALYSIS_PERIOD');
    const setting = await getInventoryAlertConfig(filter.storeId);
    const cutoverRecord = await db.config.findUnique({ where: { storeId_key: { storeId: filter.storeId, key: FLOW_CUTOVER_KEY } } });
    const cutover = cutoverRecord ? new Date(cutoverRecord.value) : null;
    if (!cutover || cutover > end)
        return { list: [], cutover: cutover?.toISOString() || null, legacyOnly: true, segments: [{ basis: 'legacy', start: start.toISOString(), end: end.toISOString() }] };
    const effectiveStart = new Date(Math.max(start.getTime(), cutover.getTime()));
    const inventory = await db.inventory.findMany({ where: { storeId: filter.storeId }, orderBy: { name: 'asc' } });
    const snapshots = await db.orderConsumptionSnapshot.findMany({ where: { storeId: filter.storeId, createdAt: { gte: effectiveStart, lte: end } } });
    const logs = await db.stockOutLog.findMany({ where: { inventory: { storeId: filter.storeId }, createdAt: { gte: effectiveStart, lte: end }, reason: { in: ['withdrawal', 'loss', 'expired', 'other', 'process'] } } });
    const uncovered = await db.order.count({ where: { storeId: filter.storeId, status: { in: ['completed', 'paid'] }, createdAt: { gte: effectiveStart, lte: end }, id: { notIn: snapshots.map((s: any) => s.orderId) } } });
    const materials = new Map<string, {
        quantity: number;
        unit: string;
    }>();
    let incomplete = uncovered > 0;
    for (const snapshot of snapshots) {
        if (snapshot.reversedAt)
            continue;
        const issues: ConsumptionIssue[] = JSON.parse(snapshot.issues);
        if (issues.length)
            incomplete = true;
        for (const material of JSON.parse(snapshot.materials) as ConsumptionMaterial[]) {
            // Old snapshots recorded the processed quantity before its recipe was linked.
            // Keep that evidence intact and do not compare it to raw withdrawals as if equivalent.
            if(inventory.some((i:any)=>i.id===material.inventoryId&&i.type==='semi_finished'&&i.processRecipeId))incomplete=true;
            const previous = materials.get(material.inventoryId);
            if (previous && previous.unit !== material.unit)
                incomplete = true;
            materials.set(material.inventoryId, { quantity: (previous?.quantity || 0) + material.quantity, unit: material.unit });
        }
    }
    const list = inventory.filter((i:any)=>i.type!=='semi_finished'||!i.processRecipeId).map((item: any) => {
        const totals: {
            [key: string]: number;
        } = { withdrawal: 0, loss: 0, expired: 0, other: 0, process: 0 };
        for (const log of logs.filter((l: any) => l.inventoryId === item.id))
            totals[log.reason] += log.quantity;
        const actual = Object.values(totals).reduce((a, b) => a + b, 0), theory = materials.get(item.id);
        const classification = classifyEmployeeConsumption(theory?.quantity || 0, actual, setting.varianceWarningPercent, setting.varianceCriticalPercent, setting.enableConsumptionAlert, incomplete || !!theory && theory.unit !== item.unit);
        return { inventoryId: item.id, inventoryName: item.name, unit: item.unit, theoreticalConsumption: theory?.quantity || 0, actualConsumption: actual, breakdown: totals, ...classification, windowStart: effectiveStart.toISOString(), windowEnd: end.toISOString(), basis: 'employee_out_vs_sale_recipe', provisional: end >= startOfDay(new Date()), partialPeriod: start < cutover };
    });
    return { list, cutover: cutover.toISOString(), legacyOnly: false, segments: [...(start < cutover ? [{ basis: 'legacy', start: start.toISOString(), end: new Date(cutover.getTime() - 1).toISOString() }] : []), { basis: 'employee_out_vs_sale_recipe', start: effectiveStart.toISOString(), end: end.toISOString() }] };
}
export async function checkConsumptionDay(storeId: string, businessDate: string, now = new Date()) {
    const {boundary,startOfDay}=await inventoryBusinessCalendar(storeId);
    if (boundary(businessDate, true) >= startOfDay(now))
        throw Error('BUSINESS_DAY_NOT_CLOSED');
    const result = await employeeConsumption({ storeId, startDate: businessDate, endDate: businessDate });
    for (const row of result.list) {
        // The transition day's evidence is partial; report it but never trigger an alert from it.
        const status = row.partialPeriod ? 'unavailable' : row.varianceStatus;
        await prisma.consumptionAlert.upsert({ where: { storeId_businessDate_inventoryId: { storeId, businessDate, inventoryId: row.inventoryId } }, create: { storeId, businessDate, inventoryId: row.inventoryId, status, detail: JSON.stringify(row) }, update: { status, detail: JSON.stringify(row) } });
    }
    return result;
}
export async function getConsumptionAlerts(storeId: string) {
    const setting = await getInventoryAlertConfig(storeId);
    if (!setting.enableConsumptionAlert)
        return [];
    const rows = await prisma.consumptionAlert.findMany({ where: { storeId, status: { in: ['warning', 'critical'] } }, orderBy: [{ businessDate: 'desc' }, { inventoryId: 'asc' }] });
    return rows.map(row => ({ ...row, detail: JSON.parse(row.detail) }));
}
let running = false;
export async function checkClosedConsumptionDays(now = new Date()) {
    if (running)
        return;
    running = true;
    try {
        const stores = await prisma.store.findMany({ select: { id: true } });
        for (const store of stores) {
            try {
                const {startOfDay,addDays,formatDate,boundary}=await inventoryBusinessCalendar(store.id);
                const cutover = await ensureInventoryFlow(store.id, prisma, now);
                const settings = await getInventoryAlertConfig(store.id);
                if (!settings.enableConsumptionAlert)
                    continue;
                const checkpoint = await prisma.config.findUnique({ where: { storeId_key: { storeId: store.id, key: 'employee_consumption_checkpoint' } } });
                let day = checkpoint ? addDays(boundary(checkpoint.value), 1) : startOfDay(cutover);
                const today = startOfDay(now);
                while (day < today) {
                    const date = formatDate(day);
                    await checkConsumptionDay(store.id, date, now);
                    await prisma.config.upsert({ where: { storeId_key: { storeId: store.id, key: 'employee_consumption_checkpoint' } }, create: { storeId: store.id, key: 'employee_consumption_checkpoint', value: date, category: 'inventory' }, update: { value: date } });
                    day = addDays(day, 1);
                }
                // Durable dirty-day markers survive downtime and delayed offline receipt sync.
                const dirty = await prisma.config.findMany({ where: { storeId: store.id, key: { startsWith: 'employee_consumption_dirty:' } } });
                for (const record of dirty) {
                    const date = record.key.slice('employee_consumption_dirty:'.length);
                    if (boundary(date) >= today)
                        continue;
                    await checkConsumptionDay(store.id, date, now);
                    await prisma.config.deleteMany({ where: { storeId: store.id, key: record.key, value: record.value } });
                }
            }
            catch (error) {
                console.error('[Inventory consumption]', store.id, error);
            }
        }
    }
    finally {
        running = false;
    }
}
export function startConsumptionScheduler() {
    void checkClosedConsumptionDays();
    const timer = setInterval(() => void checkClosedConsumptionDays(), 60 * 60 * 1000);
    timer.unref();
    return timer;
}
