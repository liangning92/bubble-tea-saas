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
Native Windows timings and original-version results must be collected by the
build workflow before this change can be called ready for release.

The first candidate was rejected: prepared install/restart took 139 seconds.
The build now prunes server development dependencies before packaging, while
retaining generated Prisma runtime clients. Restart verification additionally
requires the local API readiness endpoint. The 90 second gate is unchanged.
