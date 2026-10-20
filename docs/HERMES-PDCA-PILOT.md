# Hermes PDCA pilot contract v1

Status: isolated implementation, based on production source `97a56d1c`. No production router, executor grant, Hermes bearer, model invocation, callback subscription, or additional running service is enabled by this work.

The shared TypeScript/Zod contract is `server/src/services/agentTasks/contract.ts`. The business factory is `createAgentTaskService(db, dependencies)`. Required authorization callbacks have no permissive default: each transaction rechecks the independent principal, current grant/client versions, store, channel and permitted scope. Tool JSON never supplies the acting principal. Existing employee/admin task mutations cannot mutate an agent task.

## Ownership and identity

- dot owns planning, independent checking, acceptance, rework and changes to the next plan.
- Hermes executes the assigned round through restricted tools; MiniMax is its model, not a separate persistent process.
- The backend owns the task, run, authorization, atomic lease, evidence snapshot, immutable report, receipts, audit and event outbox.
- `taskId` identifies the existing TeamTask. `runId` identifies one backend round. `hermesRunId` and `sessionId` identify transport receipts and confer no business authority.
- The new business code owns `agentTasks/*`. The Hermes adapter owns `hermesTransport/*`. MCP owns `externalMcp/*`, trusted identity bindings and Events subscriptions/delivery.

## STOCK-RO-001 SOP

P: Assign one store-scoped task to compare the current inventory ledger with existing physical count evidence. Record objective, prohibited actions, deadline, first report within ten minutes, required evidence and explicit acceptance criteria.

D: Hermes re-reads the task, claims its current run atomically, reads the fixed stock evidence capability and returns its own report. Include the task/round, scope understood, item names, units, book quantities, source times and IDs, comparable physical evidence, differences only where unit and ledger boundary are certified, and missing evidence or blockers. No physical evidence means unknown; negative book balance alone does not establish a physical shortage. The raw report is retained. No canned expected report is supplied for the model to copy.

C: dot re-reads the immutable report and underlying snapshot, checks every planned criterion and records evidence IDs plus reasons. A report is pending review; transport admission, callback delivery and a model's claim of success never accept it.

A: dot either accepts the report against all criteria or records corrections and the next plan on the same task. Rework creates a new backend round and event after closing the old lease. Accepting a read-only report does not resolve a physical inventory discrepancy.

Allowed capability: read the store's native inventory/count evidence and report it. No procurement, ledger adjustment, employee contact, payment, rewards, punishment, permission changes, SQL, arbitrary tools or operating promises.

## Tool and event boundary

Tools: `store_task_assign`, `store_task_get`, `store_task_claim`, `store_task_read_stock_evidence`, `store_task_report`, `store_task_review`. Manager scopes are `management.assign/read/review`; executor scopes are `executor.claim/evidence/report`. Executor task reads use `executor.claim`.

`report` requires the immutable evidence ID and snapshot hash for a completed report. A failed/blocked/unknown report may omit evidence when none was obtained, and must not invent source references. Review must refer to the latest report/run/round/version. An unknown result cannot be blindly reworked into another execution.

The internal `task.dispatch_ready` event triggers Hermes HTTP admission. dot receives only `task.report_ready`, `task.blocked`, or `task.failed`, with task/run/round/report IDs and versions. The outbox retains stable event IDs, sequence and timestamp. The current MCP Events adapter advertises `cursor: null`; backend `events(after,limit)` recovery is not a claim of protocol replay support. A callback HTTP 2xx records receipt only.

`POST /v1/runs` uses a stable run/event idempotency key and immutable body. HTTP 202 does not claim the backend lease. Network uncertainty is retained and reconciled; it does not authorize a new key or run. An interrupted Hermes process is not business completion. Revoked, stale, duplicate and expired execution must fail closed.

## Acceptance evidence still required

Isolated tests must cover assign → claim → evidence → report → rework → second report → accept on one task; concurrent claim, revoked grants, stale versions/leases, late old reports, audit rollback, durable receipts/outbox and restart recovery. Simulated reports/auth/HTTP transport are explicitly marked and cannot prove real Hermes or MiniMax execution.

Production credentials, independent agent grants, gateway service/network exposure and a persistent Events subscription remain separate operational authorization items. The temporary Mac coordination channel is not a direct root MCP connection or verified automatic dot wakeup. Najwa's existing pause remains untouched.
