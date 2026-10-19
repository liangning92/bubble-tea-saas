# Employee roles and management access

The active V2 employee assignment determines the role shown in staff profiles, the staff list, and permission settings. A job title remains descriptive and does not appoint a manager. Existing `admin` accounts retain administrator access; this repository has no separate owner identity field.

Only administrators and employees explicitly assigned the manager role may enter the admin app. The backend independently checks every declared management route against the current assignment, including requests from existing sessions and callers supplying arbitrary client headers. Reviewed POS and employee work routes retain their existing permission, field, membership and store checks. Client headers do not grant management access.

| Capability | Administrator | Assigned manager | Other employees |
| --- | --- | --- | --- |
| Admin app and management routes | Existing access | Assigned store | Denied |
| Hygiene areas, templates, tasks, review | Existing access | Assigned store | Employee app, own tasks |
| Product management, BOM recipes/costs and price writes | Existing access, selected resource store | Denied | Denied |
| POS product catalog and checkout work | Existing access | Existing grants | Existing grants |
| Prepared refund approval | Existing verification | Existing verification, assigned store | Apply only |
| Unprepared refund stock reversal | Existing admin verification | Existing admin restriction retained | Denied |
| Scheduling, agreed shift swaps, leave review | Existing access | Assigned store | Own employee workflows |
| Stock-in/out and inventory count review | Existing access | Assigned store | Existing APP input/submit, no review |
| Financial business logic | Unchanged | No new grants | No new grants |

The account-role editor now works when V2 is active. An explicit role change updates its policy assignment and revision in the same serializable transaction, invalidates the old user token, and records the real administrator's User ID. It refuses self-demotion and removal of the last active administrator. Existing payroll participation is preserved independently of the new role. A role update does not appoint a real employee or change production data until an administrator explicitly submits it.

Hygiene area/template writes accept a strict runtime schema at both the HTTP and service boundaries. Services construct database fields explicitly; relation writes, scalar update operators, IDs, store changes and unknown fields are rejected before any write. Template checklist replacement is atomic. Built-in preset standards use the current `standardDuring` field. Hygiene resource IDs, area managers and template/task assignees are checked against the assigned store. When a manager performs a colleague's task, the assignee stays intact while completion and activity records identify the manager who acted. The service rechecks the current database identity and assignment before allowing this exception.

All BOM routes require administrator access. Product and inventory lookups also require an explicit selected store, including direct service calls and linked ingredients. POS catalog reads remain separate. Employee-client login and profile responses use the existing employee authentication boundary and do not load management policy; malformed management policy still fails closed on management requests.

## Validation

Run the PostgreSQL fixture through the repository cleanup wrapper:

```sh
python3 scripts/with-docker-test.py -- node tests/stoploss/staff-management-boundary-http-check.cjs
```

The test creates one labeled temporary PostgreSQL container, an explicitly labeled volume, a random loopback port, and synthetic users and business records. It installs the repository's real inventory ledger triggers. No production connection, volume, account or approval is used. The wrapper removes the batch's resources on completion or failure.

Assertions also exercise the existing employee attachment/private-file multipart upload and private download authentication. Assertions cover login admission, misleading job titles, current and forged client/role claims, POS catalog/version/channel/activity reads, preserved durable receipt/offline route admission, employee work, role display, hygiene management and real actor attribution, schedule/swap/leave approvals, stock-in/out and count submission/review, cross-store denials, prepared refund verification, administrator-only unprepared refunds and exact original stock restoration/idempotency, session changes, V2 account editing, payroll identity preservation and self/last-admin protection.

The same fixture invokes `staff-management-review-regression.cjs`: negative hygiene writes are compared against database snapshots, normal full forms/copies/presets are exercised, V2 and legacy managers are denied every BOM read, administrators require matching resource store selection, and malformed JSON or malformed policy shapes do not prevent employee login/profile/dashboard access. Password checks and management/client-spoofing rejection remain enforced.

No schema migration or automatic production policy activation is included. Updating any real assignment, administrator identity, or explicit payroll-participation flag requires a separately reviewed exact account list. Production verification and deployment are outside this PR; the task deliberately does not deploy.
