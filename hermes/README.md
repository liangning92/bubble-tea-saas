# Dedicated PDCA bridge (not installed)

This adapter targets the inspected Hermes v0.21.0 source commit
`a7198a8855ad98681114ff5138eb01fe132a62e7`. It is not a drop-in OpenAI
provider. No profile, credential, process, server or plugin installation is created
by these files or by importing `pdca_bridge`.

## Explicit composition

`Bridge(policy, journal_directory, raw_mcp_call, relay_call,
runtime_settings=read_resolved_dedicated_runtime)` is the dependency seam.

* `raw_mcp_call(name, args)` returns the **raw MCP** result dictionary. The bridge
  accepts only `structuredContent.task`, never text or a rendered Hermes result.
  `RawMcpSession(existing_sdk_session, existing_loop)` can wrap the official MCP
  SDK session supplied by the dedicated credential broker. It creates no session
  and does no auth/profile discovery. A timed-out mutation remains uncertain.
* `RelayHttp(fixed_origin, fresh_access_token_callback)` POSTs only to
  `/agent-model/v1/chat/completions`. It has no redirect/retry loop. The callback
  belongs to the dedicated AS credential broker. Tokens and credential files are
  never written to the journal or errors. No MiniMax provider key is needed here.
* `runtime_settings()` must project the **resolved live dedicated runtime**, not
  intended defaults or prompt data. Required shape is enforced by
  `ProfilePolicy.validate_runtime`: exact nondefault profile, same relay base URL,
  literal unusable raw-provider sentinel, no provider fallbacks, only four tools
  and three executor scopes, and auxiliary models/memory/compression disabled.
  Rechecked at registration and before each external operation.
* `policy.pilot` is authoritative server configuration with a fixed absolute
  24-hour window; it cannot originate in dispatch input or renew itself.

The stock `ctx.call_mcp` is deliberately unsuitable: Hermes renders content before
returning its envelope, may drop structuredContent when text exists, and caps it
at 64KB (`hermes_cli/plugins.py:510`, `tools/mcp_tool_handlers.py:387`). An actual
raw SDK/broker connection still needs to be composed and tested before deployment.

## Official plugin entry and aliases

A dedicated plugin wrapper can expose `from pdca_bridge import register` once the
adapter is packaged on that plugin's import path. Official
`ctx.get_config('bootstrap_file')` reads the explicitly configured absolute path
of a private operator-owned Python file (0600, parent 0700). That file exports
`build_bridge(ctx)` and returns a Bridge composed with the broker above. The file
is trusted operator/plugin code, never downloaded or selected by an LLM. A missing
factory, default profile, or different returned profile fails registration.
There is no imaginary `ctx.pdca_bridge` injection and no global bootstrap singleton.

Alternatively a wrapper whose Python code owns the dependencies can call
`register_bridge(ctx, bridge)` directly. Both paths register through actual
`ctx.register_tool`, `ctx.register_hook` and `ctx.register_middleware` APIs.
Four exact aliases (`store_task_get`, `store_task_claim`,
`store_task_read_stock_evidence`, `store_task_report`) belong only to
`pdca_executor_only`; their ordinary handlers always return a local denied result.
This solves Hermes' tool recognition before execution middleware without enabling
unknown tools, MCP aliases, shell, files or browser. A registration collision fails.

Hermes middleware exceptions are fail-open. Safety therefore also requires the
underlying provider to point to this same strict relay with the literal
`pdca-raw-provider-denied` credential and **no fallback**. Normal OpenAI
`messages/tools` payloads must be rejected by that server. Do not substitute a real
access token or a normal MiniMax/OpenAI provider as the fallback. This constraint
must be verified against the running dedicated agent before enabling dispatch;
a configuration projection alone is not deployment evidence.

## Execution and recovery

The first `pre_llm_call` captures only the bounded dispatch reference schema.
Those identifiers grant no authority. Before the first relay call the bridge
executes native get, UUIDv5 claim, then UUIDv5 read_stock_evidence. Native results
must match immutable task/run/round/executor. The backend authorizes every call.

The private per-run transport journal stores immutable references, lease/evidence
bindings, exact canonical request bytes, responses and receipt references. It is
not a task database. It does not retain inventory snapshots, provider keys or OAuth
tokens. The lease token is a sensitive execution binding retained only in this
0600 journal and native/relay metadata; the relay excludes it from provider context.
Run files and lock files refuse symlinks and nonprivate ownership/permissions.
An exclusive flock covers execution; reservations are fsynced and atomically
replaced before external I/O.

Relay tool_calls must have an allowed exact name, the original call ID and native
public arguments bound to that relay response. Only those calls reach raw MCP.
Native task versions advance from receipts; original tool arguments never get
rewritten to a fresh version. Follow-up model input contains metadata,
previousRequestId and backend receipt refs, never arbitrary messages or tool text.

A relay response loss leaves its original request reserved/unknown and blocks all
further model POSTs, including restart. No receipt-query endpoint currently exists,
so the bridge cannot claim to recover such a response. `recover_native` can
explicitly replay only the persisted original native operation bytes/ID, relying
on backend permanent request receipts. An uncertain report may likewise be
repeated only by its exact registered call. Program failures are labelled
`HERMES_PROGRAM_BLOCKED`/`hermesProgram`, never invented MiniMax reports. A submitted
report stops locally as `REPORT_SUBMITTED_AWAITING_HUMAN_REVIEW`; no accept/rework
or manager tool is available.

## Isolated validation

```
python3 -m unittest discover -s hermes/tests -p 'test_pdca_bridge.py' -v
```

All inventory, task IDs, network and credentials are synthetic/tempdir. Two tests
read pinned local Hermes **source only**: the real execution middleware, real tool
registry and exact official register_tool method, with fake configuration modules.
They do not import the real env loader/config, initialize Hermes, or read profiles.
Set `HERMES_SOURCE` to a matching source checkout elsewhere; these integration tests
explicitly skip if unavailable. No complete real Hermes conversation loop, real
MCP/relay connection, gateway startup, MiniMax call or latency has been validated.

## Still required before this can actually start

The private factory interface is implemented, but a deployable factory is **not**
provided and no credentials have been read. Root still needs to implement/compose:

1. A dedicated AS credential broker: read only its explicitly configured private
   client credential files, perform the actual AS grant for the correct audience
   and three scopes, cache/refresh access tokens safely, honor revocation/absolute
   pilot expiry, and expose a fresh-token callback. This is executable OAuth code,
   not just filling a secret string. The AS grant/endpoint must be confirmed;
   this bridge intentionally does not guess them or mint JWTs itself.
2. An official MCP SDK streamable-HTTP client lifecycle for that fixed resource:
   initialize its authenticated session on an owned event loop, refresh bearer
   auth through that broker, provide the existing raw session to RawMcpSession,
   and close session/HTTP client/loop through plugin unload. Do not wrap
   `ctx.call_mcp`'s rendered output or enable all native MCP aliases.
3. A resolved-live-runtime settings projection and isolated gateway launcher:
   select the nondefault profile, disable auxiliary/compression/memory model paths
   and all tools except pdca_executor_only, deny provider fallback, bind the
   unusable raw-provider sentinel to the strict relay, and verify the actual agent
   agrees. The launcher must refuse startup if any of this cannot be established.
4. A private factory file (`build_bridge(ctx)`) that constructs those dependencies,
   takes the authoritative pilot stamp and fixed endpoints from server/operator
   configuration, creates its private journal directory, then returns Bridge.
   Package the official plugin wrapper and manifest; do not mutate default profile.
5. An isolated full gateway test of real /v1/runs → pre_llm_call → real SDK MCP →
   relay → recognized alias → report using fake AS/backend/model transports,
   including startup refusal, revocation/expiry during I/O and process restart.
   The current source-seam fake tests do not replace that full composition test.

## Dedicated launcher and templates (explicit activation only)

`pdca_launcher.py --config /absolute/private/launch.json` validates a plan without
writing or spawning. Add `--activate` only after the dedicated materials are
provisioned and approved. The launcher does not generate any key or clone a user
profile. The private launch JSON has these exact fields:

```
profile_home, hermes_source, python_executable, gateway_bearer_file,
private_client_file, endpoints:{api_origin,issuer,resource}, pilot:{id,startedAt,expiresAt}, port
```

`profile_home` must end in `profiles/stock-ro-001` and must not exist. Files are
0600 and directories private. `hermes_source` must be a clean independent Git checkout at the
inspected commit, with no `.env`/`.op.env`: a719 explicitly tries to load
`PROJECT_ROOT/.env`, even for a dedicated profile. The launcher refuses their
existence without reading them. No inherited API keys/platform credentials are
passed to the child; both its user-home directory and HERMES_HOME are private.
The real user's process environment/default profile is untouched.

The actual a719 command is `python -m hermes_cli.main --profile stock-ro-001 gateway
run`; the environment binds only loopback `API_SERVER_HOST`/port and a strong
explicit `API_SERVER_KEY` from its supplied private file. This Bearer is not written
to YAML/journal/logs. The copied plugin wrapper loads the private bootstrap factory,
which composes the broker/SDK runtime and registers close through ctx.on_unload.
Import, plan and template evaluation do not start the runtime. Only explicit
activation followed by plugin registration calls handle.start().

Actual a719 configuration keys disable both memories, automatic compression and
session-title generation. There is **no general auxiliary.enabled switch** in
that revision: all other auxiliary routes are configured to the same strict deny
endpoint with unusable sentinel, no provider fallback or ambient credentials.
This prevents auxiliary provider inference; it is not proof that the framework
will never attempt a rejected auxiliary HTTP request. The live configuration
projector checks this private file; the bridge additionally checks its actual
model-call base_url. Full AIAgent resolved-state verification belongs to the
isolated gateway composition acceptance, not these fake-process tests.

The launcher checks the fixed UTC cutoff before spawn and every 250ms while
supervising; the first check after sleep/resume terminates its owned process group.
Bridge/broker/server checks enforce the exact cutoff for operations between ticks.
The foreground CLI closes its owned group on SIGTERM/SIGINT. It installs no daemon,
service, launchd entry or restart policy. If an operator kills the launcher with
SIGKILL, its monitor cannot run; the in-process/server absolute pilot guards remain
mandatory, and process cleanup requires the operator's explicit supervisor.

Launcher tests use a fake process and temporary profile only. Before the runtime
module is delivered they substitute a comment for its copy to test launcher file
composition; this does not validate SDK/broker implementation or gateway startup.


### Source object and checkout verification

Production startup verifies the raw fixed a719 commit SHA and recursively verifies
its raw Git tree object hashes, with replacement objects disabled in every child
command and no inherited Git environment/global configuration. Expected file bytes
come from this verified object chain, independently of index stat flags. Staged,
untracked and ignored shadows, changed modes and symlink substitutions are rejected.
The only supported checkout conversion is the pinned root `.gitattributes` blob
`80824c67581d7be781d3f457280f7f1dbbd22897`: its 13 pure-LF `*.ps1` blobs require
exact CRLF checkout bytes. All other files retain exact raw blob bytes. Actual
worktree contents are never normalized, and no local check-attr/custom filter is
executed or trusted. Keep the interpreter/venv outside that clean checkout;
`PYTHONDONTWRITEBYTECODE=1` prevents the child from adding bytecode shadows there.
