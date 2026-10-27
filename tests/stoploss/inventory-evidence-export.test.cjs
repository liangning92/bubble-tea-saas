const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
function load(file, imports = {}) {
  const m = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module: m, exports: m.exports, require: n => n in imports ? imports[n] : require(n), Date, Map, Set, console, Intl })
  return m.exports
}
const calendar = load('server/src/utils/storeDateSettings.ts')
const service = load('server/src/services/InventoryEvidenceExport.ts', { zod: require('../../server/node_modules/zod'), '../utils/storeDateSettings': calendar, '../utils/inventoryUnits': load('server/src/utils/inventoryUnits.ts') })
const http = load('server/src/services/InventoryEvidenceHttp.ts', { './InventoryEvidenceExport': service })
const user = { id: 'owner', role: 'admin', storeId: 'own' }
const query = { storeId: 'own', startDate: '2026-10-26', endDate: '2026-10-26' }
const at = new Date('2026-10-26T05:00:00Z')
function fixture(change = {}) {
  const calls = []
  const material = { id: 'tea', storeId: 'own', name: 'Tea', unit: 'kg', category: 'raw', type: 'raw_material', currentStock: 4.5, avgCost: 12, ledgerSequence: 9n, ledgerEpoch: 1n, updatedAt: at, createdAt: at }
  const rows = {
    inventory: [material],
    stockInLog: [{ id: 'in', inventoryId: 'tea', quantity: 2, unitCost: 9, totalAmount: 18, createdAt: at, note: JSON.stringify({ version: 1, inputQuantity: 2, inputUnit: 'bag', ledgerUnit: 'kg', pack: { unit: 'bag', quantity: 1, baseUnit: 'kg' } }) }],
    stockOutLog: ['sold', 'loss', 'adjust', 'expired', 'transfer', 'sale_estimate', 'sale_estimate_reversal'].map((reason, i) => ({ id: 'out' + i, inventoryId: 'tea', quantity: reason.includes('reversal') ? -1 : 1, reason, createdAt: at, note: null })),
    inventoryCount: [{ id: 'count', storeId: 'own', startDate: at, endDate: at, status: 'completed', createdAt: at, updatedAt: at, items: [{ id: 'ci', inventoryId: 'tea', systemQty: 4.5, countedQty: 4, countedAt: at }] }],
    order: [{ id: 'o', storeId: 'own', orderNumber: '20261026-1', status: 'completed', createdAt: at, updatedAt: at, items: [{ id: 'oi', productId: 'p', specId: 's', quantity: 1, createdAt: at }] }],
    orderConsumptionSnapshot: [{ id: 'cs', storeId: 'own', orderId: 'o', createdAt: at, materials: JSON.stringify([{ inventoryId: 'tea', quantity: 0.02, unit: 'kg' }]), issues: '[]' }],
    bOMItem: [{ id: 'b', productId: 'p', inventoryId: 'tea', version: 3, quantity: 0.02, unit: 'kg', auditStatus: 'approved', createdAt: at, updatedAt: at }], ...change,
    processRecipe: [],
  }
  const tx = { config: { findUnique: async () => ({ value: '{"timezone":"Asia/Jakarta"}' }) } }
  for (const [name, parent] of [['inventoryCountItem', 'inventoryCount'], ['orderItem', 'order'], ['processRecipeItem', 'processRecipe']]) tx[name] = { count: async q => { assert.equal(q.where[parent].storeId, 'own'); return 1 } }
  for (const [name, records] of Object.entries(rows)) tx[name] = { findMany: async q => {
    calls.push([name, q])
    assert.equal(q.where.storeId || q.where.inventory?.storeId, 'own', 'all reads must be store scoped')
    if (q.where.createdAt) {
      assert.equal(q.where.createdAt.gte.toISOString(), '2026-10-25T17:00:00.000Z')
      assert.equal(q.where.createdAt.lt.toISOString(), '2026-10-26T17:00:00.000Z')
    }
    return records
  } }
  const db = { $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(tx) } }
  return { db, calls }
}
test('unauthorized, cross-store, revoked ACL and employee sessions fail before database reads', async () => {
  const db = { $transaction: () => { throw Error('must never query') } }
  for (const actor of [undefined, { ...user, employeeApp: true }, { ...user, storeId: 'other' }, { ...user, role: 'manager' }, { ...user, role: 'staff', accessRole: { version: 2, modes: { 'inventory.read': 'allow', 'data.export': 'deny' } } }]) {
    await assert.rejects(() => service.exportInventoryEvidence(db, actor, query), e => e.status === 403)
  }
})
test('captures all movement reasons and current recipe IDs, flags historical gaps without inventing counts', async () => {
  const { db } = fixture(), r = await service.exportInventoryEvidence(db, user, query, at)
  assert.equal(r.data.movements.length, 8)
  assert.equal(r.data.movements[0].conversionVerified, true)
  assert.equal(r.data.movements.find(m => m.reason === 'sale_estimate_reversal').quantity, -1)
  assert.equal(r.data.currentRecipes[0].id, 'b'); assert.equal(r.data.currentRecipes[0].version, 3)
  assert.equal(r.data.currentRecipes[0].historicalApplicability, 'unverified')
  assert.equal(r.data.snapshots[0].snapshotKind, 'current_book_only')
  assert.equal(r.data.counts[0].items[0].countedQuantity, 4)
  assert.equal(r.data.consumption[0].orderLinked, true)
  assert.equal(r.data.businessVerified, false)
  assert.ok(r.data.missing.some(x => x.code === 'HISTORICAL_OPENING_CLOSING_SNAPSHOTS_UNAVAILABLE'))
})
test('same snapshot has stable export ID despite download time; changing source evidence changes hash', async () => {
  const a = await service.exportInventoryEvidence(fixture().db, user, query, at)
  const b = await service.exportInventoryEvidence(fixture().db, user, query, new Date(at.getTime() + 1))
  assert.equal(a.exportId, b.exportId); assert.notEqual(a.generatedAt, b.generatedAt)
  assert.equal(service.evidenceHash(JSON.parse(JSON.stringify(a.data))), a.contentHash)
  const c = await service.exportInventoryEvidence(fixture({ stockOutLog: [] }).db, user, query, at)
  assert.notEqual(a.exportId, c.exportId)
})
test('authorized inventory exporter without cost permission gets a hash over the actually redacted payload', async () => {
  const actor = { ...user, role: 'staff', accessRole: { version: 2, modes: Object.fromEntries(['inventory.read', 'data.export', 'orders.read', 'products.read'].map(k => [k, 'allow'])) } }
  const r = await service.exportInventoryEvidence(fixture().db, actor, query, at)
  assert.equal(r.data.costsIncluded, false)
  assert.equal('avgCost' in r.data.snapshots[0], false)
  assert.equal('unitCost' in r.data.movements[0], false)
  assert.equal('totalCost' in r.data.movements[0], false)
  assert.equal(service.evidenceHash(r.data), r.contentHash)
})
test('invalid dates, missing store, unsupported selectors and large ranges never read data', async () => {
  const db = { $transaction: () => { throw Error('must never query') } }
  for (const q of [{ ...query, storeId: '' }, { ...query, startDate: '2026-02-30' }, { ...query, endDate: '2026-10-25' }, { ...query, endDate: '2026-12-01' }, { ...query, reason: 'sold' }]) await assert.rejects(() => service.exportInventoryEvidence(db, user, q))
})
test('large result sets are rejected, never silently truncated into complete evidence', async () => {
  await assert.rejects(() => service.exportInventoryEvidence(fixture({ stockOutLog: Array(20001).fill({}) }).db, user, query), e => e.status === 413)
})
test('nested row limit is checked before any parent or child relation is materialized', async () => {
  const { db } = fixture()
  const transaction = db.$transaction
  db.$transaction = (fn, options) => transaction(tx => {
    tx.orderItem.count = async () => 20001
    tx.inventory.findMany = async () => { throw Error('must not load rows') }
    return fn(tx)
  }, options)
  await assert.rejects(() => service.exportInventoryEvidence(db, user, query), e => e.status === 413 && e.message.endsWith('order_items'))
})
test('foreign and malformed consumption references are omitted and missing links explicit', async () => {
  const r = await service.exportInventoryEvidence(fixture({ orderConsumptionSnapshot: [{ id: 'bad', storeId: 'own', orderId: 'old-key', createdAt: at, materials: '[{"inventoryId":"foreign","quantity":1,"unit":"kg"}]', issues: 'bad' }] }).db, user, query)
  assert.equal(r.data.consumption[0].materials.length, 0)
  assert.equal(r.data.consumption[0].orderLinked, false)
  assert.ok(r.data.missing.some(x => x.code === 'CONSUMPTION_MATERIALS_INVALID'))
})
test('HTTP adapter audits before releasing hash-verifiable download; audit failure releases no evidence', async () => {
  const makeRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.statusCode = code; return this }, json(value) { this.error = value }, send(value) { this.body = value } })
  const { db } = fixture(), audit = []
  db.financeAuditLog = { create: async q => audit.push(q.data) }
  const res = makeRes(); await http.inventoryEvidenceHandler(db)({ user, query }, res)
  assert.equal(audit[0].entityType, 'inventory_evidence')
  assert.equal(res.headers['Cache-Control'], 'private, no-store')
  const body = JSON.parse(res.body); assert.equal(service.evidenceHash(body.data), body.contentHash)
  db.financeAuditLog.create = async () => { throw Error('audit down') }
  const failed = makeRes(); await http.inventoryEvidenceHandler(db)({ user, query }, failed)
  assert.equal(failed.statusCode, 503); assert.equal(failed.body, undefined)
})
