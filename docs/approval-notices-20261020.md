# Approval awareness (isolated implementation, no deployment)

Base: `ceb25d4aa590b716822d6bacae8b92797953fe70`.

## Read-only contracts

`projectApprovalAwareness(db, {id, storeId, employeeApp?, issuedAtMs?})` returns `{id,event,kind,domain,objectId,status,title,url,adminUrl,pending,createdAt}[]`. Caller-supplied role, staffId and permission objects never grant access. The service reloads User, active Staff and the active V2 policy or validated legacy binding from the supplied DB. Every bound user, including admin, remains in their assigned store. A genuinely unbound admin can use an already authenticated current-store context; the inbox caller must supply that context, not accept a client override. Employee-app mode only exposes personal nodes/results. Management approvals use the native route declaration, `canUseManagementRoute`, and the actual action capability/self-refund helpers. It never executes an approval, changes business state, creates a user, creates push keys or sends push.

Every currently pending row is considered, including old requests. There is no latest-100 cutoff. Pending is independent of reminder `read` or delivery status. Historical results remain available in the projection. GET callers can compare `createdAt` with the persisted baseline to default historical results to read.

`collectApprovalNotices(db,storeId)` can receive PrismaClient or a transaction. It creates one `employee.workspace.approval.notice.baseline={at}` on first collection; current pending nodes may notify immediately, results older than baseline do not produce new reminders. It writes existing `employee.workspace.reminder.<staffId>.<id>` records through `writeWork(...,db)`, with `userId`, `businessStatus`, `read:false` and transport `status:'pending'`. Records already present are not reset or duplicated. An owner without Staff can use the projection and gets no fabricated Staff/push recipient.

`approvalNoticeRelevant(db,storeId,reminder,staffId?)` rechecks user/staff/store identity, active status, current capability, business node and event version before inbox exposure or delivery. The worker and inbox integration must call this helper; this change does not alter those existing modules.

Event: `approval-notice:<domain>:<objectId>:<kind>:sha256(version)`; version joins status, peer/manager stage, lifecycle timestamp and expiry. ID is `sha256(userId + ':' + event)`, identical for projection and persistence, regardless of whether collection has run. `status` in the projection is business state; persisted `status` remains the delivery state, with business state in `businessStatus`.

StaffActionApproval lacks updatedAt/rejectedAt. Its native service's financeAuditLog timestamp supplies authorize/reject result time; only entityId and createdAt are read, never the monetary payload/audit body. Missing legacy audit falls back to the original request creation time, conservatively avoiding an old-result push.

## Actual authorization/node mapping

| Domain | Current node | Native gate |
| --- | --- | --- |
| staffActionApproval | pending and unexpired | personal transport route plus requireApprovalCapability(action,true,db), fresh applicant capability, blocksSelfApproval; refund target still pending or balance member still exists |
| refundRequest | pending | orders.refund.approve route; native V2 orders.refund + approvals.approve; blocksSelfApproval (native real-admin self-refund exception retained) |
| leave | pending | attendance.write |
| overtimeRequest | pending | attendance.write |
| attendanceCorrection | pending | attendance.write |
| reimbursement | pending | finance.write |
| shiftSwap | pending, target unconfirmed | only targetStaffId through personal.schedule confirmation route |
| shiftSwap | pending, target confirmed | schedules.write through native management route |
| hygiene | pending_approval | hygiene.write |
| inventoryCount | pending_review | inventory.count through complete route |
| profile / appeal | pending | ownerOnly declaration plus the route's real-admin requirement |

Native routes that permit a manager processing their own ordinary request retain that behavior. No new business self-approval prohibition is introduced. Refund/action self-approval restrictions use the existing helper. The base has no packaging reviewer assignment fields; no administrator wildcard is invented for a future packaging workflow.

Result visibility is restricted to the actual applicant or actual shift-swap counterpart, hygiene assignee/completer, or recorded inventory countedBy participant, and their native readable personal endpoint. InventoryCount has no creator/submitter field: unknown submitters cannot be fabricated; only recorded countedBy identities can receive results. Current pending counts remain real even for participants because native completion has no self-approval restriction.

Reward redemption has fulfill/cancel rather than an approval endpoint; purchase pending is receiving work. Cash warning review is not added to approvals. These are deliberately outside this approval projection.

## Legacy overlap for root integration

Replace new production of, and suppress old undelivered duplicates for:

- `hygiene-review:*` with hygiene result;
- `review:*` with profile/appeal result;
- `leave-review:*`, `reimbursement-review:*`, `overtimeRequest-review:*`, `attendanceCorrection-review:*` with matching result;
- `shiftSwap-review:*` and `swap-result:*` with shiftSwap result;
- `swap-confirm:*` with shiftSwap peer request.

Preserve `swap-agreed:*` (intermediate progress to the applicant is not a separate approval/result here), `shift:*`, `hygiene-assigned:*`, `hygiene-due:*` and training reminders.

## Exact object destinations

Object URLs use `noticeObject=<objectId>` for root's highlight/scroll integration. Inventory retains its existing `countId` query too. `url` always targets the employee site: management-only pending work opens `/inbox?notice=<inboxId>`; a personal result or peer confirmation opens its real employee page. Refund results and hygiene completer results that cannot appear in the assigned personal list use the same root-owned generic inbox card. `adminUrl` uses the actual management destination only when the fresh management identity can use its native read route; otherwise it falls back to the generic inbox card. Both fields persist with the reminder; push uses only `url`, admin UI uses `adminUrl`. Neither URL grants execution access.

| Domain | Management destination | Employee destination |
| --- | --- | --- |
| staffActionApproval | /approvals | /approvals |
| refundRequest | /finance/orders?tab=refunds | /inbox?notice=ID |
| leave | /staff/attendance/leave | /leave |
| overtimeRequest | /staff/attendance/overtime | /overtime |
| attendanceCorrection | /staff/attendance/correction | /attendance/correction |
| shiftSwap | /staff/attendance/shift-swap | /shift-swap |
| reimbursement | /staff/salary/reimbursement | /reimbursement |
| hygiene | /hygiene/today | /hygiene |
| inventoryCount | /inventory/count?countId=ID | /inventory/count?countId=ID |
| profile | /staff/attendance/workspace | /profile/documents |
| appeal | /staff/attendance/workspace | /attendance/appeals |

The separate UI commit adds object markers to the ordinary admin/staff lists and profile/appeal lists, clears active status filters when opening a linked object, and returns employee leave to its history tab. Those native lists have no pagination or implicit month cutoff. Management StaffApprovalPage supplements its latest-100 list through the existing independently authorized `GET /staff-permissions/approvals/:id` endpoint, clears stale rows on failure and opens the all-status view. Management refund links load all states so a linked completed result is present. Hygiene management/employee links include the actual task date and the pages load that date, including old tasks. Management inventory retains countId detail loading and marks its selected detail; employee inventory already loads all counts and now marks each count. Root's global query locator owns highlight/scroll.

`shared/StaffApprovalInbox` is owned by the separate UI agent and is not modified here. That consumer must also supplement the native 100-row list via its detail API for a linked older approval. Generic inbox result details and integration with the global locator are owned by root. A completer who is not the hygiene task's assignee and lacks management access receives the generic result fallback because native personal tasks list only assigned tasks. Management-only employee-site notifications now use generic inbox cards. Root should request the live read-only projection with fresh real identity `{id,storeId,issuedAtMs?}` for cross-client awareness; explicitly passing `employeeApp:true` intentionally narrows the projection to personal nodes/results. The notification changes never change employee-header execution authorization.

## Synthetic verification

Run one temporary PostgreSQL instance with `python3 scripts/with-docker-test.py -- python3 scripts/test-approval-notices.py`. This sets a random loopback port and a test-only database name, creates synthetic users/business rows, compiles into the disposable directory, and removes the instance and its directory in finally. No production URL, credential, volume, real approval, real push or deployment is used. The test covers fresh V2/legacy/management/native gates, owner-only requests, peer stages, store/user binding, old pending beyond 100, private-field omission, business-table invariance, reminder idempotency/read preservation, first-collection historical-result suppression, revocation, completion and applicant results. Focused delivery validation reads only the current object and identity/policy; it does not rescan unrelated business tables, and rejects modified stored title/URL. UI verification is separately required and is not implied by this service test.
