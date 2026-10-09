type CartItem = { id: string; productId: string; productName: string; specName: string; quantity: number; unitPrice: number; sugarLevelName?: string; iceLevelName?: string; addons: { name: string; price: number; qty: number }[] }
/** A reported cart value, before checkout discounts and taxes. */
export function cartAuditSnapshot(cart: CartItem[]) {
  const items = cart.map(item => {
    const addons = item.addons.map(addon => ({ name: addon.name, price: addon.price, quantity: addon.qty }))
    const unitPrice = item.unitPrice + addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0)
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || addons.some(a => !Number.isFinite(a.price) || a.price < 0 || !Number.isSafeInteger(a.quantity) || a.quantity <= 0)) throw new Error('CART_AUDIT_INVALID')
    return { id: item.id, productId: item.productId, productName: item.productName, specName: item.specName, options: [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(' / '), quantity: item.quantity, unitPrice, addons, lineTotal: unitPrice * item.quantity }
  })
  return { version: 1, items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0) }
}
