# POS shift settlement: attribution boundary before implementation

Baseline: fix/pos-payment-shift-config @ 12b8ecb175c23d5b241d7a953857f346aa72c5ca, synchronized with GitHub and CI-successful. New local worktree/branch: pos-shift-session-summary / fix/pos-shift-session-summary. Original worktree remains clean. No application changes, DB queries, migration, deployment or push in this investigation.

## Verified F03/F04 behavior

| Location | Actual behavior | Consequence |
| --- | --- | --- |
| server/src/services/OrderService.ts:823 | Completed cash sales create cash_sale with authoritative grandTotal and orderNumber, but no shift key or session ID | close filtering by key omits sales; adding just a key would mix same-key reopenings |
| server/src/services/OrderService.ts:925 | Existing refund rule records cash_out = min(positive requested amount, finalAmount), or finalAmount for direct full refund; no shift/session | cash refund is omitted by close; it belongs to the drawer/session handling the refund, not necessarily the sale's session |
| server/src/routes/posCash.ts:128 | current reads all cash events and orders since Jakarta day-start | morning/evening/reopening mix; a session crossing midnight loses its prior-day events |
| server/src/routes/posCash.ts:221 | QRIS aggregate sums totalAmount, with no completed/refund exclusion | uses pre-discount/pre-tax total, includes refunded orders; simply excluding refunded orders would incorrectly erase the remaining amount of a partial refund |
| server/src/routes/posCash.ts:427 | close filters cash events by same shift key since day-start | misses unlabelled automatic events; same-key reopenings mix; midnight truncation |
| server/src/routes/posCash.ts:449 | unconditional session update followed by a separate close_shift event write | concurrent closes can both write events; update/event can partially succeed |
| server/src/routes/order.ts:184 | bulk-sync validates optional shiftSessionId against the store | useful validation, but not durable attribution |
| server/src/services/OrderService.ts:1149 | bulkCreateOrders passes data to createOrder, which has no session field and uses default createdAt at insertion | delayed prior-session orders are indistinguishable from current-session online orders by time alone |
| client-pos/src/db/offline.ts:22; POSPage checkout | local model has optional session ID; current checkout does not populate it | legacy queue provenance is often absent even before server persistence |

## What the existing schema can and cannot represent

- ShiftSession has a stable id, storeId, openedAt, closedAt, status and shift key. Safe boundaries for known online events are store + a non-overlapping [openedAt, closedAt) interval, never Jakarta-day + shift name. An open interval must use one captured as-of time. Multiple overlapping open sessions make time attribution ambiguous.
- Order and CashEvent have no persisted session ID. CashEvent.orderId is nullable free text, not a foreign key, and existing writers use orderNumber or client display numbers. CashEvent.note/Order.note are user/business prose, not an established session metadata protocol. This batch must not silently repurpose them or extension fields as an undocumented ledger.
- Order.createdAt/CashEvent.createdAt measure server insertion. Offline input createdAt/session ID are not persisted in this baseline. A timestamp interval cannot prove the original cashier session of a delayed sync. Identical stored rows can result from either a current-session online sale or a prior-session delayed sale.
- Order.finalAmount is the authoritative charged amount including the existing discounts/points/tax calculation. It must not be recomputed or changed for settlement.
- Refunded status does not encode refund amount. Existing partial refunds set the entire order status to refunded. Noncash refunds do not create a payment event. Approved RefundRequest amount/approvedAt are updated outside the refund transaction; direct refunds have no request at all. updatedAt is not a dedicated refund execution timestamp. These fields cannot prove all actual QRIS refund cash flow or its handling session.
- ShiftSession.expectedCash is non-null Int. Unknown reconciliation must not be persisted or displayed as 0. CashSummary's unique(storeId,date,shift) also cannot represent same-key reopenings. It must not be used as the new session ledger.

## Stop decision

The complete requested cash/QRIS session closure cannot be certified using these existing fields alone. Durable structured attribution/refund execution records would require either a migration or a separately reviewed explicit storage protocol, together with offline replay identity. No migration is authorized. Therefore stop before application edits rather than label a timestamp-only patch as a complete fix.

This is an information-loss boundary, not a dependency-installation issue. No production reads are needed to establish it. No historical rows should be backfilled by guessed key/time. No tax, points, inventory or refund allocation rules should be recreated.

## No-migration alternative and smallest next increment

A strictly bounded, provisional read-only summary can be offered without a schema change:

1. Select the authenticated store and one non-overlapping session interval. Never include earlier same-day/same-key events. For a midnight-spanning session use its actual openedAt, not startOfTodayJakarta.
2. Report independently verified raw window evidence as provisional. Missing/overlapping provenance, late or unbound offline queues, and refunded QRIS orders without an atomic execution amount make the corresponding metric `null` with explicit reasons, rendered as “unverifiable”, not 0. Do not claim that timestamps repair attribution.
3. Preserve history/raw amounts and the existing refund amount rule. Completed QRIS receipts can display finalAmount evidence; QRIS **net** must remain unknown where refund execution cannot be proved. Do not silently drop a partially refunded order or subtract totalAmount.
4. Do not write an uncertified expectedCash or cashDifference, and do not finalize automatic reconciliation on provisional totals. Closing-state concurrency can be fixed separately with one transaction, a conditional open→closed update and its close event. To ensure a stable closing snapshot, all online order/cash/refund writers must share the same session lock/boundary. A CAS only on close does not protect against a racing sale.
5. Before promising offline-inclusive final settlement, take a dedicated narrow replay/session-binding batch. The current schema/orderNumber uniqueness is not proof of bound idempotent replay: short pickup numbers are converted to newly generated orderNumbers. Replayed or delayed writes can invalidate an earlier settlement. Preserve this risk for that batch rather than integrate patch130 here.

The next safe implementation choice is provisional UI/API evidence plus explicit unverifiable states, with no automatic settlement write on unknown data; it is not the requested complete ledger. A separate durable-attribution/replay decision is required before a complete closure patch. No customer-facing behavior was changed in this branch.

## Concentrated test matrix for the eventual implementation

- Same-day morning/evening; morning close + morning reopen; isolated store B events must never enter store A.
- Jakarta midnight crossing: both sides of midnight belong to the same actual session; exact closedAt belongs to the next interval, never both.
- Opening float counted once; additional float policy explicit; cash_sale + cash_in − cash_out including existing cash refund amounts; original order amounts unchanged.
- QRIS uses finalAmount evidence, honors the existing applied refund amount, handles prior-session-order refund execution during current session, and displays unknown for legacy/direct/non-atomic refund provenance.
- Concurrent close/close produces one closed session and one event; repeat close adds no event; event failure rolls back closing; close racing with sale/refund/in-out uses a common serialization boundary.
- Delayed sync from an already closed session and repeated short-pickup replay remain uncertified until dedicated binding/idempotency tests pass. Do not count these as current-session sales based on insertion time.
- Unknown history is visibly unverifiable rather than 0; automated reconciliation writes are blocked for uncertified metrics.

No implementation tests were run for a nonexistent fix. Prior branch's 23 synthetic tests and CI remain valid only for payment/shift configuration, not this settlement closure. This local finding is ready for scope review; no new GitHub CI or deployment was triggered.

## Authorized no-migration implementation scope

The user selected display/protection only. Add a read-only current-session evidence endpoint shape using authenticated store and captured [openedAt, asOf) bounds, with provisional server-window receipts and explicit unknown metrics. No session identity is inferred or backfilled. Opening float is the recorded session value. Unlabelled/mismatched cash events hide the affected subtotal; QRIS refund amount uncertainty hides QRIS receipt subtotal; expected cash and net QRIS remain uncertified/null. Multiple/no open sessions do not fall back to whole-day totals. Frontends show provisional/unverifiable labels and never coerce unavailable evidence to 0 or auto-fill actual cash. They retain explicit manual input/close but suppress uncertified automatic Z-reports. Close API semantics are unchanged because no reliable persistent pending-verification field exists. This does not block normal checkout. No database/schema/financial algorithm changes.


## Implemented display/protection increment

- New read-only ShiftSummaryEvidence service replaces the misleading whole-day /balance and /shifts/current read summaries. Authenticated store + exactly one open session + captured [openedAt, asOf) selects server insertion records. No session/time backfill. Multiple open sessions, absent session and invalid interval return unavailable evidence. A matching shift key is at most provisional window evidence, never certified ownership.
- Cash event types with missing/mismatched shift keys return null for their subtotal. Completed QRIS window receipts use original finalAmount; any refunded QRIS order hides that receipt subtotal because execution amount is unknown. QRIS net, expectedCash and currentBalance are always null/uncertified. Observed empty-window zeros are explicitly provisional, not settlement values. Opening float is the recorded session field.
- POS shift dialog and CashManagement replace the previous day/audit/channel settlement cards with the same provisional/unverifiable component. Local pending/syncing/failed orders are counted by authenticated store via real IndexedDB; any such rows or queue-read uncertainty masks amounts. A read failure clears old evidence rather than displaying a stale summary. Receipt/cash amounts remain distinct from certified net/reconciliation.
- No implicit actual-cash fallback. Both UIs require explicit valid manual input; an explicitly entered 0 is accepted. Existing close API body is byte-for-byte unchanged. **Its pre-existing expectedCash/cashDifference write logic and concurrency weaknesses are NOT fixed/certified.** No durable pending-verification flag is written because the schema has no reliable field; the UI explains the existing close process still needs manual verification. Do not represent the resulting old close record as verified financial settlement.
- Uncertified automatic main-POS Z-report printing is suppressed. No change to normal sale receipts, payment methods, shift opening, inventory, tax, points, refund amount calculations or offline synchronization. No schema, migrations, credentials or production changes. Existing source payment-configuration branch remains independently clean at 12b8ecb; this work is on fix/pos-shift-session-summary.
- Source/API must later be deployed with the matching frontend: old clients that coerce null to 0 are not certified with this new read shape. This task does not deploy either.

## Validation

- `node --test tests/stoploss/*.test.cjs`: 31/31 PASS, zero skips. Actual helper execution with synthetic data covers same-day same-key reopen, store isolation, exact upper boundary, Jakarta midnight crossing, missing/mismatched event attribution, QR finalAmount/refund uncertainty, no/overlapping session, healthy empty provisional evidence, manual explicit 0/125 and zero uncertified prints. A source-equality test proves the close API body remains unchanged.
- `node tests/stoploss/shift-page-check.cjs`: 7/7 real React/Chromium scenarios PASS (healthy, legacy, refund, local queue, read failure, explicit manual count, CashManagement); actual evidence service + synthetic HTTP/Prisma/device boundaries, real isolated IndexedDB, zero page errors, zero uncertified Z-report calls. PNGs stay outside Git under /tmp/pos-shift-page-evidence; legacy screenshot inspected visually.
- Original `node tests/stoploss/page-check.cjs`: all five payment/configuration scenarios PASS on this branch, including actual 10s poll, all-off, reconnect, HTTP409 visible refusal, dual-save failure zero printing, custom/off shifts. Evidence outside Git under /tmp/pos-shift-config-regression. Confirms this display change does not disable normal checkout.
- `npm run typecheck`: all four packages PASS. `npm run i18n:check`: all three packages PASS. API and POS existing build commands PASS with only output directories redirected to /tmp/pos-shift-build so tracked prior artifacts are preserved. Chunk-size warning unchanged.
- Security review: 18 PASS, 0 FAIL, 1 existing requireStoreAccess warning. Dependency manifests, both lockfiles, schema, OrderService, order routes and workflows are unchanged.
- Listener sandbox denial was followed by normal approved test execution, no alternate route. Prisma generation was normally approved and did not connect a DB. No real DB/server process or physical devices used; no production logs/screenshots/operational backups committed.
- Supporting output: docs/issues/pos-shift-evidence-validation-20261007.txt. Ready for one focused review before the requested branch-only push/CI stage. Full session attribution, refund execution ledger, stable closing snapshot/concurrency, and patch-bound replay remain separate approval work.
