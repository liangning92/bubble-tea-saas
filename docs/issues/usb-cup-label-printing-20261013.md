# USB cup label discovery and printing

## Verified failure

The Windows terminal runs BTPS 2026.10.449. Windows has a healthy `Label Printer(4inch)` queue on USB002 and a separate POS-58 receipt queue on USB001. The enabled label configuration had an empty printerName. The corresponding backend store configuration was corrected to bind that exact label queue; receipt and kitchen settings were preserved. The terminal was at the login page, so receiving the new backend configuration and printing a real order remain unverified.

The label driver advertises 100×150 mm at 203 dpi. The application has no saved label dimensions and defaults to 40×30 mm with a 2 mm gap. Driver defaults do not establish the size of paper physically loaded or establish TSPL compatibility. Do not change paper dimensions based on that default alone.

## Source changes

- Startup discovery uses the preload's `listPrinters` interface, with refresh on window focus and every 30 seconds. Manual and automatic discovery share one normalizer. Successful empty inventories can clear stale backend discovery lists; discovery failures do not clear them.
- Windows discovery waits for all bounded probes. PowerShell scalar JSON is parsed as a queue name without JSON quotes. Only spool queue names and direct COM device IDs are selectable, rather than unprintable USB PnP friendly names.
- Labels are submitted once after order acceptance before awaiting receipt output, so a stalled receipt cannot block cup labels. Each output retains its explicitly configured purpose and device.
- Cup label name, size, sugar and ice have separate lines. Layout respects configured height at 203 dpi; ASCII uses a built-in font, Chinese still requires the printer's existing TSS24.BF2 font. Long lines are marked with `~` when shortened to fit. Control characters/quotes are sanitized, and a zero paper gap is preserved.
- Label transport errors retain their diagnostic detail. No automatic retry is added after uncertain delivery.

## Validation

POS renderer and Electron TypeScript checks (`--noEmit`) passed. Thirty unit/bridge tests passed. Browser scenarios verified enabled label output and receipt timeout, including name/size/sugar/ice payload and double-click prevention; existing disabled/empty/unconfigured/offline receipt scenarios also passed. No official build or release was run.

## Subscription product direction (proposal)

The cashier interface only takes orders and payments. Printer setup belongs to a store administrator's onboarding and device management page. The existing Electron application executes local USB jobs; the cloud backend distributes configuration, rather than accessing USB itself.

Onboarding should report the installed queues and ask an administrator to map receipt, kitchen and cup label roles once. Save that mapping per terminal, including protocol, paper size and quantity policy, and verify each purpose with a test. Do not infer a printer's purpose merely from its name or use an OS default. Supported hardware bundles can provide validated driver/protocol/paper presets.

After order acceptance, produce separate receipt/kitchen jobs and one label per cup. A future durable job queue should use order/purpose/cup identifiers, retain uncertain delivery status, and allow explicit retry or reprint without creating a second sale. The admin page should show terminal heartbeat, last detection, configured target and actionable driver/queue failures. This broader per-terminal queue and onboarding work is not implemented by this bug fix.
