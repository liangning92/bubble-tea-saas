export const handoverReceiptFields = [
  'storeName', 'sessionId', 'cashierName', 'shiftType', 'openedAt', 'closedAt', 'printedAt',
  'openFloat', 'cashSales', 'qrisSales', 'cashIn', 'cashOut', 'recordedBalance', 'closeCash',
  'expectedCash', 'variance', 'orderCount', 'cupCount', 'expenses', 'cashierSignature', 'supervisorSignature'
] as const
export type HandoverReceiptField = typeof handoverReceiptFields[number]

/** New print choices override legacy summary choices, preserving old stores' defaults. */
export function resolveHandoverReceiptItems(settings: any = {}): Record<HandoverReceiptField, boolean> {
  return Object.fromEntries(handoverReceiptFields.map(key => [key,
    typeof settings?.receiptItems?.[key] === 'boolean'
      ? settings.receiptItems[key] : settings?.summaryItems?.[key] !== false
  ])) as Record<HandoverReceiptField, boolean>
}
