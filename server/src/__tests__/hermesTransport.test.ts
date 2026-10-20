import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HermesRunsClient, prepareBackendDispatch, prepareDispatchEvent, prepareDispatch } from '../services/hermesTransport/client.js';
import type { DispatchReferences, HttpFetch, PreparedDispatch } from '../services/hermesTransport/types.js';

const profile = 'stock-ro-isolated';
const refs: DispatchReferences = { taskCode: 'STOCK-RO-001', taskId: 'task_fixture', backendRunId: 'backend_run_1',
  eventId: 'event_1', executorId: 'executor_fixture', round: 1, taskVersion: 2, leaseVersion: 1 };
const response = (status: number, data: unknown) => ({ status, text: async () => JSON.stringify(data) });
const client = (fetch: HttpFetch, timeoutMs = 1000) => new HermesRunsClient({ origin: 'http://127.0.0.1:8642',
  profile, fetch, timeoutMs, bearerToken: () => 'fixture-only-not-a-credential' });
const prepared = () => prepareDispatch(profile, refs);
const mapping = () => ({ dispatch: prepared(), hermesRunId: 'run_fixture' });

test('stable immutable dispatch survives persistence/reorder and rejects extra secret fields', () => {
  const first = prepared();
  const second = prepareDispatch(profile, { leaseVersion: 1, eventId: 'event_1', taskVersion: 2, round: 1,
    executorId: 'executor_fixture', backendRunId: 'backend_run_1', taskId: 'task_fixture', taskCode: 'STOCK-RO-001' });
  assert.deepEqual(first, second);
  assert(Object.isFrozen(first) && Object.isFrozen(first.references));
  assert.throws(() => prepareDispatch(profile, { ...refs, leaseToken: 'secret' } as any));
  assert.throws(() => prepareDispatch('default', refs));
  assert.throws(() => prepareDispatch(profile, { ...refs, taskCode: 'OTHER' } as any));
  assert.throws(() => prepareDispatch(profile, { ...refs, round: 0 }));
  assert.equal(prepareDispatch(profile, { ...refs, round: 2, backendRunId: 'backend_run_2', eventId: 'event_2' }).sessionId, first.sessionId);
  assert.notEqual(prepareDispatch(profile, { ...refs, eventId: 'event_2' }).idempotencyKey, first.idempotencyKey);
});

test('mainline DispatchEnvelope maps runId and executorId without lease credentials', () => {
  const dispatch = prepareBackendDispatch(profile, { taskId: refs.taskId, runId: refs.backendRunId, eventId: refs.eventId,
    executorId: refs.executorId, round: refs.round, taskVersion: refs.taskVersion, leaseVersion: 0 });
  assert.equal(dispatch.references.backendRunId, refs.backendRunId);
  assert.equal(dispatch.references.executorId, refs.executorId);
  assert.equal(dispatch.references.leaseVersion, 0);
  assert.throws(() => prepareBackendDispatch(profile, { ...refs, runId: refs.backendRunId, leaseToken: 'secret' } as any));
});

test('only matching internal dispatch_ready events can prepare work; dot events cannot dispatch', () => {
  const envelope = { taskId: refs.taskId, runId: refs.backendRunId, eventId: refs.eventId,
    executorId: refs.executorId, round: refs.round, taskVersion: refs.taskVersion, leaseVersion: refs.leaseVersion };
  const event = { id: refs.eventId, sequence: 1, occurredAt: '2026-10-21T00:00:00Z', type: 'task.dispatch_ready' as const,
    payload: { taskId: refs.taskId, runId: refs.backendRunId, round: refs.round, taskVersion: refs.taskVersion } };
  assert.deepEqual(prepareDispatchEvent(profile, event, envelope), prepared());
  assert.throws(() => prepareDispatchEvent(profile, { ...event, type: 'task.report_ready' }, envelope));
  assert.throws(() => prepareDispatchEvent(profile, event, { ...envelope, taskVersion: 3 }));
  assert.throws(() => prepareDispatchEvent(profile, { ...event, id: 'wrong' }, envelope));
});

test('dispatch uses isolated profile, bearer auth and exact persisted request', async () => {
  const persisted: PreparedDispatch = JSON.parse(JSON.stringify(prepared()));
  const calls: any[] = [];
  const c = client(async (url, request) => { calls.push({ url, request }); return response(202, { run_id: 'run_fixture', status: 'queued', replayed: false }); });
  const result = await c.dispatch(persisted);
  assert.equal(result.kind, 'accepted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8642/p/stock-ro-isolated/v1/runs');
  assert.equal(calls[0].request.body, persisted.body);
  assert.equal(calls[0].request.headers['Idempotency-Key'], persisted.idempotencyKey);
  assert.equal(calls[0].request.redirect, 'error');
  assert(!JSON.stringify(result).includes('fixture-only-not-a-credential'));
});

test('lost admission has no automatic retry; explicit replay preserves bytes and key', async () => {
  const calls: any[] = [];
  const c = client(async (_url, request) => {
    calls.push(request);
    if (calls.length === 1) throw new Error('lost response with PRIVATE_DETAIL');
    return response(202, { run_id: 'run_original', status: 'running', replayed: true });
  });
  const dispatch = prepared();
  const unknown = await c.dispatch(dispatch);
  assert.equal(unknown.kind, 'admission_unknown');
  assert.equal(calls.length, 1);
  assert(!JSON.stringify(unknown).includes('PRIVATE_DETAIL'));
  const replay = await c.dispatch(dispatch);
  assert.equal(replay.kind, 'accepted');
  if (replay.kind === 'accepted') { assert.equal(replay.mapping.hermesRunId, 'run_original'); assert.equal(replay.replayed, true); }
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
});

test('tampered persisted envelope is rejected before auth or network', async () => {
  let called = false;
  const c = client(async () => { called = true; return response(202, {}); });
  await assert.rejects(c.dispatch({ ...prepared(), body: 'tampered' }));
  await assert.rejects(c.dispatch({ ...prepared(), profile: 'default' }));
  assert.equal(called, false);
});

test('admission errors distinguish explicit rejection from uncertain server outcomes; never read error bodies', async () => {
  for (const [httpStatus, expected] of [[401, 'rejected'], [403, 'rejected'], [409, 'rejected'], [429, 'rejected'], [400, 'rejected'], [408, 'admission_unknown'], [500, 'admission_unknown'], [302, 'admission_unknown']] as const) {
    const c = client(async () => ({ status: httpStatus, text: async () => { throw new Error('must not read'); } }));
    assert.equal((await c.dispatch(prepared())).kind, expected);
  }
  for (const payload of [null, { run_id: 'run_fixture', status: 'new_unknown', replayed: false }, { run_id: 'bad/id', status: 'queued', replayed: false }, { run_id: 'run_fixture', status: 'queued' }]) {
    assert.equal((await client(async () => response(202, payload)).dispatch(prepared())).kind, 'admission_unknown');
  }
});

test('HTTP timeout is unknown and aborts without retry', async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const result = await client(async (_url, req) => { calls++; signal = req.signal; return new Promise(() => {}); }, 10).dispatch(prepared());
  assert.equal(result.kind, 'admission_unknown');
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test('late credential resolution after timeout cannot trigger a request', async () => {
  let release!: (token: string) => void;
  let calls = 0;
  const c = new HermesRunsClient({ origin: 'http://localhost:8642', profile, timeoutMs: 10,
    bearerToken: () => new Promise(resolve => { release = resolve; }), fetch: async () => { calls++; return response(202, {}); } });
  assert.equal((await c.dispatch(prepared())).kind, 'admission_unknown');
  release('fixture');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('status does not equate transport completion with task acceptance and omits model output', async () => {
  for (const [status, next] of [['queued', 'poll'], ['running', 'poll'], ['waiting_for_approval', 'attention'], ['completed', 'read_backend_report'], ['interrupted', 'coordinate_recovery'], ['failed', 'coordinate_recovery'], ['cancelled', 'coordinate_recovery']]) {
    let calls = 0;
    const c = client(async (url, req) => { calls++; assert(url.endsWith('/run_fixture')); assert.equal(req.method, 'GET');
      return response(200, { run_id: 'run_fixture', session_id: prepared().sessionId, status, output: 'PRIVATE_OUTPUT', error: 'PRIVATE_ERROR' }); });
    const result = await c.status(mapping());
    assert.equal(result.kind, 'status');
    if (result.kind === 'status') assert.equal(result.next, next);
    assert(!JSON.stringify(result).includes('PRIVATE_'));
    assert.equal(calls, 1);
  }
});

test('wrong session/run, missing state or 404 is unknown and never launches another run', async () => {
  for (const payload of [{ run_id: 'run_other', session_id: prepared().sessionId, status: 'completed' },
    { run_id: 'run_fixture', session_id: 'wrong_session', status: 'completed' },
    { run_id: 'run_fixture', session_id: prepared().sessionId, status: 'unrecognized' }]) {
    assert.equal((await client(async () => response(200, payload)).status(mapping())).kind, 'status_unknown');
  }
  const result = await client(async (_url, req) => { assert.equal(req.method, 'GET'); return response(404, null); }).status(mapping());
  assert.equal(result.kind, 'status_unknown');
  if (result.kind === 'status_unknown') assert.equal(result.reason, 'not_found');
});

test('rejects origins containing credentials, query, path or nonlocal cleartext', () => {
  for (const origin of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?key=secret']) {
    assert.throws(() => new HermesRunsClient({ origin, profile, fetch: async () => response(200, {}), bearerToken: () => 'fixture' }));
  }
});
