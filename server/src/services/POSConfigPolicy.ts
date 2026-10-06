import prisma from '../config/database'

// Store configuration overrides global configuration, including an explicit all-off list.
export async function checkPaymentMethod(storeId: string, method: string): Promise<string | null> {
  const configs = await prisma.config.findMany({
    where: { key: 'paymentMethods', storeId: { in: ['', storeId] } },
    orderBy: { storeId: 'asc' }
  })
  const row = configs.find(c => c.storeId === storeId) || configs.find(c => c.storeId === '')
  if (!row) return 'PAYMENT_CONFIG_UNAVAILABLE'
  try {
    const value: unknown = JSON.parse(row.value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'PAYMENT_CONFIG_UNAVAILABLE'
    return (value as Record<string, unknown>)[method] === true ? null : 'PAYMENT_METHOD_DISABLED'
  } catch {
    return 'PAYMENT_CONFIG_UNAVAILABLE'
  }
}
