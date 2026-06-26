import prisma from '../config/database'

// Default inventory alert config
export const DEFAULT_INVENTORY_ALERT_CONFIG = {
  // Low stock warning thresholds (in days)
  lowStockWarningDays: 7,      // Warning: stock will last less than 7 days
  lowStockCriticalDays: 3,     // Critical: stock will last less than 3 days

  // Consumption variance thresholds (percentage)
  varianceWarningPercent: 10,  // Warning: actual vs theoretical variance > 10%
  varianceCriticalPercent: 20, // Critical: actual vs theoretical variance > 20%

  // Enable/disable alerts
  enableLowStockAlert: true,
  enableConsumptionAlert: true,

  // Auto-check interval (in hours)
  autoCheckIntervalHours: 24
}

export interface InventoryAlertConfig {
  lowStockWarningDays: number
  lowStockCriticalDays: number
  varianceWarningPercent: number
  varianceCriticalPercent: number
  enableLowStockAlert: boolean
  enableConsumptionAlert: boolean
  autoCheckIntervalHours: number
}

/**
 * Get inventory alert config for a store
 */
export async function getInventoryAlertConfig(storeId: string): Promise<InventoryAlertConfig> {
  const configs = await prisma.config.findMany({
    where: { storeId, category: 'inventory' }
  })

  const result: InventoryAlertConfig = { ...DEFAULT_INVENTORY_ALERT_CONFIG }

  for (const config of configs) {
    if (config.key === 'inventory_alert_config') {
      try {
        const saved = JSON.parse(config.value)
        Object.assign(result, saved)
      } catch {
        // Use defaults
      }
    }
  }

  return result
}

/**
 * Save inventory alert config for a store
 */
export async function saveInventoryAlertConfig(
  storeId: string,
  config: Partial<InventoryAlertConfig>
): Promise<InventoryAlertConfig> {
  const current = await getInventoryAlertConfig(storeId)
  const updated = { ...current, ...config }

  await prisma.config.upsert({
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
  })

  return updated
}
