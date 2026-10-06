# POS barcode identity handoff

Baseline 73b9abe1937820a90d223f8171ae0bbd17d7cfba; branch fix/pos-barcode-identity.

## Learn, confirm and scope

React useEffect documentation (https://react.dev/reference/react/useEffect) describes ignoring canceled/stale fetch responses. Number.isFinite documentation (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite) and integer validation distinguish an actual numeric zero from absent/non-numeric price. Use one normal product-options/cart construction path rather than a separate scanner price calculation.

Confirmed: ScanPage treats the product API response as {price}, but Product has no price column: price lives on Spec. It writes no specId, uses the product name as spec name. POSPage's scan_to_cart effect defaults missing specId to empty and unitPrice to 0 and merges by product/spec name. Barcode lookup returns just one default spec; that does not prove a multi-spec product has only one specification.

Only a versioned product/store identity crosses the scan handoff. POS refetches the same authenticated current-store active product directory used by ordinary add, checks returned product store/status/deletion/IDs/spec fields and finite nonnegative integer prices, and opens shared ordinary product options. Multi-spec products require explicit selection; isDefault does not silently select one. No old handoff/local prices, name-based merging, cached/demo price recovery or new schema. Failed/stale/cross-store lookups preserve the cart; invalid handoffs require rescan.

The current /products directory can contain storeId in its raw response, unlike the simplified /products/pos response; strict response store validation is required. No real request or database operation is used for validation: all HTTP/data boundaries are synthetic.

## Independent server risks (recorded; NOT fixed here)

- Order route requires authenticated store, active shift/payment and integer nonnegative unitPrice, but accepts productId/specId as strings. OrderService.createOrder computes channel-adjusted totals from the client item.unitPrice, then persists client product/spec identities and names. No pre-transaction query verifies active/not-deleted product in that store, spec belonging to product or canonical Spec.price. FK existence is not that business validation. This remains an independent direct-request/price-tampering risk; a frontend barcode fix cannot close it. No pricing/points/tax/refund/inventory rewrite is included.
- General GET /products honors a query storeId rather than getStoreId, and GET /products/:id looks up globally. A separate server authorization fix is needed; this batch requests only its authenticated current store and rejects cross-store directory entries. Do not switch to the global single-product route as a shortcut.
- General getProducts may recalculate/persist BOM cost when cost is zero; this is pre-existing directory behavior, not new barcode accounting logic. No production API/database is invoked in this task.
- /products/pos and ordinary directory have differing addon override handling. Reuse the ordinary directory/normal options path to avoid introducing a second price interpretation; do not fix addon pricing algorithms here.

## Planned focused verification

Single/multiple specs; explicit zero versus missing/string/negative/nonfinite price; same name/different IDs; repeated scan; addon/sugar/ice variants; authentic current-store scope and old/cross-store handoffs; late/canceled requests; failure keeps existing cart; ordinary add versus scan checkout item payload equivalence. Real React/IndexedDB with synthetic HTTP and printer bridges, no production or physical hardware.

The /scan route formerly unmounted a POSPage with component-local cart state; the toolbar's existing scan panel was only a placeholder. Reuse ScanPage inside that panel and render the same POSPage type for /scan and /pos so scan navigation preserves the current cart. Only identity is handed off; no new price/draft persistence is introduced. Scanner keystrokes cannot activate ordinary product-number shortcuts. Route transition/cart preservation requires an actual React test.

## Implemented

- ScanPage no longer displays or hands off a nonexistent top-level price. Both callback and legacy localStorage handoff contain only version/store/product identity. Returned product/store must match the active user before handoff.
- POS reads a new authenticated active-store directory response and verifies exact store/product/spec/addon identities and numeric prices. A failed read, offline state, absent/invalid prices, inactive/deleted product or cross-store/old unversioned handoff never recovers a cached/demo price and never mutates the cart. Zero is valid.
- Barcode and normal product click/number shortcut share openProductOptions and handleAddToCartWithAddons. Multi-spec products require explicit selection even if a spec isDefault. The shared ID/spec/sugar/ice/addon merge rule is reused and now also requires equal unit/addon quoted price and addon quantity; scanned same-name products are distinct by ID. Different quotes stay in separate rows; identical quotes still merge quantity. No second pricing algorithm.
- The current POS component stays mounted for the toolbar scanner and /pos↔/scan route transitions. Escape/cancel preserves the existing cart. Scanner typing does not invoke POS product shortcuts. No cart price cache or new persistence protocol was added.
- Search responses in ScanPage are guarded by request version/auth identity; canceled/edited/new searches ignore older results and older finally updates. POS current-directory requests also use cancellation, current auth/token, exact handoff and immediate intent version guards. A newer same-product scan invalidates old responses before React cleanup.

## Validation and limits

60 synthetic tests pass, including actual ScanPage actions, actual POS handoff effect and shared options handler. 17 real React/Chromium scenarios pass; existing 5 payment/config, 7 shift-evidence and 10 printer scenarios also pass. POS types, all-client i18n checks and POS build pass. All HTTP, users, orders, tokens and devices in tests are synthetic. Multi-spec chooser visually inspected; /pos→/scan→/pos tested with existing cart; ordinary and scanner checkout item payloads matched for the same spec/addons/quantity.

The server direct-request active-product/spec ownership/canonical-price and general product-read authorization risks above remain open. This batch does not certify cached/offline barcode lookup: it refuses a new scan when no fresh directory can be read, preserving the cart for recovery. Physical USB barcode hardware and Windows output not tested. Existing member lookup/checkout arithmetic/replay/session ledger boundaries are unchanged. No server source, schema, manifests/locks, workflow, production data/config or credentials modified; no push, packaging, merge, deployment or restart.

## Review P2: ordinary selection supersedes pending scan

Review of b974e099 identified a pending scan A catalog response reopening A after the operator had selected ordinary product B. Shared openProductOptions now synchronously advances the scan intent and removes the old handoff before validating/opening any product. Clicks and numeric shortcuts share this boundary; accepted scan responses still use the same options flow. Delayed real-page tests select B, choose Large plus boba and quantity two, release A, and assert B remains selected and checkout contains only B with unchanged options/quote/quantity. The unit test also asserts invalid ordinary selections discard the prior scan intent/handoff. Full 60 unit and 17 barcode page scenarios, POS types and build pass after this fix. No push/deploy.
