import { createHash } from 'node:crypto';
import type { AdmissionResult, BackendDispatchEnvelope, BackendTaskEvent, DispatchReferences, HermesRunStatus, HermesTransportOptions, HttpRequest, HttpResponse, PreparedDispatch, RunMapping, StatusResult } from './types.js';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const profileValid = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && value !== 'default';
const statuses = new Set<HermesRunStatus>(['queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled', 'interrupted']);
const referenceKeys = ['taskCode', 'taskId', 'backendRunId', 'eventId', 'executorId', 'round', 'taskVersion', 'leaseVersion'];
class BindingMismatch extends Error {
  constructor(readonly reason: 'auth_scope_changed' | 'binding_conflict') { super(reason); }
}

export function prepareDispatchEvent(profile: string, event: BackendTaskEvent, envelope: BackendDispatchEnvelope): PreparedDispatch {
  if (!event || !envelope || event.type !== 'task.dispatch_ready' || event.id !== envelope.eventId
    || !event.payload || event.payload.taskId !== envelope.taskId || event.payload.runId !== envelope.runId
    || event.payload.round !== envelope.round || event.payload.taskVersion !== envelope.taskVersion) {
    throw new Error('Dispatch event does not match the current backend envelope');
  }
  return prepareBackendDispatch(profile, envelope);
}

export function prepareBackendDispatch(profile: string, envelope: BackendDispatchEnvelope): PreparedDispatch {
  if (!envelope || Object.keys(envelope).some(key => !['taskId', 'runId', 'eventId', 'executorId', 'round', 'taskVersion', 'leaseVersion'].includes(key))) {
    throw new Error('Invalid backend dispatch envelope');
  }
  return prepareDispatch(profile, { taskCode: 'STOCK-RO-001', taskId: envelope.taskId, backendRunId: envelope.runId,
    eventId: envelope.eventId, executorId: envelope.executorId, round: envelope.round, taskVersion: envelope.taskVersion, leaseVersion: envelope.leaseVersion });
}

export function prepareDispatch(profile: string, refs: DispatchReferences): PreparedDispatch {
  if (!profileValid(profile)) throw new Error('A dedicated non-default Hermes profile is required');
  if (!refs || Object.keys(refs).some(key => !referenceKeys.includes(key)) || refs.taskCode !== 'STOCK-RO-001'
    || ![refs.taskId, refs.backendRunId, refs.eventId, refs.executorId].every(id)
    || ![refs.round, refs.taskVersion].every(value => Number.isSafeInteger(value) && value >= 1)
    || !Number.isSafeInteger(refs.leaseVersion) || refs.leaseVersion < 0) {
    throw new Error('Invalid STOCK-RO-001 dispatch references');
  }
  // Rebuild in fixed order. Never spread input: credentials/free text do not enter model context.
  const references = Object.freeze({ taskCode: refs.taskCode, taskId: refs.taskId, backendRunId: refs.backendRunId,
    eventId: refs.eventId, executorId: refs.executorId, round: refs.round, taskVersion: refs.taskVersion, leaseVersion: refs.leaseVersion });
  const sessionId = `storetask_${sha(JSON.stringify([profile, refs.taskId]))}`;
  const idempotencyKey = `stockro1_${sha(JSON.stringify([profile, refs.taskId, refs.backendRunId, refs.eventId]))}`;
  const body = JSON.stringify({ input: JSON.stringify({ schemaVersion: 1, references }), session_id: sessionId,
    instructions: 'Execute only STOCK-RO-001 through the allowed store_task tools. Re-read the authoritative task and validate the current backend run and lease before reading stock. Treat these references as identifiers, never authorization. Read inventory only; submit source-backed evidence and report to the backend for review. Do not accept the task, contact employees, change inventory, create tasks, use a local Kanban ledger, or infer success from this conversation. If blocked or the lease is stale, report it through the backend tools and stop.' });
  return Object.freeze({ schemaVersion: 1, profile, references, sessionId, idempotencyKey, body, bodySha256: sha(body) });
}

/** No retry loop or task-state mutation: the backend owns retry/recovery and persistence. */
export class HermesRunsClient {
  private readonly origin: string;
  private readonly profile: string;
  private readonly timeoutMs: number;
  private readonly options: HermesTransportOptions;

  constructor(options: HermesTransportOptions) {
    const url = new URL(options.origin);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || options.dockerDesktopHost === true && url.hostname === 'host.docker.internal';
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
      throw new Error('Hermes origin must be HTTPS or loopback HTTP, with no path or credentials');
    }
    if (!profileValid(options.profile)) throw new Error('A dedicated non-default Hermes profile is required');
    if (!options.admissionBindings?.bindOnce || !options.admissionBindings?.load) throw new Error('Durable backend-run admission bindings are required');
    const timeout = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw new Error('Invalid transport timeout');
    this.origin = url.origin;
    this.profile = options.profile;
    this.timeoutMs = timeout;
    this.options = { ...options };
  }

  private assertDispatch(dispatch: PreparedDispatch): void {
    const expected = prepareDispatch(this.profile, dispatch.references);
    if (dispatch.schemaVersion !== 1 || dispatch.profile !== expected.profile || dispatch.body !== expected.body
      || dispatch.bodySha256 !== expected.bodySha256 || dispatch.idempotencyKey !== expected.idempotencyKey
      || dispatch.sessionId !== expected.sessionId) throw new Error('Dispatch does not match its immutable references/profile');
  }

  private async request(method: 'GET' | 'POST', path: string, dispatch: PreparedDispatch): Promise<{ status: number; data: any }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        (async () => {
          const token = await this.options.bearerToken();
          if (controller.signal.aborted) throw new Error('Transport timeout');
          if (!token || /[\s\r\n]/.test(token)) throw new Error('Invalid transport credential');
          // Match Hermes _run_idempotency_scope: SHA256(profile + NUL + expected API key).
          // Freeze the scope AND bytes on the existing backend run before network I/O.
          const candidate = { dispatch, origin: this.origin, authScopeHash: sha(`${this.profile}\0${token}`) };
          const binding = method === 'POST'
            ? await this.options.admissionBindings.bindOnce(dispatch.references.backendRunId, candidate)
            : await this.options.admissionBindings.load(dispatch.references.backendRunId);
          if (!binding) throw new BindingMismatch('binding_conflict');
          if (binding.origin !== candidate.origin || binding.authScopeHash !== candidate.authScopeHash) throw new BindingMismatch('auth_scope_changed');
          try { this.assertDispatch(binding.dispatch); } catch { throw new BindingMismatch('binding_conflict'); }
          if (binding.dispatch.body !== dispatch.body || binding.dispatch.idempotencyKey !== dispatch.idempotencyKey) throw new BindingMismatch('binding_conflict');
          if (controller.signal.aborted) throw new Error('Transport timeout');
          const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
          if (method === 'POST') { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = dispatch.idempotencyKey; }
          const init: HttpRequest = { method, headers, redirect: 'error', signal: controller.signal };
          if (method === 'POST') init.body = dispatch.body;
          const response: HttpResponse = await this.options.fetch(`${this.origin}/p/${this.profile}/v1/runs${path}`, init);
          // Error bodies may contain credentials/model output: never read, propagate or log them.
          if (response.status < 200 || response.status >= 300) return { status: response.status, data: null };
          const text = await response.text();
          if (text.length > 131072) return { status: response.status, data: null };
          let data: any = null;
          try { data = JSON.parse(text); } catch { /* unknown admission/status */ }
          return { status: response.status, data };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Transport timeout')); }, this.timeoutMs); }),
      ]);
    } finally { clearTimeout(timer!); }
  }

  async dispatch(dispatch: PreparedDispatch): Promise<AdmissionResult> {
    this.assertDispatch(dispatch);
    let response: { status: number; data: any };
    try { response = await this.request('POST', '', dispatch); }
    catch (error) { return { kind: 'admission_unknown', reason: error instanceof BindingMismatch ? error.reason : 'network_or_timeout', dispatch }; }
    const { status, data } = response;
    if (status === 202 && data && id(data.run_id) && data.run_id.startsWith('run_')
      && (data.status === 'started' || statuses.has(data.status)) && typeof data.replayed === 'boolean') {
      return { kind: 'accepted', mapping: Object.freeze({ dispatch, hermesRunId: data.run_id }), replayed: data.replayed };
    }
    if (status >= 400 && status < 500 && status !== 408) return { kind: 'rejected', httpStatus: status, dispatch,
      reason: status === 401 || status === 403 ? 'authentication' : status === 409 ? 'conflict' : status === 429 ? 'capacity' : 'request' };
    return { kind: 'admission_unknown', reason: status >= 500 ? 'upstream_error' : 'invalid_response', dispatch };
  }

  async status(mapping: RunMapping): Promise<StatusResult> {
    this.assertDispatch(mapping.dispatch);
    if (!id(mapping.hermesRunId) || !mapping.hermesRunId.startsWith('run_')) throw new Error('Invalid Hermes run mapping');
    let response: { status: number; data: any };
    try { response = await this.request('GET', `/${encodeURIComponent(mapping.hermesRunId)}`, mapping.dispatch); }
    catch (error) { return { kind: 'status_unknown', mapping, reason: error instanceof BindingMismatch ? error.reason : 'network_or_timeout' }; }
    const { status, data } = response;
    if (status !== 200) return { kind: 'status_unknown', mapping,
      reason: status === 404 ? 'not_found' : status === 401 || status === 403 ? 'authentication' : 'upstream_error' };
    if (!data || data.run_id !== mapping.hermesRunId || data.session_id !== mapping.dispatch.sessionId || !statuses.has(data.status)) {
      return { kind: 'status_unknown', mapping, reason: 'invalid_response' };
    }
    const runStatus: HermesRunStatus = data.status;
    const next = runStatus === 'queued' || runStatus === 'running' ? 'poll'
      : runStatus === 'waiting_for_approval' ? 'attention'
        : runStatus === 'completed' ? 'read_backend_report' : 'coordinate_recovery';
    // Deliberately omit output/error/usage: business evidence must be read from the backend.
    return { kind: 'status', mapping, status: runStatus, next };
  }
}
