# Employee conversation orchestration

`createEmployeeOrchestration` is default disabled. It has no timer, HTTP mount, credential enrollment, deployment or production grant installer. The existing worker may call `drain(limit)`, and the manager-facing host may call `get(channelId)` / `reconcile(channelId,reservationId)` through separately authorized application ports.

The module reconnects the existing persistent intake, native TeamTask reference, employee runtime and private gateway. Each intake event is checked against its actual stored human message, active current audience, source floor, current channel binding, server-stored grant and exact route/task version. An established route never restores the former direct model consumer merely because its grant expires or processing fails.

Before invoking the runtime, the continuation has reserved one attempt. This module persists a preparing correlation, calls `host.begin`, and persists its actual execution ID before credential issuance and gateway HTTP. A crash leaves correlation unresolved; it never invents a fresh execution or automatically reissues an unknown admission. The gateway owns an independent immutable admission journal. Credentials only cross the trusted injected issuer/gateway port; this module writes no credential into Config, employee messages, reports or model input.

Only a complete persisted runtime response is reportable. A waiting state requires both an explicit `expectsReply` issued-tool result and the exact actual native agent message. Stored/sent/read is never equated with device arrival, execution or employee non-cooperation. An ordinary acknowledgement does not mean the employee owes a reply.

A later real employee message starts a new isolated execution on the same native task. The previous question context pointer is written only from an authoritative runtime/tool/native message receipt. Its `employee_exchange` source must be validated by the runtime source resolver for the same task, grant, audience and compartment; model-declared context is not accepted. This is not shared manager memory. The pointer is cleared after a final report.

Reports are immutable existing-Config records under `team.communication.employeeOrchestration.report.<executionId>`, linked to the existing task ID and source event. Their state is `awaiting_review`. This module does not accept/verify the report or complete the native task. A manager's existing authorized review interface must perform that decision.

`drain` also reconstructs active continuations and progresses known completions / queued follow-ups. It runs no separate scheduler and never retries an unknown model action. Failures leave persistent intake or continuation review states rather than silently falling back to another AI.

## Isolation verification

Run the dedicated disposable database check:

```sh
python3 scripts/with-docker-test.py -- python3 scripts/test-employee-orchestration.py
```

The harness uses actual native messages and `createEmployeeRuntime`, with synthetic provider turns and gateway execution. It is not a real Hermes/model/OAuth/employee-device test. Mainline runtime dependencies include requester-preserving reply context, `expectsReply` receipts, redacted restricted-question input and the trusted `employee_exchange` source resolver. These mainline source copies are used for local integration testing but are not included in this module's commit.

No production activation was performed. Real deployment still requires authorized scoped credentials, callback/model ingress mounting, private Docker-to-host reachability, source-pinned child execution, unique-worker integration and an end-to-end real Hermes verification. Paths, host topology, credentials and startup scheduling are dependency/configuration choices; the module contains no Mac path or hardcoded local endpoint.

## Optional actual Hermes/private gateway combination

Set `EMPLOYEE_REAL_HERMES=1`, `EMPLOYEE_HERMES_PYTHON` and `EMPLOYEE_HERMES_SOURCE` to an explicit reviewed Python and clean pinned Hermes source before running the same disposable database runner. `EMPLOYEE_SYSTEM_TEMPLATE` may identify an explicitly reviewed fixture; it never learns or approves the first observed request. The default fixture is the pinned source's approved system assembly. No actual provider credential is used.

This optional check launches the real Python private gateway on loopback, which launches the actual source-verified `host_stdio` and `AIAgent.run_conversation`. The real callback/model HTTP ingress uses separate execution/purpose-scoped synthetic credentials and real persisted runtime ports. The model transport returns synthetic provider JSON through the actual relay/SSE/SDK path. Two real executions each read the current native message, send an agent-authored native message and persist their final response. The second employee message (`37`) resumes the same task with the original question context; only a pending-review report is saved.

The check proves the combined real program/HTTP/database path. It does not prove real MiniMax semantics, OAuth, Docker-to-Mac networking, production delivery or seconds-level latency. In particular the fresh raw-source verifier/bootstrap in this test consumed substantial per-execution startup time; no provider latency or SLA is inferred from this synthetic run.
