import { createHash } from 'crypto';
import { z } from 'zod';
import { TeamError } from '../TeamCommunicationService';
import {
  applyDailyMembershipPolicy,
  inspectDailyMembershipPolicy,
} from '../DailyMembershipOperationsService';
import { audienceAllows, assertEmployeeSettings } from './employeeAccess';
import { assertOperationRequester } from './employeeOperationAuthority';
import type { BridgeGrant, CommunicationScope } from './contract';

export const membershipToolSchema = {
  type: 'function' as const,
  function: {
    name: 'employee_manage_membership',
    description:
      'Inspect actual store membership qualification and existing daily special prices. Apply the confirmed one-time Rp30,000 completed-paid-order entry policy and member-only access to existing daily specials. First qualifying purchase uses ordinary prices; later member purchases have no repeated Rp30,000 minimum. Inspect current versions first. Never activate a member manually, invent a paid order, change product prices or publish a draft.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['inspect', 'apply'] },
        expectedPolicyVersion: { type: 'integer', minimum: 0 },
        activities: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'version'],
            properties: { id: { type: 'string' }, version: { type: 'integer', minimum: 1 } },
          },
        },
        minimumPaidAmount: { type: 'integer', enum: [30000] },
        memberOnly: { type: 'boolean', enum: [true] },
      },
    },
  },
};
const input = z
  .object({
    action: z.enum(['inspect', 'apply']),
    expectedPolicyVersion: z.number().int().nonnegative().optional(),
    activities: z
      .array(z.object({ id: z.string().min(1), version: z.number().int().positive() }).strict())
      .min(1)
      .max(20)
      .optional(),
    minimumPaidAmount: z.literal(30000).optional(),
    memberOnly: z.literal(true).optional(),
  })
  .strict();
export function membershipOperationId(executionId: string, toolCallId: string) {
  const b = createHash('sha256')
    .update(JSON.stringify(['hermes-membership', executionId, toolCallId]))
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString('hex');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20)
  );
}
export async function executeMembershipTool(
  db: any,
  g: BridgeGrant,
  scope: CommunicationScope,
  raw: unknown,
  executionId: string,
  toolCallId: string,
) {
  const parsed = input.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: 'EMPLOYEE_MEMBERSHIP_INPUT_INVALID',
      message:
        'Inspect the actual daily specials and current versions; keep the confirmed Rp30,000 one-time policy.',
    };
  const v = parsed.data;
  if (
    !g.actions.includes(v.action === 'inspect' ? 'members.read' : 'members.write') ||
    (v.action === 'apply' && !g.actions.includes('marketing.write'))
  )
    throw new TeamError(403, 'EMPLOYEE_BUSINESS_ACTION_NOT_GRANTED');
  const settings = await assertEmployeeSettings(db, g.storeId);
  if (
    settings &&
    (!settings.permissions?.members?.[v.action === 'inspect' ? 'read' : 'write'] ||
      (v.action === 'apply' && !settings.permissions?.marketing?.write))
  )
    throw new TeamError(403, 'EMPLOYEE_TOOL_DISABLED_BY_SETTINGS');
  if (v.action === 'apply')
    await assertOperationRequester(db, g, scope, 'employee_manage_membership', v);
  const before = await inspectDailyMembershipPolicy(g.storeId, db);
  if (v.action === 'inspect') {
    // Public eligibility is ordinary store knowledge, not customer-personal data.
    // Only a marketing-authorized audience receives unpublished activity details.
    const internal = await audienceAllows(db, g, scope, 'marketing.read');
    return {
      ok: true,
      policy: internal
        ? before.policy
        : {
            enabled: before.policy.enabled,
            minimumPaidAmount: before.policy.minimumPaidAmount,
            qualifyOnce: before.policy.qualifyOnce,
          },
      activities: before.activities.filter(
        (a: any) => internal || (a.status === 'published' && a.showOnTv),
      ),
      membershipRecordsChanged: 0,
      qualificationTransitionVerified: false,
    };
  }
  if (v.expectedPolicyVersion === undefined || !v.activities?.length)
    return {
      ok: false,
      code: 'EMPLOYEE_MEMBERSHIP_VERSIONS_REQUIRED',
      message:
        'Use inspect first and select the actual existing daily specials with their current versions. No rule was changed.',
    };
  const selected = v.activities.map((w) =>
    before.activities.find((a) => a.id === w.id && a.version === w.version),
  );
  if (
    v.expectedPolicyVersion === before.policy.version &&
    new Set(v.activities.map((a) => a.id)).size === v.activities.length &&
    before.policy.enabled &&
    before.policy.minimumPaidAmount === 30000 &&
    before.policy.qualifyOnce &&
    selected.every((a) => a?.memberOnly && a.hasMemberNotice)
  )
    return {
      ok: true,
      alreadyConfigured: true,
      operationRecorded: false,
      policy: before.policy,
      activities: selected.map((a) => ({ id: a!.id, version: a!.version, memberOnly: true })),
      membershipRecordsChanged: 0,
      cashierVerified: false,
      qualificationTransitionVerified: false,
      newSpendCents: 0,
    };
  if (v.expectedPolicyVersion !== before.policy.version || selected.some((a) => !a))
    return {
      ok: false,
      code: 'EMPLOYEE_MEMBERSHIP_VERSION_CHANGED',
      message:
        'The actual policy or daily specials changed. Inspect the current versions again. No rule was changed.',
    };
  const receipt = await applyDailyMembershipPolicy(
    db,
    {
      id: 'hermes-membership:' + g.agentId,
      storeId: g.storeId,
      ownerId: g.sponsorUserId,
      activityIds: before.activities.map((a) => a.id),
    },
    {
      requestId: membershipOperationId(executionId, toolCallId),
      expectedPolicyVersion: v.expectedPolicyVersion,
      activities: v.activities,
      minimumPaidAmount: 30000,
      memberOnly: true,
    },
  );
  await db.financeAuditLog.create({
    data: {
      storeId: g.storeId,
      userId: 'agent:' + g.agentId,
      action: 'update',
      entityType: 'hermes_membership_policy',
      entityId: receipt.requestId,
      description: 'Configure member daily specials and one-time paid-order qualification',
      newValue: JSON.stringify({
        requesterStaffId: scope.requesterStaffId,
        policyVersion: receipt.policy.version,
        activityIds: receipt.activities.map((a: any) => a.id),
      }),
    },
  });
  return {
    ok: true,
    operationRecorded: true,
    operationId: receipt.requestId,
    fingerprint: receipt.fingerprint,
    storeId: g.storeId,
    alreadyApplied: receipt.alreadyApplied === true,
    policy: receipt.policy,
    activities: receipt.activities.map((a: any) => ({
      id: a.id,
      version: a.version,
      memberOnly: a.memberOnly,
    })),
    membershipRecordsChanged: 0,
    cashierVerified: false,
    qualificationTransitionVerified: false,
    newSpendCents: 0,
  };
}
