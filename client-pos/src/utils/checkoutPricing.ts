// A quote signature also covers gifts/activity versions. Those changes alone
// do not mean the cashier's displayed prices have changed.
export function checkoutPriceChanged(previous: any, next: any): boolean {
  const prices = (quote: any) => ({
    subtotal: quote.subtotal,
    discount: quote.discount,
    finalAmount: quote.finalAmount,
    tax: quote.tax,
    grandTotal: quote.grandTotal,
    pointsRedeemed: quote.pointsRedeemed || 0,
    items: quote.items.map((item: any) => ({
      productId: item.productId, specId: item.specId,
      quantity: item.quantity, unitPrice: item.unitPrice,
      addons: (item.addons || []).map((addon: any) => ({
        name: addon.name, price: addon.price, qty: addon.qty || 1,
      })),
    })),
  })
  return JSON.stringify(prices(previous)) !== JSON.stringify(prices(next))
}
