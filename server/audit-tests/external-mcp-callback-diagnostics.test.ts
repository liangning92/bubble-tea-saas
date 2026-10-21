import { describe, test, expect, jest, afterEach } from '@jest/globals'
import { EventEmitter } from 'events'
import { randomBytes, randomUUID } from 'crypto'
import { taskEvents } from '../src/services/externalMcp/eventsService'
import { EventOwner, EventState } from '../src/services/externalMcp/eventsContract'
import { CallbackFailure, callbackDiagnostic, pinnedCallbackLookup, publicHttpsPost } from '../src/services/externalMcp/webhookDelivery'
const dns = require('dns/promises'), https = require('https')
const owner: EventOwner = { storeId: 'synthetic', agentId: randomUUID(), grantVersion: 1, clientRevision: 1, subjectKey: 'synthetic', tokenHash: 'synthetic' }
const secret = 'whsec_' + randomBytes(32).toString('base64')
const input = { name: 'task.report_ready', arguments: { taskId: randomUUID() }, delivery: { mode: 'webhook', url: 'https://callback.example.com/events?private=do-not-log', secret } }
function fixture(post: any) {
  const state: EventState = { subscriptions: [], deliveries: {} }, audits: any[] = []
  return { state, audits, service: taskEvents({ repository: { transaction: async (_s, work) => work(state) }, authorize: async () => {}, audit: async event => { audits.push(event) }, post }) }
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })
describe('safe callback verification diagnostics', () => {
  test.each([
    [403, '<html>private remote body</html>', 'http_status', 'response'],
    [302, 'redirect to private location', 'http_status', 'response'],
    [503, '{}', 'http_status', 'response'],
    [200, 'private malformed json', 'response_invalid_json', 'verification'],
    [200, '{}', 'challenge_missing', 'verification'],
    [200, '{"challenge":"private wrong echo"}', 'challenge_mismatch', 'verification']
  ])('classifies status %i response without retaining it', async (status, body, reason, phase) => {
    const f = fixture(async () => ({ status, body }))
    await expect(f.service.subscribe(owner, input)).rejects.toMatchObject({ code: -32015, data: { reason, phase, status, elapsedMs: expect.any(Number) } })
    expect(f.audits[0]).toMatchObject({ action: 'callback_verification_failed', status, diagnostic: { reason, phase, status } })
    expect(f.state.subscriptions[0]).toMatchObject({ active: false, secret: '' }); expect(f.state.deliveries).toEqual({})
    const recorded = JSON.stringify(f.audits)
    for (const privateValue of [secret, input.delivery.url, 'do-not-log', 'private remote body', 'private malformed json', 'private wrong echo', 'redirect to private location']) expect(recorded).not.toContain(privateValue)
  })
  test.each(['dns_failed', 'tls_failed', 'connection_failed', 'response_too_large', 'response_incomplete', 'timeout'] as const)('preserves safe transport class %s and clears signing material', async reason => {
    const f = fixture(async () => { throw new CallbackFailure(reason, 'connect') })
    await expect(f.service.subscribe(owner, input)).rejects.toMatchObject({ code: -32015, data: { reason, phase: 'connect' } })
    expect(f.state.subscriptions[0].secret).toBe(''); expect(f.state.subscriptions[0].active).toBe(false)
  })
  test('unknown errors and malicious remote strings cannot enter diagnostic fields', async () => {
    const f = fixture(async () => { throw Object.assign(Error(input.delivery.url + secret), { code: 'secret-code', status: 401, body: 'private' }) })
    await expect(f.service.subscribe(owner, input)).rejects.toMatchObject({ data: { reason: 'verification_failed', phase: 'verification' } })
    expect(JSON.stringify(f.audits)).not.toContain(secret); expect(JSON.stringify(f.audits)).not.toContain('callback.example.com')
    expect(callbackDiagnostic(new Error('raw secret'))).toEqual({ reason: 'verification_failed', phase: 'verification' })
  })
  test('correct challenge still activates and sends only signed control payload', async () => {
    const f = fixture(async (_url: string, body: string, headers: any) => {
      expect(JSON.parse(body)).toEqual({ type: 'verification', challenge: expect.any(String) }); expect(headers['webhook-signature']).toBeTruthy()
      return { status: 200, body: JSON.stringify({ challenge: JSON.parse(body).challenge }) }
    })
    await f.service.subscribe(owner, input); expect(f.state.subscriptions[0].active).toBe(true)
  })
})
describe('pinned Node22 lookup and bounded transport', () => {
  test('all:true returns exactly the one validated address; legacy lookup keeps scalar form', () => {
    const lookup = pinnedCallbackLookup({ address: '8.8.8.8', family: 4 }), all = jest.fn(), single = jest.fn()
    lookup('ignored.example.com', { all: true }, all); lookup('ignored.example.com', {}, single)
    expect(all).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]); expect(single).toHaveBeenCalledWith(null, '8.8.8.8', 4)
  })
  test.each([
    ['ENOTFOUND', 'dns_failed'], ['EAI_AGAIN', 'dns_failed']
  ])('DNS %s is classified before any socket', async (code, reason) => {
    jest.spyOn(dns, 'lookup').mockRejectedValue(Object.assign(Error('private name'), { code }) as never)
    const wire = jest.spyOn(https, 'request')
    await expect(publicHttpsPost(input.delivery.url, '{}', {})).rejects.toMatchObject({ reason, phase: 'dns', networkCode: code }); expect(wire).not.toHaveBeenCalled()
  })
  test.each([
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls_failed'], ['CERT_HAS_EXPIRED', 'tls_failed'], ['ECONNREFUSED', 'connection_failed'], ['ERR_INVALID_IP_ADDRESS', 'connection_failed']
  ])('connection %s safely classified with hostname and single DNS address preserved', async (code, reason) => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any)
    jest.spyOn(https, 'request').mockImplementation(((_url: URL, opts: any) => {
      expect(opts.servername).toBe('callback.example.com'); expect(opts.agent).toBe(false)
      opts.lookup('callback.example.com', { all: true }, (_error: any, rows: any) => expect(rows).toEqual([{ address: '8.8.8.8', family: 4 }]))
      const req = new EventEmitter() as any; req.end = () => { req.emit('error', Object.assign(Error('private TLS/host detail'), { code })) }; return req
    }) as any)
    await expect(publicHttpsPost(input.delivery.url, '{}', {})).rejects.toMatchObject({ reason, phase: 'connect', networkCode: code })
  })
  test.each(['limit', 'aborted'])('bounded response %s preserves status and failure kind', async mode => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any)
    jest.spyOn(https, 'request').mockImplementation(((_url: URL, _opts: any, received: any) => {
      const req = new EventEmitter() as any; req.end = () => {
        const res = new EventEmitter() as any; res.statusCode = 200; res.destroy = () => { res.emit('aborted'); res.emit('error', Error('raw private response error')) }
        received(res); if (mode === 'limit') res.emit('data', Buffer.alloc(4097)); else res.emit('aborted')
      }; return req
    }) as any)
    await expect(publicHttpsPost(input.delivery.url, '{}', {})).rejects.toMatchObject({ reason: mode === 'limit' ? 'response_too_large' : 'response_incomplete', phase: 'response', status: 200 })
  })
  test('private DNS is still rejected and revoked preflight still prevents connection', async () => {
    const wire = jest.spyOn(https, 'request'); jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any)
    await expect(publicHttpsPost(input.delivery.url, '{}', {})).rejects.toMatchObject({ reason: 'callback_blocked', phase: 'dns' })
    await expect(publicHttpsPost(input.delivery.url, '{}', {}, { preflight: () => { throw Error('private revoked') } })).rejects.toMatchObject({ reason: 'authorization_changed', phase: 'authorization' })
    expect(wire).not.toHaveBeenCalled()
  })
})
