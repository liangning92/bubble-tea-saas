# POS payment and shift configuration

Baseline: handoff/training-source-filtered-20261007 @ 5de8547126e05beff22d94ec44e625f3f858fba0.
This branch does not incorporate patch130 or claim equivalence with deployed source.

## Learning
React controlled input state must reflect the operator's input; polling configuration must not replace that state during payment. Reference: https://react.dev/learn/preserving-and-resetting-state and https://react.dev/reference/react-dom/components/input . API boundaries must verify the authenticated store and active configuration; client options alone are insufficient.

## Confirmed causes
POS configuration polling resets payment selection twice; empty enabled lists retain defaults; admin allows disabled defaults. Main POS hardcodes three shifts. Shift GET seeds when all shifts are inactive. Checkout treats server rejections as successful offline sales and prints.

## Plan and safety policy
Use existing Config and Shift models. Require a successful payment configuration read in the current session; absent/malformed configuration and read failure block new checkout until recovery. Never silently enable methods. Keep operator selection during an open payment dialog, and reject invalid selection without clearing the order. Only transport failures without an HTTP response may queue offline sales; HTTP failures never print or queue. Main POS reads active shifts and opening validates an active store-scoped key. Shift GET becomes read-only; historical sessions remain readable/closable. No database, schema, credentials, deployment or pricing/inventory/points/tax changes.

## Validation and integration limits (2026-10-07)
- `node --test tests/stoploss/config-policy.test.cjs tests/stoploss/offline-checkout.test.cjs`: 17/17 pass. Executes actual TypeScript route handlers, loader callbacks and checkout via AST/transpilation, with synthetic Prisma/API/auth middleware stand-ins. No real database, schema changes or devices. Covers enabled defaults/all-off/single method, disabled default normalization/repeated save, payment polling/read failure/reconnection/stale responses, two/custom/disabled shifts, retained historical session on config failure, API role/store rejection, HTTP rejection versus transport failure, double-submit and dual-save failure zero printing.
- `npm run typecheck`: server/admin/POS/staff pass. Final POS check repeated after last UI edits.
- POS i18n checker passes (existing hardcoded-string warnings remain). Admin checker fails with 4043 issues; unchanged baseline has 4047. Not a release-ready CI claim.
- Isolated actual page regression attempted using `node tests/stoploss/page-check.cjs`. Sandbox local-listener limitation was escalated through normal approval and approved. Browser then could not load POS because reused workspace frontend dependencies do not resolve `bcryptjs`. No dependency reinstall/refactor was attempted. The updated browser fixture is included but is NOT a passing browser result.
- Standard smoke was not run: its configured `npm run dev` starts the real backend, and isolated frontend page loading is already blocked. Full builds, production tests, GitHub workflows, push and deploy were not run.
- Existing source trees and their WIP remain untouched. Clone baseline is the public GitHub handoff SHA. Local dependencies are read via untracked symlinks to the prior training checkout; these are not deliverables.
- Default shift initialization is now an explicit admin action, not a GET side effect. A store without a persisted valid payment configuration or any active shifts will be blocked until an administrator deliberately configures it. Verify intended store configuration read-only before a later rollout; this task does not modify that configuration.
- Already queued/historical orders retain existing bulk-sync semantics; the new policy applies to new online sales and shift opening. Historical session read/close routes and financial algorithms are unchanged.
- Next step is a dedicated review of this fixed local increment. Do not push before review, dependency/browser regression resolution and authorized release checks. patch130 conflicts and baseline CI debt remain separate work.
