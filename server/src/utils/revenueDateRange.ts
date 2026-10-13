import { DEFAULT_TIMEZONE, calendarDate as storeCalendarDate, calendarStart, nextCalendarDate, calendarParts, shiftCalendarMonth } from './storeDateSettings'
export class RevenueDateError extends Error {}
const invalid = (): never => { throw new RevenueDateError('Invalid revenue date range') }

export function businessCalendarDate(date: Date,timezone=DEFAULT_TIMEZONE): string {return storeCalendarDate(date,timezone)}
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value
}
export function parseRevenueDate(value: unknown, end = false,timezone=DEFAULT_TIMEZONE): Date {
  if (typeof value !== 'string') return invalid()
  if (calendarDate(value)) return end ? new Date(calendarStart(nextCalendarDate(value),timezone).getTime()-1) : calendarStart(value,timezone)
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
export function revenuePeriodRange(query: {period?:unknown;startDate?:unknown;endDate?:unknown}, now = new Date(), defaultPeriod = 'today',timezone=DEFAULT_TIMEZONE) {
  // Supplied dates are never silently discarded by a fixed/default period.
  const suppliedStart = query.startDate === undefined ? undefined : parseRevenueDate(query.startDate,false,timezone)
  const suppliedEnd = query.endDate === undefined ? undefined : parseRevenueDate(query.endDate,true,timezone)
  if (suppliedStart && suppliedEnd) checked(suppliedStart,suppliedEnd)
  const period = query.period === undefined ? defaultPeriod : query.period
  if (period === 'custom') {
    if (!suppliedStart || !suppliedEnd) return invalid()
    return checked(suppliedStart,suppliedEnd)
  }
  if (suppliedStart || suppliedEnd) throw new RevenueDateError('Explicit dates require period=custom')
  if (!['yesterday','today','week','month'].includes(String(period)) || typeof period !== 'string') return invalid()
  const date=businessCalendarDate(now,timezone),today=calendarStart(date,timezone)
  if(period==='yesterday'){const first=nextCalendarDate(date,-1);return {start:calendarStart(first,timezone),end:new Date(today.getTime()-1)}}
  if(period==='today')return {start:today,end:new Date(calendarStart(nextCalendarDate(date),timezone).getTime()-1)}
  if(period==='week'){
    const weekday=new Date(date+'T00:00:00Z').getUTCDay(),first=nextCalendarDate(date,-((weekday+6)%7))
    return {start:calendarStart(first,timezone),end:new Date(calendarStart(nextCalendarDate(first,7),timezone).getTime()-1)}
  }
  const p=calendarParts(now,timezone),first=`${p.year}-${String(p.month).padStart(2,'0')}-01`,next=new Date(Date.UTC(p.year,p.month,1)).toISOString().slice(0,10)
  return {start:calendarStart(first,timezone),end:new Date(calendarStart(next,timezone).getTime()-1)}
}

export function revenueDailyRange(query: {startDate?:unknown;endDate?:unknown},now = new Date(),timezone=DEFAULT_TIMEZONE) {
  const month = revenuePeriodRange({period:'month'},now,'today',timezone)
  const today = revenuePeriodRange({period:'today'},now,'today',timezone)
  return checked(query.startDate===undefined?month.start:parseRevenueDate(query.startDate,false,timezone),query.endDate===undefined?today.end:parseRevenueDate(query.endDate,true,timezone))
}
// Like subMonths, clamp the calendar day while retaining time within the WIB day.

export function revenueComparisonRange(period: unknown,range: {start:Date;end:Date},timezone=DEFAULT_TIMEZONE) {
  checked(range.start,range.end)
  if (period==='yesterday'||period==='today'||period==='week') {
    const days=period==='week'?7:1,first=nextCalendarDate(businessCalendarDate(range.start,timezone),-days),last=nextCalendarDate(businessCalendarDate(range.end,timezone),-days+1)
    return {start:calendarStart(first,timezone),end:new Date(calendarStart(last,timezone).getTime()-1),adjusted:false}
  }
  const start = shiftCalendarMonth(range.start,timezone)
  const end = shiftCalendarMonth(range.end,timezone)
  const duration = range.end.getTime()-range.start.getTime()
  const adjusted = end.getTime()<start.getTime() || (duration>0 && end.getTime()===start.getTime())
  // Independent month-end clamping may invert or collapse a valid interval.
  // Keep the prior-month end anchor and retain exact elapsed duration in that case.
  const previous = checked(adjusted?new Date(end.getTime()-duration):start,end)
  return {...previous,adjusted}
}
