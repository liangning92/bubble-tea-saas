import {actualInventorySince} from './ActualInventoryPolicy';
import {unifiedInventorySince} from './UnifiedInventoryService';
import {salesInventoryForecast} from './SalesInventoryForecastService';
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar';
import prisma from '../config/database';
import { getInventoryAlertConfig } from './InventoryAlertConfigService';
import { FLOW_CUTOVER_KEY } from './OrderConsumptionService';
import { startOfDay, addDays } from '../utils/dateUtils';
export const ACTUAL_OUT_REASONS = ['withdrawal', 'loss', 'expired', 'other', 'process'];
const DAY = 86400000;
export async function inventoryForecast(storeId: string, days = 30, now = new Date(), db: any = prisma) {
    if (!Number.isInteger(days) || days < 1 || days > 365)
        throw Error('INVALID_FORECAST_DAYS');
    const {startOfDay,addDays,dayCount}=await inventoryBusinessCalendar(storeId,db);
    const settings = await getInventoryAlertConfig(storeId), end = startOfDay(now), windowStart = addDays(end, -days);
    if(await actualInventorySince(db,storeId)||await unifiedInventorySince(db,storeId))return salesInventoryForecast(db,storeId,days,now,settings);
    const config = await db.config.findUnique({ where: { storeId_key: { storeId, key: FLOW_CUTOVER_KEY } } });
    const cutover = config ? new Date(config.value) : null;
    const reasons = cutover ? ACTUAL_OUT_REASONS : ['sold', 'refund_unprepared'];
    const materials = await db.inventory.findMany({ where: { storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}] }, orderBy: { name: 'asc' } });
    const first = await db.stockOutLog.groupBy({ by: ['inventoryId'], where: { inventory: { storeId }, reason: { in: reasons }, quantity: { gt: 0 }, createdAt: { lt: end, ...(cutover ? { gte: cutover } : {}) } }, _min: { createdAt: true }, _max: { createdAt: true } });
    const latest = await db.stockOutLog.groupBy({ by: ['inventoryId'], where: { inventory: { storeId }, reason: { in: reasons }, quantity: { gt: 0 }, createdAt: { lte: now, ...(cutover ? { gte: cutover } : {}) } }, _max: { createdAt: true } });
    const start = new Date(Math.max(windowStart.getTime(), cutover?.getTime() || 0));
    const logs = await db.stockOutLog.findMany({ where: { inventory: { storeId }, reason: { in: reasons }, createdAt: { gte: start, lt: end } } });
    return materials.map((mat: any) => {
        const history = first.find((row: any) => row.inventoryId === mat.id);
        const sampleStart = history ? new Date(Math.max(windowStart.getTime(), startOfDay(history._min.createdAt).getTime())) : null;
        const historyDays = sampleStart ? Math.min(days, Math.max(1, dayCount(sampleStart,end))) : 0;
        const entries = logs.filter((row: any) => row.inventoryId === mat.id);
        const totalUsage = Math.max(0, entries.reduce((sum: number, row: any) => sum + row.quantity, 0));
        const dailyUsage = historyDays > 0 ? totalUsage / historyDays : 0;
        const dynamicSafetyStock = dailyUsage * settings.lowStockWarningDays;
        const effectiveSafetyStock = Math.max(mat.safetyStock || 0, mat.minStock || 0, dynamicSafetyStock);
        const lossUsage = entries.filter((row: any) => ['loss', 'expired'].includes(row.reason)).reduce((sum: number, row: any) => sum + row.quantity, 0);
        return { inventoryId: mat.id, id: mat.id, name: mat.name, unit: mat.unit, avgCost: Number(mat.avgCost), category: mat.category, currentStock: mat.currentStock, safetyStock: mat.safetyStock, totalUsage, dailyUsage, historyDays, requestedHistoryDays: days, insufficientHistory: historyDays < days, noUsageHistory: !historyDays, historyStart: sampleStart?.toISOString() || null, historyEnd: end.toISOString(), lastUsageAt: latest.find((row: any) => row.inventoryId === mat.id)?._max.createdAt.toISOString() || null, dynamicSafetyStock, effectiveSafetyStock, daysUntilStockOut: dailyUsage > 0 ? Math.max(0, mat.currentStock / dailyUsage) : null, suggestedReorderQty: Math.max(0, effectiveSafetyStock - mat.currentStock), lossUsage, lossPercent: totalUsage > 0 ? lossUsage / totalUsage * 100 : null, basis: cutover ? 'employee_actual_out' : 'recorded_sales_ledger_estimate' };
    }).sort((a: any, b: any) => (a.daysUntilStockOut ?? Infinity) - (b.daysUntilStockOut ?? Infinity));
}
