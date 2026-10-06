# POS printer routing — bounded repair

Baseline: 7aa6cfb3e27178c2c3f946888f6d191622c7d387; branch fix/pos-printer-routing.

## Learn and confirm

Electron documentation https://www.electronjs.org/docs/latest/api/web-contents explains empty deviceName with silent printing selects the OS default, and print callbacks report failure. Therefore an empty target must not represent a safe purpose-specific printer. Installed/spooled does not prove a physical receipt printed.

Actual paths: POSPage getPrinterName falls back to disabled same-purpose records, legacy/local names and empty system default. Receipt, label, cash drawer, configuration-triggered tests and manual tests use this helper. Kitchen allows enabled records without a named target. main.ts resolvePrinterName uses fuzzy names, default/thermal/first installed printer; network receipt failure falls back to local. Current OrderHistoryPage has no reprint action; do not add a new order or mutate history to retry printing.

## Scope and intended behavior

A shared renderer resolver selects only enabled devices for the requested purpose. Explicit tests must select an enabled configured matching-purpose device; unassigned detected devices must first be saved as that purpose. Automatic default is the first enabled same-purpose configured device, never another purpose or OS default. Invalid selected/default target does not fall through to another device. An explicitly present printer list is authoritative, even empty/all-disabled; only absent lists may use a named legacy receipt configuration. No localStorage fallback after authoritative configuration. No configuration means no bridge dispatch and a translated configure-printer warning.

Named local bridge targets match installed names exactly (case-insensitive), never fuzzy/default. Direct exact COM/UNC targets are retained; they are not proof of availability. Network targets remain network targets even on error. Driver/network failures surface, never become payment/API failure or duplicate offline orders. Receipt timeouts are uncertain delivery: check paper before manual retry. Transport/protocol retries, if any, keep the same device.

No schema, production configuration, actual devices, packaging/deployment or order/refund arithmetic changes. Physical Windows printing remains unverified.

## Implemented and validation

- Removed forced re-enabling of named receipt devices during configuration load. Server []/disabled/malformed lists are authoritative and replace stale cached bindings; malformed cached rows cannot create default routes.
- Shared selectPrinter now serves receipt, kitchen, labels, manual drawer, manual tests, Admin-triggered tests and the guarded shift report. Optional kitchen/label outputs explicitly unconfigured/disabled are skipped. Enabled invalid outputs produce a warning. Manual tests reject detected devices until configured for that purpose.
- Electron checks exact installed local names; inventory failure/timeout is refusal, not a default. Receipt/network drawer failures stop without local rerouting. Existing same-device protocol attempts remain; they cannot prove physical delivery. Automatic drawer fallback after uncertain receipt failure was removed, avoiding an additional pulse or changing destinations. Named COM/UNC and configured network targets remain supported.
- Printing failure/timeout displays an order-status-preserving warning. Receipt bridge rejection stays inside printing; online success clears the cart and remains paid, while an offline committed order stays pending. Neither creates another order. No existing historical reprint UI exists in this baseline; none was invented. Manual retry through the print IPC remains independent of order creation and retains the caller's order number.

Verification is entirely synthetic: actual renderer/IndexedDB and actual IPC handler code with fake transport and inventory. No real backend, DB, staff data, logs or printers. Three locales synchronized. API/order calculations and schemas unchanged. Test evidence separately lists commands/results. New renderer and Electron bridge should be delivered together; old clients with empty implicit targets will receive a refusal.
