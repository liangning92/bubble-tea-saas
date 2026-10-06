# Durable checkout intent stoploss

Baseline 08f46fba70a64b68f179fdd88a9e72f851fb9ec0; branch fix/pos-durable-checkout-intent.

## Evidence and scope

Checkout currently assigns LOCAL-Date.now after collecting a mutable cart; the first POST does not carry the offline orderNumber. Network failure then inserts a second identity into IndexedDB. A committed response lost in transit can therefore create another order on sync. Synchronizers reconstruct fields and substitute POS channel; they have no cross-tab claim. Legacy queues lack a complete original request.

Learned from https://dexie.org/docs/Dexie/Dexie.transaction() and https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction : wait for transaction completion before HTTP, and keep network operations outside IndexedDB transactions. Readwrite transactions over shared stores serialize tab claims. The old audit implementation uses UUID + complete checkoutRequest, but its exact server replay needs absent requestFingerprint/checkoutTaxAmount columns; those changes are excluded.

## Minimal policy

Persist a prepared immutable UUID request plus an order recovery row atomically in existing config/orders stores; mark it sent in another atomic claim before HTTP. Any failed first/claim write blocks HTTP. Prepared means no request was sent and can be explicitly discarded. Sent or transport/5xx/identity-conflict uncertainty is retained and blocks another checkout at this store in the same browser profile. Editing a shopping cart does not mutate or overwrite that intent. Restore a visible recovery banner after refresh; never call uncertain receipt success/print or fabricate legacy queue snapshots. Known first-send validation/auth/config rejection may release the intent and preserve the cart. Accepted response must be durably acknowledged before output/clearing; a failed acknowledgement retains an uncertain sent intent.

Single/bulk upload uses only the stored original snapshot, scoped to the authenticated store, with atomic order claims across tabs. Review/sending rows are not automatic pending work. Explicit review retry is same identity/content only, claims the row once, prints nothing, and remains review on conflict/lost response. No automatic different identity or bulk-to-single fallback after an ambiguous bulk response. Server unique orderNumber is used only to prevent another insertion, never as proof of matching request content.

No schema, production data/config/credentials, financial algorithms, deployment or push in this batch. The review increment adds only a typed inventory refusal after verified transaction rollback. Browser-local operational recovery metadata is not server Config. Cross-device deduplication and authenticated server replay remain future work.

## Implemented boundary and review notes

- No Dexie version/store/index change: operational metadata uses the existing browser config table; complete requests use extensible existing orders rows. This does not add server Config records.
- First prepare atomically creates an immutable recovery order and a per-store barrier. Another transaction claims prepared→sent before POST. Both POS checkout and suspended-order POST use the same boundary. A prepared request can only be changed by explicitly discarding its unsent intent and creating another; its old order recovery row is retained as discarded. A sent intent has no discard action.
- Same-store barriers cover first sends across tabs, refresh between claim and POST, response loss, failed accepted-response acknowledgement and failed review writes. Draft cart edits remain separate from request snapshots. Corrupt recovery records fail closed with a visible banner, no render crash and no HTTP.
- Known first-send 4xx validation/auth/refusal may release the intent and retain cart/payment input. 5xx, generic identity conflict, unknown exceptions and network failures stay review. Failed first storage/claim blocks all HTTP. No uncertain printing, drawer pulse, completion, success banner or cart clear. A confirmed order followed by local output failure clears the original sale to prevent resending it.
- New checkout and suspend controls disable during recovery; handlers and transaction guard also enforce it. Original request details are labelled as not payment evidence. Legacy rows show their identity for manual verification; no invented snapshot/default POS channel. Explicit review retry uses original body only and has a cross-tab atomic row claim. A crashed syncing/sending row is retained for manual verification rather than having its claim timed out and automatically resent.
- A real first-create HTTP201 response for the original UUID atomically saves confirmation and removes only its matching active barrier. Refresh preserves that proof; an explicit acknowledgement starts an empty new basket with no retry print. Unknown records can instead be isolated in a retained audit record, never declared paid/unpaid, never automatically uploaded, and never converted into a replacement original sale. All tabs clear saved baskets when isolation or confirmation appears. Full authenticated replay certification remains separate work.
- The existing synchronous store busy guard remains. Sync singleton listeners are restored without duplication after POS route unmount/remount; upload rechecks authenticated token/store before HTTP and only accepts POS roles in this frontend. This does not repair the independent server bulk-route role/schema gap.

## Validation

See pos-durable-checkout-validation-20261007.txt for commands/evidence. Synthetic utility/actual-checkout tests, native IndexedDB/browser cases, related payment/shift/printer/barcode regressions, POS types, all-client translations and POS build run locally. Actual current Express order router, JWT authentication and OrderService run against fresh isolated SQLite and PostgreSQL databases. Commit then lose response, exact original single/bulk/concurrent retry, and full actual POS→IndexedDB→real POST→refresh→retry are exercised; each UUID produces one order with once-only stock/points/cash effects. Current server returns unique conflicts or closed-shift refusal: these are review, not replay success.

## Material limitations

Repository schema.sqlite.prisma lacks pickupNumber already required by OrderService. Its unmodified initial acceptance fails before order creation. SQLite transaction acceptance therefore uses a /tmp-only provider adaptation of current schema.prisma. This is not certification of the stale packaged SQLite schema or a production migration. PostgreSQL acceptance uses the current model without new fields. Test SQL initializes only new empty owned databases; no existing database is migrated. Generated runtime, databases, logs and screenshots stay in /tmp; owned servers/PG stop afterward.

Stable identity only covers requests written by this browser profile and retries preserving that identity. Existing requests sent before this fix and queues lacking original snapshots cannot be certified; legacy recovery is retained for manual review. Clearing browser data/different-device reconstruction is outside this stoploss. Server original-request fingerprint and immutable tax return fields are absent, historical quotes remain unauthenticated, and pricing/addon/permission algorithms are not rewritten. No production change, push, packaging, merge, deployment, or physical Windows/printer certification.

## Review increment

Independent review identified a permanent barrier after a valid retry201, no safe operational exit for sent-before-HTTP/legacy uncertainty, inventory rollback being mislabeled generic500, and rejected/discarded rows inflating shift uncertainty. The incremental fix retains originals and an actor/time isolation audit, accepts only structured409 rollback proof matching the original UUID, and excludes only explicit rejected/discarded resolutions from shift pending evidence. Quarantined unknowns remain uncertain. Corrupt recovery still fails closed and requires technical investigation. See pos-durable-checkout-review-20261007.txt; the earlier validation file records initial commit476366f.
