import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import {
  ACTIVITY_PREFIX,
  casRecord,
  listActivities,
  notifyActivities,
  putRecord,
  quoteActivities,
} from './ActivityService'
import {
  defaultMembershipPolicy,
  MEMBERSHIP_POLICY_KEY,
  membershipPolicy,
  paidAmountMeetsMembershipPolicy,
} from './MembershipQualificationService'
import { readTeam } from './TeamCommunicationService'

const PREFIX = 'store.operations.delegation.'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const fail = (code: string): never => {
  throw Error(code)
}
export const delegationInput = z
  .object({
    activityIds: z.array(z.string().min(1)).min(1).max(20),
    expiresAt: z.string().datetime().nullable(),
    confirm: z.literal('daily_member_specials_and_single_paid_order_30000'),
  })
  .strict()
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
  .strict()
export const operationsQuoteInput = z
  .object({
    sideEffectFree: z.literal(true),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1),
            specId: z.string().min(1),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    memberId: z.string().min(1).optional(),
    taxEnabled: z.boolean().optional(),
  })
  .strict()
export function assertNarrowDailySpecial(activity: any) {
  if (
    activity?.type !== 'special_price' ||
    !Array.isArray(activity.weekdays) ||
    !activity.weekdays.length ||
    activity.status === 'ended'
  )
    fail('OPERATIONS_DAILY_SPECIAL_REQUIRED')
}
async function ownerAllowed(
  db: any,
  ownerId: string,
  storeId: string,
  securityFingerprint?: string,
) {
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { staff: true } })
  if (
    !owner ||
    owner.role !== 'admin' ||
    (owner.staff?.storeId || owner.storeId) !== storeId ||
    (owner.staff && owner.staff.status !== 'active') ||
    (securityFingerprint && hash(owner.password || '') !== securityFingerprint)
  )
    fail('OPERATIONS_OWNER_REVOKED')
  const settings = await readTeam(db, storeId, 'ai.agent.settings')
  if (
    !settings?.enabled ||
    !settings.permissions?.marketing?.write ||
    !settings.permissions?.members?.write ||
    (settings.expiresAt && Date.parse(settings.expiresAt) <= Date.now())
  )
    fail('OPERATIONS_MODULE_AUTHORIZATION_REQUIRED')
  return { owner, settings }
}
export async function operationsOwnerState(storeId: string, ownerId: string, db: any = prisma) {
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { staff: true } })
  if (
    !owner ||
    owner.role !== 'admin' ||
    (owner.staff?.storeId || owner.storeId) !== storeId ||
    (owner.staff && owner.staff.status !== 'active')
  )
    fail('OPERATIONS_OWNER_REQUIRED')
  const settings = await readTeam(db, storeId, 'ai.agent.settings')
  const canDelegate =
    !!settings?.enabled &&
    !!settings.permissions?.marketing?.write &&
    !!settings.permissions?.members?.write &&
    (!settings.expiresAt || Date.parse(settings.expiresAt) > Date.now())
  const rows = await db.config.findMany({ where: { storeId, key: { startsWith: PREFIX } } })
  return {
    canDelegate,
    authorizationExpiresAt: settings?.expiresAt || null,
    policy: await membershipPolicy(storeId, db),
    activities: (await listActivities(storeId, db)).filter(
      (a) => a.type === 'special_price' && a.weekdays.length && a.status !== 'ended',
    ),
    delegations: rows.map((r: any) => {
      const { secretHash, ownerSecurityFingerprint, ...safe } = JSON.parse(r.value)
      return safe
    }),
    scope: 'daily_member_specials_and_single_paid_order_30000',
  }
}
export async function createOperationsDelegation(
  storeId: string,
  ownerId: string,
  raw: unknown,
  db: any = prisma,
) {
  const v = delegationInput.parse(raw),
    { owner, settings } = await ownerAllowed(db, ownerId, storeId)
  const expiry = v.expiresAt ? Date.parse(v.expiresAt) : null
  if (
    (expiry !== null && expiry <= Date.now()) ||
    (settings.expiresAt && (expiry === null || expiry > Date.parse(settings.expiresAt)))
  )
    fail('OPERATIONS_EXPIRY_OUT_OF_SCOPE')
  const activities = await listActivities(storeId, db)
  const ids = [...new Set(v.activityIds)]
  for (const id of ids) assertNarrowDailySpecial(activities.find((a) => a.id === id))
  const id = randomUUID(),
    secret = randomBytes(32).toString('base64url')
  const grant = {
    id,
    storeId,
    ownerId,
    ownerSecurityFingerprint: hash(owner.password || ''),
    scope: 'store_operations.v1',
    role: 'store-operations',
    authority: 'routine_store_operations',
    capabilities: [
      'marketing.daily_specials.member_only',
      'marketing.daily_specials.quote',
      'membership.single_paid_order_policy',
    ],
    forbidden: ['payments', 'over_budget', 'employee_penalties', 'permission_changes'],
    activityIds: ids,
    expiresAt: v.expiresAt,
    createdAt: new Date().toISOString(),
    revoked: false,
    secretHash: hash(secret),
  }
  await db.config.create({
    data: { storeId, key: PREFIX + id, value: JSON.stringify(grant), category: 'agent_operations' },
  })
  const { secretHash, ownerSecurityFingerprint, ...publicGrant } = grant
  return { delegation: publicGrant, credential: id + '.' + secret, credentialShownOnce: true }
}
export async function revokeOperationsDelegation(
  storeId: string,
  ownerId: string,
  id: string,
  db: any = prisma,
) {
  // Revocation remains available even after module permissions have been withdrawn.
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { staff: true } })
  if (!owner || owner.role !== 'admin' || (owner.staff?.storeId || owner.storeId) !== storeId)
    fail('OPERATIONS_OWNER_REQUIRED')
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: PREFIX + id } } })
  if (!row) fail('OPERATIONS_DELEGATION_NOT_FOUND')
  await casRecord(db, row, {
    ...JSON.parse(row.value),
    revoked: true,
    revokedAt: new Date().toISOString(),
  })
  return { id, revoked: true }
}
async function resolve(db: any, credential: string, lock = false) {
  const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(credential)
  if (!match) fail('OPERATIONS_CREDENTIAL_REQUIRED')
  const row = await db.config.findFirst({ where: { key: PREFIX + match[1] } })
  if (!row) fail('OPERATIONS_CREDENTIAL_INVALID')
  if (
    lock &&
    !(
      await db.config.updateMany({
        where: { id: row.id, value: row.value },
        data: { value: row.value },
      })
    ).count
  )
    fail('OPERATIONS_AUTHORIZATION_CHANGED')
  const grant = JSON.parse(row.value),
    actual = Buffer.from(hash(match[2])),
    expected = Buffer.from(grant.secretHash || '')
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected) ||
    grant.revoked ||
    (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())
  )
    fail('OPERATIONS_CREDENTIAL_INVALID')
  await ownerAllowed(db, grant.ownerId, grant.storeId, grant.ownerSecurityFingerprint)
  return grant
}
export async function readOperationsState(credential: string, db: any = prisma) {
  const grant = await resolve(db, credential)
  const activities = (await listActivities(grant.storeId, db)).filter((a) =>
    grant.activityIds.includes(a.id),
  )
  const productIds = [...new Set(activities.flatMap((a) => a.productIds))]
  const products = await db.product.findMany({
    where: {
      storeId: grant.storeId,
      status: 'active',
      deletedAt: null,
      ...(activities.some((a) => !a.productIds.length) ? {} : { id: { in: productIds } }),
    },
    select: {
      id: true,
      name: true,
      specs: {
        select: { id: true, price: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      },
    },
    take: 50,
  })
  const quoteCandidates = products.flatMap((p: any) => {
    const spec = p.specs?.[0]
    return spec
      ? [
          {
            productId: p.id,
            specId: spec.id,
            quantity: 1,
            productName: p.name,
            regularPrice: spec.price,
          },
        ]
      : []
  })
  const activeMember = await db.member.findFirst({
    where: { storeId: grant.storeId, status: 'active' },
    select: { id: true, status: true },
  })
  const pendingMember = await db.member.findFirst({
    where: { storeId: grant.storeId, status: 'pending' },
    select: { id: true, status: true },
  })
  const earnedRow = await db.config.findFirst({
    where: { storeId: grant.storeId, key: { startsWith: 'membership.qualification.receipt.' } },
  })
  const earned = earnedRow ? JSON.parse(earnedRow.value) : null
  const earnedMember = earned
    ? await db.member.findFirst({
        where: { id: earned.memberId, storeId: grant.storeId, status: 'active' },
        select: { id: true, status: true },
      })
    : null
  const profile = (m: any) => (m ? { id: m.id, status: m.status } : null)
  const receipts = await db.config.findMany({
    where: {
      storeId: grant.storeId,
      key: { startsWith: 'store.operations.receipt.' + grant.id + '.' },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return {
    quoteCandidates,
    verificationProfiles: {
      activeMember: profile(activeMember),
      pendingMember: profile(pendingMember),
      earnedMember: profile(earnedMember),
    },
    receipts: receipts.map((r: any) => JSON.parse(r.value)),
    storeId: grant.storeId,
    policy: await membershipPolicy(grant.storeId, db),
    activities,
    expiresAt: grant.expiresAt,
  }
}
/** Actual price preview; never creates members/orders/payments or changes inventory. */
export async function quoteOperationsSpecials(credential: string, raw: unknown, db: any = prisma) {
  const v = operationsQuoteInput.parse(raw),
    grant = await resolve(db, credential)
  if (!grant.capabilities?.includes('marketing.daily_specials.quote'))
    fail('OPERATIONS_QUOTE_NOT_GRANTED')
  const selected = (await listActivities(grant.storeId, db)).filter((a) =>
    grant.activityIds.includes(a.id),
  )
  for (const item of v.items)
    if (!selected.some((a) => !a.productIds.length || a.productIds.includes(item.productId)))
      fail('OPERATIONS_PRODUCT_NOT_GRANTED')
  const result = await quoteActivities(
    grant.storeId,
    {
      items: v.items.map((i) => ({
        productId: i.productId!,
        specId: i.specId!,
        quantity: i.quantity!,
        unitPrice: 0,
      })),
      memberId: v.memberId,
      channel: 'DINE_IN',
      taxEnabled: v.taxEnabled,
    },
    db,
  )
  const member = v.memberId
    ? await db.member.findFirst({
        where: { id: v.memberId, storeId: grant.storeId },
        select: { id: true, status: true },
      })
    : null
  const policy = await membershipPolicy(grant.storeId, db)
  return {
    sideEffectFree: true,
    storeId: grant.storeId,
    pricingSource: 'actual_store_products_and_current_activity_rules',
    member: member ? { id: member.id, status: member.status } : null,
    items: result.items,
    subtotal: result.subtotal,
    discount: result.discount,
    finalAmount: result.finalAmount,
    tax: result.tax,
    grandTotal: result.grandTotal,
    applied: result.applied,
    signature: result.signature,
    policy,
    hypotheticalAmountThresholdChecks: [29999, 30000].map((amount) => ({
      amount,
      meets30000Threshold: paidAmountMeetsMembershipPolicy(amount, policy),
      evidenceType: 'hypothetical_amount_only_not_an_actual_order',
    })),
    qualificationGranted: false,
    ordersCreated: 0,
    paymentsCreated: 0,
    inventoryMutations: 0,
  }
}
/** Fixed capability, no product/price/schedule mutation and no model/provider calls. */
export async function applyOperationsPolicy(credential: string, raw: unknown, db: any = prisma) {
  const v = applyInput.parse(raw),
    fingerprint = hash(JSON.stringify(v))
  const receipt = await db.$transaction(
    async (tx: any) => {
      const grant = await resolve(tx, credential, true),
        storeId = grant.storeId,
        key = 'store.operations.receipt.' + grant.id + '.' + v.requestId
      await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } })
      const prior = await tx.config.findUnique({ where: { storeId_key: { storeId, key } } })
      if (prior) {
        const p = JSON.parse(prior.value)
        if (p.fingerprint !== fingerprint) fail('OPERATIONS_IDEMPOTENCY_CONFLICT')
        return { ...p, alreadyApplied: true }
      }
      if (
        new Set(v.activities.map((a) => a.id)).size !== v.activities.length ||
        v.activities.some((a) => !grant.activityIds.includes(a.id))
      )
        fail('OPERATIONS_ACTIVITY_NOT_GRANTED')
      const current = await membershipPolicy(storeId, tx)
      if (current.version !== v.expectedPolicyVersion) fail('OPERATIONS_POLICY_VERSION_CHANGED')
      const policy = {
        ...defaultMembershipPolicy(),
        version: current.version + 1,
        enabled: true,
        minimumPaidAmount: 30000,
        activatedAt: current.activatedAt || new Date().toISOString(),
      }
      const policyRow = await tx.config.findUnique({
        where: { storeId_key: { storeId, key: MEMBERSHIP_POLICY_KEY } },
      })
      if (policyRow) await casRecord(tx, policyRow, policy)
      else await putRecord(tx, storeId, MEMBERSHIP_POLICY_KEY, policy)
      const activities = []
      for (const wanted of v.activities) {
        const row = await tx.config.findUnique({
          where: { storeId_key: { storeId, key: ACTIVITY_PREFIX + 'activity.' + wanted.id } },
        })
        if (!row) fail('OPERATIONS_ACTIVITY_NOT_FOUND')
        const old = JSON.parse(row.value)
        assertNarrowDailySpecial(old)
        if (old.version !== wanted.version) fail('OPERATIONS_ACTIVITY_VERSION_CHANGED')
        const memberNotice =
          'Promo Harian Khusus Member. Belanja minimal Rp30.000 dalam satu transaksi untuk menjadi member. Berlaku untuk pembelian berikutnya tanpa minimum belanja berulang.'
        const description = old.description?.includes(memberNotice)
          ? old.description
          : [old.description, memberNotice].filter(Boolean).join('\n\n')
        if (description.length > 1000) fail('OPERATIONS_DESCRIPTION_REVIEW_REQUIRED')
        const next = { ...old, memberOnly: true, version: old.version + 1, description }
        await casRecord(tx, row, next)
        activities.push(next)
      }
      const value = {
        requestId: v.requestId,
        fingerprint,
        storeId,
        delegationId: grant.id,
        ownerId: grant.ownerId,
        policy,
        activities,
        appliedAt: new Date().toISOString(),
        newSpendCents: 0,
      }
      await putRecord(tx, storeId, key, value)
      return value
    },
    { isolationLevel: 'Serializable' },
  )
  notifyActivities(receipt.storeId)
  return receipt
}
