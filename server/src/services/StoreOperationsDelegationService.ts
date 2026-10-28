import {applyInput,assertNarrowDailySpecial,applyDailyMembershipPolicy} from './DailyMembershipOperationsService'
export {applyInput,assertNarrowDailySpecial} from './DailyMembershipOperationsService'
import { configuredEmployeeDeployment } from './teamAgentBridge/employeeConfigured'
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
import { readTeam, teamCommunication, lockTeam } from './TeamCommunicationService'
import {
  employeeRouteSchema,
  employeeRouteKey,
  employeeGrantKey,
  employeeIntakeKey,
} from './teamAgentBridge/employeeIntake'
import { grantSchema } from './teamAgentBridge/contract'
import { readAuthorizedBridgeChannel } from './teamAgentBridge/directDelegation'

const PREFIX = 'store.operations.delegation.'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const fail = (code: string): never => {
  throw Error(code)
}
export const delegationInput = z
  .object({
    activityIds: z.array(z.string().min(1)).max(20),
    expiresAt: z.string().datetime().nullable(),
    confirm: z.enum([
      'daily_member_specials_and_single_paid_order_30000',
      'full_store_operations_role',
    ]),
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
    operationProfile: settings?.operationProfile || 'custom',
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
  const fullRole = v.confirm === 'full_store_operations_role'
  if (
    fullRole &&
    (settings.operationProfile !== 'store_operations' ||
      !settings.employeeBridgeEnabled ||
      !owner.staff?.id)
  )
    fail('OPERATIONS_ROLE_PROFILE_REQUIRED')
  if (!fullRole && !v.activityIds.length) fail('OPERATIONS_DAILY_SPECIAL_REQUIRED')
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
      ...(fullRole ? ['hermes.owner_tasks.submit', 'hermes.owner_tasks.status'] : []),
    ],
    forbidden: ['payments', 'over_budget', 'employee_penalties', 'permission_changes'],
    activityIds: ids,
    expiresAt: v.expiresAt,
    createdAt: new Date().toISOString(),
    revoked: false,
    secretHash: hash(secret),
  }
  const persist = async (target: any) => {
    if (fullRole) {
      const current = await ownerAllowed(target, ownerId, storeId, grant.ownerSecurityFingerprint)
      if (
        current.settings.operationProfile !== 'store_operations' ||
        !current.settings.employeeBridgeEnabled ||
        !current.owner.staff?.id
      )
        fail('OPERATIONS_ROLE_PROFILE_REQUIRED')
      if (
        current.settings.expiresAt &&
        (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.parse(current.settings.expiresAt))
      )
        fail('OPERATIONS_EXPIRY_OUT_OF_SCOPE')
    }
    await target.config.create({
      data: {
        storeId,
        key: PREFIX + id,
        value: JSON.stringify(grant),
        category: 'agent_operations',
      },
    })
    const credential = id + '.' + secret
    let ownerTaskChannels: any[] = []
    if (fullRole) {
      const rows = await target.config.findMany({
        where: { storeId, key: { startsWith: 'team.communication.channel.' } },
      })
      for (const row of rows) {
        const c = JSON.parse(row.value)
        if (!c.id || !Array.isArray(c.members) || c.members.length !== 2) continue
        try {
          const ctx = await ownerTaskContext(target, credential, c.id)
          ownerTaskChannels.push({
            id: c.id,
            title: c.title,
            taskId: ctx.route.task.taskId,
            agentId: ctx.grant.agentId,
          })
        } catch {}
      }
      if (!ownerTaskChannels.length) {
        const agentId = process.env.EMPLOYEE_HERMES_AGENT_ID
        if (!agentId || process.env.EMPLOYEE_HERMES_STORE_ID !== storeId)
          fail('OPERATIONS_HERMES_RUNTIME_NOT_CONFIGURED')
        const row = await target.config.findUnique({
          where: { storeId_key: { storeId, key: employeeGrantKey(agentId) } },
        })
        const installed = grantSchema.parse(row && JSON.parse(row.value))
        if (
          installed.sponsorUserId !== ownerId ||
          installed.storeId !== storeId ||
          installed.revoked ||
          Date.parse(installed.expiresAt) <= Date.now()
        )
          fail('OPERATIONS_OWNER_ROUTE_REQUIRED')
        const facade = { ...target, $transaction: async (fn: any) => fn(target) }
        const channel = await teamCommunication(facade).create(
          { id: ownerId, storeId, staffId: owner.staff.id, role: 'admin', employeeApp: false },
          {
            requestId: id,
            title: 'Operasional pribadi pemilik · Hermes',
            kind: 'direct',
            members: ['agent:' + agentId],
          },
        )
        const ctx = await ownerTaskContext(target, credential, channel.id)
        ownerTaskChannels = [
          {
            id: channel.id,
            title: channel.title,
            taskId: ctx.route.task.taskId,
            agentId: ctx.grant.agentId,
          },
        ]
      }
    }
    const { secretHash, ownerSecurityFingerprint, ...publicGrant } = grant
    return {
      delegation: publicGrant,
      credential,
      credentialShownOnce: true,
      ...(fullRole ? { ownerTaskChannels } : {}),
    }
  }
  return fullRole ? db.$transaction(persist, { isolationLevel: 'Serializable' }) : persist(db)
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
export interface OperationsTaskPorts {
  gatewayHealth(db: any): Promise<unknown>
}
const taskPorts: OperationsTaskPorts = {
  gatewayHealth: async (db) => {
    const deployment = configuredEmployeeDeployment(db)
    if (!deployment) throw Error('EMPLOYEE_GATEWAY_NOT_CONFIGURED')
    return deployment.gatewayHealth()
  },
}
async function operationsGatewayState(db: any, ports: OperationsTaskPorts = taskPorts) {
  const checkedAt = new Date().toISOString()
  try {
    const raw: any = await ports.gatewayHealth(db)
    if (
      raw?.status !== 'ok' ||
      raw.protocol !== 'employee_work_trace_v1' ||
      raw.maxConcurrency !== 1 ||
      !Number.isInteger(raw.queued) ||
      raw.queued < 0 ||
      ![0, 1].includes(raw.running)
    )
      throw Error('EMPLOYEE_GATEWAY_SINGLE_SLOT_REQUIRED')
    return {
      verified: true,
      protocol: raw.protocol,
      maxConcurrency: 1,
      queued: raw.queued,
      running: raw.running,
      checkedAt,
    }
  } catch (error: any) {
    return {
      verified: false,
      checkedAt,
      reason: /^EMPLOYEE_GATEWAY_[A-Z_]+$/.test(error?.message || '')
        ? error.message
        : 'EMPLOYEE_GATEWAY_HEALTH_UNAVAILABLE',
    }
  }
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
  // Expose only the original qualification audit and its current same-store order.
  // Profile status alone is never proof of an actual qualifying purchase.
  const earnedOrder =
    earnedMember && earned?.orderId
      ? await db.order.findFirst({
          where: { id: earned.orderId, storeId: grant.storeId, memberId: earnedMember.id },
          select: { id: true, status: true, finalAmount: true },
        })
      : null
  const qualificationAudit =
    earnedMember && earned
      ? {
          memberId: earnedMember.id,
          orderId: earned.orderId,
          paidAmount: earned.paidAmount,
          minimumPaidAmount: earned.minimumPaidAmount,
          policyVersion: earned.policyVersion,
          qualifiedAt: earned.qualifiedAt,
          evidenceType: 'persisted_paid_order_qualification_receipt',
          currentOrder: earnedOrder
            ? {
                id: earnedOrder.id,
                status: earnedOrder.status,
                finalAmount: earnedOrder.finalAmount,
              }
            : null,
        }
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
  const ownerTaskChannels: any[] = []
  if (grant.capabilities?.includes('hermes.owner_tasks.submit')) {
    const channels = await db.config.findMany({
      where: { storeId: grant.storeId, key: { startsWith: 'team.communication.channel.' } },
    })
    for (const row of channels) {
      const c = JSON.parse(row.value)
      if (!c.id || !Array.isArray(c.members) || c.members.length !== 2) continue
      try {
        const context = await ownerTaskContext(db, credential, c.id)
        ownerTaskChannels.push({
          id: c.id,
          title: c.title,
          taskId: context.route.task.taskId,
          agentId: context.grant.agentId,
        })
      } catch {
        /* unavailable/changed routes are not advertised */
      }
    }
  }
  return {
    gateway: grant.capabilities?.includes('hermes.owner_tasks.submit')
      ? await operationsGatewayState(db)
      : { verified: false, reason: 'OPERATIONS_ROLE_DELEGATION_REQUIRED' },
    capabilities: grant.capabilities || [],
    ownerTaskChannels,
    quoteCandidates,
    qualificationAudit,
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
export async function applyOperationsPolicy(credential:string,raw:unknown,db:any=prisma) {
  const v=applyInput.parse(raw)
  const receipt=await db.$transaction(async(tx:any)=>{
    const grant=await resolve(tx,credential,true)
    return applyDailyMembershipPolicy(tx,grant,v)
  },{isolationLevel:'Serializable'})
  notifyActivities(receipt.storeId)
  return receipt
}

const operationsTaskInput = z
  .object({
    requestId: z.string().uuid(),
    channelId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict()
async function ownerTaskContext(db: any, credential: string, channelId: string, lock = false) {
  const delegation = await resolve(db, credential, lock)
  if (!delegation.capabilities?.includes('hermes.owner_tasks.submit'))
    fail('OPERATIONS_ROLE_DELEGATION_REQUIRED')
  const { owner, settings } = await ownerAllowed(
    db,
    delegation.ownerId,
    delegation.storeId,
    delegation.ownerSecurityFingerprint,
  )
  if (
    settings.operationProfile !== 'store_operations' ||
    !settings.employeeBridgeEnabled ||
    !owner.staff?.id
  )
    fail('OPERATIONS_ROLE_PROFILE_REQUIRED')
  const channel = await readTeam<any>(db, delegation.storeId, 'channel.' + channelId)
  if (!channel || channel.archived) fail('OPERATIONS_OWNER_CHANNEL_REQUIRED')
  const route = employeeRouteSchema.parse(
    await db.config
      .findUnique({
        where: { storeId_key: { storeId: delegation.storeId, key: employeeRouteKey(channelId) } },
      })
      .then((r: any) => r && JSON.parse(r.value)),
  )
  const row = await db.config.findUnique({
    where: { storeId_key: { storeId: delegation.storeId, key: employeeGrantKey(route.agentId) } },
  })
  const grant = grantSchema.parse(row && JSON.parse(row.value))
  if (
    process.env.EMPLOYEE_HERMES_AGENT_ID &&
    grant.agentId !== process.env.EMPLOYEE_HERMES_AGENT_ID
  )
    fail('OPERATIONS_OWNER_ROUTE_REQUIRED')
  if (
    grant.sponsorUserId !== owner.id ||
    route.sourceStaffId !== owner.staff.id ||
    !route.enabled ||
    route.paused ||
    Date.parse(route.expiresAt) <= Date.now()
  )
    fail('OPERATIONS_OWNER_ROUTE_REQUIRED')
  const humans = channel.members.filter((m: any) => !m.staffId.startsWith('agent:'))
  if (
    humans.length !== 1 ||
    humans[0].staffId !== owner.staff.id ||
    channel.members.some(
      (m: any) => m.staffId.startsWith('agent:') && m.staffId !== 'agent:' + grant.agentId,
    )
  )
    fail('OPERATIONS_OWNER_PRIVATE_AUDIENCE_REQUIRED')
  if (
    !grant.channelIds.includes(channelId) ||
    !['messages.read', 'messages.send', 'tasks.read'].every((action) =>
      grant.actions.includes(action as any),
    )
  )
    fail('OPERATIONS_OWNER_ROUTE_REQUIRED')
  const task = await readTeam<any>(
    db,
    delegation.storeId,
    'task.' + channelId + '.' + route.task.taskId,
  )
  if (
    !task ||
    task.id !== route.task.taskId ||
    task.version !== route.task.version ||
    task.ownerId !== 'agent:' + grant.agentId ||
    !['assigned', 'accepted', 'submitted', 'changes_requested'].includes(task.status)
  )
    fail('OPERATIONS_OWNER_TASK_CHANGED')
  await readAuthorizedBridgeChannel(db, grant, route.task, channelId, channel)
  return { delegation, owner, route, grant, channel }
}
/** Enqueue into the existing native Hermes worker. Never run a second model loop.
 * The owner identity is resolved from the explicit role delegation, not caller JSON.
 */
export async function submitOperationsTask(
  credential: string,
  raw: unknown,
  db: any = prisma,
  ports: OperationsTaskPorts = taskPorts,
) {
  const input = operationsTaskInput.parse(raw)
  const initialGrant = await resolve(db, credential)
  if (!initialGrant.capabilities?.includes('hermes.owner_tasks.submit'))
    fail('OPERATIONS_ROLE_DELEGATION_REQUIRED')
  const gateway = await operationsGatewayState(db, ports)
  if (!gateway.verified) fail('OPERATIONS_SINGLE_SLOT_GATEWAY_REQUIRED')
  return db.$transaction(async (tx: any) => {
    const context = await ownerTaskContext(tx, credential, input.channelId, true)
    if (
      process.env.EMPLOYEE_HERMES_ENABLED !== '1' ||
      process.env.EMPLOYEE_HERMES_STORE_ID !== context.delegation.storeId ||
      process.env.EMPLOYEE_HERMES_AGENT_ID !== context.grant.agentId
    )
      fail('OPERATIONS_HERMES_RUNTIME_NOT_CONFIGURED')
    const { delegation, owner, route } = context
    const key = 'store.operations.task.' + delegation.id + '.' + input.requestId
    await lockTeam(tx, delegation.storeId, key)
    const old = await readTeam<any>(tx, delegation.storeId, key),
      fingerprint = hash(JSON.stringify(input))
    if (old) {
      if (old.fingerprint !== fingerprint) fail('OPERATIONS_TASK_REQUEST_CONFLICT')
      return { ...old, alreadySubmitted: true }
    }
    const facade = { ...tx, $transaction: async (fn: any) => fn(tx) }
    const message = await teamCommunication(facade).send(
      {
        id: owner.id,
        storeId: delegation.storeId,
        staffId: owner.staff.id,
        role: 'admin',
        employeeApp: false,
      },
      input.channelId,
      {
        requestId: input.requestId,
        text: input.text,
        files: [],
        expectedLastSeq: context.channel.lastSeq,
      },
      undefined,
      undefined,
      undefined,
      { id: delegation.id, requestId: input.requestId },
    )
    const eventId = hash(JSON.stringify(['employee_work', input.channelId, message.id]))
    const pending = await tx.config.findUnique({
      where: { storeId_key: { storeId: delegation.storeId, key: employeeIntakeKey(eventId) } },
    })
    if (!pending || JSON.parse(pending.value).state !== 'pending')
      fail('OPERATIONS_HERMES_NOT_QUEUED')
    const receipt = {
      requestId: input.requestId,
      fingerprint,
      delegationId: delegation.id,
      agentId: context.grant.agentId,
      origin: 'owner_operations_delegation',
      channelId: input.channelId,
      taskId: route.task.taskId,
      messageId: message.id,
      sourceSeq: message.seq,
      eventId,
      submittedAt: new Date().toISOString(),
      state: 'queued',
      businessCompleted: false,
      gateway,
    }
    await tx.config.create({
      data: {
        storeId: delegation.storeId,
        key: 'team.communication.' + key,
        category: 'agent_operations',
        value: JSON.stringify(receipt),
      },
    })
    await tx.financeAuditLog.create({
      data: {
        storeId: delegation.storeId,
        userId: 'service:operations-delegation',
        action: 'create',
        entityType: 'hermes_owner_operations_task',
        entityId: input.requestId,
        description: 'Submit owner-delegated internal task to the existing Hermes runtime',
        newValue: JSON.stringify(receipt),
      },
    })
    return receipt
  })
}
export async function operationsTaskStatus(
  credential: string,
  requestId: string,
  db: any = prisma,
) {
  z.string().uuid().parse(requestId)
  const delegation = await resolve(db, credential)
  const receipt = await readTeam<any>(
    db,
    delegation.storeId,
    'store.operations.task.' + delegation.id + '.' + requestId,
  )
  if (!receipt) fail('OPERATIONS_TASK_NOT_FOUND')
  await ownerTaskContext(db, credential, receipt.channelId)
  const row = await db.config.findUnique({
    where: {
      storeId_key: { storeId: delegation.storeId, key: employeeIntakeKey(receipt.eventId) },
    },
  })
  const pending = row && JSON.parse(row.value)
  const mappings = await db.config.findMany({
    where: {
      storeId: delegation.storeId,
      key: { startsWith: 'team.communication.employeeOrchestration.mapping.' },
    },
  })
  const mapping = mappings
    .map((r: any) => JSON.parse(r.value))
    .find((m: any) => m.sourceMessageId === receipt.messageId)
  const execution = mapping?.executionId
    ? await readTeam<any>(
        db,
        delegation.storeId,
        'employeeRuntime.execution.' + mapping.executionId,
      )
    : null
  if (
    execution &&
    (execution.scope?.channelId !== receipt.channelId ||
      execution.scope?.task?.taskId !== receipt.taskId)
  )
    fail('OPERATIONS_TASK_EXECUTION_SCOPE_CHANGED')
  const outbound: any[] = []
  for (const t of execution?.tools || [])
    if (t.name === 'employee_send_message' && t.value?.messageId && Number.isInteger(t.value.seq)) {
      const message = await readTeam<any>(
        db,
        delegation.storeId,
        'message.' + receipt.channelId + '.' + String(t.value.seq).padStart(12, '0'),
      )
      if (
        message?.id === t.value.messageId &&
        message.authorId === 'agent:' + execution.grant.agentId
      )
        outbound.push({
          messageId: message.id,
          seq: message.seq,
          text: message.text,
          expectsReply: t.value.expectsReply === true,
          delivery: 'stored',
        })
    }
  return {
    ...receipt,
    intake: pending
      ? { state: pending.state, reason: pending.reason || null, updatedAt: pending.updatedAt }
      : null,
    execution: execution
      ? { id: mapping.executionId, phase: execution.phase, fault: execution.fault || null }
      : null,
    outbound,
    operationReceipts: (execution?.tools || [])
      .filter((t: any) => t.mutating && t.name !== 'employee_send_message')
      .map((t: any) => ({ toolCallId: t.toolCallId, tool: t.name, value: t.value })),
    executionCompleted: execution?.phase === 'complete',
    businessCompleted: false,
    independentAcceptance: 'not_reviewed',
  }
}
