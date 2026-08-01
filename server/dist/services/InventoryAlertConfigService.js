"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INVENTORY_ALERT_CONFIG = void 0;
exports.getInventoryAlertConfig = getInventoryAlertConfig;
exports.saveInventoryAlertConfig = saveInventoryAlertConfig;
const database_1 = __importDefault(require("../config/database"));
// Default inventory alert config
exports.DEFAULT_INVENTORY_ALERT_CONFIG = {
    // Low stock warning thresholds (in days)
    lowStockWarningDays: 7, // Warning: stock will last less than 7 days
    lowStockCriticalDays: 3, // Critical: stock will last less than 3 days
    // Consumption variance thresholds (percentage)
    varianceWarningPercent: 10, // Warning: actual vs theoretical variance > 10%
    varianceCriticalPercent: 20, // Critical: actual vs theoretical variance > 20%
    // Enable/disable alerts
    enableLowStockAlert: true,
    enableConsumptionAlert: true,
    // Auto-check interval (in hours)
    autoCheckIntervalHours: 24
};
/**
 * Get inventory alert config for a store
 */
async function getInventoryAlertConfig(storeId) {
    const configs = await database_1.default.config.findMany({
        where: { storeId, category: 'inventory' }
    });
    const result = { ...exports.DEFAULT_INVENTORY_ALERT_CONFIG };
    for (const config of configs) {
        if (config.key === 'inventory_alert_config') {
            try {
                const saved = JSON.parse(config.value);
                Object.assign(result, saved);
            }
            catch {
                // Use defaults
            }
        }
    }
    return result;
}
/**
 * Save inventory alert config for a store
 */
async function saveInventoryAlertConfig(storeId, config) {
    const current = await getInventoryAlertConfig(storeId);
    const updated = { ...current, ...config };
    await database_1.default.config.upsert({
        where: { storeId_key: { storeId, key: 'inventory_alert_config' } },
        create: {
            storeId,
            key: 'inventory_alert_config',
            value: JSON.stringify(updated),
            category: 'inventory'
        },
        update: {
            value: JSON.stringify(updated)
        }
    });
    return updated;
}
//# sourceMappingURL=InventoryAlertConfigService.js.map