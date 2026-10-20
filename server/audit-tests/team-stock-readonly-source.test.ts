import { describe, expect, jest, test } from '@jest/globals'
import { buildTeamStockReadOnlySource, stockReadOnlySnapshotSchema } from '../src/services/TeamStockReadOnlySource'
function fixture() {
  const at = new Date('2026-10-20T10:00:00Z')
  const row = { id: 'inventory-a', name: 'Gelas', unit: 'buah', currentStock: 12, updatedAt: at, ledgerSequence: 8n, ledgerEpoch: 2n }
  const count = { id: 'item-a', inventoryCountId: 'count-a', systemQty: 12, countedQty: 10, countedAt: at }
  const proof: any = { version: 4, countId: 'count-a', systemQty: 12, countedQty: 10, observedAt: at.toISOString(), ledgerUnit: 'buah',
    boundary: { inventoryId: row.id, sequence: '8', epoch: '2' }, actor: 'private-actor', privateNote: 'never expose', avgCost: 12345 }
  const state: any = { count, proof }
  const tx = { inventory: { findMany: jest.fn(async (_q: any) => [row]) }, inventoryCountItem: { findFirst: jest.fn(async (_q: any) => state.count) },
    config: { findUnique: jest.fn(async (_q: any) => state.proof === null ? null : { value: typeof state.proof === 'string' ? state.proof : JSON.stringify(state.proof) }) } }
  const db = { $transaction: jest.fn(async (fn: any, _options: any) => fn(tx)) }
  return { row, count, proof, state, tx, db, read: () => buildTeamStockReadOnlySource(db, 'store-a') }
}
describe('STOCK-RO-001 native read-only fact source', () => {
  test('same verified observation boundary computes physical minus contemporaneous book with stable IDs', async () => {
    const f = fixture(), r = await f.read(), item = r.items[0]
    expect(stockReadOnlySnapshotSchema.safeParse(r).success).toBe(true)
    expect(item.observation).toMatchObject({ comparable: true, difference: -2, comparisonBasis: 'historical_observation_boundary', sourceIds: ['inventoryCountItem:item-a', 'countObservation:item-a'] })
    expect(item.currentDifference).toBe(-2); expect(item.sourceId).toBe('inventory:inventory-a:2:8')
    expect((await f.read()).fingerprint).toBe(r.fingerprint)
    expect(f.db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' })
  })
  test('later book movement never becomes an old physical-versus-current difference', async () => {
    const f = fixture(); f.row.ledgerSequence = 9n; f.row.currentStock = 20; f.row.updatedAt = new Date('2026-10-20T11:00:00Z')
    const item = (await f.read()).items[0]
    expect(item.observation?.difference).toBe(-2); expect(item.observation?.comparable).toBe(true)
    expect(item.currentComparable).toBe(false); expect(item.currentDifference).toBeNull()
  })
  test('missing physical evidence remains unknown; negative book stock is never physical shortage', async () => {
    const f = fixture(); f.state.count = null; f.row.currentStock = -7
    const item = (await f.read()).items[0]
    expect(item.observation).toBeNull(); expect(item.currentDifference).toBeNull(); expect(item.negativeBookBalance).toBe(true)
    expect(item.blockers).toEqual(['completed_physical_count_missing']); expect(f.tx.config.findUnique).not.toHaveBeenCalled()
    expect(item).not.toHaveProperty('shortage')
  })
  test.each(['unit', 'epoch', 'futureSequence', 'inventoryId', 'quantity', 'time', 'version', 'missing', 'malformed'])('%s evidence cannot certify a difference', async kind => {
    const f = fixture()
    if (kind === 'unit') f.proof.ledgerUnit = 'different-unit-private-value'
    if (kind === 'epoch') f.proof.boundary.epoch = '1'
    if (kind === 'futureSequence') f.proof.boundary.sequence = '9'
    if (kind === 'inventoryId') f.proof.boundary.inventoryId = 'other-store-material'
    if (kind === 'quantity') f.proof.countedQty = 11
    if (kind === 'time') f.proof.observedAt = '2026-10-20T09:00:00.000Z'
    if (kind === 'version') f.proof.version = 2
    if (kind === 'missing') f.state.proof = null
    if (kind === 'malformed') f.state.proof = '{'
    const item = (await f.read()).items[0]
    expect(item.observation?.comparable).toBe(false); expect(item.observation?.difference).toBeNull()
    expect(item.currentDifference).toBeNull(); expect(item.observation?.blockers.length).toBeGreaterThan(0)
    expect(JSON.stringify(item)).not.toMatch(/different-unit-private-value|other-store-material/)
  })
  test('actual zero count is preserved instead of treating absence and zero alike', async () => {
    const f = fixture(); f.count.countedQty = 0; f.proof.countedQty = 0
    expect((await f.read()).items[0].observation).toMatchObject({ comparable: true, physicalStock: 0, difference: -12 })
  })
  test('queries only scoped native projections and never cost, supplier, personal fields or writes', async () => {
    const f = fixture(), result = await f.read()
    expect(f.tx.inventory.findMany.mock.calls[0][0]).toEqual({ where: { storeId: 'store-a' }, orderBy: { id: 'asc' }, select: { id: true, name: true, unit: true, currentStock: true, updatedAt: true, ledgerSequence: true, ledgerEpoch: true } })
    expect(f.tx.inventoryCountItem.findFirst.mock.calls[0][0].where).toEqual({ inventoryId: 'inventory-a', inventory: { storeId: 'store-a' }, inventoryCount: { storeId: 'store-a', status: 'completed' }, countedAt: { not: null }, countedQty: { not: null } })
    expect(f.tx.config.findUnique.mock.calls[0][0]).toEqual({ where: { storeId_key: { storeId: 'store-a', key: 'inventoryCountObservation.item-a' } }, select: { value: true } })
    expect(JSON.stringify(result)).not.toMatch(/private-actor|privateNote|avgCost|never expose|countedBy|supplier/)
  })
  test('requires an isolated snapshot rather than silently performing inconsistent sequential reads', async () => {
    await expect(buildTeamStockReadOnlySource({}, 'store-a')).rejects.toThrow('STOCK_READONLY_SNAPSHOT_TRANSACTION_REQUIRED')
  })
})
