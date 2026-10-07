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
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime()>end.getTime()) return invalid()
  return {start,end}
}
export function revenuePeriodRange(query: {period?:unknown;startDate?:unknown;endDate?:unknown}, now = new Date(), defaultPeriod = 'today') {
  // Supplied dates are never silently discarded by a fixed/default period.
  const suppliedStart = query.startDate === undefined ? undefined : parseRevenueDate(query.startDate)
  const suppliedEnd = query.endDate === undefined ? undefined : parseRevenueDate(query.endDate,true)
  if (suppliedStart && suppliedEnd) checked(suppliedStart,suppliedEnd)
  const period = query.period === undefined ? defaultPeriod : query.period
  if (period === 'custom') {
    if (!suppliedStart || !suppliedEnd) return invalid()
    return checked(suppliedStart,suppliedEnd)
  }
  if (suppliedStart || suppliedEnd) throw new RevenueDateError('Explicit dates require period=custom')
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
  checked(range.start,range.end)
  if (period==='today'||period==='week') {
    const offset = (period==='today'?1:7)*DAY
    return {start:new Date(range.start.getTime()-offset),end:new Date(range.end.getTime()-offset),adjusted:false}
  }
  const start = previousMonth(range.start)
  const end = previousMonth(range.end)
  const duration = range.end.getTime()-range.start.getTime()
  const adjusted = end.getTime()<start.getTime() || (duration>0 && end.getTime()===start.getTime())
  // Independent month-end clamping may invert or collapse a valid interval.
  // Keep the prior-month end anchor and retain exact elapsed duration in that case.
  const previous = checked(adjusted?new Date(end.getTime()-duration):start,end)
  return {...previous,adjusted}
}
