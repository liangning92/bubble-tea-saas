import { createHash, randomUUID } from 'crypto'
import { describe, expect, jest, test } from '@jest/globals'
jest.mock('../src/services/TeamCommunicationService', () => ({
  TeamError: class extends Error { constructor(public status: number, code: string) { super(code) } },
  lockTeam: async () => {},
  readTeam: async (db: any, store: string, key: string) => structuredClone(db.rows.get(store + '|team.communication.' + key) || null),
  writeTeam: async (db: any, store: string, key: string, value: unknown) => { db.rows.set(store + '|team.communication.' + key, structuredClone(value)) }
}))
jest.mock('../src/services/TeamAiService', () => ({
  readAiConnection: async (db: any, store: string, config: any) => {
    const c = db.rows.get(store + '|team.communication.ai.connection')
    return c?.configVersion === config.version && c?.model === config.model && c?.region === config.region ? c : null
  },
  createTeamAgentMiniMaxTransport: () => async () => { throw Error('REAL_TRANSPORT_MUST_NOT_RUN') }
}))
import { createAgentModelRelay, agentModelRelayRequestSchema } from '../src/services/agentTasks/modelRelay'
import { readTaskSchema } from '../src/services/agentTasks/contract'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const completion = (content: string) => ({ id: 'synthetic-provider', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { prompt_tokens: 40, completion_tokens: 20 } })
const tool = (id: string, name: string, args: any) => ({ id: 'synthetic-provider', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 40, completion_tokens: 20 } })
function fixture() {
  const clock = { value: Date.parse('2026-10-20T12:00:00Z') }, store = 'synthetic-store', taskId = randomUUID(), runId = randomUUID(), channelId = randomUUID(), evidenceId = randomUUID()
  const stamp = { id: randomUUID(), startedAt: new Date(clock.value - 60000).toISOString(), expiresAt: new Date(clock.value - 60000 + 86400000).toISOString() }
  const principal: any = { agentId: 'synthetic-executor', role: 'executor', storeId: store, grantVersion: 1, clientRevision: 1, scopes: ['executor.evidence'], pilot: stamp }
  const plan = { scope: 'stock_readonly_v1', objective: 'Read native stock only', constraints: ['Read-only facts'], deadlineAt: new Date(clock.value + 600000).toISOString(), criteria: [{ id: 'facts', standard: 'Cite source IDs' }] }
  const task: any = { id: taskId, channelId, version: 3, agentTask: { taskCode: 'STOCK-RO-001', capability: 'stock_readonly_v1', executorId: principal.agentId, runId, round: 1, plan,
    pilot: stamp, leaseVersion: 1, state: 'running', lease: { token: randomUUID(), until: clock.value + 600000, grantVersion: 1, clientRevision: 1 }, evidenceId } }
  const facts = { schema: 'team.stock.readonly.v1', pilot: 'STOCK-RO-001', storeId: store, items: [],
    boundaries: 'Read-only facts; historical difference is physical minus book at the certified observation boundary, never physical minus current stock. Missing counts are unknown, not zero. A negative book balance is not proof of physical shortage.' }
  const snapshot = { ...facts, fingerprint: hash(facts) }; task.agentTask.inputSnapshotHash = snapshot.fingerprint
  const rows = new Map<string, any>(), put = (key: string, value: any) => rows.set(store + '|' + key, structuredClone(value)), team = (key: string, value: any) => put('team.communication.' + key, value)
  team('agent.task.index.' + taskId, { channelId }); team(`task.${channelId}.${taskId}`, task); team('channel.' + channelId, { id: channelId, archived: false })
  team('agent.evidence.' + evidenceId, { id: evidenceId, taskId, runId, round: 1, executorId: principal.agentId, leaseVersion: 1, snapshotHash: snapshot.fingerprint, snapshot, sourceRefs: [] })
  team('ai.settings', { enabled: true, provider: 'minimax', region: 'cn', model: 'MiniMax-M3.1-Flash', version: 5, secret: 'synthetic-ciphertext-not-a-provider-key' })
  team('ai.connection', { status: 'ready', configVersion: 5, model: 'MiniMax-M3.1-Flash', region: 'cn', checkRevision: 2 })
  put('externalAgent.pilot.v1', { stamp, storeId: store, channelId, taskCode: 'STOCK-RO-001', enabled: true, version: 1 }); put('externalAgent.pilot.v1.anchor.' + stamp.id, stamp)
  let tail = Promise.resolve(); const audit: any[] = []; const db: any = { rows, config: { findUnique: async (q: any) => { const k = q.where.storeId_key; const r = rows.get(k.storeId + '|' + k.key); return r ? { value: JSON.stringify(r) } : null } }, financeAuditLog: { create: async (q: any) => { audit.push(q); return q } } }
  db.$transaction = (fn: any) => {
    const next = tail.then(async () => { const before = structuredClone(rows), count = audit.length; try { return await fn(db) } catch (e) { rows.clear(); for (const [k, v] of before) rows.set(k, v); audit.length = count; throw e } }); tail = next.catch(() => {}); return next
  }
  const live = { authorized: true }, deps: any = { now: () => clock.value, authorize: async () => { if (!live.authorized) throw Error('SYNTHETIC_REVOKED'); return principal } }
  const request: any = { requestId: randomUUID(), authVersion: 1, taskId, runId, round: 1, expectedVersion: 3, leaseVersion: 1, leaseToken: task.agentTask.lease.token,
    evidenceId, inputSnapshotHash: snapshot.fingerprint, model: 'MiniMax-M3.1-Flash', stream: false }
  let calls = 0; const inputs: any[] = [], rawReplies: any[] = [completion('Native stock facts are unverified.')]
  let provider: any = async () => rawReplies.shift()
  const transport: any = async (_s: string, _v: number, input: any, before: any, deadlineAt: number) => { expect(deadlineAt).toBe(Math.min(Date.parse(stamp.expiresAt), task.agentTask.lease.until, Date.parse(task.agentTask.plan.deadlineAt))); await before(); calls++; inputs.push(structuredClone(input)); expect(JSON.stringify(input)).not.toContain(request.leaseToken); expect(input).not.toHaveProperty('max_tokens'); expect(input).not.toHaveProperty('max_completion_tokens'); return provider(input) }
  const relay = () => createAgentModelRelay(db, deps, { enabled: true, transport })
  return { db, rows, team, put, store, task, snapshot, principal, request, clock, live, deps, transport, relay, inputs, rawReplies, audit, calls: () => calls, setProvider: (fn: any) => { provider = fn } }
}
describe('default-closed sealed claimed-run model relay (fake provider only)', () => {
  test('disabled and arbitrary OpenAI messages, tools, URLs or stream are rejected before transport', async () => {
    const f = fixture(); await expect(createAgentModelRelay(f.db, f.deps).complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_RELAY_DISABLED')
    for (const patch of [{ messages: [{ role: 'user', content: 'arbitrary prompt' }] }, { tools: [] }, { stream: true }, { endpoint: 'https://invalid.example' }]) expect(agentModelRelayRequestSchema.safeParse({ ...f.request, ...patch }).success).toBe(false)
    expect(f.calls()).toBe(0)
  })
  test('one reservation wins concurrency; ready replay and reconstructed service do not call provider twice', async () => {
    const f = fixture(), results = await Promise.allSettled([f.relay().complete(f.principal, f.request), f.relay().complete(f.principal, f.request)])
    expect(results.some(r => r.status === 'fulfilled')).toBe(true); expect(f.calls()).toBe(1)
    const again = await f.relay().complete(f.principal, f.request); expect(again.choices[0].finish_reason).toBe('stop'); expect(f.calls()).toBe(1)
  })
  test('sealed-phase GET continuations preserve complete context without repeating preparation; tokens never enter model context', async () => {
    const f = fixture()
    f.rawReplies.splice(0, 1, tool('get-1', 'store_task_get', {}), tool('get-2', 'store_task_get', {}), completion('No physical count is available; difference remains unknown.'))
    const first = await f.relay().complete(f.principal, f.request)
    expect(JSON.parse(first.choices[0].message.tool_calls[0].function.arguments)).toEqual({ taskId: f.request.taskId })
    expect(readTaskSchema.omit({ authVersion: true }).strict().safeParse(JSON.parse(first.choices[0].message.tool_calls[0].function.arguments)).success).toBe(true)
    const secondBody = { ...f.request, requestId: randomUUID(), previousRequestId: f.request.requestId, toolResults: [{ toolCallId: 'get-1' }] }
    const second = await f.relay().complete(f.principal, secondBody), native = JSON.parse(second.choices[0].message.tool_calls[0].function.arguments)
    expect(native).toEqual({ taskId: f.request.taskId }); expect(native).not.toHaveProperty('authVersion')
    const third = await f.relay().complete(f.principal, { ...f.request, requestId: randomUUID(), previousRequestId: secondBody.requestId, toolResults: [{ toolCallId: 'get-2' }] })
    expect(third.choices[0].finish_reason).toBe('stop'); expect(f.calls()).toBe(3)
    expect(f.inputs[2].messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'tool'])
    expect(f.inputs[2].messages.at(-1).content).toContain(f.request.taskId)
    expect(f.inputs[0].reasoning_effort).toBe('low'); expect(f.inputs[0].tools.map((t: any) => t.function.name)).toEqual(['store_task_get', 'store_task_report'])
    expect(f.inputs[0].messages[0].content).toContain('already claimed this run and sealed its evidence')
  })
  test('missing native mutation receipt cannot be replaced by caller tool text or another model request', async () => {
    const f = fixture(), id = randomUUID(); f.rawReplies.splice(0, 1, tool('missing', 'store_task_report', { requestId: id, outcome: 'completed', rawReport: 'Physical count is unavailable; findings are unverified.', sourceRefs: [] }))
    await f.relay().complete(f.principal, f.request)
    await expect(f.relay().complete(f.principal, { ...f.request, requestId: randomUUID(), previousRequestId: f.request.requestId, toolResults: [{ toolCallId: 'missing', receiptRequestId: id }] })).rejects.toThrow('AGENT_MODEL_TOOL_RECEIPT_REQUIRED')
    expect(f.calls()).toBe(1)
  })
  test.each(['store_task_claim', 'store_task_read_stock_evidence'])('fresh provider %s cannot repeat completed preparation or trigger another provider call', async name => {
    const f = fixture(); f.rawReplies.splice(0, 1, tool('repeat-preparation', name, { requestId: randomUUID() }))
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN')
    const record: any = f.rows.get(f.store + '|team.communication.agent.model.request.' + f.principal.agentId + '.' + f.request.requestId)
    expect(record.state).toBe('blocked'); expect(record.billingStatus).toBe('usage_recorded'); expect(record.usage).toEqual({ prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 })
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN')
    expect(f.calls()).toBe(1)
  })
  test('historical ready preparation response is retained and replayed without a new provider call', async () => {
    const f = fixture(); await f.relay().complete(f.principal, f.request)
    const key = f.store + '|team.communication.agent.model.request.' + f.principal.agentId + '.' + f.request.requestId
    const record: any = f.rows.get(key)
    record.providerMessage = tool('historic-claim', 'store_task_claim', { requestId: randomUUID() }).choices[0].message
    record.finishReason = 'tool_calls'; f.rows.set(key, record)
    const before = JSON.stringify(record), replay = await f.relay().complete(f.principal, f.request)
    expect(replay.choices[0].message.tool_calls[0].function.name).toBe('store_task_claim')
    expect(JSON.parse(replay.choices[0].message.tool_calls[0].function.arguments).taskId).toBe(f.request.taskId)
    expect(JSON.stringify(f.rows.get(key))).toBe(before); expect(f.calls()).toBe(1)
  })
  test('unknown provider outcome remains durable across restart and blocks new-ID reruns', async () => {
    const f = fixture(); f.setProvider(async () => { throw Error('SYNTHETIC_LOST_RESPONSE') })
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN')
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN')
    await expect(f.relay().complete(f.principal, { ...f.request, requestId: randomUUID() })).rejects.toThrow('AGENT_MODEL_RUN_ALREADY_STARTED')
    expect(f.calls()).toBe(1)
  })
  test.each(['manager', 'staff', 'admin'])('%s cannot impersonate the executor', async role => {
    const f = fixture(); await expect(f.relay().complete({ ...f.principal, role } as any, f.request)).rejects.toThrow('AGENT_MODEL_EXECUTOR_REQUIRED'); expect(f.calls()).toBe(0)
  })
  test.each(['lease', 'deadline', 'pilot', 'evidence', 'config', 'connection'])('%s change fails before provider invocation', async change => {
    const f = fixture()
    if (change === 'lease') f.task.agentTask.lease.until = f.clock.value
    if (change === 'deadline') f.task.agentTask.plan.deadlineAt = new Date(f.clock.value).toISOString()
    if (change === 'pilot') f.put('externalAgent.pilot.v1.anchor.' + f.principal.pilot.id, { ...f.principal.pilot, id: randomUUID() })
    if (change === 'evidence') f.task.agentTask.inputSnapshotHash = '0'.repeat(64)
    if (change === 'config') f.team('ai.settings', { enabled: true, provider: 'minimax', region: 'global', model: 'MiniMax-M3.1-Flash', version: 5, secret: 'synthetic' })
    if (change === 'connection') f.team('ai.connection', { status: 'uncertain' })
    f.team(`task.${f.task.channelId}.${f.task.id}`, f.task)
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow(); expect(f.calls()).toBe(0)
  })
  test('post-start revocation withholds output but retains provider receipt/usage for audit', async () => {
    const f = fixture(); f.setProvider(async () => { f.live.authorized = false; return completion('Read-only result.') })
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_RESULT_WITHHELD')
    const saved = f.rows.get(f.store + '|team.communication.agent.model.request.' + f.principal.agentId + '.' + f.request.requestId)
    expect(saved.state).toBe('withheld'); expect(saved.providerReceipt.usage.completion_tokens).toBe(20); expect(saved.billingStatus).toBe('usage_recorded'); expect(f.calls()).toBe(1)
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow(); expect(f.calls()).toBe(1)
    f.live.authorized = true
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN'); expect(f.calls()).toBe(1)
  })
  test('audit failure rolls back the reservation and run pointer before transport', async () => {
    const f = fixture(), before = structuredClone(f.rows)
    f.db.financeAuditLog.create = async () => { throw Error('SYNTHETIC_AUDIT_FAILURE') }
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE')
    expect(JSON.stringify([...f.rows])).toBe(JSON.stringify([...before])); expect(f.calls()).toBe(0)
  })
  test('same ID with changed continuation conflicts without a second invocation', async () => {
    const f = fixture(); await f.relay().complete(f.principal, f.request)
    await expect(f.relay().complete(f.principal, { ...f.request, previousRequestId: randomUUID(), toolResults: [] })).rejects.toThrow('AGENT_MODEL_REQUEST_CONFLICT')
    expect(f.calls()).toBe(1)
  })
  test('deadline passing during provider work withholds the returned result and preserves receipt', async () => {
    const f = fixture(); f.setProvider(async () => { f.clock.value += 600001; return completion('Read-only result.') })
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_RESULT_WITHHELD')
    const saved = f.rows.get(f.store + '|team.communication.agent.model.request.' + f.principal.agentId + '.' + f.request.requestId)
    expect(saved.state).toBe('withheld'); expect(saved.providerReceipt).toBeDefined(); expect(f.calls()).toBe(1)
  })
  test('a new pilot stamp cannot reuse an old task or extend its anchored T0', async () => {
    const f = fixture(), newer = { id: randomUUID(), startedAt: new Date(f.clock.value - 1).toISOString(), expiresAt: new Date(f.clock.value - 1 + 86400000).toISOString() }
    f.principal.pilot = newer
    f.put('externalAgent.pilot.v1', { stamp: newer, storeId: f.store, channelId: f.task.channelId, taskCode: 'STOCK-RO-001', enabled: true, version: 2 })
    f.put('externalAgent.pilot.v1.anchor.' + newer.id, newer)
    await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_RUN_OR_LEASE_CHANGED'); expect(f.calls()).toBe(0)
  })
  test('deadline reached before send is known-not-sent, blocked and not billable; no automatic replay', async () => {
    const f = fixture(); let networkCalls = 0
    const relay = createAgentModelRelay(f.db, f.deps, { enabled: true, transport: async (_s, _c, _r, before) => {
      f.clock.value += 600001; await before(); networkCalls++; return completion('Must not happen')
    } })
    await expect(relay.complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_NOT_SENT')
    const saved = f.rows.get(f.store + '|team.communication.agent.model.request.' + f.principal.agentId + '.' + f.request.requestId)
    expect(saved.state).toBe('blocked'); expect(saved.billingStatus).toBe('not_started'); expect(saved.providerReceipt).toBeUndefined(); expect(networkCalls).toBe(0)
  })
  test('unsafe model tool names or arbitrary tool arguments are never returned for execution', async () => {
    for (const response of [tool('bad', 'shell', {}), tool('bad', 'store_task_get', { url: 'https://invalid.example' })]) {
      const f = fixture(); f.rawReplies.splice(0, 1, response)
      await expect(f.relay().complete(f.principal, f.request)).rejects.toThrow('AGENT_MODEL_OUTCOME_UNKNOWN')
      expect(f.calls()).toBe(1)
    }
  })
})
