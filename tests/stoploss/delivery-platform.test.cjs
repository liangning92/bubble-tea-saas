const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const serverRequire = require('node:module').createRequire(path.resolve(__dirname, '../../server/package.json'))
const express = serverRequire('express')
const request = serverRequire('supertest')
const jwt = serverRequire('jsonwebtoken')

const root = path.resolve(__dirname, '../..')
const secret = 'synthetic-delivery-test-secret-with-no-production-access'
const users = {
  manager: { id: 'manager', phone: 'synthetic', role: 'manager', storeId: 'store-a', updatedAt: new Date(0) },
  cashier: { id: 'cashier', phone: 'synthetic', role: 'cashier', storeId: 'store-a', updatedAt: new Date(0) },
  admin: { id: 'admin', phone: 'synthetic', role: 'admin', storeId: '', updatedAt: new Date(0) }
}
const cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    if (name.endsWith('/config/env')) return { config: { jwt: { secret } } }
    if (name.endsWith('/config/database')) return { user: { findUnique: async ({ where }) => users[where.id] || null } }
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')))
    return serverRequire(name)
  }, module, module.exports)
  cache.set(file, module.exports)
  return module.exports
}

const adapters = load('server/src/services/delivery/PlatformAdapter.ts')
const app = express()
app.use('/api/delivery', load('server/src/routes/delivery.ts').deliveryRouter)
const token = role => jwt.sign({ id: role, role, storeId: users[role].storeId, staffId: '', issuedAtMs: Date.now() }, secret)

test('all pending platforms reject every integration operation instead of reporting success', async () => {
  for (const platform of adapters.DELIVERY_PLATFORMS) {
    const adapter = adapters.createPlatformAdapter(platform, { storeId: 'store-a' })
    for (const operation of [
      () => adapter.fetchOrders(),
      () => adapter.confirmOrder('synthetic-order', 10),
      () => adapter.updateStatus('synthetic-order', 'ready'),
      () => adapter.syncMenu([]),
      () => adapter.verifyWebhook(new Uint8Array(), {}),
      () => adapter.parseWebhook(new Uint8Array())
    ]) await assert.rejects(operation, error => error.code === 'DELIVERY_PLATFORM_NOT_CONNECTED' && error.platform === platform)
  }
})

test('connection status has no enabled capabilities or credential references', () => {
  const result = adapters.getPlatformConnections({ storeId: 'store-a', credentialReference: 'private-reference' })
  assert.equal(result.length, 3)
  assert.ok(result.every(row => row.status === 'not_connected' && Object.values(row.capabilities).every(value => value === false)))
  assert.ok(!JSON.stringify(result).includes('private-reference'))
})

test('platform status enforces authentication, role and assigned store through real middleware', async () => {
  await request(app).get('/api/delivery/platforms').expect(401)
  await request(app).get('/api/delivery/platforms').set('Authorization', `Bearer ${token('cashier')}`).expect(403)
  await request(app).get('/api/delivery/platforms?storeId=store-b').set('Authorization', `Bearer ${token('manager')}`).expect(403)
  const response = await request(app).get('/api/delivery/platforms?storeId=store-a').set('Authorization', `Bearer ${token('manager')}`).expect(200)
  assert.deepEqual(response.body.data.platforms.map(row => row.platform), ['grabfood', 'gofood', 'shopee'])
  await request(app).get('/api/delivery/platforms').set('Authorization', `Bearer ${token('admin')}`).expect(400)
})
