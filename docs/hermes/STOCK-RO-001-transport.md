# STOCK-RO-001 Hermes transport (isolated, not mounted)

## Scope and ownership

This module is a transport adapter only. It neither creates nor starts Hermes, reads environment secrets, imports Hermes Python, contacts models/employees, subscribes to Events, nor changes inventory. No application route imports it in this isolated branch. The backend integration owner must supply an explicit HTTP implementation, credential resolver and durable AdmissionBindings implementation before it can send anything.

Owned files: `server/src/services/hermesTransport/{types,client}.ts`, `server/src/__tests__/hermesTransport.test.ts`, and this directory. Backend mainline alone integrates task/identity/lease persistence; externalMcp owns tools and Events. The adapter imports only the frozen DispatchEnvelope type from mainline `agentTasks/contract.ts`; that file is not modified or owned here. Integrate after the mainline contract commit.

## Observed local contract

Inspected editable checkout `~/.hermes/hermes-agent`, source version 0.21.0, commit `a7198a8855ad98681114ff5138eb01fe132a62e7`. Its stale distribution metadata says 0.12.0. Do not treat local source presence as a running service.

- `gateway/platforms/api_server_runs.py`: `POST /v1/runs` accepts `input`, `instructions`, `session_id`, and `Idempotency-Key`; its first response is 202 `{run_id,status:"started",replayed:false}`. A replay uses stored queued/running/terminal status. `started` is an admission marker, not a stored lifecycle status. GET `/v1/runs/{run_id}` returns status and session ID.
- `gateway/platforms/api_server.py`: `/p/<profile>/` mirrors and validates served profile; Bearer authentication is profile-scoped. Our client always uses this prefix for a dedicated profile; configure that profile as served before future live acceptance.
- Statuses: queued, running, waiting_for_approval, completed, failed, cancelled, interrupted. Interrupted is synthesized when a previous owner died/restarted, not an automatic resume promise.
- `api_server_run_idempotency.py`: SQLite-backed dedup/status; may fall back to memory on open failure. Terminal records can age out after 24 hours. Before uncertain admission replay, backend must verify the same authentication scope and acceptable retention window. Outside it, reconcile backend lease/report and block for recovery; never assume the same idempotency key is permanently safe.
- `_run_idempotency_scope` hashes `profile + NUL + expected API key`. Rotating the API key changes Hermes's scope: the same request/key could otherwise admit a second run. The adapter binds the original scope hash, origin and exact dispatch to the existing backendRunId before I/O and rejects changes before sending. No raw bearer is stored or returned. This adapter supports the inspected Bearer API path, not room-grant dispatch.
- Python MCP SDK 1.27.0 uses Streamable HTTP and legacy initialize 2025-11-25, not discover 2026-07-28. MCP tool endpoint must accept legacy handshake. Toolset registration is `mcp-<server>`; tool names are `mcp__<server>__<tool>` and `tools.include` contains raw names.

## Backend integration boundary

1. Server resolves trusted executor principal, store scope and assigned task. No caller-controlled ID in the transport prompt grants authority.
2. `prepareBackendDispatch(profile, view.dispatch)` accepts the imported mainline DispatchEnvelope: taskId/runId/eventId/round/taskVersion/executorId/leaseVersion. It maps `runId` to `backendRunId` and adds the fixed taskCode. Initial leaseVersion may be zero before claim; later task/lease state must be re-read. executorId is only a reference; tools resolve trusted AgentPrincipal independently. Long-lived business/API credentials never enter input. The task-scoped leaseToken is obtained from the claim tool and used only in the business-tool protocol, not in this transport envelope. MCP adapter must supply/advertise the trusted current authVersion required by service inputs; it is not present in DispatchEnvelope and may not be guessed by the model.
3. Prefer `prepareDispatchEvent(profile, event, view.dispatch)`: it admits only internal `task.dispatch_ready` whose ID/task/run/round/version match the current envelope. Dot's three report events cannot trigger work. Persist the complete prepared value **before** POST, associated with the authoritative backend run/event. It contains only references, fixed instructions, deterministic session/key, exact body and hash. No credentials/free text. Implement required `AdmissionBindings.bindOnce(backendRunId,binding)` as atomic insert-if-absent on the existing backend run and return the original persisted binding if present; `load` reads it. Never overwrite/delete it on uncertainty, restart, credential/authVersion rotation, new event, new task/lease version or HTTP completion. Do not supply a process-memory fallback. Storage failure prevents network admission.
4. Send once with `client.dispatch(prepared)`. Persist accepted `hermesRunId` with prepared dispatch. A 202 is admission, not proof of lease acquisition or business success.
5. Network failures, timeout, HTTP 408/5xx, unexpected status/body mean admission_unknown. Do not create a replacement backend run, change lease, regenerate event ID or claim failure. Coordinator decides whether to replay the same key and exact body within dedup retention, then recovers original Hermes ID. `auth_scope_changed` or `binding_conflict` also preserves unknown state and requires recovery: the adapter sends nothing when the original scope/origin/profile/body/key changes, even across client restart. This adapter never retries on its own. Repreparing changed references for the same backendRunId cannot bypass the stored binding; creating a new backendRunId before settling the old unknown run is prohibited by the mainline coordinator.
6. Query `client.status(mapping)`. Polling interval is owned by backend (not implemented here); it does not delay admission. Completed means `read_backend_report`; failed/cancelled/interrupted means `coordinate_recovery`. Neither closes the business task. 404 is unknown, never permission to relaunch. waiting_for_approval needs attention; do not auto-approve.
7. Backend verifies submitted evidence/report through its own trusted tools and lease fence. Dot receives ID/version Events and independently reads the report. Only dot-side accepted review completes the original task.

The backend must serialize active runs for a task. Stable session IDs reuse context but do **not** serialize concurrent HTTP runs; leases, stale-write rejection and per-task dispatch ownership are mandatory. Body hashes bind request bytes, not proof of task authority.

## Employee feedback and rework

STOCK-RO-001 does not send employee messages. For a later explicitly authorized waiting flow, backend stores waiting state and feedback, settles the active run, then dispatches a new backend attempt/event with a new lease version under the same task/session. A rework creates a new round/attempt while retaining original task and evidence. Do not reuse a live run or let an old lease submit later. Do not mirror business tasks into Hermes Kanban; default profile's cron and private sessions are unrelated.

## Independent profile / activation boundary

`stock-ro-profile.template.yaml` is a disabled review template only. Do not copy default profile, `.env`, auth.json, memory, sessions or cron. Clone in this installed Hermes copies credentials and memory. No profile has been created by this work.

Future activation requires explicit scope for: creation of the named isolated profile; selection of MiniMax credentials; backend executor binding and limited business credential; HTTP access path to Mac; listener address and auth; launch supervision; Events install/subscription. Do not publish a port or create a tunnel automatically. Enable neither default's 10 cron jobs nor its local-terminal toolset.

Profile/template allowlists are defense in depth, not an OS sandbox or backend authorization. Verify the effective API tool list before enabling: only the agreed store_task executor tools, no terminal/browser/cron/Kanban/delegation tools. Backend tools must reject manager operations, wrong store, task, round and stale lease, even if model asks.

Mac must remain awake, online, powered and logged in for LaunchAgent execution. Existing gateway plist has RunAtLoad and KeepAlive SuccessfulExit=false; normal exit is not guaranteed to restart. Startup, sleep/reboot recovery, durable admission store, and reachable authenticated profile endpoint all need later live acceptance. This change does not alter power/service settings.

## Verification performed

The focused Node test uses an injected in-memory fake fetch and a test-only binding store: no sockets, listeners, credentials, model or production traffic. Fifteen tests check the actual first `started` response, stable/persisted request bytes, dedicated profile routing, lost admission replay, authentication rotation after client restart, changed event/key/version/profile fences, durable-storage failure, tamper rejection, error classifications, timeout/abort, late credential resolution, output omission, interrupted recovery, mismatched run/session and origin validation. The scoped-server fixture demonstrates one admitted run and no second network call on rotated auth. Strict TypeScript checking covers adapter/test against mainline's read-only contract reference. It is not live Hermes/provider/MCP acceptance.
