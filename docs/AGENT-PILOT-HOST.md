# Bounded task host — disabled until explicitly configured

This increment wires the existing task, dispatch and Events services into the API
process. It does not enroll principals, create credentials, start Hermes, configure
an authorization server or enable the pilot on import.

The only production origin is `https://api.aicube.online`:

* `/mcp/agent-tasks` — authenticated task tools and Events.
* `/agent-model/v1/chat/completions` — task/lease/evidence-bound model relay.
* `/.well-known/oauth-protected-resource/mcp/agent-tasks` — resource metadata.
* `/.well-known/oauth-authorization-server/identity/realms/store-agents` — AS metadata.
* `/identity/realms/store-agents` — the recommended Keycloak issuer, which still
  requires separately configured HTTPS routing to the identity service.

The pilot anchor is an immutable, separately stored `{id,startedAt,expiresAt}`
record, exactly 24 hours long. The active pointer, principal registrations, task,
dispatch, model relay and Events must agree with that anchor. Token refresh,
subscription renewal and a changed pointer cannot extend it. Public discovery may
remain readable after expiry; authenticated work fails closed. Revocation is
checked again at execution, including immediately before external admission.

Production identities are server-resolved from verified issuer/client/subject,
bound to one store/channel and STOCK-RO-001. Manager and executor are independent
principals. Both the tool directory and each operation use the intersection of
token and binding scopes. No employee/admin impersonation or enrollment endpoint
is introduced. The API-owned recovery timer reads existing outbox work, with
single-flight processing and persisted cursor; it does not dispatch a new task or
retry unknown admissions. Transient storage errors remain visible and retryable;
an expired/revoked pilot stops work.

The model relay is deliberately not a generic OpenAI proxy. It rejects arbitrary
messages/tools and builds the request from the persisted plan and sealed inventory
evidence. Public tool arguments omit server-owned authVersion. A model response
does not accept a task. Provider credentials remain in the existing backend;
low reasoning is explicit and no output cap or fee rate is added. Existing
MiniMax subscription compatibility with the full Hermes chain remains unverified.

Verification for this increment includes 61 targeted audit assertions, 16 scope
and dispatch assertions, API type checking and five real temporary PostgreSQL /
HTTP composition groups. Those groups use synthetic JWTs, fake Hermes/provider and
a loopback signed callback. They prove neither a real Hermes conversation nor a
real dot wakeup. Exact source/dist hashes and cleanup are recorded in
`output/agent-pilot-host-http/{delivery,result,cleanup}.json`.

The user approved a real 24-hour connection package, but that is a separate
operational step after review and precise CI. At this checkpoint no real identity,
secret, HTTPS route, profile, subscription or model request has been created.
The dedicated Hermes credential broker, plugin packaging, runtime launcher and
actual platform OAuth / Events connection must be verified before activation.
Najwa remains paused; the trial does not send employee messages or write stock.
