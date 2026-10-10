# Windows upgrade preflight and release evidence

The 384 installer rejected a valid staged record left by another installer
(`STAGED_INSTALLER_MISMATCH`). Preparation must select by installer SHA512:
a matching record receives all existing strict integrity checks; an obsolete
record is preserved and the installer creates a new verified recovery backup.
Malformed pointers and corrupted matching backups still block replacement.

Windows build validation now exercises the unchanged public 295, 372 and 384
payloads through their original preload updater IPC and a local candidate feed.
372 starts with an obsolete staged record, reproducing the store failure.
384 must finish background preparation and reuse that backup during installation.
The native NSIS harness additionally tests obsolete records directly and verifies
retained backup bytes, historical rows, installed version and restart profile.
All fixtures are runner-owned; this does not operate the store computer.

Publication requires all evidence from the exact build/source, including the
pinned historical installer hashes and successful original updater downloads.
The prepared native and 384 online paths must finish installation and restart
within 90 seconds on the Windows runner. This is a release rejection threshold,
not a promise for every store computer. Legacy 372 has no background helper;
its first bridge upgrade still requires a fresh backup during installation.
No verified backup or integrity check is bypassed to reduce downtime.

Local checks: 21 helper tests, 4 preflight tests and 224 JavaScript checks pass.
Native Windows verification run 38049563798 passed for source
d83d99cc9a523925574d9c793d1b038c5dfeda7e and installer 2026.10.392:
prepared install/restart 53.343 seconds; authentic 384 online upgrade 63.078
seconds; legacy 372 90.078 seconds; legacy 295 104.984 seconds. All ten native
cases passed, including preserved historical data, obsolete preparation,
healthy local API restart and normal exit. Legacy timings are recorded without
applying the prepared-upgrade threshold to their initial bridge installation.

The first candidate was rejected: prepared install/restart took 139 seconds.
The build now prunes server development dependencies before packaging, while
retaining generated Prisma runtime clients. Restart verification additionally
requires the local API readiness endpoint. The 90 second gate is unchanged.
Type declarations and source maps are also excluded from the shipped runtime
payload; generated Prisma engines and schemas remain included. All 17 local
barcode browser cases pass after waiting for the repriced quote before exact cash.

Desktop-only publication checks the live backend health/capabilities and either
the exact source SHA or byte-identical Git trees for the complete `server` Docker
context, `shared`, and root dependency manifests. The deployed backend must be
an ancestor of the verified desktop source. Changed or missing inputs block
publication until backend deployment; an unchanged API does not need a restart.
Publication still uses the immutable installer from the exact successful native
verification run, rather than rebuilding it after validation.
