# Lawrence single-conversation Hermes cutover

This increment retains free operational questions and clarification. Inventory is
one optional read tool, not a fixed product/phrase router. Employee messages are
untrusted data; unsupported leave, employee-profile, purchasing and inventory-write
actions are not available tools and must not be represented as completed.

The existing API and sole teamWorkflow worker have default-off wiring through
`EMPLOYEE_HERMES_ENABLED`. An enabled deployment additionally requires an explicit
server-resolved BridgeGrant, a native linked task, channel binding, exclusive route,
private gateway configuration and reviewed system-template hash. None is enrolled
by startup. Credentials are execution/purpose bound, sent on the private transport,
stored as digests in the backend, and expire no later than the execution/grant.
The model provider secret stays in the existing server-only MiniMax transport.

On cutover, write the binding/grant/route atomically under the channel lock with
`fromSeq = current lastSeq + 1`. Keep the direct conversation's two human members.
The AI uses its own `agent:<id>` identity. A route excludes the legacy consumer even
when paused, expired, malformed or revoked; claim, pre-provider and atomic legacy
send paths recheck this. Do not replay already-answered messages. Rollback is an
explicit reviewed route change after stopping/reconciling active executions, not
automatic fallback on a failed Hermes request.

The current authorized window ends **2026-10-23T10:00:00.000Z**; configuration or
credential renewal must not extend it. Only the Lawrence conversation is approved.
Do not enable financial/private-staff data, staff creation, leave submission,
purchasing, stock writes or other conversations.

Each model turn reserves actual SDK input before network. The private relay accepts
only that input and reserves its provider attempt once; unknown does not release
the reservation. Complete real provider receipts are persisted before tools. Real
socket SSE is buffered before exposing tool-bearing bytes to the SDK because the
SDK stops iteration on `[DONE]`. Partial/unknown responses cannot authorize tools.

Fresh private Hermes profiles fix `tools.tool_search.enabled: off` and verify the
effective setting. This preserves the actual issued tool catalog rather than
weakening the whitelist. Default/shared profiles and memories are not reused.

An explicit `expectsReply` flag plus the actual stored AI message permits waiting;
it is not evidence of delivery or employee failure. A later actual employee message
continues the same linked task with a new execution. Context contains only verified
same-task human facts and the previous actual question. Immutable final reports are
`awaiting_review`, never manager acceptance. Actual dot Events delivery and manager
review of a new task must be verified separately; a saved report is not proof that
dot was awakened.

Deployment paths, gateway origin and isolated root are configuration. Migration to
a cloud host requires private backend/gateway reachability, a verified Hermes
checkout/venv, private secret storage and persistent database/journal volumes. No
cloud migration or new paid service is performed by this increment.

Validation artifacts distinguish real Hermes with a synthetic provider from true
MiniMax latency and production employee interaction. Tests never send production
employee messages or replay Lawrence sequences 13–18.
