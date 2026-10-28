# Windows checkout recovery and nonblocking receipt delivery

User reports the installed Windows POS stops after running for a while: a disabled payment button, no receipt output, and no next sale. The supplied photo shows the generic local-save failure banner. It does not identify the original exception. Current live POS monitoring contains received-payment records but no original local exception, so disk, network, expired authorization, or printer hardware cannot be asserted as the initial cause.

Confirmed code defects addressed:
- The payment modal covers the recovery controls while its confirmation action is disabled by recovery state. Expose a recovery action inside that modal; keep cart/payment evidence and the existing unsubmitted-cancel, retry, verified-completion and isolate-for-review operations.
- A failed recovery read has no explicit retry dependency. Add a recheck action, including on the main recovery banner.
- A payment-report failure before order POST is misclassified as a generic local save failure, although its durable intent has already been claimed. Retain it as review and log the actual failure.
- Checkout waits for native receipt delivery, and initial multi-copy delivery has no deadline. Persist the immutable receipt first, release checkout without awaiting the device, retain late results, and bound multi-copy waits. Cash drawer output without automatic receipt is also independent of checkout.
- Record pre-submit exception name/code, stage, version and original order identity in the existing checkout audit stream.

Equal product contents are not an idempotency key. Separate customers retain separate order/receipt identities. No payment, device, inventory, authentication or authorization settings are switched off.

Validation: focused checkout and receipt tests (22 passing), POS TypeScript check and translation check. Tests exercise a permanently stalled printer, two identical baskets with distinct receipt IDs, snapshot storage failure, lost payment-journal reply, multi-copy timeout and late success. Synthetic tests supplement verification; they do not prove the affected store's physical printer works.

UI: preserve all existing payment amount, tender/change, voucher, payment-method, keypad, quick-amount, cancel/confirm and recovery operations. Added recovery controls wrap, have 48px touch height, and use a bounded scrolling alert. Actual responsive screenshots and installed Windows/physical-device validation remain pending and must be reported as unverified until performed. No claim that the original machine's first exception has been diagnosed.

Windows baseline: v2026.10.526, source ce0b7d471bd1dcf1201c81333c355f1e9d79272e, verified from the current GitHub release. Use this baseline for the precise target build and preserve current master fixes.

## Expanded audit requested by user

The store always uses the installed Windows application. Browser views below are administrator verification only, not a change to store operation.

Live read-only evidence from the running API showed `POST /api/pos-action-logs` declared as `permission: owner.only`, `ownerOnly: true`; `canUseManagementRoute({role:'cashier'}, spec)` returned false. This prevents cashier audit/error events from reaching the owner monitor and is distinct from the original unknown local-save exception. Restore only cashier log submission under the existing `orders.create` permission. Keep administrator audit reads and device-configuration permissions restricted. Pre-submit and pricing-verification failures now also enter the same diagnostic path. A scoped diagnostic outbox retries lost reports with one event identity; server deduplication prevents duplicate warning counts.

| Condition checked | Finding / action |
| --- | --- |
| Cash tender upper limit | Live `maxCashAmount` was 100000. Changed through the actual administrator payment UI to 0 (unlimited), reopened the settings and independently confirmed the saved database value. Minimum remains 0, change enabled, cash/QRIS enabled, debit/card disabled. Photo tender 50000 did not hit this cap. Store Windows must load the updated configuration before it takes effect there. |
| Disabled payment methods | Cash and QRIS enabled; other unsupported methods intentionally stay disabled. No blanket provider enabling. |
| Minimum amount / change switch | Minimum 0 and change enabled; no active block from these settings. Numeric, sufficient-tender and correct-change validation remain. |
| Receipt copies / paper size | Live auto-print true, one copy, 58mm. Multi-copy handover defects are potential blockers, not proven to have caused this single-copy incident. |
| Native output waits | Checkout releases after receipt snapshot save. Serialize native receipt delivery so later orders do not collide with the native busy guard. All receipt UI waits are bounded, late results retained, and an active native attempt cannot be reprinted concurrently. |
| Multi-copy take-paper prompt | Was a full-screen modal with no native expiry. Change to a nonmodal assistance panel, cancel remaining copies after 30 seconds, and preserve explicit handover before another copy. |
| Recovery barrier / failed read | Original receipt identity and evidence stay intact. Expose the recovery route inside payment, add storage-read retry, and retain explicit isolation/next-empty-sale actions. |
| Price refresh / changed-price acknowledgement | A dismissed price-change confirmation could leave its flag active. Add explicit acknowledgement of the visible current amount and a quote retry. Log verification failures with actual codes. Do not substitute a guessed price or silently remove a customer's discount. |
| Network requests | POS Axios lacked a default deadline. Add 15s default and 5s bounds for API-address/product-version fetches. Price/cached-read paths keep their stricter existing deadlines. |
| Optional snapshot cache | A cache-write failure could reject an otherwise successful server configuration/permission read. Keep the valid server response; local sale/receipt writes still must commit durably. |
| Permission cache | A failed optional sessionStorage write could turn a freshly verified permission response into global access failure. Isolate that cache error; real server denials stay enforced. |
| Update installation | Background downloaded updates could restart after 60 seconds idle. Remove this automatic idle installation; retain explicit installation and unpaid-order/update backup guards. A deliberate install is a maintenance action, not a sales operation. |
| Shift state | Requires an open, enabled shift. Supervisor confirmation currently false. No removal of shift accounting. |
| Offline authorization / machine clock | Signed offline authorizations expire after the existing 30-day policy; a clock more than 60s behind its local ledger is rejected. Keep these validations and report their exact failure code, rather than inventing evidence or extending authorization. |
| Local durable storage failure | A failed actual order write still cannot be treated as a completed paid order. Preserve the basket and show diagnostic code/recovery actions. The affected machine's original exception is still unavailable. |
| Printer inventory and administrator remote tests | Separate from native receipt output. Existing owner restrictions remain; no broad device permission change was applied. Automatic review rejected expanding printer-inventory writes, so that proposed expansion was excluded. |

Validation now includes focused tests for the outbox, warning emission and idempotency, serialized printing, expired handover, duplicate baskets, update scheduling and permission-cache failures. The disposable PostgreSQL HTTP scenario verifies a real authenticated cashier POST reaches the owner's warning counters exactly once, while cashier GET of administrator logs is denied. Every Docker attempt used the cleanup wrapper; failed and successful batches were cleaned.

Actual administrator screenshots: `output/pos-checkout-unblock-20261028/cash-limit-before.png` and `cash-limit-after.png`. Existing payment controls and provider selections were preserved. Windows/printer and new recovery-panel responsive validation remain pending; these screenshots verify the configuration change only.

Publication status: independent PR #341. Automatic approval review refused default-branch merge/publication because real Windows/page acceptance was incomplete. No merge, installation or production API deployment was performed. Prior CI run 40677005326 passed for the initial b0c8e9d4 target only; subsequent expanded changes require a fresh exact-SHA run.
