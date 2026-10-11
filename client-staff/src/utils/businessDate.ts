const WIB = 7 * 60 * 60 * 1000

export function businessDate(date = new Date()): string {
  return new Date(date.getTime() + WIB).toISOString().slice(0, 10)
}

export function businessWeekStart(date: Date): Date {
  const day = businessDate(date)
  const midnight = new Date(`${day}T00:00:00+07:00`)
  const weekday = new Date(midnight.getTime() + WIB).getUTCDay()
  return new Date(midnight.getTime() - ((weekday + 6) % 7) * 86400000)
}

export function businessWeekday(date: Date): number {
  return new Date(date.getTime() + WIB).getUTCDay()
}
