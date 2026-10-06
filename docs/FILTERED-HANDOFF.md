# Filtered source handoff

Local review candidate only; no push or deployment. Comparison baseline: 0eff20cbdc3427f527e7b22dd40f4e1ff56be629. Training source: f0dbb295088bbf146db097d08e45b0f06b83913f.

Includes original training pages, shared library/editor, protected video handling, API Prisma import and POS offline-save stoploss. Preserves the comparison baseline desktop startup fixes and all workflows. Generated output, historical deployment records, logs, screenshots, temporary operational scripts and environment-bound acceptance harnesses are omitted.

This exported combination needs full build and integration verification before release. Historical training acceptance does not certify the new baseline combination. Portable content and POS stoploss tests are retained. Video/editor HTTP/DB/browser acceptance requires fresh isolated fixtures; no production credentials or database are part of this export.

Audit source remains separate and deferred: inventory watermark/sync permissions and refund/report changes share files and schema. Refund financial P2 remains open in finance/export, shift handover and performance/member consumers. No completed audit branch is asserted.

## Verification of filtered candidate 757bcb2

Server, Admin and Staff production builds passed against this filtered combination using existing dependencies in a separate validation checkout. Admin has a bundle size warning. POS TypeScript stage passed, but Vite failed to resolve bcryptjs from the validation checkout. The existing original project has this dependency; no dependency installation or adjustment was performed.

A fresh synthetic video/editor integration harness targeted this candidate source but stopped before acceptance when the sandbox refused its listening socket (listen EPERM). That restriction was not retried or bypassed. These video/editor groups have not passed for this combination. Content validation and five POS offline stoploss unit tests passed. Historical source-branch tests do not certify this combination.

This branch is an incomplete integration handoff, not release acceptance. Do not merge, deploy, restart services or run production database changes from this handoff. Audit source and unresolved refund financial P2 remain separate and undelivered.
