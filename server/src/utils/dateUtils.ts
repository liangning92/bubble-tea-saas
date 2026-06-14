// Date utility functions

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function startOfWeek(date: Date, startDay: number = 1): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day < startDay ? 7 : 0) + day - startDay
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfWeek(date: Date, startDay: number = 1): Date {
  const d = startOfWeek(date, startDay)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  d.setHours(23, 59, 59, 999)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function subDays(date: Date, days: number): Date {
  return addDays(date, -days)
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function subMonths(date: Date, months: number): Date {
  return addMonths(date, -months)
}

export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function getTimeRangeLabel(start: Date, end: Date): string {
  if (isSameDay(start, end)) {
    return formatDate(start, 'YYYY-MM-DD')
  }
  return `${formatDate(start, 'YYYY-MM-DD')} to ${formatDate(end, 'YYYY-MM-DD')}`
}

// Indonesian holidays (simplified)
const INDONESIAN_HOLIDAYS = [
  { name: 'Tahun Baru', month: 0, day: 1 },
  { name: 'Hari Raya Nyepi', month: 2, day: 11 },
  { name: 'Hari Kemerdekaan Indonesia', month: 7, day: 17 },
  { name: 'Natal', month: 11, day: 25 }
]

export function isHoliday(date: Date): { isHoliday: boolean; name?: string } {
  const holiday = INDONESIAN_HOLIDAYS.find(
    h => h.month === date.getMonth() && h.day === date.getDate()
  )
  return holiday ? { isHoliday: true, name: holiday.name } : { isHoliday: false }
}

// Ramadan dates (approximate - actual dates vary)
function getApproximateRamadan(year: number): { start: Date; end: Date } {
  // Ramadan moves back ~11 days each year
  // 2024: March 11 - April 9
  // 2025: Feb 28 - March 30
  // 2026: Feb 17 - March 18
  const baseYear = 2024
  const baseStart = new Date(baseYear, 2, 11)
  const daysDiff = Math.floor((year - baseYear) * 354.37 / 365.25 * 365.25) - Math.floor((year - baseYear) * 11)
  const start = new Date(baseStart.getTime() - daysDiff * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000)
  return { start, end }
}

export function isRamadan(date: Date): boolean {
  const ramadan = getApproximateRamadan(date.getFullYear())
  return date >= ramadan.start && date <= ramadan.end
}

export function isFriday(date: Date): boolean {
  return date.getDay() === 5 // Friday
}