import { resolveHandoverReceiptItems } from '../../../shared/utils/handoverReceipt'

/** Keep one editable field map; old settings are converted when next saved. */
export function normalizeHandoverSettings(settings: any = {}) {
  const { summaryItems, showSummary: _showSummary, ...rest } = settings
  const legacy = summaryItems || {}
  const receiptItems = resolveHandoverReceiptItems({
    ...settings,
    summaryItems: {
      ...legacy,
      cashReceived: legacy.cashReceived ?? legacy.cashSales,
      cashReceipts: legacy.cashReceipts ?? legacy.cashSales,
      qrisReceipts: legacy.qrisReceipts ?? legacy.qrisSales,
    },
  })
  return { ...rest, receiptItems }
}
