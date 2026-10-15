// Interpret persisted audit events without changing their original status or severity.
const states = ['pending', 'sent', 'failed', 'unknown', 'paper-confirmed'] as const
const reasons: Record<string, string> = {
  RECEIPT_PAINT_TIMEOUT: 'paintTimeout', RECEIPT_DELIVERY_TIMEOUT: 'deliveryTimeout',
  PRINTER_API_UNAVAILABLE: 'apiUnavailable', PRINTER_TARGET_UNAVAILABLE: 'targetUnavailable',
}
export function readReceiptLog(log: { action?: string; metadata?: unknown; description?: string; entityId?: string }) {
  if (log.action !== 'receipt_print') return null
  let meta: any = log.metadata
  if (typeof meta === 'string') { try { meta = JSON.parse(meta) } catch { meta = null } }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {}
  const recordedStatus = typeof meta.status === 'string' ? meta.status : log.description?.match(/^Receipt (?:output|recovery): ([a-z-]+)$/)?.[1]
  const status = states.find(state => state === recordedStatus) || 'unrecorded'
  const rawError = typeof meta.error === 'string' ? meta.error : typeof meta.error?.code === 'string' ? meta.error.code : ''
  const reason = reasons[rawError] || (rawError.startsWith('Print delivery unconfirmed:') ? 'deliveryTimeout' : 'unknownReason')
  const text = (value: unknown) => typeof value === 'string' ? value : ''
  return { status, reason, orderNumber: text(meta.orderNumber) || text(log.entityId), pickupNumber: text(meta.pickupNumber), error: rawError }
}
