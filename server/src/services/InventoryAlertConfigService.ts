import { z } from 'zod';
import prisma from '../config/database';
export const DEFAULT_INVENTORY_ALERT_CONFIG = {
    settingsVersion: 2, lowStockWarningDays: 15, lowStockCriticalDays: 3,
    varianceWarningPercent: 10, varianceCriticalPercent: 20,
    lossWarningPercent: 10, lossCriticalPercent: 20, countVarianceWarningPercent: 10, countVarianceCriticalPercent: 20,
    expiryWarningDays: 7, overstockDays: 60, stagnantDays: 30,
    enableLowStockAlert: true, enableConsumptionAlert: true, enablePurchaseAlert: true, enableLossAlert: true,
    enableExpiryAlert: true, enableCountVarianceAlert: true, enableOverstockAlert: true, enableDataAlert: true,
    autoCheckIntervalHours: 24
};
export type InventoryAlertConfig = typeof DEFAULT_INVENTORY_ALERT_CONFIG;
const positive = z.number().finite().positive(), percent = positive.max(100);
const alertSchema = z.object({
    settingsVersion: z.literal(2), lowStockWarningDays: positive.max(365), lowStockCriticalDays: positive.max(365),
    varianceWarningPercent: positive, varianceCriticalPercent: positive, lossWarningPercent: percent, lossCriticalPercent: percent,
    countVarianceWarningPercent: positive, countVarianceCriticalPercent: positive,
    expiryWarningDays: positive.max(365), overstockDays: positive.max(730), stagnantDays: positive.max(730),
    enableLowStockAlert: z.boolean(), enableConsumptionAlert: z.boolean(), enablePurchaseAlert: z.boolean(), enableLossAlert: z.boolean(), enableExpiryAlert: z.boolean(), enableCountVarianceAlert: z.boolean(), enableOverstockAlert: z.boolean(), enableDataAlert: z.boolean(), autoCheckIntervalHours: positive.min(1).max(720)
}).refine(v => v.lowStockCriticalDays <= v.lowStockWarningDays && v.varianceCriticalPercent >= v.varianceWarningPercent && v.lossCriticalPercent >= v.lossWarningPercent && v.countVarianceCriticalPercent >= v.countVarianceWarningPercent && v.overstockDays > v.lowStockWarningDays);
export async function getInventoryAlertConfig(storeId: string): Promise<InventoryAlertConfig> {
    const config = await prisma.config.findUnique({ where: { storeId_key: { storeId, key: 'inventory_alert_config' } } });
    let saved: any = {};
    try {
        saved = JSON.parse(config?.value || '{}');
    }
    catch { }
    // Upgrade the previous default of seven days. Explicit v2 choices and other customized days remain intact.
    if (saved.settingsVersion !== 2 && saved.lowStockWarningDays === 7)
        saved.lowStockWarningDays = 15;
    const parsed = alertSchema.safeParse({ ...DEFAULT_INVENTORY_ALERT_CONFIG, ...saved, settingsVersion: 2 });
    return parsed.success ? parsed.data as InventoryAlertConfig : { ...DEFAULT_INVENTORY_ALERT_CONFIG };
}
export async function saveInventoryAlertConfig(storeId: string, config: Partial<InventoryAlertConfig>) {
    const updated = alertSchema.parse({ ...await getInventoryAlertConfig(storeId), ...config, settingsVersion: 2 }) as InventoryAlertConfig;
    await prisma.config.upsert({ where: { storeId_key: { storeId, key: 'inventory_alert_config' } }, create: { storeId, key: 'inventory_alert_config', value: JSON.stringify(updated), category: 'inventory' }, update: { value: JSON.stringify(updated) } });
    await prisma.config.deleteMany({ where: { storeId, key: 'employee_consumption_checkpoint' } });
    return updated;
}
