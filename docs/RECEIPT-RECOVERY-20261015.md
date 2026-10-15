# Receipt recovery — 2026-10-15

The Windows 479 receipt audit for AEOTUL8F6M / A01 at 11:56 WIB records RECEIPT_PAINT_TIMEOUT. This failed before printer transport. Subsequent sent records do not prove physical paper delivery. Earlier 478 orders also failed at the same rendering stage; the offscreen paint replacement did not remove the compositor dependency.

## Change

- Preserve the existing receipt HTML, template blocks, fonts, paper widths, QR/barcode graphics and totals. Generate an embedded-font PDF in Chromium and rasterize it on CPU through pinned PDF.js / native canvas, without capturePage, offscreen paint events or animation frames. Bound generation and retry one fresh renderer only before transport.
- Keep RAW transport unchanged. Classify network/COM errors after a send attempt and partial copies as uncertain; never automatically resend a possibly accepted job.
- Retain exact paid receipt payloads and expose a persistent, collapsible recovery list under the existing POS toolbar. A retry prints one copy with no drawer pulse, payment or new order. Uncertain/old transport failures require the cashier to confirm no paper came out. Already received paper can be acknowledged. The PIN lock remains in place and explains how to resume.
- Record late native results after the UI deadline, and claim retries transactionally to stop competing tabs submitting the same pending job.
- Package PDF worker/font/wasm files and platform canvas binding outside ASAR; declare compiled Electron modules CommonJS independently of the web client's ESM package.
- The backend release compatibility gate compares the complete server/ Docker build context. Root desktop dependencies are outside that API context. Server input differences, ancestry, health and capability checks remain enforced.

## Validation and limitations

Local Electron validation with GPU disabled passed six long receipts (58/80 mm × Chinese/Indonesian/English), including QR and barcode, without contacting a printer. CPU PDF raster tests cover the final partial strip. Recovery tests cover concurrent retries, single-copy/no-drawer payload, late native success and uncertain delivery. Existing receipt/logo tests, POS types/build and translation checks are included in applicable verification.

UI retains all existing toolbar, product, cart, payment and lock controls. Added recovery controls wrap and the expanded list has bounded scrolling. Real desktop/tablet/phone UI checks with business data and before/after screenshots remain pending; the Mac browser currently reaches the POS login page and does not contain Windows-local receipt jobs. That browser is not evidence of Windows printing. Windows packaged-module and physical printer checks must be reported separately; no physical-print claim is made by local generation tests.

Production bases observed before preparation: Windows 479 and Web POS f91b440ebf7e1e4911eecd81c541b6a5b1796f15; API db508c35c7391a9ca14d9b6a74be572770f42cde. Recheck these before release. Only task files are included; existing data and other components are not replaced as part of receipt remediation.
