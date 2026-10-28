# Windows POS: continue serving while the backend reviews exceptions

The store only uses the installed Windows application. Cashiers must not adjudicate uncertain payments, tick acknowledgements or open recovery dialogs before serving another customer. Review belongs to the administrator backend.

## Confirmed defects

The photographed red message is `pos.offlineSaveFailed`. The published handler classified every exception before `sent=true` as a local save failure, although this included a failed received-payment HTTP request after the intent had already been claimed. It returned without resolving that claimed state, so the global recovery barrier disabled further checkout and printing never ran. Pre-submit errors also returned before failure reporting. Separately, the deployed `POST /api/pos-action-logs` manifest was owner-only and denied cashier reports. The affected terminal's original exception remains unknown; an injected 503 proves the code path but cannot establish which exception occurred on that machine.

## Resulting behavior

- Commit the original payment evidence locally, then upload its backend review copy independently. A failed or stalled review-copy request cannot block a valid order admission or receipt.
- If the actual order submission fails or remains uncertain, preserve the immutable request, amount/tender evidence and operator provenance automatically, quarantine that identity, and begin the next customer's empty sale. No cashier verification, checkbox, acknowledgement or special continue action is required.
- Retain unknown transactions for the backend only. The foreground synchronizer may submit orders only for locally accepted offline sales. Unknown identities are never automatically replayed as orders, including through the generic retry control.
- Retry quarantined received-payment evidence through the existing idempotent receipt endpoint. This creates backend review evidence, never an order. Only the administrator's existing pending-receipt controls may post or discard it. Bound batches, isolate store/backend/actor scope, retain rejected old evidence and do not let a semantically invalid record hold newer records behind it.
- Recover older unresolved entries automatically. A previously confirmed transaction is acknowledged locally without a false failure warning. Durable-write failure does not permit deleting original evidence or manufacturing payment success.
- Report pre-submit, pricing and order errors with actual codes and stages. The actor/backend/store-scoped diagnostic outbox retries one stable event identity; the server deduplicates warnings. Diagnostics include financial evidence but omit reusable admission/offline grants. Keep administrator audit reads and hardware permissions restricted; only cashier own-log submission uses existing `orders.create`.

## Other blockers handled in this task

Receipt snapshots commit before independent serialized native delivery. All initial receipt UI waits are bounded; queued jobs expire without accumulating behind a hung native request, and an active native attempt cannot be resent concurrently. Multi-copy assistance is nonmodal and initially collapsed at the top, with native cancellation/30s expiry. Keep price acknowledgement and quote retry reachable, default POS requests to 15s, bound configuration/product-version fetches to 5s, and prevent optional cache writes from revoking valid server reads or verified access. Background update downloads do not schedule idle restarts; explicit installation remains guarded.

The live cash tender cap was 100000 and was changed to 0 (unlimited) through the logged-in administrator UI, reopened and independently read back from the database. The photographed tender 50000 did not hit that cap. Minimum remains 0, change enabled, cash/QRIS enabled and other provider selections unchanged. Receipt configuration remains USB POS-58, one 58mm copy, automatic print; labels use their separate device and kitchen printing is disabled. Windows OS sleep, USB power, driver and spooler state have not been inspected on the store machine.

## Validation and UI

46 related unit tests pass. The native IndexedDB/React page suite verifies that a failed review-copy endpoint still allows two normal sales and receipts; actual order failure automatically archives once and returns to the next sale; the old request is never posted again; its original items/payment method remain unchanged; and background evidence reaches the backend after recovery. It also covers unknown card outcome followed by a new cash customer, confirmed old transactions without false warnings, legacy entries and continued offline sales. Error/next-sale page flows pass at 1440/768/390 widths. These use synthetic business data and mock device/API boundaries; they are not physical-printer or real-store acceptance.

The cashier review controls are intentionally moved out of POS according to the user's requirement. Products, cart, totals, keypad, payment methods, cancel, confirmation, ordinary channel selection and other operational modules remain. The normal next-order flow is used after an exception. Screenshots and JSON evidence are under output/pos-checkout-unblock-20261028/automatic-backend-review-evidence. The existing administrator POS monitor and pending-receipt review controls remain unchanged. Earlier disposable PostgreSQL HTTP validation confirms authenticated cashier error reports reach owner warnings once while cashier administrator reads remain denied; all Docker batches used the cleanup wrapper and were cleaned.

## Exact source and publication

PR #341 is not merged or deployed. Preserve the latest master conversation-isolation fix (cec75151f1dfe663dae632a96a3ed6581a76bd5c; actual API/worker image 1a6f1151fdbffeda06189b34c8a7b6591f39de50). Published Windows baseline remains v2026.10.526, ce0b7d471bd1dcf1201c81333c355f1e9d79272e. CI 40710567889 for the superseded manual-continue candidate was cancelled after the user clarified automatic backend-only review. New exact-source checks/builds are required.

Earlier native builds were not published because of the unchanged 120s downtime gate; the latest previous attempt 40698600370 measured interactive 83.578s and silent 142.969s. Consolidating frozen-helper startup alone did not resolve it. The validator now observes fresh, correct-profile/current-PID healthy-runtime readiness concurrently with silent setup, then still requires setup exit 0, the same live main PID and a second healthy response before normal teardown. It reports readiness and installer completion separately. Keep the original start point, 120s readiness gate, 10s login gate, 180s installer bound and all version/profile/history checks. Three executable verifier tests reject failed setup and disappearing processes. A fresh native run must pass before claiming this resolves the gate.

Automatic approval review previously refused default-branch merge/publication because real Windows/page acceptance was incomplete. Store-machine/real-data/physical-printer acceptance and production deployment remain unverified. No rejected printer permission expansion or failed installer has been published.
