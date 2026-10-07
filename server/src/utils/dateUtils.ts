const WIB = 7 * 3600000
const calendar = (date:Date) => new Date(date.getTime()+WIB)
const instant = (date:Date) => new Date(date.getTime()-WIB)
export function startOfDay(date:Date):Date { const d=calendar(date); d.setUTCHours(0,0,0,0);return instant(d) }
export function endOfDay(date:Date):Date { return new Date(startOfDay(date).getTime()+86400000-1) }
export function startOfTodayJakarta():Date { return startOfDay(new Date()) }
export function startOfWeek(date:Date,startDay:number=1):Date { const d=calendar(startOfDay(date));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()-startDay+7)%7));return instant(d) }
export function endOfWeek(date:Date,startDay:number=1):Date {return new Date(startOfWeek(date,startDay).getTime()+7*86400000-1)}
export function startOfMonth(date:Date):Date {const d=calendar(date);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-WIB)}
export function endOfMonth(date:Date):Date {const d=calendar(date);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-WIB-1)}
export function addDays(date:Date,days:number):Date {return new Date(date.getTime()+days*86400000)}
export function subDays(date:Date,days:number):Date {return addDays(date,-days)}
export function addMonths(date:Date,months:number):Date {
 const d=calendar(date),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months)
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return instant(d)
}

export function subMonths(date: Date, months: number): Date {
  return addMonths(date, -months)
}

export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const local = calendar(date)
  const year = local.getUTCFullYear()
  const month = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  const hours = String(local.getUTCHours()).padStart(2, '0')
  const minutes = String(local.getUTCMinutes()).padStart(2, '0')
  const seconds = String(local.getUTCSeconds()).padStart(2, '0')

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

export function isSameDay(a:Date,b:Date):boolean {return startOfDay(a).getTime()===startOfDay(b).getTime()}

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