import prisma from '../config/database'
import { inventoryBusinessCalendar } from '../utils/inventoryBusinessCalendar'
import { loadInventoryActors } from '../utils/inventoryActors'

// Physical registrations, not automatic sales consumption or count corrections.
export const registeredStockOutReasons = ['withdrawal', 'loss', 'expired', 'other', 'process', 'transfer']
function businessNote(value: string | null) {
  if (!value) return ''
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? (typeof parsed.note === 'string' ? parsed.note : '') : (typeof parsed === 'string' ? parsed : value) } catch { return value }
}
export async function todayStockOuts(storeId: string, now = new Date(), db: any = prisma) {
  const calendar = await inventoryBusinessCalendar(storeId, db)
  const from = calendar.startOfDay(now), until = calendar.addDays(from, 1)
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
  return { date: calendar.formatDate(now), timezone: calendar.timezone, from: from.toISOString(), until: until.toISOString(), generatedAt: now.toISOString(), recordCount: rows.length, groups: [...groups.values()] }
}
