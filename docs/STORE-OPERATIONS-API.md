# Store operations execution API

The workbench executes business operations through this API, not browser cookies,
SQL, or a new model call. The v1 registry currently implements
`marketing.daily_specials.member_only`, `marketing.daily_specials.quote`, and
`membership.single_paid_order_policy`.
The credential identifies role `store-operations` with routine-store authority;
payments, over-budget actions, penalties, and permission changes are excluded.
Future routine capabilities belong in the same registry and must have backend
authorization and business validation, rather than generic arbitrary API access.

## One-time owner binding

In existing **Settings → AI Settings**, the owner selects the existing daily
specials and explicitly creates a revocable delegation following the existing business authorization. This requires a
normal current administrator session, enabled agent settings, and current write
permissions for marketing and members. The setting page does not renew PDCA or
global permissions. The owner can revoke even after those module permissions are
withdrawn. The returned credential is shown once and only its hash is stored.

Authenticated owner routes:

- `GET /api/team/ai/operations-delegations`: policy, existing daily specials,
  delegation metadata without secret hashes, and `canDelegate`.
- `POST /api/team/ai/operations-delegations`: `{activityIds, expiresAt,
  confirm:"daily_member_specials_and_single_paid_order_30000"}`; expiry cannot exceed the existing agent authorization expiry. An existing
  continuous authorization may use a null expiry; this endpoint never extends it.
- `POST /api/team/ai/operations-delegations/:id/revoke`.

Creation returns `{code:200,data:{delegation,credential,credentialShownOnce:true}}`.
Save the credential only in the workbench server's protected connection store.
Never forward it to staff, public posts, an LLM, or a browser-storage extractor.

## Deterministic agent tools

Use `Authorization: Bearer <credential>` against the normal existing API origin.
An administrator JWT does not work here. Every call verifies the owner is still
an active administrator of this store, their security credential fingerprint has not changed,
the agent and both module permissions remain enabled, and the delegation has not
expired or been revoked. No production database access is exposed.

`GET /api/internal/store-operations/daily-member-specials` returns
`{code:200,data:{storeId,policy,activities,receipts,expiresAt,quoteCandidates,
verificationProfiles,qualificationAudit}}`.
`receipts` contains the latest 20 results belonging only to this delegation.
`quoteCandidates` supplies real product/default specification IDs, product names,
regular prices, and quantity 1 only for the delegated daily specials.
`verificationProfiles` exposes actual active/pending/earned member IDs and statuses
without names, phones, or birthdays; unavailable real samples remain null.
`qualificationAudit` exposes the persisted qualification receipt
`{memberId,orderId,paidAmount,minimumPaidAmount,policyVersion,qualifiedAt,evidenceType,
currentOrder:{id,status,finalAmount}|null}` for an actual earned member, or null.
The current order is looked up using the same store and member; profile presence
alone cannot prove a qualifying transaction. A refund or missing order remains
visible through current status/null and must be reviewed rather than hidden.

`POST /api/internal/store-operations/daily-member-specials/quote` accepts
`{sideEffectFree:true,items:[{productId,specId,quantity}],memberId?,taxEnabled?}`.
It uses the actual same-store price engine and current member status, and returns
prices, applied promotion, signature and current policy. Amount-boundary checks
are explicitly hypothetical calculations through the same policy function, never
evidence of a paid order or new qualification. The endpoint cannot create an order,
member, payment, or inventory movement. An absent pending/earned production sample
must be reported as not verified; do not create a test customer in production.

`POST /api/internal/store-operations/daily-member-specials/apply` accepts:

```json
{
  "requestId": "a client-generated UUID reused on uncertain retry",
  "expectedPolicyVersion": 0,
  "activities": [{"id": "an actual selected activity ID", "version": 1}],
  "minimumPaidAmount": 30000,
  "memberOnly": true
}
```

Only selected existing `special_price` activities with weekday schedules can be
changed. Product links, prices, statuses and schedules are preserved. Existing
description text is retained, with the Indonesian member notice appended; a
description exceeding the allowed length fails rather than being truncated.
The policy, activity versions and execution receipt commit in one serializable
transaction. A reused request ID returns its prior result; different content with
the same ID is rejected. Version conflicts do not partially apply the policy.
On timeout, query the receipt list first; do not create a new request ID blindly.

Success data includes `{requestId,fingerprint,storeId,delegationId,ownerId,policy,
activities,appliedAt,newSpendCents:0,alreadyApplied?}`.

## Membership and cashier behavior

Existing active members remain active; enabling this policy does not revoke or
batch-convert them. New registrations become `pending` with no welcome points or
welcome campaign. They can be linked to an ordinary order, but do not receive
member prices, birthday/welcome benefits, point redemption, or active-member
offline snapshots. The qualifying order is priced as a non-member order.

After normal checkout commits a same-store, same-person completed paid order
whose server-calculated `finalAmount` is at least Rp30,000, the backend activates
the pending member, awards the existing 100 welcome points once, and saves an
order-linked qualification receipt. Two smaller purchases are not combined.
Subsequent member purchases can receive the daily special even below Rp30,000.
Suspended, cancelled, wrong-store and wrong-member orders cannot qualify.
Registration and policy activation share a store lock to prevent a race bypass.

The amount basis is the server order's actual final amount (including the current
order's configured tax), not a client claimed subtotal. Refunds retain the earned
membership and remain in normal business audit; this API cannot punish or revoke
a member automatically. New offline enrollment is rejected while this policy is
enabled; reconnect to complete enrollment. Existing active-member offline policy
continues unchanged. No test should create a real payment, cash event or consume
production stock solely for acceptance.

Original configured benefits are not discarded by pending registration. The
registration snapshot retains the same-store referrer and original welcome
campaign/coupon. A durable post-qualification job delivers the original referral
500 points and welcome coupon with per-benefit idempotency; an unavailable coupon
cannot roll back or repeat a valid referral reward. Failure remains recoverable
without rolling back the paid checkout. Existing notification configuration stays
explicitly pending a verified no-new-cost delivery channel; this worker invokes
no SMS, WhatsApp, or model provider API.

## Verification boundary

`server/audit-tests/daily-member-operations.test.ts` covers scoped credentials,
revocation/current permissions, atomic version failures, duplicate execution,
Rp29,999/Rp30,000 boundaries, pending/full-price checkout and a later low-value
member-price quote using isolated in-memory test evidence. These are not real
production transactions. Production configuration readback, actual web/phone
layout, and cashier read-only quote verification must be recorded separately.

## Full operations role, shared Hermes runtime

The administrator may select `operationProfile: "store_operations"` on the existing
Agent settings page. A normal audited settings save expands all existing module
permissions and synchronizes the existing Hermes grant. It does not change staff
roles or create SQL/shell access. Custom profiles and explicit disable/revocation
remain supported; expiry follows the owner's existing saved authorization.

A new operations delegation using `confirm: "full_store_operations_role"` receives
`hermes.owner_tasks.submit` and `hermes.owner_tasks.status`. This requires the full
profile and enabled employee bridge. Old daily-specials credentials never acquire
these capabilities automatically. For this confirmation `activityIds` may be empty.
The selected daily-special IDs still scope any daily-special mutation.

State discovery adds `capabilities`, `ownerTaskChannels:[{id,title,taskId}]`, and
`gateway`. A verified gateway is `{verified:true,protocol:"employee_work_trace_v1",
maxConcurrency:1,queued,running,checkedAt}`. A missing/old/unverifiable installation
returns `{verified:false,reason,checkedAt}` without exposing origin or credentials.
Submit rechecks the real private gateway before writing a native task message.

`POST /api/internal/store-operations/tasks` accepts only
`{requestId,channelId,text}`. IDs must be UUIDs and text 1–4000 characters. The backend
resolves owner identity from the explicit role delegation, checks an already-bound
owner-only native channel and the same Hermes grant/task/route, and writes the
native source message plus intake in one transaction. It never accepts a caller-
supplied requester or adds a group, staff role, new model loop or provider.
The message is visibly marked as Operations Agent acting under owner delegation;
its source/audit records retain `origin:"owner_operations_delegation"`.

The response contains `{requestId,fingerprint,delegationId,origin,channelId,taskId,
messageId,sourceSeq,eventId,submittedAt,state:"queued",businessCompleted:false,
gateway,alreadySubmitted?}`. Reuse requestId after an unknown response; changed
inputs conflict. Queueing is not execution or acceptance.

`GET /api/internal/store-operations/tasks/:requestId` rechecks current authorization
and private audience, then adds `intake:{state,reason,updatedAt}|null`,
`execution:{id,phase,fault}|null`, actual stored `outbound` message references/text,
`operationReceipts`, `executionCompleted`, and `independentAcceptance:"not_reviewed"`.
`businessCompleted` remains false. Missing executions/replies remain null/empty.
Only actual stored source-bound receipts can support subsequent independent review.

Employee conversations continue to use their real recipient permissions before
sources, model facts and memory are assembled. Every business mutation also checks
the real requesting employee's account operation permission; sponsor authority is
not an employee's permission. Read access to private details is not required to
perform an otherwise authorized mutation: its model-facing write receipt is a
fixed minimal acknowledgement, without raw private prose or amounts.

Content writes cannot publish private planning facts through another surface.
Standard daily hygiene and training avoid manual per-item approvals through the
same existing tools: `employee_manage_hygiene/assign_standard` accepts exactly
`{action,staffId,date,areaCode}` and `employee_manage_training/assign_published_course`
accepts exactly `{action,staffId,date,courseKey}`. Real same-store targets and existing
public sources are resolved server-side; free-text notes/titles/scores are rejected.
They create native pending cleaning tasks and scheduled training, retain source
versions/fingerprints, and never claim physical completion. New free-text public
content requires an audience-safe context; no private owner draft is forwarded as
employee-facing content by default.

Procurement orders produced here remain pending drafts and do not place supplier
orders or pay. Non-cash expense evidence recording is autonomous with the proper
account permission and explicit `amountUnit:"IDR"`; the backend converts rupiah to
native expense cents. Cash-drawer effects and an unspecified payment source require
approval. Expense reads normalize cents back to rupiah; salary records additionally
require the actual account's salary permission. Payments, spending commitments,
unknown/over-budget expenditure and employee penalties are not granted by a model
request. No existing production records are migrated or automatically corrected.

### Membership in the existing Hermes runtime

The existing `employee_manage_membership` tool now supports `inspect` and `apply`.
It uses the same transactional daily-membership service as the opaque operations
endpoint; it does not maintain another qualification policy or activate customers
manually. `apply` requires both the actual requesting account's `members.write`
and `marketing.write`, live role settings, and current policy/activity versions.
It preserves existing product prices, weekdays, activity publication status and
existing active members. Inspect before applying; a fully configured rule is a
read-only no-op. Tool receipts omit unpublished activity prices from employee
conversation contexts. No receipt claims cashier or paid-order verification.

Ordinary stale versions return an actionable no-write tool result. A concurrent
change during the business transaction rolls the whole configuration and trace
back; a transport failure can still leave execution status unknown. Query the
original execution before retrying. No blind replay or fabricated payment is used.

Marketing writes from this runtime use `saveActivityInTransaction` with the same
outer native trace transaction. A failed unified activity write aborts the legacy
campaign/rule and receipt too. Notifications run only after that transaction
commits. References used by mutations are checked against the current store;
product, training and staff updates retain store-scoped predicates.

These source and isolated PostgreSQL checks do not constitute production setup,
installed POS verification, an actual paid qualifying order, or independent
business acceptance. Those remain separate recorded stages.
