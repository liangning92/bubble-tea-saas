# POS display, diagnostics, camera scanning and purchase receiving

The previous completion screen scheduled an unconditional five-second reset. A new order or payment could be replaced by that old reset. The display now cancels the previous timer on new order/payment/clear/completion and on unmount; preload subscriptions expose cleanup functions.

Diagnostics now probes the actual POSOffline config table with a unique temporary write/read/delete, without modifying sales or the sync queue. Server database health has a separate badge populated only from the server dependency check. Unknown server health is not shown as healthy. Neither test asserts that every order has uploaded.

Camera mode now opens a real media stream and decodes it using a bundled ZXing reader. A successful scan uses the same store-scoped lookup and confirmation path as USB/manual scanning, without automatically adding a product. Permission/device failures have visible feedback and retry; switching modes or closing releases the camera, including a late permission response. Product 404 correctly falls back to member lookup; other server failures do not.

Receiving claims only pending/approved purchase orders inside the transaction. Stock, weighted average cost, received quantities, batches, logs, product BOM costs and the received status commit together. Concurrent or repeated receipt returns conflict and cannot add stock twice. Terminal orders cannot be reopened or cancelled, and the status endpoint cannot bypass receiving. Manager requests and supplier/inventory ownership are scoped to the store. The previously unmounted purchase page is available under inventory/purchase-orders; pending actions are disabled and errors shown inline.

Unsupported message providers and missing/malformed credentials now fail instead of simulating success/costs or using a fallback credential. The implemented WhatsApp provider requires a configured credential, a successful HTTP response and a positive provider result. Provider acceptance still does not prove delivery to a recipient; no real customer messages were sent during testing.

Validation:
- Real PostgreSQL and SQLite HTTP/Prisma fixtures: concurrent/repeated receipt, concurrent different orders on one stock item, terminal status refusal, cross-store rejection, injected BOM update failure rolling back stock/status/batch/logs, successful retry, unavailable message channels producing only failed logs with zero cost.
- Real admin browser against isolated PostgreSQL: approval/receive, repeated-click lock, visible conflict, retry; existing expense/asset/reward/staff workflows.
- Real POS React/IndexedDB browser: new order survives the old completion timeout; repeated completion resets the timeout; new payment, clear and unmount cleanup; local write/read/delete failures; server failure and unknown health; actual ZXing decode of a generated video barcode; denied/missing/unsupported camera, late permission cleanup and member fallback.
- 147 stop-loss tests and 173 audited backend tests passed, along with builds/types/translations/Electron compilation.

Limits: generated camera video is a software fixture, not a physical store-camera test. Physical receipt printing and actual message delivery require device/provider evidence and are not marked passed. This change does not constitute acceptance of all 134 pages or every finding in the older operational report.
