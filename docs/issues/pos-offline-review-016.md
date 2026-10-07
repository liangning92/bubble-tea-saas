# Offline review counterexamples — 016

## Learn and evidence
The previous 19 browser scenarios did not cover changing payment method after an uncertain card response. Actual React/HTTP review fixtures produced two UUIDs for the same preserved basket and stock 100→98. Dexie transaction/generation checks must protect the basket across all methods, while independent locally accepted rows remain uploadable. Existing docs: https://dexie.org/docs/Dexie/Dexie.transaction(). Review artifacts: `/tmp/review-ed543-real-duplicate{,-postgresql}.json`, `/tmp/review-ed543-counterexamples/{partial-config-cache,fallback-blocks-offline,inventory-cache}.json`.

## Root causes and bounded fix
1. Cash/manual QRIS skipped the recovery guard and recordLocalSale did not re-read it atomically. Require old non-local uncertain rows/intent to be isolated first, advance basket generation, preserve unrelated paid pending rows.
2. category=pos config responses overwrote the full config snapshot. Cache only unfiltered complete config requests, retain completeness/version evidence and original disabled-tax setting.
3. Health fallback changed the configured business backend. Probe results must not rewrite that identity.
4. Product snapshot copied full Prisma product/BOM/inventory into IndexedDB and each sale. Persist a whitelist of cashier product/category/spec/addon fields only.

## Validation
Owned SQLite and PostgreSQL fixtures exercise actual Express/JWT/Prisma routes, React, Chromium and IndexedDB, with synthetic printer output only. An original card sale commits and loses its reply: changing its preserved basket to cash sends no second request, prints nothing, and stock stays 99. Explicit isolation clears that basket. A captured checkout callback in another tab and the old generation cannot reuse it. An independently created cash basket succeeds once; stock then becomes 98, with one print and no upload/replay print.

Tax configuration follows the existing admin `taxSettings.enabled` key and existing POS/OrderService rules. No rate, default, tax algorithm or receipt template was changed. Partial `category=pos` responses do not replace the complete config or its original version/time. Disabled-tax local payment and printer payload are tax 0 / total 10000. Re-enabling the backend setting before upload still yields server receipt and idempotent replay tax 0 / total 10000. Historical migration fixture amounts also remain unchanged. This confirms source behavior, not the installed shop version or physical receipt layout.

SQLite evidence: `/tmp/pos-receipt-http-2xQfQz/browser-recovery-evidence.json`; PostgreSQL evidence: `/tmp/pos-receipt-http-M2piIX/browser-recovery-evidence.json`. Reproduce with an owned runtime created by `node scripts/prepare-order-receipt-runtime.cjs`, set `RECEIPT_RUNTIME` and `RECEIPT_PROVIDER=sqlite` or `postgresql`, then run `node tests/stoploss/offline-recovery-http-check.cjs`. Chromium and provider binaries must be available; no production database is accepted by the fixture.

The browser script `tests/stoploss/continuous-offline-page-check.cjs` retains four review counterexamples alongside the existing 19 scenarios. `OFFLINE_SCENARIOS=partial-config-cache` checks full configuration, category poll, disconnect, reload, two consecutive payments and reconnect. The legacy scenario originally timed out behind the existing channel-selection modal; the test now confirms that channel through the real UI before requesting isolation. No application behavior was bypassed.

All 23 browser scenarios passed in `/tmp/pos-offline-review-native23-fixed.log`; individual JSON evidence is in `/tmp/pos-continuous-offline-evidence/`. The extra periodic-probe race is tested directly against the transpiled ConnectionManager in `tests/stoploss/connection-target.test.cjs`: both stale success and failure are ignored; current-target success, failed-target backoff and manual reconnect remain functional without business-URL writes. This Node test is covered by the existing CI wildcard without workflow edits.

113 Node regressions (the previous 110 plus three target checks), POS TypeScript/build, three-language validation and four Python preflights passed. Security checks: 18 pass, zero fail, one existing middleware warning. Packaging validation: 17 pass, zero fail, three existing warnings (Windows engine, icon resources, middleware). The separate legacy `packaging-check.sh` fails its module-pattern checks on the unchanged configuration; this is not installer validation.

## Scope and review boundary
Five production source files implement only the four listed fixes. Independent scope review approved preserving polling, backoff, online events and manual reconnect while prohibiting health-based business-target changes. Periodic checks ignore results for a previous target. Manual target selection is preserved. Requiring a proven complete snapshot means an older unmarked candidate cache needs online initialization again; it is neither deleted nor falsely marked complete. No actual shop cache was modified.

An attempted CI workflow addition was backed up in `../pos-offline-review-paused-20261007/tracked.patch` and excluded from this increment. Browser/HTTP scripts remain reproducible repository tests; they are not currently connected to CI. No cloud schema, real database, financial algorithms, receipt template, inventory policy, member policy or installer changes. No offline push or production release. The prior public-receipt branch is separate and is not included here.
