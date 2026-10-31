import prisma from '../config/database'
import { inventoryBusinessCalendar } from '../utils/inventoryBusinessCalendar'
import { loadInventoryActors } from '../utils/inventoryActors'
import {z} from 'zod'
import {revenuePeriodRange} from '../utils/revenueDateRange'

// Physical registrations, not automatic sales consumption or count corrections.
export const registeredStockOutReasons = ['withdrawal', 'loss', 'expired', 'other', 'process', 'transfer']
function businessNote(value: string | null) {
  if (!value) return ''
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? (typeof parsed.note === 'string' ? parsed.note : '') : (typeof parsed === 'string' ? parsed : value) } catch { return value }
}
export const stockOutReportSchema=z.object({period:z.enum(['today','yesterday','week','month','custom']).default('today'),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).strict().describe('Complete registered physical stock-outs for the store business calendar range. Supports today, yesterday, current week/month, or inclusive custom startDate/endDate (YYYY-MM-DD). Excludes automatic sales consumption.')
export async function todayStockOuts(storeId:string,now=new Date(),db:any=prisma){return registeredStockOutReport(storeId,{period:'today'},now,db)}
export async function registeredStockOutReport(storeId:string,input:unknown,now=new Date(),db:any=prisma){
  const filter=stockOutReportSchema.parse(input),calendar=await inventoryBusinessCalendar(storeId,db)
  if(filter.period==='custom'&&(!filter.startDate||!filter.endDate))throw Error('STOCK_OUT_DATES_REQUIRED')
  const range=revenuePeriodRange(filter,now,'today',calendar.timezone),from=range.start,until=new Date(range.end.getTime()+1)
  const first=calendar.formatDate(from),last=calendar.formatDate(range.end)
  if(from>=until||calendar.dayCount(from,range.end)>=366)throw Error('STOCK_OUT_RANGE_TOO_LARGE')
  // Deliberately no history limit: all today's registrations must be included.
  const rows = await db.stockOutLog.findMany({
    where: { inventory: { storeId }, createdAt: { gte: from, lt: until }, reason: { in: registeredStockOutReasons } },
    select: { id: true, inventoryId: true, quantity: true, reason: true, staffId: true, note: true, createdAt: true, inventory: { select: { name: true, unit: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  })
  const actors = await loadInventoryActors(db, storeId, rows.map((row: any) => row.staffId))
  const groups = new Map<string, { inventoryId: string; name: string; unit: string; quantity: number; entries: any[] }>()
  for (const row of rows) {
    let group = groups.get(row.inventoryId)
    if (!group) { group = { inventoryId: row.inventoryId, name: row.inventory.name, unit: row.inventory.unit, quantity: 0, entries: [] }; groups.set(row.inventoryId, group) }
    group.quantity += row.quantity
    group.entries.push({ id: row.id, quantity: row.quantity, reason: row.reason, createdAt: row.createdAt, operator: actors.get(row.staffId) || null, note: businessNote(row.note) })
  }
  return { date:first===last?first:first+' — '+last, startDate:first,endDate:last,period:filter.period, timezone: calendar.timezone, from: from.toISOString(), until: until.toISOString(), generatedAt: now.toISOString(), recordCount: rows.length, groups: [...groups.values()] }
}
