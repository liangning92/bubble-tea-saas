const reasons: Record<string, string> = {
  INVENTORY_INSUFFICIENT: 'failureStock', OPEN_SHIFT_REQUIRED: 'failureShift', SHIFT_DISABLED: 'failureShiftDisabled',
  PAYMENT_METHOD_DISABLED: 'failurePaymentDisabled', PAYMENT_CONFIG_UNAVAILABLE: 'failurePaymentConfig',
  ORDER_IDEMPOTENCY_CONFLICT: 'failureOrderConflict', ORDER_REPLAY_UNVERIFIED: 'failureOrderUnverified',
  CHECKOUT_AMOUNT_RECONCILIATION_REQUIRED: 'failureAmount', CHECKOUT_RECOVERY_INVALID: 'failureRecovery',
  ERR_NETWORK: 'failureNetwork', ECONNABORTED: 'failureTimeout', ETIMEDOUT: 'failureTimeout',
}
export function readPOSFailure(value: unknown) {
  let metadata: any = value
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata) } catch { metadata = null } }
  const raw = metadata?.failureCode || metadata?.code || metadata?.error?.code || (typeof metadata?.error === 'string' ? metadata.error : '')
  const code = typeof raw === 'string' ? raw.slice(0, 160) : ''
  return { code, reasonKey: code ? reasons[code] || 'failureUnknown' : 'failureNotRecorded',
    httpStatus: Number.isInteger(metadata?.httpStatus) ? metadata.httpStatus : null,
    needsReview: metadata?.outcome === 'review', rejected: metadata?.outcome === 'rejected' }
}
