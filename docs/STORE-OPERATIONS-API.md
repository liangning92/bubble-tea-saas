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
