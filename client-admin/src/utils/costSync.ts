// Only derived read models: edit-form queries must not reset unsaved input.
export const costQueryKeys = new Set([
  'inventory', 'inventory-all-items', 'inventory-alerts', 'inventory-alert-center',
  'materials', 'material-alerts', 'materials-for-recipe', 'process-recipes',
  'products', 'bom-products', 'bom-product'
])
export const COST_SYNC_EVENT = 'inventory-costs-changed'
export const COST_SYNC_INTERVAL = 10_000

export function isCostMutation(method?: string, url = ''): boolean {
  return method?.toLowerCase() === 'post' &&
    /(?:manual-logs\/(?:stock_in|stock_out)\/[^/?]+\/corrections(?:\?|$))|(?:^|\/)purchase-orders\/[^/?]+\/(?:receive|reverse-receipt)(?:\?|$)/.test(url)
}
