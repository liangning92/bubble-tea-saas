const DAY = 86400000
const WIB = 7 * 3600000
export class RevenueDateError extends Error {}
const invalid = (): never => { throw new RevenueDateError('Invalid revenue date range') }

export function businessCalendarDate(date: Date): string {
  return new Date(date.getTime()+WIB).toISOString().slice(0,10)
}
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value
}
export function parseRevenueDate(value: unknown, end = false): Date {
  if (typeof value !== 'string') return invalid()
  if (calendarDate(value)) return new Date(Date.parse(`${value}T00:00:00.000Z`)-WIB+(end?DAY-1:0))
  // Calendar validation also rejects Date.parse's normalization of Feb30.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !calendarDate(value.slice(0,10))) return invalid()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return invalid()
  return date
}
function checked(start: Date, end: Date) {
  if (start.getTime()>end.getTime()) return invalid()
  return {start,end}
}
export function revenuePeriodRange(query: {period?:unknown;startDate?:unknown;endDate?:unknown}, now = new Date(), defaultPeriod = 'today') {
  const period = query.period === undefined ? defaultPeriod : query.period
  if (period === 'custom') return checked(parseRevenueDate(query.startDate),parseRevenueDate(query.endDate,true))
  if (!['today','week','month'].includes(String(period)) || typeof period !== 'string') return invalid()
  const today = parseRevenueDate(businessCalendarDate(now))
  if (period === 'today') return {start:today,end:new Date(today.getTime()+DAY-1)}
  const calendar = new Date(today.getTime()+WIB)
  if (period === 'week') {
    const start = new Date(today.getTime()-calendar.getUTCDay()*DAY)
    return {start,end:new Date(start.getTime()+7*DAY-1)}
  }
  const start = new Date(Date.UTC(calendar.getUTCFullYear(),calendar.getUTCMonth(),1)-WIB)
  const end = new Date(Date.UTC(calendar.getUTCFullYear(),calendar.getUTCMonth()+1,1)-WIB-1)
  return {start,end}
}
export function revenueDailyRange(query: {startDate?:unknown;endDate?:unknown},now = new Date()) {
  const month = revenuePeriodRange({period:'month'},now)
  const today = revenuePeriodRange({period:'today'},now)
  return checked(query.startDate===undefined?month.start:parseRevenueDate(query.startDate),query.endDate===undefined?today.end:parseRevenueDate(query.endDate,true))
}
// Like subMonths, clamp the calendar day while retaining time within the WIB day.
function previousMonth(date: Date) {
  const local = new Date(date.getTime()+WIB),day = local.getUTCDate()
  local.setUTCDate(1)
  local.setUTCMonth(local.getUTCMonth()-1)
  const last = new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate()
  local.setUTCDate(Math.min(day,last))
  return new Date(local.getTime()-WIB)
}
export function revenueComparisonRange(period: unknown,range: {start:Date;end:Date}) {
  if (period==='today'||period==='week') {
    const offset = (period==='today'?1:7)*DAY
    return {start:new Date(range.start.getTime()-offset),end:new Date(range.end.getTime()-offset)}
  }
  return {start:previousMonth(range.start),end:previousMonth(range.end)}
}
