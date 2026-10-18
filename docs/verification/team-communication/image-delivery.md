# Image attachment delivery verification

This change fixes two independently reproduced attachment failures:

- The staff nginx proxy rejected a 1.2 MB request with HTTP 413 while the UI and API allow each attachment up to 8 MiB. The API location now permits a 9 MiB multipart request; the API still limits each file to 8 MiB.
- A committed upload whose response was lost generated a second private file on retry. Uploads now use the persisted message UUID plus file slot, scoped to the current store and staff owner. Concurrent/repeated requests reuse one private file. Reusing that key with different bytes fails with 409. Existing uploads without a request key remain compatible.

No database migration, model call, employee message, notification subscription, or permission change is part of this repair.

## Independently exercised image paths

The native browser file chooser was blocked by the local extension's file URL permission. That permission was not changed. A local fixture therefore generated a synthetic 68-byte PNG as a native File and placed it in the real shared outbox through savePending. This verifies storage and the actual client upload/send/retry path; it does not verify physical phone file picking.

- Native IndexedDB retained File/Blob type, file name, MIME, length and SHA256 across reload while uploads returned 503.
- The real page displayed a pending attachment, an upload error and a retry control.
- Signing out of synthetic Alice and into Bob did not display or send Alice's pending image. Signing back into Alice resumed its own queue.
- Service recovery produced one uploaded image and one message with matching source bytes.
- An uploaded image checkpoint survived reload while message submission returned 503. Retry reused its existing file ID.
- Before repair, a lost upload response produced two files for one message. After repair, two accepted HTTP requests reused one private file and produced one message with matching bytes.
- Channel members downloaded the attachment with private/no-store headers. A same-store nonmember received 403; another store received 404. Existing legacy-download and audit-reason tests also passed.
- The 17 related HTTP groups passed on isolated PostgreSQL 15.17 and 16.15, including concurrent upload retries, response loss, payload conflicts, owner/store isolation, and an image larger than 1 MiB.
- Published staff nginx baseline versus proposed configuration was tested against a separate mock API on a labelled isolated Docker network. Baseline: 64 KiB accepted, 1.2 MB rejected with 413. Proposed: 1.2 MB and 8 MiB plus multipart allowance accepted, 10 MiB rejected with 413.

SHA256 of the synthetic PNG: `6b1048f8a6d40bac0b2954c18fefa40c4ea7a96120fc2e54b7317c0e43c2bbec`.
Disposable databases, uploaded files, labelled containers/networks/volumes and browser fixture tabs are cleaned after testing. Logs and machine evidence stay in task output, without production credentials or photos.

## Phone acceptance still required

1. While online, open the existing private test conversation and choose a nonsensitive JPEG or PNG below 8 MiB. Tap Kirim. A successful attachment appears as Lampiran 1; this release uses a private download control rather than an inline photo preview.
2. For offline testing, first open that conversation online, then disconnect Wi-Fi and mobile data. Select the image and tap Kirim before leaving; selection alone is an in-memory draft. Confirm the pending attachment indicator before reconnecting.
3. Keep the app page open after reconnecting. A previous HTTP 413 was classified as a stopped failure; after loading the repair, use Coba lagi for that retained item. Do not create a new duplicate message just to retry.
4. Have the other test participant check the attachment and count while retaining the clearly labelled test history.

Physical phone file selection, native offline/reload behavior, and the user's actual image are not yet accepted by the isolated test. HEIC and video are not supported. Browser storage failure is reported as OUTBOX_STORAGE_FAILED and must not be described as a saved queue. Team message background/lock-screen push and AI image analysis are not implemented by this repair.
