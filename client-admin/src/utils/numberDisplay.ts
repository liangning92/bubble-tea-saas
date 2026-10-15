/** Presentation only: round halves away from zero without altering source values. */
const integer = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'number' && typeof value !== 'string') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return typeof value === 'string' ? value : '—'
  return integer.format(Math.abs(numeric) < 0.5 ? 0 : numeric)
}
