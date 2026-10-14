/** Keep the complete numeric value; never abbreviate thousands or round away decimals. */
export function formatExactCurrency(amount: number): string {
  if (amount === undefined || amount === null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 20
  }).format(amount)
}
