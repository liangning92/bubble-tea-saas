# POS continuous offline checkout — 014

## Learn
Dexie transaction promises resolve after commit; asynchronous network work must remain outside the IndexedDB transaction: https://dexie.org/docs/Dexie/Dexie.transaction(). Existing server f192 persists original UUID request fingerprint and first receipt, so uncertain delivery can retry the original input under current cloud authorization.

## Evidence and scope
Current global recovery barrier stops later sales; payment configuration read failure removes readiness; cached products lack backend/store scope. Offline credentials have no signed historical authorization. QRIS waiting only shows a toast, with no manual completion path.

## Plan
Use existing IndexedDB only. Scope successful read snapshots by backend and store; bind login and queued orders to that target. Atomically record local cash/manual QRIS sale, original request, occurred time, pending upload and basket generation before output. Unknown or refused rows remain individually visible without blocking other sales. Synchronization uses current authorized session, original UUID and backend, with no recovery printing. QRIS manual confirmation records operator evidence, not bank confirmation. No cloud schema/time semantics change, no offline points/balance policy or new permissions, no installer work.

## Validation
Final source validation: all 16 native IndexedDB/React scenarios passed after the final session/isolation corrections, plus 3 supplemental scenarios (amount conflict, actual bcrypt cached login, cloud 401). Chromium runs the production React/Dexie code; only API and printing boundaries use synthetic fixtures. Individual JSON records and screenshots are retained in `/tmp/pos-continuous-offline-evidence/`. Logs: `/tmp/pos-continuous-offline-page-final16-2.log` and `/tmp/pos-continuous-offline-page-extra.log`.

The 16 scenarios: ten continuous sales; restart; lost reply/replay; automatic reconnect; target changes; manual static QRIS; order write failure; generation write failure/atomic rollback; cloud business refusal while preserving payment; missing initialization; crashed syncing claim recovery; unbound legacy isolation; foreign-store isolation; missing cloud token; two-tab stale basket protection; unresolved points/member/discount policy rejection.

110 Node regression cases, POS TypeScript/build, three-language check, four Python upgrade preflights, security (18 pass, zero fail) and packaging configuration (17 pass, zero fail) passed. Earlier Node AST cash fixtures were adapted to the preserved online card path; actual offline cash is tested in native IndexedDB. Initial packaging check lacked client-pos/dist because build output was held in /tmp; the real build was put at its normal path and the check passed. No Windows installer was built or tested.

## Behavior and remaining boundaries
- Local acceptance stores original UUID/request/backend, occurredAt, amounts and frozen catalog/config evidence in one IndexedDB transaction before output. Retry uses that exact request through the existing authorized bulk receiver, one row at a time. Delivery or amount conflicts never erase the collected-payment fact. Upload never prints.
- Current token/store/backend are checked again immediately before sending. A prior 401 cannot erase a newer target/session. Expiring the cloud token preserves the previously authenticated local identity and does not grant cloud access; online re-login is required for uploads. A cached password hash and local catalog digest are not signed historical authorization or price grants. Cache reads do not falsify the original fetch time.
- Initialization requires a previous online login and complete scoped products/payment/active-shift/open-session snapshots. Offline opening/closing a new shift is not implemented. Legacy credentials without backend evidence require fresh online login, and unbound legacy orders are never assigned a new destination.
- Local-first financial acceptance is limited to cash or manually acknowledged static QRIS without member, points, coupon or discount inputs. Other authorized online flows retain their existing checks. No offline balance/points spending, negative-stock policy, permission expansion or 24-hour cutoff was added.
- QRIS records the operator acknowledgement that the customer success screen/photo was checked, with bankConfirmed=false and a reconciliation note. Photo capture/storage and bank reconciliation remain external; this does not verify funds at the bank.
- Occurred time is local only. Cloud createdAt/report business-day semantics remain unchanged; cross-day cloud attribution requires the separately pending field/policy decision. No schema changes, SQLite inventory mirror, installer WIP, real data edits, push or deployment.
- Safe cloud replay requires the reviewed f192 idempotency service and its separately controlled migration; source fixtures do not prove that code is live on the actual backend or cashier device. The separately reviewed public projection increment a217 is not included in this branch.

