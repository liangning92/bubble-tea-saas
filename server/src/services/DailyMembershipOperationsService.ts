import { createHash } from 'crypto';
import { z } from 'zod';
import { ACTIVITY_PREFIX, casRecord, putRecord, listActivities } from './ActivityService';
import {
  defaultMembershipPolicy,
  MEMBERSHIP_POLICY_KEY,
  membershipPolicy,
} from './MembershipQualificationService';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const fail = (code: string): never => {
  throw Error(code);
};
export const MEMBER_DAILY_NOTICE =
  'Promo Harian Khusus Member. Belanja minimal Rp30.000 dalam satu transaksi untuk menjadi member. Berlaku untuk pembelian berikutnya tanpa minimum belanja berulang.';
export const applyInput = z
  .object({
    requestId: z.string().uuid(),
    expectedPolicyVersion: z.number().int().min(0),
    activities: z
      .array(z.object({ id: z.string().min(1), version: z.number().int().positive() }).strict())
      .min(1)
      .max(20),
    minimumPaidAmount: z.literal(30000),
    memberOnly: z.literal(true),
  })
  .strict();
export function assertNarrowDailySpecial(activity: any) {
  if (
    activity?.type !== 'special_price' ||
    !Array.isArray(activity.weekdays) ||
    !activity.weekdays.length ||
    activity.status === 'ended'
  )
    fail('OPERATIONS_DAILY_SPECIAL_REQUIRED');
}

export interface DailyMembershipAuthority {
  id: string;
  storeId: string;
  ownerId: string;
  activityIds: string[];
}
/** Caller supplies its verified authority and the current outer business transaction.
 * Shared by the opaque executor and the original Hermes runtime; no second logic.
 */
export async function applyDailyMembershipPolicy(
  tx: any,
  authority: DailyMembershipAuthority,
  raw: unknown,
) {
  const v = applyInput.parse(raw),
    fingerprint = hash(JSON.stringify(v)),
    storeId = authority.storeId,
    key = 'store.operations.receipt.' + authority.id + '.' + v.requestId;
  await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } });
  const prior = await tx.config.findUnique({ where: { storeId_key: { storeId, key } } });
  if (prior) {
    const p = JSON.parse(prior.value);
    if (p.fingerprint !== fingerprint) fail('OPERATIONS_IDEMPOTENCY_CONFLICT');
    return { ...p, alreadyApplied: true };
  }
  if (
    new Set(v.activities.map((a) => a.id)).size !== v.activities.length ||
    v.activities.some((a) => !authority.activityIds.includes(a.id))
  )
    fail('OPERATIONS_ACTIVITY_NOT_GRANTED');
  const current = await membershipPolicy(storeId, tx);
  if (current.version !== v.expectedPolicyVersion) fail('OPERATIONS_POLICY_VERSION_CHANGED');
  const policy = {
    ...defaultMembershipPolicy(),
    version: current.version + 1,
    enabled: true,
    minimumPaidAmount: 30000,
    activatedAt: current.activatedAt || new Date().toISOString(),
  };
  const policyRow = await tx.config.findUnique({
    where: { storeId_key: { storeId, key: MEMBERSHIP_POLICY_KEY } },
  });
  if (policyRow) await casRecord(tx, policyRow, policy);
  else await putRecord(tx, storeId, MEMBERSHIP_POLICY_KEY, policy);
  const activities = [];
  for (const wanted of v.activities) {
    const row = await tx.config.findUnique({
      where: { storeId_key: { storeId, key: ACTIVITY_PREFIX + 'activity.' + wanted.id } },
    });
    if (!row) fail('OPERATIONS_ACTIVITY_NOT_FOUND');
    const old = JSON.parse(row.value);
    assertNarrowDailySpecial(old);
    if (old.version !== wanted.version) fail('OPERATIONS_ACTIVITY_VERSION_CHANGED');
    const memberNotice = MEMBER_DAILY_NOTICE;
    const description = old.description?.includes(memberNotice)
      ? old.description
      : [old.description, memberNotice].filter(Boolean).join('\n\n');
    if (description.length > 1000) fail('OPERATIONS_DESCRIPTION_REVIEW_REQUIRED');
    const next = { ...old, memberOnly: true, version: old.version + 1, description };
    await casRecord(tx, row, next);
    activities.push(next);
  }
  const value = {
    requestId: v.requestId,
    fingerprint,
    storeId,
    delegationId: authority.id,
    ownerId: authority.ownerId,
    policy,
    activities,
    appliedAt: new Date().toISOString(),
    newSpendCents: 0,
  };
  await putRecord(tx, storeId, key, value);
  return value;
}
export async function inspectDailyMembershipPolicy(storeId: string, db: any) {
  return {
    policy: await membershipPolicy(storeId, db),
    activities: (await listActivities(storeId, db))
      .filter((a) => a.type === 'special_price' && a.weekdays.length && a.status !== 'ended')
      .map((a) => ({
        id: a.id,
        version: a.version,
        name: a.name,
        status: a.status,
        showOnTv: a.showOnTv,
        hasMemberNotice: !!a.description?.includes(MEMBER_DAILY_NOTICE),
        memberOnly: a.memberOnly,
        productIds: a.productIds,
        weekdays: a.weekdays,
        rule: { price: a.rule.price },
      })),
  };
}
