import { describe, expect, test, jest } from '@jest/globals'
import { randomUUID, createHash } from 'crypto'
jest.mock('../src/services/TeamCommunicationService', () => ({ TeamError: class extends Error { constructor(public status: number, message: string) { super(message) } } }))
import { productionAgentBindings, productionAgentBindingKey, productionAgentRegistrationSchema } from '../src/services/externalMcp/productionAgentBindings'
import { agentIdentityHash } from '../src/services/externalMcp/agentBindings'
import { AGENT_PILOT_DURATION_MS, AGENT_PILOT_KEY } from '../src/services/agentTasks/pilot'
const managerScopes = ['management.assign', 'management.read', 'management.review'], executorScopes = ['executor.claim', 'executor.evidence', 'executor.report']
function fixture() {
  const storeId = 'synthetic-store', channelId = randomUUID(), t0 = Date.parse('2026-10-20T00:00:00Z'); let clock = t0 + 1000
  const stamp = { id: randomUUID(), startedAt: new Date(t0).toISOString(), expiresAt: new Date(t0 + AGENT_PILOT_DURATION_MS).toISOString() }
  const pilot = { stamp, storeId, channelId, taskCode: 'STOCK-RO-001', enabled: true, version: 1 }
  const managerIdentity = { issuer: 'https://as.synthetic.invalid/realms/test', clientId: 'dot-synthetic', subject: 'fixture-manager', tokenId: 'token-manager' }
  const executorIdentity = { ...managerIdentity, clientId: 'hermes-synthetic', subject: 'fixture-executor', tokenId: 'token-executor' }
  const make = (identity: any, role: 'manager' | 'executor') => ({ identityHash: agentIdentityHash(identity), agentId: randomUUID(), role, grantVersion: 1, clientRevision: 1,
    scopes: role === 'manager' ? managerScopes : executorScopes, channelIds: [channelId], revoked: false, revokedTokenHashes: [] as string[], environment: 'production', pilotId: stamp.id, expiresAt: stamp.expiresAt })
  const registrations = [make(managerIdentity, 'manager'), make(executorIdentity, 'executor')], rows = new Map<string, string>(), reads: string[] = []
  const db = { config: { findUnique: async ({ where }: any) => { expect(where.storeId_key.storeId).toBe(storeId); reads.push(where.storeId_key.key); const value = rows.get(where.storeId_key.key); return value === undefined ? null : { value } }, findMany: () => { throw Error('SCAN_FORBIDDEN') }, upsert: () => { throw Error('WRITE_FORBIDDEN') } } }
  const savePilot = () => rows.set(AGENT_PILOT_KEY, JSON.stringify(pilot)), saveBindings = () => rows.set(productionAgentBindingKey, JSON.stringify(registrations))
  rows.set(`${AGENT_PILOT_KEY}.anchor.${stamp.id}`, JSON.stringify(stamp)); savePilot(); saveBindings()
  return { bindings: productionAgentBindings(db, { storeId, now: () => clock }), db, rows, reads, pilot, stamp, registrations, managerIdentity, executorIdentity, storeId, channelId, savePilot, saveBindings, setClock: (n: number) => { clock = n }, now: () => clock }
}
describe('fixed-store production bindings and immutable absolute pilot', () => {
  test('missing authority or registry denies without scanning stores or writing', async () => {
    const f = fixture(); f.rows.delete(AGENT_PILOT_KEY); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    f.savePilot(); f.rows.delete(productionAgentBindingKey); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    expect(() => productionAgentBindings(f.db, { storeId: '' })).toThrow('MCP_AGENT_STORE_REQUIRED')
  })
  test('resolve intersects token scopes; transaction authorization never restores absent token scope', async () => {
    const f = fixture(), p = await f.bindings.resolve(f.managerIdentity, ['management.read', 'executor.report'])
    expect(p.scopes).toEqual(['management.read']); expect(p.pilot).toEqual(f.stamp)
    expect((await f.bindings.authorize(f.db, p, 'management.read', f.channelId)).scopes).toEqual(['management.read'])
    await expect(f.bindings.authorize(f.db, p, 'management.assign', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    await expect(f.bindings.resolve(f.managerIdentity, [], undefined)).rejects.toThrow('MCP_AGENT_TOKEN_REJECTED')
    await expect(f.bindings.resolve(f.managerIdentity, ['management.read'], 'management.assign')).rejects.toThrow('MCP_AGENT_TOKEN_REJECTED')
    expect(f.reads.every(k => k === AGENT_PILOT_KEY || k.startsWith(AGENT_PILOT_KEY + '.anchor.') || k === productionAgentBindingKey)).toBe(true)
  })
  test('registration requires exact role scope set, one channel, production environment and unique identities', async () => {
    const f = fixture(), valid = f.registrations[0]
    for (const delta of [{ scopes: ['management.read', 'management.read', 'management.review'] }, { scopes: executorScopes }, { channelIds: [f.channelId, randomUUID()] }, { environment: 'isolated-test' }]) expect(productionAgentRegistrationSchema.safeParse({ ...valid, ...delta }).success).toBe(false)
    f.registrations[1].identityHash = valid.identityHash; f.saveBindings(); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
  })
  test('mismatched channel, duplicate agent, foreign pilot and grant extended beyond T0+24h deny', async () => {
    for (const field of ['channel', 'agent', 'pilot', 'expiry']) { const f = fixture()
      if (field === 'channel') f.registrations[0].channelIds = [randomUUID()]
      if (field === 'agent') f.registrations[1].agentId = f.registrations[0].agentId
      if (field === 'pilot') f.registrations[0].pilotId = randomUUID()
      if (field === 'expiry') f.registrations[0].expiresAt = new Date(Date.parse(f.stamp.expiresAt) + 1).toISOString()
      f.saveBindings(); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED') }
  })
  test('before T0 and exact T0+24h deny; pointer extension cannot overwrite immutable anchor', async () => {
    const f = fixture(); f.setClock(Date.parse(f.stamp.startedAt) - 1); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    f.setClock(Date.parse(f.stamp.expiresAt) - 1); expect((await f.bindings.resolve(f.managerIdentity, managerScopes)).pilot).toEqual(f.stamp)
    f.setClock(Date.parse(f.stamp.expiresAt)); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    f.pilot.stamp = { ...f.stamp, startedAt: new Date(Date.parse(f.stamp.startedAt) + 1000).toISOString(), expiresAt: new Date(Date.parse(f.stamp.expiresAt) + 1000).toISOString() }; f.savePilot()
    await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
  })
  test('short grant expiry, fresh version revocation and disabled pilot invalidate old principals', async () => {
    const f = fixture(), p = await f.bindings.resolve(f.managerIdentity, managerScopes)
    f.registrations[0].expiresAt = new Date(f.now() + 1).toISOString(); f.saveBindings(); f.setClock(f.now() + 1)
    await expect(f.bindings.authorize(f.db, p, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    f.registrations[0].expiresAt = f.stamp.expiresAt; f.registrations[0].grantVersion++; f.saveBindings()
    await expect(f.bindings.authorize(f.db, p, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    f.pilot.enabled = false; f.savePilot(); await expect(f.bindings.authorize(f.db, p, 'management.read', f.channelId)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
  })
  test('authorize reads supplied transaction authority and rejects other store/channel or absent stamp', async () => {
    const f = fixture(), p = await f.bindings.resolve(f.managerIdentity, managerScopes)
    const tx = { config: { findUnique: async ({ where }: any) => where.storeId_key.key === AGENT_PILOT_KEY ? null : f.db.config.findUnique({ where }) } }
    await expect(f.bindings.authorize(tx, p, 'management.read', f.channelId)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    await expect(f.bindings.authorize(f.db, p, 'management.read', randomUUID())).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    await expect(f.bindings.authorize(f.db, { ...p, storeId: 'foreign' }, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    await expect(f.bindings.authorize(f.db, { ...p, pilot: undefined }, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
  })
  test('internal executor selection needs current manager assign and a unique current executor', async () => {
    const f = fixture(), manager = await f.bindings.resolve(f.managerIdentity, managerScopes), executor = await f.bindings.executorFor(f.db, manager, f.channelId)
    expect(executor.role).toBe('executor'); expect(executor.scopes).toEqual(executorScopes); expect(executor.pilot).toEqual(f.stamp)
    const narrow = await f.bindings.resolve(f.executorIdentity, ['executor.claim']); expect(narrow.scopes).toEqual(['executor.claim'])
    await expect(f.bindings.authorize(f.db, narrow, 'executor.evidence', f.channelId)).rejects.toThrow()
    await expect(f.bindings.executorFor(f.db, await f.bindings.resolve(f.managerIdentity, ['management.read']), f.channelId)).rejects.toThrow()
    f.registrations[1].revoked = true; f.saveBindings(); await expect(f.bindings.executorFor(f.db, manager, f.channelId)).rejects.toThrow('MCP_EXECUTOR_SELECTION_REQUIRED')
  })
  test('event owner carries server stamp; restore has read-only scope and rechecks token/grant/pilot', async () => {
    const f = fixture(), owner = await f.bindings.eventOwner(f.managerIdentity, ['management.read'])
    expect(owner.pilot).toEqual(f.stamp); expect((await f.bindings.restoreEventOwner(owner)).scopes).toEqual(['management.read'])
    await expect(f.bindings.restoreEventOwner({ ...owner, pilot: undefined })).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    await expect(f.bindings.restoreEventOwner({ ...owner, pilot: { ...f.stamp, id: randomUUID() } })).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    f.registrations[0].revokedTokenHashes.push(createHash('sha256').update(JSON.stringify(f.managerIdentity.tokenId)).digest('hex')); f.saveBindings()
    await expect(f.bindings.restoreEventOwner(owner)).rejects.toThrow('MCP_EVENT_OWNER_UNAVAILABLE'); await expect(f.bindings.resolve(f.managerIdentity, managerScopes)).rejects.toThrow('MCP_AGENT_TOKEN_REJECTED')
  })
  test('old event owner stops at deadline and cannot survive new authoritative pilot identity', async () => {
    const f = fixture(), owner = await f.bindings.eventOwner(f.managerIdentity, ['management.read'])
    f.setClock(Date.parse(f.stamp.expiresAt)); await expect(f.bindings.restoreEventOwner(owner)).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    f.setClock(Date.parse(f.stamp.startedAt) + 1000); f.pilot.stamp = { ...f.stamp, id: randomUUID() }; f.savePilot(); f.rows.set(AGENT_PILOT_KEY + '.anchor.' + f.pilot.stamp.id, JSON.stringify(f.pilot.stamp)); f.registrations.forEach(r => r.pilotId = f.pilot.stamp.id); f.saveBindings()
    await expect(f.bindings.restoreEventOwner(owner)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
  })
  test('native recovery manager is fresh and narrow, cannot review, and never creates an identity', async () => {
    const f = fixture(), p = await f.bindings.recoveryManager()
    expect(p.agentId).toBe(f.registrations[0].agentId); expect(p.pilot).toEqual(f.stamp)
    expect(new Set(p.scopes)).toEqual(new Set(['management.read', 'management.assign']))
    await expect(f.bindings.authorize(f.db, p, 'management.review', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    expect((await f.bindings.authorize(f.db, p, 'management.assign', f.channelId)).scopes).not.toContain('management.review')
    f.registrations[0].revoked = true; f.saveBindings()
    await expect(f.bindings.recoveryManager()).rejects.toThrow('MCP_MANAGER_SELECTION_REQUIRED')
  })
  test('native recovery rejects multiple managers, grant expiry and absolute pilot deadline', async () => {
    const f = fixture(); f.setClock(Date.parse(f.stamp.expiresAt))
    await expect(f.bindings.recoveryManager()).rejects.toThrow('AGENT_PILOT_UNAVAILABLE_OR_EXPIRED')
    f.setClock(Date.parse(f.stamp.startedAt) + 1000); f.registrations[0].expiresAt = new Date(f.now()).toISOString(); f.saveBindings()
    await expect(f.bindings.recoveryManager()).rejects.toThrow('MCP_MANAGER_SELECTION_REQUIRED')
    f.registrations[0].expiresAt = f.stamp.expiresAt
    f.registrations.push({ ...f.registrations[0], agentId: randomUUID(), identityHash: 'f'.repeat(64) }); f.saveBindings()
    await expect(f.bindings.recoveryManager()).rejects.toThrow('MCP_MANAGER_SELECTION_REQUIRED')
  })

  test('transaction rechecks token revocation across resolve and preserves private provenance; copies never become internal', async () => {
    const f = fixture(), p = await f.bindings.resolve(f.managerIdentity, managerScopes)
    const refreshed = await f.bindings.authorize(f.db, p, 'management.read', f.channelId)
    await expect(f.bindings.authorize(f.db, { ...refreshed }, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    f.registrations[0].revokedTokenHashes.push(createHash('sha256').update(JSON.stringify(f.managerIdentity.tokenId)).digest('hex')); f.saveBindings()
    await expect(f.bindings.authorize(f.db, p, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    await expect(f.bindings.authorize(f.db, refreshed, 'management.read', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
    const internal = await f.bindings.recoveryManager()
    expect((await f.bindings.authorize(f.db, internal, 'management.assign', f.channelId)).scopes).not.toContain('management.review')
    ;(internal.scopes as string[]).push('management.review')
    await expect(f.bindings.authorize(f.db, internal, 'management.review', f.channelId)).rejects.toThrow('MCP_AGENT_GRANT_REJECTED')
  })

})
