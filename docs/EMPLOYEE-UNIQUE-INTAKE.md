# Employee conversation cutover intake

This increment is disabled by absence of a server-owned route. It adds no UI,
enrollment endpoint, grant creation, process, polling timer or model call.

`externalAgent.teamBridge.v1.employeeRoute.<channelId>` uses
`employeeRouteSchema`. Its `fromSeq` must be the latest committed channel sequence
plus one at the authorized cutover. The route references the existing native task
and independent agent; it does not create another task store or impersonate a
human. The current grant is resolved from the server-owned
`externalAgent.teamBridge.v1.grant.<agentId>` record. The exact direct delegation,
active users, sponsor owner, grant versions, expiry and current task version are
rechecked before a pending fact is admitted.

The native message transaction calls `enqueueEmployeeIntake` before inheriting
the previous direct MiniMax workflow policy. An established route owns the whole
channel. Post-cutover employee text creates one immutable `employeePending` fact;
pause, expiry, revocation and authorization failures create a blocked fact. Neither
condition falls back to the former model consumer. Pre-cutover messages are not
replayed, and AI/agent messages do not become new execution sources. The original
bridge event hook yields to this route, preventing a second durable consumer.

This is intake only. The existing worker must consume these pending facts through
the trusted runtime/task continuation ports. It must call `assertLegacyConsumer`
before claiming/calling the former model and again inside the native reply's
outer transaction. The check rejects **all** old pending jobs for a channel with
an established route, including pre-cutover jobs. Removing a route is an explicit
reviewed rollback operation; toggling `enabled` never reactivates the old model.
No production route or grant is installed by this increment.

Validation: `npm --prefix server run build`, then
`python3 scripts/with-docker-test.py -- python3 scripts/test-employee-intake.py`.
The probes use disposable PostgreSQL and actual native message transactions with
synthetic users. They do not demonstrate real Hermes/model execution or employee
device delivery.
