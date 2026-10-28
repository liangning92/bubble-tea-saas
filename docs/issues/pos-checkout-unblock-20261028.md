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
