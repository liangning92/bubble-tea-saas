// Store requirement: a prepared POS must keep operating for 30 consecutive days offline.
export const POS_OFFLINE_DAYS = 30
export const POS_OFFLINE_TTL_MS = POS_OFFLINE_DAYS * 24 * 60 * 60 * 1000
export const POS_MANUAL_PAYMENT_METHODS = ['cash','qris','gopay','ovo','dana','shopeepay','debit','card'] as const
