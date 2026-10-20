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

export type AdmissionResult =
  | { kind: 'accepted'; mapping: RunMapping; replayed: boolean }
  | { kind: 'admission_unknown'; reason: 'network_or_timeout' | 'invalid_response' | 'upstream_error'; dispatch: PreparedDispatch }
  | { kind: 'rejected'; reason: 'authentication' | 'conflict' | 'capacity' | 'request'; httpStatus: number; dispatch: PreparedDispatch };

export type HermesRunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type StatusResult =
  | { kind: 'status'; mapping: RunMapping; status: HermesRunStatus; next: 'poll' | 'attention' | 'read_backend_report' | 'coordinate_recovery' }
  | { kind: 'status_unknown'; mapping: RunMapping; reason: 'network_or_timeout' | 'invalid_response' | 'not_found' | 'authentication' | 'upstream_error' };

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
  /** Configured origin only, never taken from task/event input. */
  origin: string;
  /** Dedicated non-default profile; requests use /p/<profile>/v1/runs. */
  profile: string;
  timeoutMs?: number;
  /** Injected at integration time. No env/private-profile reads or network on import. */
  fetch: HttpFetch;
  bearerToken: () => string | Promise<string>;
}
