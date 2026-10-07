# Order public receipt projection — 015

## Learn
Express serializes supplied response objects; public shape must be selected before serialization: https://expressjs.com/en/4x/api/. Existing publicOrder removes internal receipt/fingerprint without mutating the stored order or historical amounts.

## Evidence
Review found status update returned a raw Order and refund request list included raw nested Order. Read-only follow-up found KDS and refund routes also returned raw Order. This can expose the stored first response and request fingerprint even though ordinary order list/detail are projected.

## Fix
Reuse the same publicOrder projection at every Order response boundary in order router, including nested refund requests and KDS. Do not change authorization, financial rules, schema or stored metadata.

## Validation
Actual HTTP tests cover manager status update, nested refund list, KDS and detail/list, NULL history, cashier rejection, and unchanged private database receipt. Repeat with both SQLite and PostgreSQL synthetic fixtures.

Results: 110 Node regression cases passed from repository root; server TypeScript check and build passed. Actual SQLite and PostgreSQL HTTP fixtures passed all seven groups, including newly added public projection and role checks. Synthetic evidence: `/tmp/pos-receipt-http-uNB5St/evidence.json`, `/tmp/pos-receipt-http-evRwqP/evidence.json`. Logs: `/tmp/order-public-projection-sqlite.log`, `/tmp/order-public-projection-postgresql.log`, `/tmp/order-public-projection-regression-root.log`. Initial regression invocation from server cwd failed fixture path resolution; rerun from required repository root passed. No real database access, push or deployment.
