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

## Follow-up public-route audit
Independent review reproduced another raw Order list in GET /api/channels/:id/orders. Systematic source checks of direct Prisma Order queries, included Order relations and OrderService route consumers found the same issue in GET /api/members/:id nested orders; both now reuse publicOrder. Report/dashboard routes map explicit public fields or aggregate counts/amounts; posCash/staffManagement/marketing use Orders only for aggregates; refund approval's raw relation remains internal. No other public raw Order boundary was found in this audit. Existing channel/member authorization and financial behavior are unchanged. The pre-existing BOM refund Number×BigInt failure remains a separate backlog item, without algorithm changes here.

Follow-up HTTP fixtures mount the actual channel and member routers and assert cashier-visible history (including NULL legacy metadata), amounts/items, absence of both private fields, unchanged stored receipt and 401 without authorization on both providers. Results: SQLite and PostgreSQL actual HTTP runs passed all eight groups, including cashier channel/member history projection, original-receipt replay, additive migration, NULL history, sales report stability and once-only side effects. 110 Node regressions and server typecheck passed. Evidence: `/tmp/pos-receipt-http-0wfUm1/evidence.json`, `/tmp/pos-receipt-http-x5UIGZ/evidence.json`; logs: `/tmp/order-public-projection-channels-sqlite.log`, `/tmp/order-public-projection-channels-postgresql.log`, `/tmp/order-public-projection-channels-regression.log`. Server build also checked before commit.
