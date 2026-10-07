import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export const validInstant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
// Indonesia store business day, independent of the browser's local timezone.
export function businessDay(instant: string) {
  if (!validInstant(instant)) throw new Error('DASHBOARD_CONTEXT_INVALID')
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant))
  const part = (type: string) => parts.find(p=>p.type===type)!.value
  const start = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00+07:00`)
  return {startDate:new Date(start).toISOString(),endDate:new Date(start+86400000-1).toISOString()}
}
export function dashboardLink(path: string, context: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key,value] of Object.entries(context)) if (value !== undefined) params.set(key,value)
  return `${path}?${params.toString()}`
}
export function useDashboardContext() {
  const {user} = useAuthStore()
  const [params] = useSearchParams()
  const storeId = user?.storeId || undefined
  const startDate = params.get('startDate') || undefined
  const endDate = params.get('endDate') || undefined
  const asOf = params.get('asOf') || undefined
  const valid = !!storeId && (!params.has('storeId') || params.get('storeId') === storeId) &&
    (!asOf || validInstant(asOf)) && (!startDate && !endDate || !!startDate && !!endDate && validInstant(startDate) && validInstant(endDate) && Date.parse(startDate) <= Date.parse(endDate))
  return {valid,storeId,startDate:startDate&&validInstant(startDate)?new Date(startDate).toISOString():undefined,endDate:endDate&&validInstant(endDate)?new Date(endDate).toISOString():undefined,asOf:asOf&&validInstant(asOf)?new Date(asOf).toISOString():undefined,range:params.get('range') || '',forecastDays:params.get('forecastDays')}
}

export function requireRead<T>(value: T, valid: boolean): T {
  if (!valid) throw new Error('DASHBOARD_READ_INVALID')
  return value
}
export const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
export function validDashboard(value: any): boolean {
  return !!value && validInstant(value.timestamp) &&
    ['orders','revenue','averageOrder','cost','profit'].every(k=>finiteNumber(value.today?.[k])) &&
    ['orders','revenue','cost','profit','goalProgress'].every(k=>finiteNumber(value.thisMonth?.[k])) &&
    ['newMembers','ratio'].every(k=>finiteNumber(value.member?.[k])) &&
    ['checkedIn','total','pendingLeave'].every(k=>finiteNumber(value.staff?.[k])) &&
    Array.isArray(value.topProducts) && value.topProducts.every((row:any)=>typeof row?.id==='string' && typeof row.name==='string' && finiteNumber(row.quantity)) &&
    Array.isArray(value.recentOrders) && value.recentOrders.every((row:any)=>typeof row?.id==='string' && typeof row.orderNumber==='string' && finiteNumber(row.finalAmount) && validInstant(row.createdAt)) &&
    Array.isArray(value.inventory?.lowStockItems) && value.inventory.lowStockItems.every((row:any)=>typeof row?.id==='string' && typeof row.name==='string' && finiteNumber(row.currentStock) && finiteNumber(row.safetyStock))
}
