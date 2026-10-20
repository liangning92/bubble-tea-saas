import { createHash } from 'crypto'
import { z } from 'zod'

const sequence = z.string().regex(/^\d+$/)
const instant = z.string().datetime()
const finite = z.number().finite()
const boundarySchema = z.object({ inventoryId: z.string(), sequence, epoch: sequence }).strict()
const observationSchema = z.object({
  countId: z.string(), itemId: z.string(), observedAt: instant.nullable(), unit: z.string().nullable(),
  bookStockAtObservation: finite.nullable(), physicalStock: finite.nullable(),
  boundary: boundarySchema.nullable(), sourceIds: z.array(z.string()),
  comparable: z.boolean(), difference: finite.nullable(),
  comparisonBasis: z.literal('historical_observation_boundary'), blockers: z.array(z.string())
}).strict()
export const stockReadOnlySnapshotSchema = z.object({
  schema: z.literal('team.stock.readonly.v1'), pilot: z.literal('STOCK-RO-001'), storeId: z.string(),
  items: z.array(z.object({
    id: z.string(), name: z.string(), unit: z.string(), stock: finite, updatedAt: instant,
    ledgerBoundary: boundarySchema, sourceId: z.string(), negativeBookBalance: z.boolean(),
    // Current book stock and an older physical observation are distinct facts.
    currentDifference: finite.nullable(), currentComparable: z.boolean(),
    observation: observationSchema.nullable(), blockers: z.array(z.string())
  }).strict()),
  boundaries: z.literal('Read-only facts; historical difference is physical minus book at the certified observation boundary, never physical minus current stock. Missing counts are unknown, not zero. A negative book balance is not proof of physical shortage.'),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export type StockReadOnlySnapshot = z.infer<typeof stockReadOnlySnapshotSchema>
const iso = (v: unknown): string | null => {
  if (!(v instanceof Date) && typeof v !== 'string') return null
  const n = new Date(v).getTime(); return Number.isFinite(n) ? new Date(n).toISOString() : null
}
const amount = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
const COUNT_OBSERVATION_PREFIX = 'inventoryCountObservation.'

/** Only reads, inside one repeatable-read snapshot. Never use a current balance
 * as the ledger balance at an older count, or infer missing physical counts. */
export async function buildTeamStockReadOnlySource(db: any, storeId: string): Promise<StockReadOnlySnapshot> {
  z.string().trim().min(1).parse(storeId)
  if (typeof db.$transaction !== 'function') throw Error('STOCK_READONLY_SNAPSHOT_TRANSACTION_REQUIRED')
  return db.$transaction(async (tx: any) => {
    const inventory = await tx.inventory.findMany({ where: { storeId }, orderBy: { id: 'asc' },
      select: { id: true, name: true, unit: true, currentStock: true, updatedAt: true, ledgerSequence: true, ledgerEpoch: true } })
    const items: StockReadOnlySnapshot['items'] = []
    for (const row of inventory) {
      const stock = amount(row.currentStock), updatedAt = iso(row.updatedAt)
      const current = boundarySchema.safeParse({ inventoryId: row.id, sequence: String(row.ledgerSequence), epoch: String(row.ledgerEpoch) })
      if (stock === null || !updatedAt || !current.success) throw Error('STOCK_READONLY_INVALID_NATIVE_FACT')
      const sourceId = `inventory:${row.id}:${current.data.epoch}:${current.data.sequence}`
      const latest = await tx.inventoryCountItem.findFirst({ where: { inventoryId: row.id, inventory: { storeId }, inventoryCount: { storeId, status: 'completed' }, countedAt: { not: null }, countedQty: { not: null } },
        orderBy: [{ countedAt: 'desc' }, { id: 'asc' }], select: { id: true, inventoryCountId: true, systemQty: true, countedQty: true, countedAt: true } })
      let observation: StockReadOnlySnapshot['items'][number]['observation'] = null
      let currentDifference: number | null = null
      let currentComparable = false
      const blockers: string[] = []
      if (!latest) blockers.push('completed_physical_count_missing')
      else {
        const evidence = await tx.config.findUnique({ where: { storeId_key: { storeId, key: COUNT_OBSERVATION_PREFIX + latest.id } }, select: { value: true } })
        let proof: any = null
        try { proof = JSON.parse(evidence?.value || 'null') } catch { /* malformed evidence is unknown */ }
        const observedAt = iso(latest.countedAt), book = amount(latest.systemQty), physical = amount(latest.countedQty)
        const boundary = boundarySchema.safeParse(proof?.boundary), issues: string[] = []
        if (physical === null || physical < 0 || book === null || !observedAt) issues.push('physical_observation_incomplete')
        if (![3, 4].includes(proof?.version) || proof?.countId !== latest.inventoryCountId || proof?.systemQty !== book || proof?.countedQty !== physical || proof?.observedAt !== observedAt) issues.push('observation_evidence_mismatch')
        if (proof?.ledgerUnit !== row.unit) issues.push('observation_unit_mismatch')
        if (!boundary.success || boundary.data.inventoryId !== row.id || boundary.data.epoch !== current.data.epoch || BigInt(boundary.data.sequence) > BigInt(current.data.sequence)) issues.push('observation_ledger_boundary_unverified')
        if (observedAt && observedAt > updatedAt) issues.push('observation_time_after_inventory_snapshot')
        const comparable = issues.length === 0
        const difference = comparable ? Math.round((physical! - book!) * 1e9) / 1e9 : null
        if (difference !== null && !Number.isFinite(difference)) issues.push('observation_difference_invalid')
        observation = { countId: latest.inventoryCountId, itemId: latest.id, observedAt, unit: proof?.ledgerUnit === row.unit ? row.unit : null,
          bookStockAtObservation: book, physicalStock: physical, boundary: boundary.success && boundary.data.inventoryId === row.id ? boundary.data : null,
          sourceIds: [`inventoryCountItem:${latest.id}`, ...(evidence ? [`countObservation:${latest.id}`] : [])],
          comparable: issues.length === 0, difference: issues.length ? null : difference, comparisonBasis: 'historical_observation_boundary', blockers: issues }
        currentComparable = observation.comparable && boundary.success && boundary.data.sequence === current.data.sequence && book === stock
        currentDifference = currentComparable ? observation.difference : null
        if (!currentComparable) blockers.push('current_book_and_physical_not_same_verified_boundary')
      }
      items.push({ id: row.id, name: row.name, unit: row.unit, stock, updatedAt, ledgerBoundary: current.data, sourceId,
        negativeBookBalance: stock < 0, currentDifference, currentComparable, observation, blockers })
    }
    const facts = { schema: 'team.stock.readonly.v1' as const, pilot: 'STOCK-RO-001' as const, storeId, items,
      boundaries: 'Read-only facts; historical difference is physical minus book at the certified observation boundary, never physical minus current stock. Missing counts are unknown, not zero. A negative book balance is not proof of physical shortage.' as const }
    return stockReadOnlySnapshotSchema.parse({ ...facts, fingerprint: createHash('sha256').update(JSON.stringify(facts)).digest('hex') })
  }, { isolationLevel: 'RepeatableRead' })
}
