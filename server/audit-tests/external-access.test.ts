import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { randomUUID } from 'crypto'
import { externalAccess } from '../src/services/externalAccess/service'
import { emptyState, deny, State, Registration } from '../src/services/externalAccess/contract'
import { isolatedMockGateway, MockPrincipal, MockBinding, MockGrant } from '../src/services/externalAccess/mockGateway'
import { externalAccessRouter } from '../src/routes/externalAccess'
import { postgresExternalRepository } from '../src/services/externalAccess/postgresRepository'

const channelId = randomUUID(), taskId = randomUUID(), actor = { id: 'admin', storeId: 'store' }
const input = () => ({ expectedVersion: 0, name: 'isolated client', clientType: 'mcp_compatible', storeIds: ['store'], channelIds: [channelId], tools: ['tasks.read', 'messages.read', 'task.suggest'] })
function setup() {
  let state: State = emptyState(), admin = true, tail = Promise.resolve()
  const service = externalAccess({ transaction(storeId, fn) {
    const run = tail.then(async () => {
      const copy = structuredClone(state)
      return fn({ requireAdmin: async a => { if (!admin || a.id !== actor.id || a.storeId !== storeId || a.employeeApp) deny('EXTERNAL_ADMIN_REQUIRED') },
        load: async () => copy, save: async s => { state = structuredClone(s) } })
    }); tail = run.then(() => {}, () => {}); return run
  } })
  return { service, state: () => state, demote: () => { admin = false } }
}

describe('external access control plane (isolated memory repository)', () => {
  test('defaults disabled, no secret fields, saving does not connect; mock never authenticates', async () => {
    const { service } = setup(), r = await service.save(actor, input())
    expect(r).toMatchObject({ enabled: false, authState: 'unconfigured', executionState: 'frozen', connectionState: 'not_tested', approvalRequired: true })
    expect(await service.validate(actor, r.id, r.version)).toMatchObject({ status: 'configuration_validated', productionEnabled: false, authenticated: false, eventWakeup: false })
    await expect(service.invoke()).rejects.toMatchObject({ status: 503 })
  })
  test.each([{ enabled: true }, { storeIds: ['other'] }, { storeIds: ['store', 'other'] }, { approvalRequired: false }, { tools: ['sql'] }, { token: 'secret' }])('rejects unsafe config %p', async bad => {
    await expect(setup().service.save(actor, { ...input(), ...bad })).rejects.toBeDefined()
  })
  test('fresh admin identity required for reads, writes, audit and mock checks', async () => {
    const s = setup(), r = await s.service.save(actor, input()); s.demote()
    for (const call of [() => s.service.list(actor), () => s.service.audits(actor), () => s.service.save(actor, input()),
      () => s.service.validate(actor, r.id, 1), () => s.service.revoke(actor, r.id, 1)]) await expect(call()).rejects.toMatchObject({ status: 403 })
  })
  test('CAS rejects concurrent saves; edits freeze and invalidate mock/auth revisions; revoke keeps facts', async () => {
    const s = setup(), r = await s.service.save(actor, input())
    await s.service.validate(actor, r.id, 1)
    const results = await Promise.allSettled([s.service.save(actor, { ...input(), expectedVersion: 1 }, r.id), s.service.save(actor, { ...input(), expectedVersion: 1 }, r.id)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const updated = (await s.service.list(actor))[0]
    expect(updated).toMatchObject({ version: 2, authVersion: 2, clientRevision: 2, connectionState: 'not_tested', executionState: 'frozen' })
    const revoked = await s.service.revoke(actor, r.id, 2)
    expect(revoked).toMatchObject({ version: 3, authVersion: 3, authState: 'revoked', enabled: false })
    expect((await s.service.audits(actor)).map(a => a.action)).toEqual(['save', 'validate', 'save', 'revoke'])
    expect(JSON.stringify(s.state().audits)).not.toContain('isolated client')
  })
  test('removal requires current version and owner, retains audit and never reuses registration ID', async () => {
    const s = setup(), r = await s.service.save(actor, input())
    await expect(s.service.remove(actor, r.id, 99)).rejects.toMatchObject({ status: 409 })
    await expect(s.service.remove({ ...actor, employeeApp: true }, r.id, 1)).rejects.toMatchObject({ status: 403 })
    await expect(s.service.remove(actor, r.id, 1)).resolves.toEqual({ removed: true })
    expect(await s.service.list(actor)).toEqual([])
    expect((await s.service.audits(actor)).map(a => a.action)).toEqual(['save', 'remove'])
    const next = await s.service.save(actor, input()); expect(next.id).not.toBe(r.id)
    await expect(s.service.save(actor, { ...input(), expectedVersion: 1 }, r.id)).rejects.toMatchObject({ status: 404 })
  })
  test('adapter-required does not pretend compatibility', async () => {
    const s = setup(), r = await s.service.save(actor, { ...input(), clientType: 'adapter_required' })
    await expect(s.service.validate(actor, r.id, 1)).rejects.toMatchObject({ message: 'EXTERNAL_ADAPTER_REQUIRED' })
  })
  test('management route handlers validate identity, strict input and versions without opening sockets', async () => {
    const s = setup(), router = externalAccessRouter(s.service, (_req, _res, next) => next())
    async function call(method: string, path: string, body = {}, params = {}, user: any = actor) {
      const handler = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]).route.stack[0].handle
      let status = 200, result: any
      const res: any = { status(n: number) { status = n; return res }, json(value: any) { result = value; return res } }
      await handler({ user, body, params }, res)
      return { status, result }
    }
    expect((await call('get', '/', {}, {}, null)).status).toBe(401)
    expect((await call('post', '/', { ...input(), apiKey: 'never-log-this' })).status).toBe(400)
    const created = await call('post', '/', input()); expect(created.status).toBe(200)
    expect((await call('put', '/:id', input(), { id: created.result.data.id })).status).toBe(409)
    expect((await call('post', '/:id/validate', { expectedVersion: 1 }, { id: created.result.data.id })).result.data.productionEnabled).toBe(false)
  })
})

describe('isolated mock client authorization contract', () => {
  let r: MockGrant, principal: MockPrincipal, binding: MockBinding, read: any, authorize: any, gateway: ReturnType<typeof isolatedMockGateway>
  beforeEach(async () => {
    r = { ...await setup().service.save(actor, input()), enabled: true, authState: 'active', executionState: 'ready' } // synthetic only
    principal = { registrationId: r.id, storeId: 'store', subjectId: 'delegated-staff', authVersion: 1, clientRevision: 1, expiresAt: Date.now() + 60000 }
    binding = { taskId, channelId, registrationId: r.id, clientRevision: 1, state: 'ready' }
    read = jest.fn(async () => ['scoped fixture']); authorize = jest.fn(async () => {})
    gateway = isolatedMockGateway({ load: async () => r, authenticate: async token => token === 'mock-only' ? principal : null, read, authorize, binding: async () => binding })
  })
  const call = (r: MockGrant, extra = {}) => ({ requestId: randomUUID(), registrationId: r.id, version: 1, tool: 'tasks.read', channelId, ...extra })
  test('unauthenticated and expired calls never reach business adapter', async () => {
    await expect(gateway.call(null, call(r))).rejects.toMatchObject({ status: 401 }); principal.expiresAt = 0
    await expect(gateway.call('mock-only', call(r))).rejects.toMatchObject({ status: 401 }); expect(read).not.toHaveBeenCalled()
  })
  test.each(['disabled', 'revoked', 'unconfigured', 'frozen', 'wrong-store', 'wrong-client', 'stale-auth', 'stale-client', 'wrong-channel', 'missing-tool', 'arbitrary-store'])('denies %s before data access', async kind => {
    let args: any = call(r)
    if (kind === 'disabled') r.enabled = false
    if (kind === 'unconfigured') r.authState = 'unconfigured'
    if (kind === 'frozen') r.executionState = 'frozen'
    if (kind === 'revoked') r.authState = 'revoked'
    if (kind === 'wrong-store') principal.storeId = 'other'
    if (kind === 'wrong-client') principal.registrationId = randomUUID()
    if (kind === 'stale-auth') principal.authVersion++
    if (kind === 'stale-client') principal.clientRevision++
    if (kind === 'wrong-channel') args.channelId = randomUUID()
    if (kind === 'missing-tool') r.tools = []
    if (kind === 'arbitrary-store') args.storeId = 'other'
    await expect(gateway.call('mock-only', args)).rejects.toBeDefined(); expect(read).not.toHaveBeenCalled()
  })
  test('delegated identity and fromSeq remain business-adapter responsibilities, errors propagate', async () => {
    await expect(gateway.call('mock-only', call(r))).resolves.toEqual(['scoped fixture'])
    expect(read).toHaveBeenCalledWith(principal, 'tasks.read', channelId, 0)
    read.mockRejectedValueOnce(new Error('membership revoked'))
    await expect(gateway.call('mock-only', call(r))).rejects.toThrow('membership revoked')
  })
  test('revoked membership blocks suggestions before binding or retention', async () => {
    authorize.mockRejectedValueOnce(new Error('membership revoked'))
    await expect(gateway.call('mock-only', call(r, { tool: 'task.suggest', taskId, suggestion: 'fixture' }))).rejects.toThrow('membership revoked')
  })
  test('suggestions are pending, idempotent and bound to task owner/revision; uncertain outcome freezes takeover', async () => {
    const args = call(r, { tool: 'task.suggest', taskId, suggestion: 'Review fixture' })
    const result = await gateway.call('mock-only', args)
    expect(result).toMatchObject({ status: 'pending_human_review', executed: false, authVersion: 1, clientRevision: 1 })
    expect(await gateway.call('mock-only', args)).toEqual(result)
    await expect(gateway.call('mock-only', { ...args, suggestion: 'changed' })).rejects.toMatchObject({ status: 409 })
    for (const state of ['uncertain', 'frozen'] as const) { binding.state = state; await expect(gateway.call('mock-only', args)).rejects.toMatchObject({ message: 'EXTERNAL_EXECUTION_FROZEN' }) }
    binding.state = 'ready'; binding.clientRevision++
    await expect(gateway.call('mock-only', args)).rejects.toMatchObject({ status: 409 })
    expect(read).not.toHaveBeenCalled()
  })
})

test('Postgres adapter locks store, re-reads admin and active staff, persists only own config namespace', async () => {
  const tx = { $executeRaw: jest.fn(), user: { findFirst: jest.fn(async (_query: any) => ({ id: 'admin' })) }, staff: { findFirst: jest.fn(async (_query: any) => ({ id: 'staff' })) },
    config: { findUnique: jest.fn(async () => null), upsert: jest.fn(async (_query: any) => null) } }
  const service = externalAccess(postgresExternalRepository({ $transaction: fn => fn(tx) }))
  await service.save(actor, input())
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
  expect(tx.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'admin', storeId: 'store', role: 'admin' })
  expect(tx.staff.findFirst.mock.calls[0][0].where).toMatchObject({ userId: 'admin', storeId: 'store', status: 'active' })
  expect(tx.config.upsert.mock.calls[0][0].create.key).toBe('externalAgent.access.v1')
})
