// Expenses use integer rupiah in the form and hundredths in the finance ledger.
export function expenseAmountFromInput(value: string): number | null {
  const input = value.trim()
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(input)) return null
  const amount = Number(input.replace(/[.,]/g, '')) * 100
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647 ? amount : null
}

export function expenseCalendarDate(value: Date | string = new Date()): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10)
}
