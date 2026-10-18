# Whole-store estimated inventory, 2026-10-18

The old ledger deducted raw materials for manual issues and again for processing. Sales only recorded independent theory. This made warehouse issues look like physical consumption and made count/forecast reports incompatible with sales snapshots.

## Intended operator workflow

- Receive goods once. Receipt changes whole-store estimated stock.
- Optional batch issue and processing records describe internal location/form changes; neither reduces whole-store stock. Preparing three kilograms of powder after issuing the same powder therefore leaves the balance unchanged.
- Paid sales automatically update estimated raw-equivalent stock from frozen sale recipes once. No per-cup manual entry. Book shortages never block a real sale. Estimates, not confirmed physical measurements.
- Approved unprepared refunds reverse their original estimate once and restore original estimated batch allocations. Prepared refunds retain ingredients used.
- Report waste/expiry/external transfers separately; these reduce stock.
- Count raw leftovers in storage and at the counter plus remaining prepared ingredients converted to raw equivalents. Optional conversion helper adds prepared leftovers and keeps the calculation in the observation note. Conversion uses standard recipes; verified actual equivalents may be entered directly.
- Approval reconciles estimated stock by the observed difference, preserving subsequent movements. Late sales preceding approved observations are not deducted again; such sales uploaded during pending review are compensated at approval.

## Migration and analysis

`activate-unified-inventory.cjs` is an audited, idempotent activation per store. Refuses to switch a store with active counts. Does not restore historical withdrawals or modify historical orders. Old balances require an actual opening whole-store count; quantities are not invented. New stores receive the same policy at creation.

Counts capture version 4 whole-store scope and certified ledger boundaries. Variance analysis requires two post-cutover observations, uses immutable sales snapshots, independent physical depletion (opening + receipts - closing - known external out), store calendar dates, and rejects incomplete recipes, missing orders, unclassified movements or invalid boundaries. Old warehouse counts do not become whole-store baselines.

Forecast demand uses complete sales days, including zero-sales days. Batch issues, processing and waste do not inflate normal demand. Numerical coverage/dynamic safety require seven full sample days, complete recipe evidence and a calibrated opening count. Manual safety floors remain. Outstanding confirmed/paid purchases subtract received quantities; package sizing is respected in recommendations. Arrival shortage warnings use expected dates separately. No automatic purchases are placed.

## Validation and rollout

Real page verification before/after, responsive checks and recorded CI/build/deploy evidence are required. Test databases are synthetic and isolated, with retained output and scoped cleanup; no production stock is changed for tests. Activation happens only against the exact verified image and an unchanged live baseline. Existing pending counts must be completed/cancelled through the ordinary authorized workflow before activation.
