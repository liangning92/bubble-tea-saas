import type { AgentTaskEvent, DispatchEnvelope } from '../agentTasks/contract.js';

/** Transport references only. Backend owns identity, leases, task state and evidence. */
export interface DispatchReferences {
  taskCode: 'STOCK-RO-001';
  taskId: string;
  backendRunId: string;
  eventId: string;
  executorId: string;
  round: number;
  taskVersion: number;
  leaseVersion: number;
}

/** Mainline owns this contract. No duplicate task/identity contract in the adapter. */
export type BackendDispatchEnvelope = DispatchEnvelope;
export type BackendTaskEvent = AgentTaskEvent;

/** Persist before I/O, then replay these exact bytes/key after uncertain admission. */
export interface PreparedDispatch {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly references: Readonly<DispatchReferences>;
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly body: string;
  readonly bodySha256: string;
}

export interface RunMapping {
  readonly dispatch: PreparedDispatch;
  readonly hermesRunId: string;
}

/** Transport metadata stored atomically on the existing backend run, not a task ledger. */
export interface AdmissionBinding {
  readonly dispatch: PreparedDispatch;
  readonly origin: string;
  /** Same profile/key scope used by Hermes; never stores the bearer token. */
  readonly authScopeHash: string;
}

export interface AdmissionBindings {
  /** Durable compare-and-set by backendRunId. Return the original if already bound.
   * Must never overwrite/remove a binding on timeout, auth rotation, event/version change,
   * restart or completed HTTP request. Throw on unavailable storage; no memory fallback.
   */
  bindOnce(backendRunId: string, binding: AdmissionBinding): Promise<AdmissionBinding>;
  load(backendRunId: string): Promise<AdmissionBinding | undefined>;
}

export type AdmissionResult =
  | { kind: 'accepted'; mapping: RunMapping; replayed: boolean }
  | { kind: 'admission_unknown'; reason: 'network_or_timeout' | 'invalid_response' | 'upstream_error' | 'auth_scope_changed' | 'binding_conflict'; dispatch: PreparedDispatch }
  | { kind: 'rejected'; reason: 'authentication' | 'conflict' | 'capacity' | 'request'; httpStatus: number; dispatch: PreparedDispatch };

export type HermesRunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type StatusResult =
  | { kind: 'status'; mapping: RunMapping; status: HermesRunStatus; next: 'poll' | 'attention' | 'read_backend_report' | 'coordinate_recovery' }
  | { kind: 'status_unknown'; mapping: RunMapping; reason: 'network_or_timeout' | 'invalid_response' | 'not_found' | 'authentication' | 'upstream_error' | 'auth_scope_changed' | 'binding_conflict' };

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}
export interface HttpRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  redirect: 'error';
  signal: AbortSignal;
}
export type HttpFetch = (url: string, request: HttpRequest) => Promise<HttpResponse>;

export interface HermesTransportOptions {
  /** Explicit Docker Desktop bridge to a Mac loopback listener; never caller input. */
  dockerDesktopHost?: boolean;
  /** Configured origin only, never taken from task/event input. */
  origin: string;
  /** Dedicated non-default profile; requests use /p/<profile>/v1/runs. */
  profile: string;
  timeoutMs?: number;
  /** Injected at integration time. No env/private-profile reads or network on import. */
  fetch: HttpFetch;
  bearerToken: () => string | Promise<string>;
  /** Required durable backend-run binding. No default/in-memory production implementation. */
  admissionBindings: AdmissionBindings;
}
