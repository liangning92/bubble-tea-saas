# STOCK-RO-001 real connection preparation — no activation performed

Recommendation: one protected private MCP resource on the existing Admin HTTPS origin, two independent principals, one dedicated local Hermes profile and one task-scoped Events subscription. Keep the Hermes run API loopback-only; the existing backend calls it on the Mac, so no public Hermes port is required. Reuse the existing store database and task/audit structures. Do not reuse employee sessions or the private/default Hermes profile.

## Confirmed gap and selected authentication path

The current MCP code is a resource server with RS256 access-token verification and metadata. It has no authorization/token/refresh/client-registration service. The existing employee HMAC login token does not meet this external resource contract.

Recommended authorization-server implementation for a compatibility proof is a dedicated self-hosted Keycloak realm with two explicitly preregistered clients, exact redirect URIs, authorization code + PKCE for dot and a restricted executor client for Hermes. Disable open/dynamic enrollment. This is a new identity service and persistent access, not an already authorized production component. First prove the complete authorization flow using synthetic users and an isolated resource before creating any real identities. This proof has not run yet.

Do not assume automatic client discovery works: the [current Keycloak MCP guide](https://www.keycloak.org/securing-apps/mcp-authz-server) explicitly describes ChatGPT CIMD incompatibility and marks newer MCP resource-indicator support experimental. Use preregistration, test actual dot client behavior, and stop if it still requires unsupported metadata. Prove the actual access-token header/claims satisfy the existing strict `at+jwt`, RS256, exact audience, issuer, scope and client-binding verifier; do not weaken token verification to make a login token pass. No third-party account, experimental feature or production identity configuration has been created.

## Proposed one-time operational authorization package

| Operation | Data and recipient | Purpose and revocation |
| --- | --- | --- |
| Add the authorization service, protected MCP path and HTTPS routing on the existing deployment | Authentication metadata; credentials stay server-side or in the designated client credential store | Permit authenticated tool access. Disable the route/realm or revoke clients to stop it. This adds a running component and requires explicit operational authorization. |
| Provision dot manager binding | Current store, designated channel, STOCK-RO-001 only; `management.assign/read/review` | Plan, read immutable evidence/report and accept/rework. Revoke the binding or increment grant/client revision. |
| Provision Hermes executor binding and dedicated profile | Same task/store/channel; `executor.claim/evidence/report`; task reads use claim scope | Perform D only. No employee messaging, inventory writes or manager review. Revoke binding/token and stop dedicated profile/run service. |
| Configure local Hermes run-API bearer and backend transport | Non-secret task/run/event references in dispatch; task context only through authorized MCP tools | Backend admission. Bind target and authentication generation to the persisted request; unknown results cannot be replayed after rotation. Rotate/revoke bearer and stop the loopback listener. |
| Install/connect one private dot plugin and create one finite-TTL task subscription | Report-ready/blocked/failed payloads contain only IDs and versions; HTTPS callback and signing secret come from subscribe | Wake the designated dot to reread authoritative results. Unsubscribe, revoke manager binding or let TTL expire. Callback 2xx is receipt, not task acceptance. |
| Configure encrypted subscription storage key | No business payload in key; kept in server secret storage | Protect callback signing material at rest. Revoke subscriptions before retiring the key. No secret has been generated. |

Only necessary inventory names, units, ledger quantities, source times, ledger boundaries and existing physical-count evidence enter this task. The raw report and evidence are readable only through the assigned manager/executor bindings. The model recipient is the existing authorized China MiniMax service through Hermes; dot receives the same task evidence for C/A. No wages, identity documents, health data, private chats or employee messages are included. The first real trial does not contact employees.

Existing Docker/Postgres, HTTPS/tunnel infrastructure, task database and authorized MiniMax relationship can be reused as foundations. Reusing the existing MiniMax secret inside a new Hermes profile still requires an approved server-side credential wiring method; the current code does not copy it or confirm that the existing server encryption format is directly consumable by Hermes. Do not read/export it to solve this gap.

No new paid service has been ordered. Keycloak would consume existing host resources; platform/model use may consume existing subscription allowances. The user's MiniMax subscription billing and actual Hermes compatibility are unverified, so no per-token rate, extra charge, free usage or output limit is asserted. No model output cap is introduced by this pilot.

## Required evidence before real enablement

1. Finish the transport fixes for real `started` responses and authentication-scoped idempotency; independently review the exact replacement commit.
2. Complete the isolated MCP six-tool → business service → fake Hermes admission → durable Events → manager rework → second report → acceptance chain. Mark auth/transport/report fixtures as simulated.
3. Prove the selected authorization server against the actual client protocol with synthetic identities, including grant revocation, audience/token separation and PKCE. No real stock or credentials for this step.
4. Present the exact bounded operations above to root for a single real-access authorization decision, including the new identity component and credential wiring.
5. After authorization, connect the actual clients and run STOCK-RO-001 once. Keep the real report/provider/run receipts, let root independently check it, write any rework back to the same task and accept only after the corrected report meets the criteria.

The current Mac-mediated thread handoff is temporary coordination, not a direct root MCP connection or verified automatic dot wakeup. Production remains unchanged, Najwa stays paused, and no real trial has been dispatched.
