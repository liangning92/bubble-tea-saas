# dot MCP tools and Events: isolated STOCK-RO-001 integration

This increment is an adapter for the existing backend-owned agent task service, not another task database or a Hermes runtime. root/dot manages P/C/A; a separately identified Hermes agent executes D; MiniMax is the model supplier; the store backend owns business facts. Within the granted routine scope the manager actually assigns, accepts and requests rework. There is no universal approved=true or staff/admin impersonation.

## Composition and integration boundary

Prerequisites: PR271 source `96dd062631d0260682263eea5b2d498129a5d370` for the standard SDK/auth adapter, and backend candidate `1bfc5885ff94c501726bd1b0842144fa9281432f` for `agentTasks/{contract,service}.ts`, `TeamStockReadOnlySource.ts` and native task guards. Temporary copies in the adapter worktree are used for compilation/tests only and must not be committed as adapter-owned changes. Final business service SHA256: `bef7765372b601858348c4b82b1d3be49e1f69b245c2fbebcfaedb5f276a1d2f`.

`agentMcpHandler` is deliberately absent from `index.ts`. Default mode returns 503 before constructing a DB or business service. Its only runnable mode requires NODE_ENV=test, BT_TEST_RUN, a loopback /team_test PostgreSQL URL and loopback resource URL. It internally constructs its DB from that validated URL. Isolated callback transport must be explicitly supplied; there is no fallback to real outbound delivery. This is not a production activation switch.

The composition root supplies `createService(db, bindings)` using the backend factory and its mandatory authorization/executor-selection dependencies. `isolatedAgentBindings` is a fixture-only server-owned identity registry, with no enrollment API. It maps the hash of issuer/client/sub to a first-class agent principal and store/channel/scopes, verifies revocation and versions, and never derives authority from a tool body or model prompt. The backend rechecks those grants inside its business transactions. Replacing credentials/clients must revoke the old binding/tokens and advance the grant version; no production registration/rotation flow is implemented here.

## Tools

| Tools | Principal and required scope | Output boundary |
| --- | --- | --- |
| store_task_assign | manager / management.assign | durable task receipt |
| store_task_get | manager / management.read | assigned task, authoritative report and immutable evidence |
| store_task_review | manager / management.review | accept/rework receipt; backend enforces criteria, evidence and same run/report versions |
| store_task_get | executor / executor.claim | task/plan and report receipt; no stock snapshot/raw report/source refs |
| store_task_claim | executor / executor.claim | unique lease receipt |
| store_task_read_stock_evidence | executor / executor.evidence | fixed read-only evidence projection |
| store_task_report | executor / executor.report | persisted untrusted report receipt, never automatic acceptance |

Public schemas come from the backend-owned Zod contract, with authVersion omitted and extra fields rejected. The adapter resolves the current principal, injects its grantVersion internally, then parses the complete business schema including refinements. Clients cannot supply authVersion/agentId/storeId/role/approved. requestId, task/run/round/expectedVersion and lease fields remain explicit business concurrency inputs, sourced from actual receipts; secrets are not placed in the dispatch prompt. Manager and executor tool lists differ. JWT scopes and server registry scopes both apply.

## Events and durable outbox seam

The same authenticated MCP endpoint advertises `events: {}` in the actual `server/discover` response and implements events/list, events/subscribe, events/unsubscribe through the official SDK custom-method extension seam. Protocol is explicitly 2026-07-28. The installed v2 client strips the draft Events capability from its parsed capabilities object, so the HTTP test also checks the real discovery wire response. Official v1 legacy initialize is retained for Hermes's Python SDK 1.27; no Event subscription capability is promised to legacy executor clients.

Only task.report_ready, task.blocked and task.failed are sent to dot. Subscription filter is an exact taskId. Payload permits taskId/runId/round/taskVersion and optional reportId/reportVersion only. No stock rows, report text, employee data or model instructions go into the event. The recipient must re-read authoritative results using tools.

The backend owns durable `AgentTaskEvent`/outbox records. The integration caller maps:

- eventId = backend id; name = backend type; timestamp = occurredAt; data = payload; cursor = null.
- task.dispatch_ready is internal Hermes transport input and must never be forwarded to the dot event adapter.
- `handler.deliver(storeId, event)` returns per-subscription accepted/retry(+retryAt)/sending(+retryAt)/stopped/inactive. Only accepted means HTTP receipt. An empty array means no active authorized matching subscription. None of these means task acceptance.
- Persist outbox progress in the existing backend worker, retry due deliveries with the same event ID, and hold progress on sending/retry. Do not advance past pending deliveries or let notification status change task business status. The adapter does not start another worker, scheduler, Kanban, or Hermes process. The backend-owned createAgentTaskRuntime wraps assign/rework/report after commit and invokes the dispatcher/publish seam automatically; explicit recoverOutbox rechecks durable events after restart. The automatic composition fixture supplies that runtime to handler.createService and maps its native stored event to handler.deliver, without manual dispatch/deliver calls in the task sequence.

Subscriptions and delivery receipts use a separate encrypted Config aggregate, store advisory transaction locks, random generation fences and a bounded sending claim. Callback/signing material is AES-256-GCM encrypted with store-bound AAD. The isolated composition receives a synthetic key; no real key provisioning is done. Deterministic subscription identity uses authenticated owner/callback/event/filter; refresh updates rather than duplicates. Finite lifetime defaults to one hour, capped at one day even for ttlMs=null; no perpetual subscription is granted. Expired/cancelled entries are reclaimed. Secrets rotate with a short dual-signature window. Delivery checks grant, client revision and creating-token hash again; revocation stops and clears its subscription. Unsubscribe is owner-bound and idempotent. An already-started network request can finish after cancellation; cancellation fences subsequent sends, and tool authorization is still checked afresh.

Callback verification uses a fresh signed challenge and constant-time echo comparison before activation. Outbound production transport helper enforces public HTTPS/443, checks all resolved IPs on each connection, pins the validated destination while retaining TLS hostname verification, rejects redirects, limits response bytes, and applies a ten-second absolute deadline covering DNS/TCP/TLS/response. It is not reachable as a default from isolated mode. Standard Webhooks signs the exact serialized bytes. 410 terminates the subscription, 413 stops that event, transient failures back off with at most five attempts and fresh signatures. Delivery IDs remain stable. Receipts retain a seven-day dedupe horizon; older events are rejected instead of becoming executable again after eviction. Capacity limits fail visibly; an outage beyond that horizon requires authoritative-state reconciliation. Protocol replay is not implemented (cursor=null), and no claim is made for exactly-once delivery or automatic recovery of unknown business actions.

Subscription/delivery audit persists only store/subscription IDs, codes, timestamps and HTTP status; it excludes callback URLs, tokens, signing secrets, report text and stock facts. Unauthenticated transport diagnostics are bounded process-local codes because there is no trustworthy store identity. Production needs an operational security sink/retention/rate limits and an actual authorization service before any mount.

## Verification and truthful boundary

The pre-projection integration passed ten groups using official v2 and legacy JS clients, real HTTP, actual backend service and disposable PostgreSQL: assignment/one lease, snapshot/report, signed event, manager evidence read, rework, second report, acceptance, durable receipts/history, subscription restart/dedupe, filters, backoff/410, rotation/unsubscribe, authorization and audit redaction. The last necessary delta uses the final backend candidate and covers affected tool projections, targeted-token subscription revocation and Python SDK 1.27 compatibility. A separate single automatic-runtime fixture covers actual fake-Hermes HTTP admission, automatic signed callback after report, automatic second admission on rework, acceptance, and restart recovery without another POST. It does not run an actual Hermes process or model. These are separately recorded; no unrelated full regression is claimed.

Reproduce after integrating the stated backend prerequisite:

```sh
node server/node_modules/typescript/bin/tsc -p server/tsconfig.json
node server/node_modules/jest/bin/jest.js --config server/jest.audit.config.cjs --runInBand --runTestsByPath server/audit-tests/external-mcp-events.test.ts server/audit-tests/external-mcp-webhook.test.ts
python3 scripts/with-docker-test.py -- python3 scripts/test-external-mcp-events.py
```

Optional exact Python compatibility proof: create a temporary Python3.12 venv, install `mcp==1.27.0` and binary `cryptography==46.0.3` (to avoid an unrelated source build), then set MCP_PYTHON127 to that interpreter. Set MCP_EVENT_DELTA=1 for the final affected-only delta. Set MCP_EVENT_AUTOMATIC=1 (without DELTA) for the single automatic-runtime composition case; it also requires the backend-owned runtime/dispatch/admissionBindings and Hermes transport files from the final integration candidate. In the older PR271 test worktree only, a temporary non-deliverable declaration merges the backend-owned TeamTask.agentTask type; the final backend candidate already owns that field. Every test database is unique-batch temporary and cleaned by finally plus the repository wrapper. Report bodies, identities, JWTs and callback keys are synthetic. The callback receiver is an actual loopback HTTP test receiver reached only through the explicit isolated fixture transport; it is not an OpenAI callback, real HTTPS platform delivery or an installed Hermes process. No real model call, staff contact, business inventory write, plugin installation or platform subscription occurred.

## Exact real activation prerequisites (not executed)

Recommended minimal deployment is one private plugin and one protected MCP resource path on the existing admin domain, plus two separate principals/grants for current store, selected channel and STOCK-RO-001. dot gets assign/get/review; Hermes gets get/claim/evidence/report. Existing Docker/Postgres/domain/Cloudflare infrastructure can be reused without a server migration, subject to explicit approval of the new authenticated exposure and persistent access.

There is no mounted MCP production endpoint, real OAuth authorize/token/refresh/client enrollment, actual platform callback or actual dot subscription in this increment. The store login HMAC JWT is not an MCP access token. root chooses a mature independent OAuth2.1 service and verifies PKCE S256, exact audience/issuer/scopes, trusted keys and token lifecycle before real activation. The current verifier requires RS256 at+jwt with exp/iat/jti/sub/client_id; an AS issuing typ=Bearer or different claims does not pass merely because it has an MCP guide. A disposable synthetic realm/client/user can prove discovery/PKCE/token/refresh/revocation and negative cases with no real account. Existing synthetic signed-JWT tests prove resource verification only, not an actual AS flow.

New operational authorization must name and bound: the protected public route/AS configuration; two actual principals and grants/expiry/revocation; Hermes runtime credentials and network binding; subscription-encryption master key; private plugin installation and connection to the specific dot; that dot's three task-filtered finite subscriptions. Platform events/subscribe supplies the actual callback and whsec; do not invent either. No new OpenAI API key is required just for signing Events. Callback verification and delivery require outbound public HTTPS from the store service; the store does not host the platform callback.

Real inventory evidence/raw reports are tool data disclosed only to the designated authorized dot/Hermes principals. Event payloads contain IDs/versions. No employee is a test recipient. Reuse of the existing model subscription/package is intended; Hermes model compatibility and actual billing attribution remain unverified, and no new paid service or tariff is assumed. root coordinates explicit authorization for those real access/cost operations and final integration, rather than asking the user to approve technical schema parameters. Production activation and actual dot reception remain unverified.

The root-owned activation plan proposes Keycloak with static client preregistration, not a claim of ChatGPT CIMD compatibility or an already working AS. The disposable AS compatibility proof remains required.

Official protocol guidance: https://developers.openai.com/plugins/build/mcp-events and https://developers.openai.com/plugins/build/auth .
