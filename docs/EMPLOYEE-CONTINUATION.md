# Employee conversation continuation (isolated, default disabled)

`createEmployeeContinuation` adds orchestration metadata in the existing Config store and links the existing native TeamTask through `resolveTask`. It does not create another task database, public API, scheduler, grant, identity, or model transport. This module is not mounted in production.

The trusted host must supply all four ports:

- `authorize(tx,event)`: re-read the actual source message, real active author/user, channel membership and source floor, exact current single-consumer routing, grant and absolute expiry. Reject AI/agent source events. Event authorization must not silently drop an ordinary employee question merely because it asks about finance or an unsupported action; the runtime must answer the actual permission/capability boundary. Unauthorized financial/personnel facts must be excluded by the source-ACL port before model input. Return a stable authorization revision covering grant, client, channel and routing versions. A body/model declaration is never sufficient.
- `resolveTask(tx,event,existing?)`: create/reuse the real authorized employee-work TeamTask on the first event, and assert the same task and its current version/status for later events. Do not silently repurpose the stock-only inventory pilot. Reject cancelled/accepted tasks unless an explicit authorized next-plan operation permits continuation.
- `execute(reservation)`: outside the transaction, perform fresh host authorization again and admit one execution with stable reservation correlation. It must return the actual runtime execution ID. Errors after invocation are admission-unknown; this module never retries them.
- `readExecution(tx,reservation)`: read the actual persistent runtime result and its native outbound receipt, including matching execution/agent/channel/task and question ID/sequence. Do not derive completion from model prose. A question receipt must refer to a stored message, not delivery or employee action. A report ID must be the actual immutable report. A complete observation without either a stored question or report is rejected. No question means `awaiting_review`, never accepted/verified.

`receive` atomically stores the source event and task linkage. Concurrent copies of one source event have one receipt. Events queued while another execution is active remain pending. An unseen out-of-order event remains work; an already-known event cannot replay. Source floors prevent processing pre-switch history.

`dispatchPending` reserves one execution per channel before invoking the execution port. `reconcile` records `waiting_for_staff`, `awaiting_review`, or a visible unknown/timeout from authoritative receipts. After a real staff reply, the next execution has a new execution ID but the same task ID. A new message can add evidence while the task awaits review; it does not accept the task. Dispatch and reconciliation are explicit methods for the existing caller/worker; this module starts no process or interval.

Unknown blocks further dispatch, including after reconstruction. A later known completed receipt can resolve unknown without another model call. Expired/revoked authority blocks work and receipt reads. A late known admission mapping is retained even if reconciliation already marked the execution unknown. Historical execution receipts remain available to the host; the latest channel state does not replace the native task/report audit.

The queue accepts at most 1,000 pending events and returns an explicit backlog error before the transaction commits if full. A caller must retain its durable source event and show the failure; this is not permission to drop a message.

## Verification boundary

Run the dedicated real temporary PostgreSQL test through the repository resource wrapper:

```
python3 scripts/with-docker-test.py -- python3 scripts/test-employee-continuation.py
```

The test uses real native message persistence and a synthetic execution port. It proves coordination/transaction/restart behavior, not real Hermes, MiniMax, OAuth, source confidentiality, employee delivery or a production route. The main integration must verify those ports in the combined end-to-end test. No UI changed here.
