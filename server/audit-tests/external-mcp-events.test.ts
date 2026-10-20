import { describe, test, expect } from '@jest/globals'
import { randomBytes, randomUUID } from 'crypto'
import { Webhook } from 'standardwebhooks'
import { taskEvents } from '../src/services/externalMcp/eventsService'
import { EventState, EventOwner } from '../src/services/externalMcp/eventsContract'
import { publicAddress, publicCallbackUrl } from '../src/services/externalMcp/webhookDelivery'
import { agentMcpHandler } from '../src/services/externalMcp/agentHandler'

const taskId = randomUUID(), owner: EventOwner = { storeId: 'fixture-store', agentId: randomUUID(), grantVersion: 1, clientRevision: 1, subjectKey: 'fixture-subject-hash', tokenHash: 'fixture-token-hash' }
const secret = () => 'whsec_' + randomBytes(32).toString('base64')
function fixture() {
  let state: EventState = { subscriptions: [], deliveries: {} }, allowed = true, clock = Date.now(), status = 200, challengeOK = true
  const calls: { value: any; headers: Record<string, string> }[] = [], audits: unknown[] = []
  const repository = { transaction: async (_store: string, work: any) => work(state) }
  const service = taskEvents({ repository, now: () => clock, authorize: async () => { if (!allowed) throw Error('revoked') }, audit: async v => { audits.push(v) },
    post: async (_url, body, headers) => {
      const value = JSON.parse(body); calls.push({ value, headers })
      return { status, body: JSON.stringify({ challenge: challengeOK ? value.challenge : 'wrong' }) }
    } })
  const input = { name: 'task.report_ready', arguments: { taskId }, delivery: { mode: 'webhook', url: 'https://callback.example.com/events', secret: secret() } }
  const event = { eventId: randomUUID(), name: 'task.report_ready', timestamp: new Date(clock).toISOString(), data: { taskId, runId: randomUUID(), round: 1, taskVersion: 2 }, cursor: null }
  return { service, calls, audits, input, event, state: () => state, allow: (v: boolean) => { allowed = v }, advance: (ms: number) => { clock += ms }, status: (v: number) => { status = v }, challenge: (v: boolean) => { challengeOK = v } }
}
describe('isolated MCP Events lifecycle', () => {
  test('default stays disabled without constructing business service; isolated callback transport is mandatory', async () => {
    const resource = new URL('http://127.0.0.1/mcp'), issuer = 'https://issuer.invalid'
    const options: any = { resource, issuerMetadata: { issuer }, verifier: { issuer, resource: resource.href }, encryptionKey: Buffer.alloc(32), createService: () => { throw Error('must not construct') } }
    const disabled = agentMcpHandler(options); expect((await disabled.fetch(new Request(resource))).status).toBe(503)
    const old = { NODE_ENV: process.env.NODE_ENV, BT_TEST_RUN: process.env.BT_TEST_RUN, DATABASE_URL: process.env.DATABASE_URL }
    try {
      process.env.NODE_ENV = 'test'; process.env.BT_TEST_RUN = 'bt-test-callback-guard'; process.env.DATABASE_URL = 'postgresql://fixture@127.0.0.1/team_test'
      expect(() => agentMcpHandler({ ...options, mode: 'isolated-test' })).toThrow('MCP_ISOLATED_CALLBACK_REQUIRED')
    } finally { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value }
  })
  test('only ID/version payloads and fixed event names are advertised', () => {
    const f = fixture(); expect(f.service.catalog().map(x => x.name)).toEqual(['task.report_ready', 'task.blocked', 'task.failed'])
    expect(f.service.catalog()[0].payloadSchema.additionalProperties).toBe(false)
  })
  test('signed challenge gates activation; deterministic subscribe refreshes rather than duplicates', async () => {
    const f = fixture(), a = await f.service.subscribe(owner, f.input), b = await f.service.subscribe(owner, f.input)
    expect(a.id).toBe(b.id); expect(f.state().subscriptions).toHaveLength(1); expect(f.state().subscriptions[0].active).toBe(true)
    const c = f.calls[0]; expect(new Webhook(f.input.delivery.secret).verify(JSON.stringify(c.value), c.headers)).toEqual(c.value)
  })
  test('wrong callback challenge is -32015, inactive, and emits no business data', async () => {
    const f = fixture(); f.challenge(false); await expect(f.service.subscribe(owner, f.input)).rejects.toMatchObject({ code: -32015 })
    expect(f.state().subscriptions[0].active).toBe(false); expect(f.calls.every(c => c.value.type === 'verification')).toBe(true)
  })
  test('invalid secrets and unauthorized tasks cannot create subscriptions', async () => {
    const f = fixture(); await expect(f.service.subscribe(owner, { ...f.input, delivery: { ...f.input.delivery, secret: 'whsec_AA==' } })).rejects.toThrow()
    f.allow(false); await expect(f.service.subscribe(owner, f.input)).rejects.toThrow(); expect(f.state().subscriptions).toHaveLength(0)
  })
  test('finite grant for no-expiration request; expired subscriptions stop delivery', async () => {
    const f = fixture(), result = await f.service.subscribe(owner, { ...f.input, ttlMs: null }); expect(result.refreshBefore).not.toBeNull()
    f.advance(3600001); expect(await f.service.deliver(owner.storeId, f.event)).toEqual([]); expect(f.calls).toHaveLength(1)
  })
  test('matching signed event is accepted once across retries; ID reuse is rejected', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input); expect((await f.service.deliver(owner.storeId, f.event))[0].state).toBe('accepted')
    const c = f.calls[1]; expect(c.headers['webhook-id']).toBe(f.event.eventId); expect(new Webhook(f.input.delivery.secret).verify(JSON.stringify(c.value), c.headers)).toEqual(f.event)
    await f.service.deliver(owner.storeId, f.event); expect(f.calls).toHaveLength(2)
    await expect(f.service.deliver(owner.storeId, { ...f.event, data: { ...f.event.data, taskVersion: 3 } })).rejects.toThrow('MCP_EVENT_ID_REUSED')
  })
  test('transient retries persist backoff and preserve ID; 410/413 never retry', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input); f.status(503)
    expect((await f.service.deliver(owner.storeId, f.event))[0].state).toBe('retry'); await f.service.deliver(owner.storeId, f.event); expect(f.calls).toHaveLength(2)
    f.advance(3000); f.status(200); await f.service.deliver(owner.storeId, f.event); expect(f.calls[2].headers['webhook-id']).toBe(f.event.eventId)
    for (const status of [410, 413]) { const g = fixture(); await g.service.subscribe(owner, g.input); g.status(status); expect((await g.service.deliver(owner.storeId, g.event))[0].state).toBe('stopped'); g.advance(60000); await g.service.deliver(owner.storeId, g.event); expect(g.calls).toHaveLength(2) }
  })
  test('revocation, filters and owner-bound unsubscribe prevent subsequent data delivery', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input)
    expect(await f.service.deliver(owner.storeId, { ...f.event, data: { ...f.event.data, taskId: randomUUID() } })).toEqual([])
    const { secret: _, ...destination } = f.input.delivery
    await f.service.unsubscribe({ ...owner, agentId: randomUUID() }, { ...f.input, delivery: destination }); expect(f.state().subscriptions[0].active).toBe(true)
    f.allow(false); await f.service.deliver(owner.storeId, f.event); expect(f.state().subscriptions[0].active).toBe(false); expect(f.calls).toHaveLength(1)
    await f.service.unsubscribe(owner, { name: f.input.name, arguments: f.input.arguments, delivery: destination })
  })
  test('rotation signs with both keys for a bounded window and uses a single serialized body', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input); const next = secret()
    await f.service.subscribe(owner, { ...f.input, delivery: { ...f.input.delivery, secret: next } }); await f.service.deliver(owner.storeId, f.event)
    const c = f.calls[2]; for (const key of [next, f.input.delivery.secret]) expect(new Webhook(key).verify(JSON.stringify(c.value), c.headers)).toEqual(f.event)
  })
  test('410 terminates subsequent events; expiry frees subscription slots and old ledger cannot reexecute', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input); f.status(410); await f.service.deliver(owner.storeId, f.event)
    expect(f.state().subscriptions[0].active).toBe(false); await f.service.deliver(owner.storeId, { ...f.event, eventId: randomUUID() }); expect(f.calls).toHaveLength(2)
    const g = fixture(); await g.service.subscribe(owner, g.input)
    g.state().subscriptions = Array.from({ length: 100 }, (_, i) => ({ ...g.state().subscriptions[0], id: String(i), expiresAt: 1 }))
    await g.service.subscribe(owner, g.input); expect(g.state().subscriptions).toHaveLength(1)
    await g.service.deliver(owner.storeId, g.event); g.advance(7 * 86400000 + 1)
    await expect(g.service.deliver(owner.storeId, g.event)).rejects.toThrow('MCP_EVENT_OUTSIDE_DELIVERY_WINDOW')
  })
  test('unsubscribe during verification cannot activate a stale subscription generation', async () => {
    let release: () => void, entered: () => void
    const ready = new Promise<void>(r => { entered = r }), wait = new Promise<void>(r => { release = r })
    const state: EventState = { subscriptions: [], deliveries: {} }
    const service = taskEvents({ repository: { transaction: async (_s, work) => work(state) }, authorize: async () => {}, audit: async () => {},
      post: async (_url, body) => { entered(); await wait; return { status: 200, body: JSON.stringify({ challenge: JSON.parse(body).challenge }) } } })
    const f = fixture(), subscribing = service.subscribe(owner, f.input)
    await ready; const { secret: _, ...destination } = f.input.delivery
    await service.unsubscribe(owner, { name: f.input.name, arguments: f.input.arguments, delivery: destination }); release()
    await expect(subscribing).rejects.toMatchObject({ code: -32015 }); expect(state.subscriptions[0].active).toBe(false)
  })
  test('concurrent workers acquire only one sending receipt before the bounded delivery deadline', async () => {
    let state: EventState = { subscriptions: [], deliveries: {} }, calls = 0, release: () => void, entered: () => void
    const ready = new Promise<void>(r => { entered = r }), wait = new Promise<void>(r => { release = r }), f = fixture()
    const service = taskEvents({ repository: { transaction: async (_s, work) => work(state) }, authorize: async () => {}, audit: async () => {},
      post: async (_url, body) => { const value = JSON.parse(body); if (value.type === 'verification') return { status: 200, body: JSON.stringify({ challenge: value.challenge }) }; calls++; entered(); await wait; return { status: 200, body: '{}' } } })
    await service.subscribe(owner, f.input); const first = service.deliver(owner.storeId, f.event); await ready
    expect((await service.deliver(owner.storeId, f.event))[0].state).toBe('sending'); expect(calls).toBe(1); release(); await first
  })
  test('reject callback protocols, userinfo, localhost, literal IPs and private/special destination ranges', () => {
    for (const url of ['http://callback.example.com', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user:secret@callback.example.com', 'https://callback.example.com:8443/a']) expect(() => publicCallbackUrl(url)).toThrow()
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.1.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '3fff::1']) expect(publicAddress(ip)).toBe(false)
    for (const ip of ['8.8.8.8', '2606:4700:4700::1111']) expect(publicAddress(ip)).toBe(true)
  })
  test('strict payload rejects business text, identities and forged store fields', async () => {
    const f = fixture(); await f.service.subscribe(owner, f.input)
    for (const extra of [{ rawReport: 'secret' }, { storeId: 'other' }, { agentId: randomUUID() }]) await expect(f.service.deliver(owner.storeId, { ...f.event, data: { ...f.event.data, ...extra } })).rejects.toThrow()
    expect(JSON.stringify(f.audits)).not.toContain(f.input.delivery.secret)
  })
})
