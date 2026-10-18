# Team communication — local implementation scope

Base: 8989b6290413af056f51b1e9b00fae2fc4f2267c, verified origin/master.
First batch: direct/group/store-member channels, text meetings, append-only messages,
per-person read positions, reliable cursor polling, private attachments, manual minutes,
explicit private-chat auditing. No model call, push, production DDL or deployment.

Use the existing store-scoped Config persistence and private employee file storage.
The reserved `team.communication.` namespace is excluded from ordinary configuration
reads, writes and sync. Transactions serialize on a channel row; client UUIDs make
message retries idempotent. Membership is checked on every read/write/download.
Removed members lose access immediately; additions can see messages from their join
sequence only. Rejoining does not restore earlier history. Audit permission is separate
from managing channels. Work chats display that authorized administrators can audit.
Minutes inherit channel visibility and never copy private discussions to a public channel.

Closing a round atomically creates a manual draft scaffold and message range. Each
edit creates a retained version with optimistic concurrency. Decisions/actions are human
input; nothing executes business tasks. Text meetings must be explicitly restarted.
Normal chats can explicitly close rounds; the next message opens a new round.

Tests: isolated PostgreSQL via with-docker-test.py; persistence, concurrent sequence
allocation, duplicate requests, revoked membership/tokens, cross-store reads/files,
read positions, manual minute versions, audit authorization, reconnect cursor recovery.
Build server/admin/staff only. Browser QA uses an isolated test API and synthetic data.

## Local verification

API integration uses a freshly initialized PostgreSQL 15.17 on a random loopback port,
a unique owned temporary directory, synthetic users, and automatic stop/removal.
Docker PostgreSQL 16 attempts were cleaned after a local Prisma connection failure;
no production volume or credentials were used. PostgreSQL 16 rollout remains untested.

Staff/admin/server builds and shared-consumer POS type check passed. Browser QA
used both built applications against the isolated API: meeting start/end, manual
minutes editing/confirmation, explicit nonmember private-chat audit reason, and
cross-client incremental messages. Service failure + page reload preserved the
IndexedDB outbox; recovery produced exactly one server message. Mobile width 390px
showed document width 386px. No AI or notification provider was called.

Messages are polled every 3 seconds while the page is visible. Closing the application
does not provide a new chat push notification in this batch. Store-scoped Config
persistence is suitable for the initial bounded team deployment (500 channels,
100 members/channel, 4000 characters/message, 30 messages/person/minute). Large
archives will need dedicated indexed tables and paginated minutes rendering.
Membership additions have no access to earlier messages or minutes; removal revokes
all channel access. Archive retains all content. No irreversible-delete endpoint exists.

Evidence: output/team-communication/http-results.json, ui-checks.json and component
build logs. Browser screenshots were emitted into the task tool record. No claim of
production page verification or deployment is made.

## Independent review follow-up

Two P2 attachment issues were reproduced and fixed before publication: legacy file
URLs now require the same channel access/audit checks, and grant lookup searches from
the membership join sequence instead of truncating at 100 records. Team-purpose
uploads are separate from existing employee-workflow evidence; existing employee file
access is preserved. Two new regression groups cover both download paths, audit log
creation, legacy metadata, ordinary file permissions, the 101st grant and revocation.
