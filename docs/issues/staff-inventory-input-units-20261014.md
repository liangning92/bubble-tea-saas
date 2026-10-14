# Staff inventory entry units

The prior inventory entry unit fix was published only to admin. Staff count entry still had no selector, while staff movements/purchases defaulted to the original gram/millilitre ledger unit.

Staff movements, purchases and count entries now use compatible units, defaulting mass to kg and volume to L. Piece/other discrete units retain their original unit; configured packages remain available. Stock movements/purchases send inputUnit to the existing server converter. Count entry converts to the ledger unit before comparison/reason validation and saving; switching units preserves the physical amount. Switching material clears stale quantity/cost, and switching movement/purchase units clears stale per-unit cost.

Validation: staff TypeScript/build/translations, inventory unit conversion regression, scoped CI, and actual employee Web workflows after deployment. Publish staff only and preserve the deployed admin/API/POS components.
