import { createHash } from 'crypto'
import { z } from 'zod'
import { calendarStart, nextCalendarDate, loadStoreDateSettings } from '../utils/storeDateSettings'
import { convertQuantity } from '../utils/inventoryUnits'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'INVALID_CALENDAR_DATE')
export const evidenceExportQuery = z.object({
  storeId: z.string().min(1).max(100), startDate: date, endDate: date,
}).strict()
const MAX_ROWS = 20000
export class EvidenceExportError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function evidenceExportAccess(user: any, storeId: string) {
  if (!user || user.employeeApp) throw new EvidenceExportError(403, 'EVIDENCE_EXPORT_ACCESS_DENIED')
  // This first release deliberately supports only the authenticated store.
  if (!storeId || storeId !== user.storeId) throw new EvidenceExportError(403, 'EVIDENCE_EXPORT_STORE_DENIED')
  if (user.role !== 'admin' && (user.accessRole?.version !== 2 ||
      ['inventory.read', 'data.export', 'orders.read', 'products.read'].some(k => user.accessRole.modes?.[k] !== 'allow'))) {
    throw new EvidenceExportError(403, 'EVIDENCE_EXPORT_PERMISSIONS_REQUIRED')
  }
  return { includeCosts: user.role === 'admin' || user.accessRole?.modes?.['cost.read'] === 'allow' }
}
export function evidenceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)).digest('hex')
}
function bounded(rows: any[], name: string) {
  if (rows.length > MAX_ROWS) throw new EvidenceExportError(413, 'EVIDENCE_EXPORT_RANGE_TOO_LARGE:' + name)
  return rows
}
const iso = (value: any) => value == null ? null : new Date(value).toISOString()
const parsed = (value: any) => { try { return JSON.parse(value) } catch { return null } }
const ref = (table: string, row: any) => ({ table, id: row.id, recordedAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const safeId = (value: unknown) => typeof value === 'string' && value.length <= 200 ? value : null

/** Read-only evidence capture: no inferred historical inventory or recipe history.
 * All reads share a repeatable-read snapshot. Append-only request audit belongs
 * to the HTTP adapter, after a successful capture and before download. */
export async function exportInventoryEvidence(db: any, user: any, input: unknown, now = new Date()) {
  const query = evidenceExportQuery.parse(input), access = evidenceExportAccess(user, query.storeId)
  if (query.startDate > query.endDate || (Date.parse(query.endDate) - Date.parse(query.startDate)) / 86400000 > 30) {
    throw new EvidenceExportError(400, 'EVIDENCE_EXPORT_MAX_31_CALENDAR_DAYS')
  }
  const data = await db.$transaction(async (tx: any) => {
    const { timezone } = await loadStoreDateSettings(tx, query.storeId)
    const start = calendarStart(query.startDate, timezone), endExclusive = calendarStart(nextCalendarDate(query.endDate), timezone)
    const between = { gte: start, lt: endExclusive }, storeId = query.storeId
    // Bound nested relations before materializing any parent/child result set.
    // RepeatableRead keeps these counts and the subsequent reads consistent.
    const checkNestedCount = async (model: any, where: any, name: string) => {
      if (await model.count({ where }) > MAX_ROWS) throw new EvidenceExportError(413, 'EVIDENCE_EXPORT_RANGE_TOO_LARGE:' + name)
    }
    await checkNestedCount(tx.inventoryCountItem, { inventoryCount: { storeId, startDate: { lt: endExclusive }, endDate: { gte: start } }, inventory: { storeId } }, 'count_items')
    await checkNestedCount(tx.orderItem, { order: { storeId, createdAt: between } }, 'order_items')
    await checkNestedCount(tx.processRecipeItem, { processRecipe: { storeId } }, 'process_recipe_items')
    const selectOrder = { id: true, storeId: true, orderNumber: true, status: true, createdAt: true, updatedAt: true,
      items: { select: { id: true, productId: true, specId: true, quantity: true, createdAt: true } } }
    const inventories = bounded(await tx.inventory.findMany({ where: { storeId }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'inventory')
    const incoming = bounded(await tx.stockInLog.findMany({ where: { inventory: { storeId }, createdAt: between }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_ROWS + 1 }), 'stock_in')
    const outgoing = bounded(await tx.stockOutLog.findMany({ where: { inventory: { storeId }, createdAt: between }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_ROWS + 1 }), 'stock_out')
    const counts = bounded(await tx.inventoryCount.findMany({ where: { storeId, startDate: { lt: endExclusive }, endDate: { gte: start } }, include: { items: { where: { inventory: { storeId } }, orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'counts')
    if (counts.reduce((sum: number, r: any) => sum + r.items.length, 0) > MAX_ROWS) throw new EvidenceExportError(413, 'EVIDENCE_EXPORT_RANGE_TOO_LARGE:count_items')
    const orders = bounded(await tx.order.findMany({ where: { storeId, createdAt: between }, select: selectOrder, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'orders')
    const orderIds = new Set(orders.map((o: any) => o.id))
    if (orders.reduce((sum: number, r: any) => sum + r.items.length, 0) > MAX_ROWS) throw new EvidenceExportError(413, 'EVIDENCE_EXPORT_RANGE_TOO_LARGE:order_items')
    const consumption = bounded(await tx.orderConsumptionSnapshot.findMany({ where: { storeId, createdAt: between }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'consumption')
    const bom = bounded(await tx.bOMItem.findMany({ where: { product: { storeId }, inventory: { storeId } }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'bom')
    const processRecipes = bounded(await tx.processRecipe.findMany({ where: { storeId }, include: { items: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1 }), 'process_recipes')
    if (processRecipes.reduce((sum: number, r: any) => sum + r.items.length, 0) > MAX_ROWS) throw new EvidenceExportError(413, 'EVIDENCE_EXPORT_RANGE_TOO_LARGE:process_recipe_items')
    const materialMap = new Map(inventories.map((r: any) => [r.id, r]))
    const missing: Array<{ code: string; sourceId?: string; detail: string }> = [
      { code: 'HISTORICAL_OPENING_CLOSING_SNAPSHOTS_UNAVAILABLE', detail: 'Current Inventory rows are not opening/closing physical counts. No historical boundary values are invented.' },
      { code: 'HISTORICAL_RECIPE_VERSIONS_UNAVAILABLE', detail: 'BOM is the current revision. OrderConsumptionSnapshot preserves aggregate consumption, not a complete versioned recipe or order-line allocation.' },
      { code: 'EXTERNAL_VOUCHERS_NOT_VERIFIED', detail: 'Original record IDs are provided. External attachments, goods received and physical stock have not been independently verified.' },
      { code: 'CURRENT_PACKAGING_NOT_EXPORTED', detail: 'Only packaging frozen on the original movement is exported. Present-day packaging settings are not evidence of historical conversion.' },
      { code: 'BATCH_EXPIRY_NOT_EXPORTED', detail: 'Shelf life is the current material setting; individual batch expiry and historical package configurations are not included in this release.' },
    ]
    const movement = (row: any, type: string) => {
      const material: any = materialMap.get(row.inventoryId), note = parsed(row.note)
      if (!material) throw new EvidenceExportError(409, 'EVIDENCE_EXPORT_RELATION_CHANGED')
      const inputQuantity = Number.isFinite(note?.inputQuantity) ? note.inputQuantity : null
      const inputUnit = safeId(note?.inputUnit)
      let conversionVerified = false
      if (inputQuantity !== null && inputUnit && note?.ledgerUnit === material.unit) {
        try { conversionVerified = Math.abs(convertQuantity(inputQuantity, inputUnit, material.unit, note?.pack || null) - row.quantity) < 1e-8 } catch { /* explicitly incomplete */ }
      }
      if (!conversionVerified) missing.push({ code: 'INPUT_CONVERSION_UNVERIFIED', sourceId: type + ':' + row.id, detail: 'Persisted ledger quantity is preserved; original input unit/package conversion cannot be confirmed.' })
      return { transactionId: row.id, storeId, inventoryId: row.inventoryId, type,
        reason: type === 'stock_in' ? 'receipt' : row.reason, quantity: row.quantity, ledgerUnit: material.unit,
        inputQuantity, inputUnit, conversionVerified, conversionRuleVersion: conversionVerified && Number.isInteger(note.version) ? note.version : null,
        packageSnapshot: conversionVerified && note.pack ? { unit: safeId(note.pack.unit), quantity: note.pack.quantity, baseUnit: safeId(note.pack.baseUnit) } : null,
        ledgerSequence: row.ledgerSequence == null ? null : String(row.ledgerSequence),
        actorId: row.staffId ?? null, supplierId: row.supplierId ?? null, orderId: row.orderId ?? null,
        note: user.role === 'admin' ? (typeof note?.note === 'string' ? note.note : note ? null : row.note ?? null) : null,
        consumptionSnapshotId: safeId(note?.snapshotId), purchaseOrderId: row.purchaseOrderId ?? null,
        batchId: row.batchId ?? null, recordedAt: iso(row.createdAt),
        businessAt: iso(row.createdAt), businessTimeBasis: 'database_createdAt; original operation time may be unavailable',
        voucherStatus: 'record_only_unverified', source: ref(type === 'stock_in' ? 'StockInLog' : 'StockOutLog', row),
        ...(access.includeCosts && type === 'stock_in' ? { unitCost: row.unitCost, totalCost: row.totalAmount } : {}) }
    }
    const mappedConsumption = consumption.map((row: any) => {
      const materials = parsed(row.materials), issues = parsed(row.issues)
      const valid = Array.isArray(materials) && materials.every((m: any) => materialMap.has(m?.inventoryId) && Number.isFinite(m.quantity) && typeof m.unit === 'string')
      if (!valid) missing.push({ code: 'CONSUMPTION_MATERIALS_INVALID', sourceId: row.id, detail: 'Invalid or foreign material references are omitted; original record must be investigated.' })
      const orderLinked = orderIds.has(row.orderId)
      if (!orderLinked) missing.push({ code: 'ORDER_SNAPSHOT_LINK_UNRESOLVED', sourceId: row.id, detail: 'Consumption key is not a unique order in the selected period; no name-based matching is attempted.' })
      return { id: row.id, storeId, orderId: row.orderId, orderLinked, materials: valid ? materials.map((m: any) => ({ inventoryId: m.inventoryId, quantity: m.quantity, unit: m.unit })) : [],
        issues: Array.isArray(issues) ? issues.map((i: any) => ({ code: safeId(i?.code), productId: safeId(i?.productId), inventoryId: materialMap.has(i?.inventoryId) ? i.inventoryId : null })) : [{ code: 'INVALID_ISSUES_JSON' }],
        reversedAt: iso(row.reversedAt), source: ref('OrderConsumptionSnapshot', row) }
    })
    const snapshots = inventories.map((row: any) => ({ snapshotId: 'current:' + row.id, storeId, inventoryId: row.id, name: row.name, category: row.category, type: row.type,
      unit: row.unit, quantity: row.currentStock, snapshotKind: 'current_book_only', sourceUpdatedAt: iso(row.updatedAt),
      safetyStock: row.safetyStock, minStock: row.minStock, maxStock: row.maxStock, concentrateRatio: row.concentrateRatio, shelfLife: row.shelfLife,
      ledgerSequence: String(row.ledgerSequence ?? 0), ledgerEpoch: String(row.ledgerEpoch ?? 0),
      ...(access.includeCosts ? { avgCost: row.avgCost } : {}), source: ref('Inventory', row) }))
    const mappedOrders = orders.map((r: any) => ({ ...r, items: [...r.items].sort((a: any, b: any) => a.id.localeCompare(b.id)), source: ref('Order', r) }))
    const mappedCounts = counts.map((r: any) => ({ id: r.id, storeId, status: r.status, startDate: iso(r.startDate), endDate: iso(r.endDate), source: ref('InventoryCount', r),
      items: r.items.map((i: any) => ({ id: i.id, inventoryId: i.inventoryId, systemQuantity: i.systemQty, countedQuantity: i.countedQty, variance: i.variance, countedAt: iso(i.countedAt), countedBy: i.countedBy,
        evidenceStatus: i.countedAt && i.countedQty !== null ? 'record_only_unverified' : 'missing' })) }))
    for (const r of processRecipes) if (r.items.some((i: any) => i.inventoryId != null && !materialMap.has(i.inventoryId))) missing.push({ code: 'PROCESS_RECIPE_MATERIAL_LINK_UNRESOLVED', sourceId: r.id, detail: 'Unknown or foreign inventory reference omitted.' })
    return { schemaVersion: 'inventory-evidence-v1', query, timezone, start: start.toISOString(), endExclusive: endExclusive.toISOString(),
      evidenceStatus: 'incomplete', businessVerified: false, costsIncluded: access.includeCosts,
      snapshots, movements: [...incoming.map((r: any) => movement(r, 'stock_in')), ...outgoing.map((r: any) => movement(r, 'stock_out'))],
      counts: mappedCounts, orders: mappedOrders, consumption: mappedConsumption,
      currentRecipes: bom.map((r: any) => ({ id: r.id, storeId, productId: r.productId, inventoryId: r.inventoryId, version: r.version, auditStatus: r.auditStatus,
        quantity: r.quantity, unit: r.unit, historicalApplicability: 'unverified', source: ref('BOMItem', r) })),
      currentProcessRecipes: processRecipes.map((r: any) => ({ id: r.id, storeId, status: r.status, outputUnit: r.outputUnit, historicalApplicability: 'unverified', source: ref('ProcessRecipe', r),
        items: r.items.filter((i: any) => i.inventoryId == null || materialMap.has(i.inventoryId)).map((i: any) => ({ id: i.id, inventoryId: i.inventoryId, type: i.type, quantity: i.quantity,
          unit: i.type === 'output' ? r.outputUnit : (materialMap.get(i.inventoryId) as any)?.unit ?? null })) })), missing }
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 })
  for (const rows of [data.snapshots, data.movements, data.counts, data.orders, data.consumption, data.currentRecipes, data.currentProcessRecipes]) {
    for (const row of rows) (row.source as any).checksum = evidenceHash(row)
  }
  const contentHash = evidenceHash(data)
  return { exportId: 'inventory-evidence-v1:' + contentHash, contentHash, generatedAt: now.toISOString(),
    hashScope: 'data only; generatedAt and requester excluded', requestedBy: { userId: user.id, role: user.role }, data }
}
