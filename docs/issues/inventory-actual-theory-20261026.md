# Actual warehouse stock and recipe comparison

Employee withdrawals reduce warehouse stock. Sales freeze theoretical recipe consumption only; sale estimates and refunds do not change physical stock after the per-store `inventory_actual_out_v2` cutover. Processing records ingredients already issued and does not deduct them again. Receipts, losses, expiry, external transfers and authorized count adjustments retain their physical effects.

The activation script requires an explicit store, emits a balance/legacy-estimate audit and never rewrites balances or historical snapshots. Existing balances need an actual warehouse count. Pending observations made under the former whole-store policy must be observed again; no pending work is cancelled automatically. New shops start with the new policy. Policy configuration is internal and cannot be changed through general settings.

New observations are version 5, warehouse scope. The latest two completed observations are the default comparison interval, isolated from old whole-store counts. The warehouse drawdown excludes known loss/expiry/transfers and is compared with frozen order recipes for that same observation window. As requested, counter/fridge leftovers are not counted. These differences are reference values and never establish waste. Count-to-book discrepancies, stock alerts, incomplete evidence and pending approvals remain actionable.

The material table shows issues, theory and difference without order numbers or repeated caveats. Batch production, recorded purposes and calculation evidence are expandable. Theoretical output uses standard recipes; missing registered output stays null. Updated recipes cannot be silently used for periods ending before their update. Columns size to content, material names flex and stay visible on small screens; numeric values use 3 decimals with explicit tiny nonzero values.

Inventory alert projections reuse live store/route grants and the existing inbox read markers. Reading a notice does not handle the alert. Resolved/handled events leave the actionable inbox; recurrence/escalation starts a new occurrence. The dashboard includes inventory exceptions alongside existing pending approvals.

Validation and release evidence: `output/inventory-actual-theory-20261026`. Verify real pages before and after release, three languages at desktop/tablet/phone widths. Preserve all inventory actions, seven stock-list columns, count comparison values and the existing first-level navigation. No test writes are made to production stock.

Historical theory can be corrected through independent immutable audit entries bound to the original snapshot hash. Daily, count-window and forecast reads share the corrected projection; reversals suppress the correction automatically. Neither source snapshots nor physical stock change. Only missing-cup cases proven against unchanged other-product recipe evidence are eligible for the one-time repair; ambiguous cases remain in the audit report.
