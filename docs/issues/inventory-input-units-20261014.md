# Inventory entry units

Inventory list receipts, manual withdrawals, stock-log receipts/losses and count entry now select compatible input units. Mass defaults to kg (kg/g), volume to L (L/ml); pieces and other discrete units retain their ledger unit. Configured packages remain available for stock movements. Existing ledger units, recipes and cost units remain unchanged.

Stock movements send inputUnit to the existing server conversion. Stock-out preview and maximum quantity use the conversion factor. Receipt cost is entered per selected input unit; changing units clears the old cost. Count entries convert to the original ledger unit before saving, and switching units preserves the entered physical amount.

Checks: admin TypeScript and build, existing translation validation, inventory unit conversions and count workspace regressions. Real browser verification and final release run IDs are recorded under output/inventory-units-20261014 in the parent workspace.
