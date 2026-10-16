const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')
const source = ts.transpileModule(fs.readFileSync('client-staff/src/utils/offlineAuth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
function context() {
  const rows = new Map(), exports = {}, clock = { now: Date.now() }
  class ClockDate extends Date { static now() { return clock.now } }
  vm.runInNewContext(source, { exports, crypto: webcrypto, TextEncoder, Uint8Array, URL, Date: ClockDate, Number, Array, window: { location: { origin: 'https://staff.example.test' } }, localStorage: { getItem: k => rows.get(k) ?? null, setItem: (k,v) => rows.set(k,v), removeItem: k => rows.delete(k) } })
  return { api: exports, rows, clock }
}
const user = { id: 'employee-1', phone: '080000000001', name: 'Offline test', role: 'staff', storeId: 'store-1', staffId: 'profile-1', position: 'cashier' }, backend = 'https://staff.example.test/api'
test('gateway outages permit offline verification; server authentication and rate limits do not', () => {
  const { api } = context()
  for (const status of [502,503,504,521,522,523,524]) assert.equal(api.temporaryLoginFailure({response:{status}}),true)
  for (const status of [400,401,403,404,409,429,500]) assert.equal(api.temporaryLoginFailure({response:{status}}),false)
  assert.equal(api.temporaryLoginFailure(new Error('network down')),true)
})
test('offline relogin verifies password, survives signout, and never persists password or bearer token', async () => {
  const { api, rows } = context()
  await api.prepareOfflineLogin(backend, { ...user, token: 'not-to-cache' }, 'test-secret')
  const before = JSON.stringify([...rows])
  assert.ok(!before.includes('test-secret')); assert.ok(!before.includes('not-to-cache'))
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'wrong'),/auth.invalidCredentials/)
  assert.equal((await api.unlockOfflineLogin(backend,user.phone,'test-secret')).user.id,user.id)
  assert.equal(JSON.stringify([...rows]),before,'offline login cannot renew its grant')
  await assert.rejects(api.unlockOfflineLogin(backend,'another-phone','test-secret'),/auth.offlineMissing/)
  await assert.rejects(api.unlockOfflineLogin('https://other.test/api',user.phone,'test-secret'),/auth.offlineMissing/)
})
test('30-day window expires at the boundary and clock rollback is refused', async () => {
  const { api, clock } = context(), start = clock.now
  await api.prepareOfflineLogin(backend,user,'test-secret')
  clock.now = start + api.OFFLINE_LOGIN_TTL - 1
  assert.equal((await api.unlockOfflineLogin(backend,user.phone,'test-secret')).user.staffId,user.staffId)
  clock.now++
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'test-secret'),/auth.offlineExpired/)
  clock.now = start - 1
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'test-secret'),/auth.offlineExpired/)
})
test('revocation, password replacement, corrupt storage and missing staff cannot silently sign in', async () => {
  const { api, rows } = context()
  await api.prepareOfflineLogin(backend,user,'old-secret')
  await api.prepareOfflineLogin(backend,user,'new-secret')
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'old-secret'),/auth.invalidCredentials/)
  assert.equal((await api.unlockOfflineLogin(backend,user.phone,'new-secret')).user.id,user.id)
  api.forgetOfflineLogin(backend,user.phone)
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'new-secret'),/auth.offlineMissing/)
  await assert.rejects(api.prepareOfflineLogin(backend,{...user,staffId:''},'secret'),/auth.staffMissing/)
  await api.prepareOfflineLogin(backend,user,'new-secret')
  rows.set([...rows.keys()][0],'{invalid')
  await assert.rejects(api.unlockOfflineLogin(backend,user.phone,'new-secret'),/auth.offlineMissing/)
})
