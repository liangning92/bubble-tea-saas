# Hermes native backend integration

The production runtime is the pinned upstream `APIServerAdapter` and `AIAgent`.
`native_gateway.py` supervises isolated account/audience homes and forwards the
native API. It does not implement a model loop or maintain business tool lists.
`store_backend` discovers the same registered Express routes used by the UI;
normal account ACLs, native validators, controllers and transactions execute.

The former captured runtime and per-business tool modules are removed. Old
execution requests return 410. Historical uncertain operations require receipt
reconciliation; upgrading must never replay them.

## Authority and isolation

One visible Hermes identity serves separate authenticated sessions. Profiles are
keyed by current account, audience and effective permissions. Each original SDK
home contains only that profile's memory/files/skills. No application source,
Docker socket, other profile home or human browser cookie is mounted. Native
terminal, skills, memory, browser and delegation use the upstream SDK; installed
prerequisites still determine availability. Hermes cannot edit or deploy the app.

Cross-audience handoff takes a registered operation plus approved public guide
or an already target-visible message. Parent instructions/history/attachments do
not enter the child. Shared output routes declare recipients alongside account
ACLs and check the current publication context. Native SDK completion, business
completion and independent acceptance are distinct states.

Payment, overspending and employee penalties require owner approval. Existing
paused/draft promotions remain unpublished. No automatic paid provider fallback.
The upstream cron tool catalog being present does not constitute acceptance of a
background scheduler; scheduled execution requires its own persistent authority
and delivery acceptance.

## Coordinated release

1. Verify exact-commit CI and API/admin/staff image artifacts; save live component
   baselines, commands, mounts and rollback images. Build and accept an immutable
   native image using the pinned upstream SHA and recorded adapter file hashes.
2. Drain the old gateway/worker. Preserve unknown execution receipts. Stop the
   old worker before changing runtime protocol; do not let both consumers run.
3. Configure the native supervisor's private mode-600 config with `nativeImage`
   (immutable sha256 image ID), `hermesExpectedSha`, `isolatedRoot`,
   `gatewayBearerFile`, `listenHost=127.0.0.1`, `listenPort`, `maxConcurrency`.
   Preserve the existing bearer file; do not print it or store it in Git.
4. API and worker need the same `EMPLOYEE_HERMES_*` store/agent/gateway identity,
   plus `EMPLOYEE_HERMES_BACKEND_ORIGIN` reachable from the sandbox containers.
   No trial grant, business-tool allowlist, or system-prompt hash is enrollment.
5. Switch gateway, API and worker as one coordinated release. Update affected
   admin/staff assets. Retain stopped old containers and gateway config for
   rollback. Verify protocol, image IDs, source SHA and normal logged-in UI.
6. Assign actual Hermes a safe read-only task first; verify real source/reply/run
   and operation receipts. Business changes must be performed by Hermes through
   the normal backend, not by the release operator. Do not create fake production
   orders/inventory or publish paused promotions as a test.

## Evidence

Use `with-docker-test.py` for image and disposable PostgreSQL tests. The native
API harness uses a synthetic provider with real upstream discovery/tools/API;
it spends no subscription/API credits and is not production acceptance. It must
run the immutable candidate image without editable adapter mounts.
