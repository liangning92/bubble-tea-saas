/** Display full IDR amounts rounded to integers; source amounts retain their precision. */
export function formatExactCurrency(amount: number): string {
  if (amount === undefined || amount === null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(Math.abs(amount) < 0.5 ? 0 : amount)
}
