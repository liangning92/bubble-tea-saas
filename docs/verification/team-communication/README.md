# Team communication local verification

Verified only with synthetic accounts and an owned temporary PostgreSQL 15.17.
Production PostgreSQL 16, real phones, push notifications, and rollout were not tested.
No production changes or model calls were made.

## Reproduce

Run component builds before the integration fixture (it loads server/dist):

```sh
npm run build:server
npm run build:admin
npm run build:staff
python3 scripts/with-docker-test.py -- python3 scripts/test-team-communication.py
```

The fixture requires local initdb/pg_ctl/createdb, opens only a random loopback port,
and removes its own temporary database and uploads on exit. It never consumes an
existing DATABASE_URL. The wrapper checks cleanup of its labelled test batch.
For browser interaction set TEAM_BROWSER=1 and type `stop` in its terminal to finish.
UI account credentials are synthetic fixture constants, not production credentials.

See http-results.json for integration coverage and ui-checks.json for observed UI
checks and limits. Full logs remain in output/team-communication. Screenshots were
emitted into this task’s browser tool record; no local screenshot export is claimed.

Visibility policy: explicit same-store membership; newly added members see only
messages from their join sequence, removed members lose access, private minutes
inherit the same scope. Only separately authorized audit actors can view nonmember
work conversations, with an obligatory reason and a recorded audit event.

Delivery uses 3-second cursor polling while visible, persistent client request UUIDs,
and a per-account IndexedDB outbox. Background/closed-app notifications are out of
scope. Human minutes retain source ranges and versions; action items do not execute
other business workflows. No model configuration, AI summary, voice, or video was added.

Independent review fixes: chat uploads use an explicit team purpose and cannot be
reused as ordinary employee evidence. Both download routes apply channel membership,
join sequence, audit permission/reason and audit logging. Existing employee files
retain their previous owner/admin access. Historical unmarked chat grants are also
recognized. Grant lookup does not truncate after 100 uses. All 16 HTTP groups passed
on an owned PostgreSQL 15.17 instance after these fixes.
