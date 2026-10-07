# 024 — Receipt template and Logo printing

The selected web receipt template disabled the header and store information, but the native POS renderer could still add a store title when its Logo failed. Pickup numbers and narrow-paper totals also overrode configured styles. The renderer returned immediately while downloading a remote Logo, so the first receipt could omit it.

The configured production Logo `/uploads/receipts/c89235d5-34c4-40af-b266-5e218270d4a6.png` returns HTTP 404 and is absent from the current upload volume, checked paired media backups, retained upload volumes and local project copies. The user confirmed it was uploaded through the web administration. Its original bytes cannot be recreated from its URL. The original image needs to be uploaded again; no substitute image has been inserted.

## Changes

- Restore Logo upload/removal in POS settings. Resolve relative media against the API origin, show unavailable-image feedback, and atomically save receipt and store Logo configuration without discarding other store information.
- Save uploads under the same `UPLOADS_PATH` used by the media server, including embedded desktop deployments.
- Respect the template Logo source before the store image, await the first remote image within one bounded download deadline, cache successful downloads, and reject oversized, malformed or unavailable downloads.
- Clear obsolete renderer image caches and ignore stale image/template responses.
- Respect pickup-number style, item alignment and large totals on 58 mm paper. Date/time occupy separate template rows. Preserve explicitly empty templates and disabled headers.
- Return an explicit missing-Logo warning after successful printing and show it on the POS. Include Logo settings in hardware test jobs.

## Validation

- Real PostgreSQL and SQLite HTTP routes: multipart receipt upload, file persisted under the configured upload root, identical served image bytes, plus the 115-request workflow persistence suite for each provider.
- Built administration in Chromium: upload through the restored control, save, reload, visible decoded image, and matching persisted receipt/store Logo values. Existing finance, asset, reward and staff-points workflows also pass; 20 staff pages have no page/API errors.
- Native renderer tests exercise first remote download, template override, bitmap alignment, cache reuse, missing image, redirects, malformed redirect, size/deadline limits, template styles and empty blocks.
- Electron's actual `nativeImage` decoder produced nonempty 240 × 240 ESC/POS raster bytes from a synthetic PNG; the disabled header remained absent.

These are synthetic database and printer-boundary tests. A physical store printer was not available, and the missing original Logo remains dependent on re-uploading the original image.
