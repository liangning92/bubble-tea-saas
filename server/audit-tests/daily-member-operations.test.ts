import { test, jest } from '@jest/globals'
import * as TeamService from '../src/services/TeamCommunicationService'
import assert from 'node:assert/strict'
import {
  createOperationsDelegation,
  applyOperationsPolicy,
  readOperationsState,
  revokeOperationsDelegation,
  operationsOwnerState,
  quoteOperationsSpecials,
  submitOperationsTask,
  operationsTaskStatus,
} from '../src/services/StoreOperationsDelegationService'
import {
  paidOrderQualifies,
  qualifyMembershipAfterPayment,
  MEMBERSHIP_POLICY_KEY,
  processMembershipQualificationBenefits,
} from '../src/services/MembershipQualificationService'
import { quoteActivities } from '../src/services/ActivityService'

function fixture() {
  const pointLogs: any[] = [],
    grantedCoupons: any[] = []
  const rows: any[] = [],
    members: any[] = [
      { id: 'member', storeId: 'store', status: 'pending', points: 0, level: 'bronze' },
    ],
    orders: any[] = []
  const activity = {
    id: 'special',
    storeId: 'store',
    version: 1,
    name: 'Promo Senin',
    description: 'Original',
    type: 'special_price',
    status: 'published',
    priority: 1,
    timezone: 'Asia/Jakarta',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    channels: [],
    paymentMethods: [],
    productIds: ['product'],
    specIds: [],
    excludedProductIds: [],
    memberOnly: false,
    memberLevels: [],
    showOnTv: true,
    used: 0,
    rule: { price: 8000 },
  }
  const add = (key: string, value: any) =>
    rows.push({
      id: String(rows.length + 1),
      storeId: 'store',
      key,
      value: JSON.stringify(value),
      createdAt: new Date(),
    })
  add('marketing.unified.activity.special', activity)
  add('team.communication.ai.agent.settings', {
    enabled: true,
    permissions: { marketing: { write: true }, members: { write: true } },
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
  const matches = (r: any, w: any) =>
    Object.entries(w || {}).every(([k, v]: any) =>
      typeof v === 'object' && v !== null
        ? v.startsWith
          ? r[k]?.startsWith(v.startsWith)
          : true
        : r[k] === v,
    )
  const db: any = {
    config: {
      findUnique: async ({ where }: any) => rows.find((r) => matches(r, where.storeId_key)),
      findFirst: async ({ where }: any) => rows.find((r) => matches(r, where)),
      findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)),
      create: async ({ data }: any) => {
        if (rows.some((r) => r.storeId === data.storeId && r.key === data.key))
          throw Error('duplicate')
        const r = { id: String(rows.length + 1), ...data }
        rows.push(r)
        return r
      },
      upsert: async ({ where, create, update }: any) => {
        const r = rows.find((r) => matches(r, where.storeId_key))
        if (r) {
          Object.assign(r, update)
          return r
        }
        const a = { id: String(rows.length + 1), ...create }
        rows.push(a)
        return a
      },
      updateMany: async ({ where, data }: any) => {
        const matched = rows.filter((r) => matches(r, where))
        matched.forEach((r) => Object.assign(r, data))
        return { count: matched.length }
      },
    },
    user: {
      findUnique: async () => ({
        id: 'owner',
        password: 'bcrypt-security-version',
        role: 'admin',
        storeId: 'store',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        staff: { storeId: 'store', status: 'active' },
      }),
    },
    store: { update: async () => ({ id: 'store' }) },
    member: {
      update: async ({ where, data }: any) => {
        const m = members.find((r) => r.id === where.id)
        m.points += data.points.increment
        return m
      },
      findFirst: async ({ where }: any) => members.find((r) => matches(r, where)),
      updateMany: async ({ where, data }: any) => {
        const found = members.filter((r) => matches(r, where))
        for (const r of found) {
          r.status = data.status
          r.points += data.points?.increment || 0
        }
        return { count: found.length }
      },
    },
    order: { findFirst: async ({ where }: any) => orders.find((r) => matches(r, where)) },
    pointLog: {
      create: async ({ data }: any) => {
        pointLogs.push(data)
        return data
      },
    },
    campaign: { findFirst: async () => null },
    coupon: { findFirst: async () => null },
    memberCoupon: {
      upsert: async ({ create }: any) => {
        if (
          !grantedCoupons.some(
            (r) => r.memberId === create.memberId && r.couponId === create.couponId,
          )
        )
          grantedCoupons.push(create)
        return create
      },
    },
    product: {
      findMany: async () => [
        {
          id: 'product',
          name: 'Real test catalog product',
          specs: [{ id: 'spec', price: 16000, isDefault: true }],
        },
      ],
    },
    channel: { findFirst: async () => null },
    spec: { findFirst: async () => ({ price: 16000 }) },
    addon: { findFirst: async () => null },
  }
  db.$transaction = async (fn: any) => {
    const before = JSON.stringify({ rows, members, pointLogs, grantedCoupons })
    try {
      return await fn(db)
    } catch (e) {
      const b = JSON.parse(before)
      rows.splice(0, rows.length, ...b.rows)
      members.splice(0, members.length, ...b.members)
      pointLogs.splice(0, pointLogs.length, ...b.pointLogs)
      grantedCoupons.splice(0, grantedCoupons.length, ...b.grantedCoupons)
      throw e
    }
  }
  return { db, rows, members, orders, activity, pointLogs, grantedCoupons }
}
const grantInput = () => ({
  activityIds: ['special'],
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  confirm: 'daily_member_specials_and_single_paid_order_30000',
})
const apply = () => ({
  requestId: 'a4a64991-ed04-4f4d-82bd-f7ff77d7136a',
  expectedPolicyVersion: 0,
  activities: [{ id: 'special', version: 1 }],
  minimumPaidAmount: 30000,
  memberOnly: true,
})
test('Agent applies member-only plus one-time qualification atomically without changing price or schedule', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db),
    r = await applyOperationsPolicy(g.credential, apply(), f.db)
  assert.equal(r.policy.minimumPaidAmount, 30000)
  assert.equal(r.policy.qualifyOnce, true)
  assert.equal(r.activities[0].memberOnly, true)
  for (const field of ['rule', 'weekdays', 'productIds', 'channels', 'status'])
    assert.deepEqual(r.activities[0][field], f.activity[field as keyof typeof f.activity])
  const again = await applyOperationsPolicy(g.credential, apply(), f.db)
  assert.equal(again.alreadyApplied, true)
  assert.equal(again.policy.version, 1)
  assert.equal((await readOperationsState(g.credential, f.db)).receipts.length, 1)
})
test('Wrong version rolls back both policy and activity mutation', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  await assert.rejects(
    () =>
      applyOperationsPolicy(
        g.credential,
        { ...apply(), activities: [{ id: 'special', version: 3 }] },
        f.db,
      ),
    /VERSION_CHANGED/,
  )
  assert.equal(
    f.rows.some((r) => r.key === MEMBERSHIP_POLICY_KEY),
    false,
  )
})
test('Unscoped activity, changed threshold, duplicate IDs, changed replay and revoked credentials fail closed', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  await assert.rejects(
    () =>
      applyOperationsPolicy(
        g.credential,
        { ...apply(), activities: [{ id: 'other', version: 1 }] },
        f.db,
      ),
    /NOT_GRANTED/,
  )
  await assert.rejects(() =>
    applyOperationsPolicy(g.credential, { ...apply(), minimumPaidAmount: 1 }, f.db),
  )
  await assert.rejects(
    () =>
      applyOperationsPolicy(
        g.credential,
        {
          ...apply(),
          activities: [
            { id: 'special', version: 1 },
            { id: 'special', version: 1 },
          ],
        },
        f.db,
      ),
    /NOT_GRANTED/,
  )
  await applyOperationsPolicy(g.credential, apply(), f.db)
  await assert.rejects(
    () => applyOperationsPolicy(g.credential, { ...apply(), expectedPolicyVersion: 1 }, f.db),
    /IDEMPOTENCY_CONFLICT/,
  )
  await revokeOperationsDelegation('store', 'owner', g.delegation.id, f.db)
  await assert.rejects(() => readOperationsState(g.credential, f.db), /CREDENTIAL_INVALID/)
})
test('Current module permission withdrawal and wrong owner/store deny the machine', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  const setting = f.rows.find((r) => r.key.endsWith('ai.agent.settings'))
  const s = JSON.parse(setting.value)
  s.permissions.members.write = false
  setting.value = JSON.stringify(s)
  await assert.rejects(() => readOperationsState(g.credential, f.db), /AUTHORIZATION_REQUIRED/)
  await assert.rejects(
    () => createOperationsDelegation('other', 'owner', grantInput(), f.db),
    /OWNER_REVOKED/,
  )
})
test('Delegation follows existing business expiry, with no repeated 30-day limit or silent extension', async () => {
  const f = fixture(),
    setting = f.rows.find((r) => r.key.endsWith('ai.agent.settings')),
    s = JSON.parse(setting.value)
  const existing = new Date(Date.now() + 200 * 86400000).toISOString()
  s.expiresAt = existing
  setting.value = JSON.stringify(s)
  const g = await createOperationsDelegation(
    'store',
    'owner',
    { ...grantInput(), expiresAt: existing },
    f.db,
  )
  assert.equal(g.delegation.expiresAt, existing)
  await assert.rejects(
    () =>
      createOperationsDelegation(
        'store',
        'owner',
        { ...grantInput(), expiresAt: new Date(Date.now() + 201 * 86400000).toISOString() },
        f.db,
      ),
    /EXPIRY_OUT_OF_SCOPE/,
  )
  await assert.rejects(
    () => createOperationsDelegation('store', 'owner', { ...grantInput(), expiresAt: null }, f.db),
    /EXPIRY_OUT_OF_SCOPE/,
  )
  s.expiresAt = null
  setting.value = JSON.stringify(s)
  const continuous = await createOperationsDelegation(
    'store',
    'owner',
    { ...grantInput(), expiresAt: null },
    f.db,
  )
  assert.equal((await readOperationsState(continuous.credential, f.db)).expiresAt, null)
})
test('Ordinary profile timestamp change preserves access; password/role/store revocation does not', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  const owner = await f.db.user.findUnique({})
  owner.updatedAt = new Date()
  f.db.user.findUnique = async () => owner
  assert.equal((await readOperationsState(g.credential, f.db)).storeId, 'store')
  owner.password = 'changed-bcrypt-security-version'
  await assert.rejects(() => readOperationsState(g.credential, f.db), /OWNER_REVOKED/)
  owner.password = 'bcrypt-security-version'
  owner.role = 'manager'
  await assert.rejects(() => readOperationsState(g.credential, f.db), /OWNER_REVOKED/)
  owner.role = 'admin'
  owner.storeId = 'other'
  owner.staff.storeId = 'other'
  await assert.rejects(() => readOperationsState(g.credential, f.db), /OWNER_REVOKED/)
})
test('Withdrawn module permission does not block owner inspection and explicit revocation', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  const setting = f.rows.find((r) => r.key.endsWith('ai.agent.settings')),
    s = JSON.parse(setting.value)
  s.enabled = false
  setting.value = JSON.stringify(s)
  const view = await operationsOwnerState('store', 'owner', f.db)
  assert.equal(view.canDelegate, false)
  assert.equal('secretHash' in view.delegations[0], false)
  assert.equal('ownerSecurityFingerprint' in view.delegations[0], false)
  await revokeOperationsDelegation('store', 'owner', g.delegation.id, f.db)
  await assert.rejects(() => readOperationsState(g.credential, f.db), /CREDENTIAL_INVALID/)
})
test('Only a real same-store same-person completed order at 30000 qualifies, never cumulative or unpaid', () => {
  const member = { id: 'member', storeId: 'store' },
    policy: any = { enabled: true, minimumPaidAmount: 30000 }
  const order = {
    id: 'order',
    storeId: 'store',
    memberId: 'member',
    status: 'completed',
    finalAmount: 30000,
  }
  assert.equal(paidOrderQualifies(order, member, policy), true)
  for (const patch of [
    { finalAmount: 29999 },
    { status: 'suspended' },
    { status: 'cancelled' },
    { storeId: 'other' },
    { memberId: 'other' },
  ])
    assert.equal(paidOrderQualifies({ ...order, ...patch }, member, policy), false)
})
test('Before qualification normal price applies; after completed qualifying order later small purchases get member price', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  await applyOperationsPolicy(g.credential, apply(), f.db)
  const input = {
    items: [{ productId: 'product', specId: 'spec', quantity: 1, unitPrice: 16000 }],
    memberId: 'member',
    taxEnabled: false,
  }
  const before = await quoteActivities('store', input, f.db)
  assert.equal(before.finalAmount, 16000)
  assert.equal(before.context.member, undefined)
  f.orders.push({
    id: 'first',
    storeId: 'store',
    memberId: 'member',
    status: 'completed',
    finalAmount: 30000,
    orderNumber: 'REAL-SIMULATED-TEST',
  })
  const r = await qualifyMembershipAfterPayment(f.db, 'store', 'member', 'first')
  assert.equal(r.paidAmount, 30000)
  assert.equal(f.members[0].status, 'active')
  assert.equal(f.members[0].points, 100)
  assert.equal(await qualifyMembershipAfterPayment(f.db, 'store', 'member', 'first'), null)
  const after = await quoteActivities('store', input, f.db)
  assert.equal(after.finalAmount, 8000)
  const without = await quoteActivities('store', { ...input, memberId: undefined }, f.db)
  assert.equal(without.finalAmount, 16000)
})
test('Original referral and welcome coupon are deferred durably, retried after failure, and never duplicated', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  await applyOperationsPolicy(g.credential, apply(), f.db)
  f.members.push({ id: 'inviter', storeId: 'store', status: 'active', points: 0 })
  f.rows.push({
    id: 'enrollment',
    storeId: 'store',
    key: 'membership.qualification.enrollment.member',
    value: JSON.stringify({
      referrerId: 'inviter',
      welcomeCampaignId: 'welcome',
      couponId: 'coupon',
      messageTemplateId: 'existing-notification',
    }),
  })
  f.orders.push({
    id: 'first',
    storeId: 'store',
    memberId: 'member',
    status: 'completed',
    finalAmount: 30000,
    orderNumber: 'TEST-ONLY',
  })
  await qualifyMembershipAfterPayment(f.db, 'store', 'member', 'first')
  f.db.campaign.findFirst = async ({ where }: any) =>
    where.storeId === 'store' ? { id: 'welcome', storeId: 'store' } : null
  await processMembershipQualificationBenefits(f.db)
  assert.equal(f.members.find((m) => m.id === 'inviter').points, 500)
  assert.equal(f.grantedCoupons.length, 0)
  const job = f.rows.find((r) => r.key === 'membership.qualification.benefits.member'),
    state = JSON.parse(job.value)
  assert.equal(state.status, 'pending')
  assert.equal(state.attempts, 1)
  assert.equal(state.applied.referralPoints, 500)
  delete state.nextAttemptAt
  job.value = JSON.stringify(state)
  f.db.coupon.findFirst = async ({ where }: any) =>
    where.storeId === 'store' ? { id: 'coupon', storeId: 'store' } : null
  await processMembershipQualificationBenefits(f.db)
  assert.equal(f.members.find((m) => m.id === 'inviter').points, 500)
  assert.equal(f.grantedCoupons.length, 1)
  assert.equal(JSON.parse(job.value).notificationState, 'pending_existing_no_cost_channel')
  await processMembershipQualificationBenefits(f.db)
  assert.equal(f.members.find((m) => m.id === 'inviter').points, 500)
  assert.equal(f.grantedCoupons.length, 1)
  assert.equal(f.pointLogs.filter((p) => p.points === 100).length, 1)
})
test('Scoped cashier quote uses actual product prices and does not create business records', async () => {
  const f = fixture(),
    g = await createOperationsDelegation('store', 'owner', grantInput(), f.db)
  await applyOperationsPolicy(g.credential, apply(), f.db)
  const input = {
    sideEffectFree: true,
    items: [{ productId: 'product', specId: 'spec', quantity: 1 }],
    taxEnabled: false,
  }
  const beforeRows = f.rows.length,
    beforeOrders = f.orders.length
  const quoted = await quoteOperationsSpecials(g.credential, input, f.db)
  assert.equal(quoted.finalAmount, 16000)
  assert.equal(quoted.sideEffectFree, true)
  assert.equal(quoted.qualificationGranted, false)
  assert.equal(f.rows.length, beforeRows)
  assert.equal(f.orders.length, beforeOrders)
  await assert.rejects(
    () =>
      quoteOperationsSpecials(
        g.credential,
        { ...input, items: [{ productId: 'not-granted', specId: 'spec', quantity: 1 }] },
        f.db,
      ),
    /PRODUCT_NOT_GRANTED/,
  )
  await assert.rejects(
    () => quoteOperationsSpecials(g.credential, { ...input, memberId: 'foreign' }, f.db),
    /MEMBER_STORE_MISMATCH/,
  )
})

test('state exposes minimal real qualification audit with same-store order, not private member data', async () => {
  const f = fixture()
  const g = await createOperationsDelegation(
    'store',
    'owner',
    {
      activityIds: ['special'],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confirm: 'daily_member_specials_and_single_paid_order_30000',
    },
    f.db,
  )
  assert.equal((await readOperationsState(g.credential, f.db)).qualificationAudit, null)
  f.members[0].status = 'active'
  f.members[0].phone = 'private-phone'
  f.rows.push({
    storeId: 'store',
    key: 'membership.qualification.receipt.member',
    value: JSON.stringify({
      memberId: 'member',
      storeId: 'store',
      orderId: 'earned-order',
      paidAmount: 30000,
      minimumPaidAmount: 30000,
      policyVersion: 1,
      qualifiedAt: '2026-10-28T00:00:00.000Z',
      privateExtra: 'must-not-leak',
    }),
  })
  f.orders.push({
    id: 'earned-order',
    storeId: 'other',
    memberId: 'member',
    status: 'completed',
    finalAmount: 30000,
  })
  const first = await readOperationsState(g.credential, f.db)
  assert.equal(first.qualificationAudit.currentOrder, null)
  f.orders[0].storeId = 'store'
  const audit = (await readOperationsState(g.credential, f.db)).qualificationAudit
  assert.equal(audit.orderId, 'earned-order')
  assert.equal(audit.paidAmount, 30000)
  assert.equal(audit.currentOrder.status, 'completed')
  assert.equal(audit.policyVersion, 1)
  assert.equal(audit.qualifiedAt, '2026-10-28T00:00:00.000Z')
  assert.equal(JSON.stringify(audit).includes('private'), false)
})


test('owner task handoff requires explicit full role and private live route; replay does not resubmit', async () => {
 const f=fixture(), add=(key:string,value:any)=>f.rows.push({id:String(f.rows.length+1),storeId:'store',key,value:JSON.stringify(value)})
 const channelId='11111111-1111-4111-8111-111111111111', agentId='22222222-2222-4222-8222-222222222222', taskId='33333333-3333-4333-8333-333333333333'
 const previous={enabled:process.env.EMPLOYEE_HERMES_ENABLED,store:process.env.EMPLOYEE_HERMES_STORE_ID,agent:process.env.EMPLOYEE_HERMES_AGENT_ID}
 const settingsRow=f.rows.find(r=>r.key==='team.communication.ai.agent.settings')
 const settings=JSON.parse(settingsRow.value);settings.operationProfile='store_operations';settings.employeeBridgeEnabled=true;settingsRow.value=JSON.stringify(settings)
 f.db.user.findUnique=async()=>({id:'owner',role:'admin',storeId:'store',password:'bcrypt-security-version',staff:{id:'owner-staff',storeId:'store',status:'active'}})
 f.db.staff={findMany:async()=>[{id:'owner-staff',userId:'owner',user:{id:'owner',storeId:'store'}}]}
 f.db.financeAuditLog={create:jest.fn(async()=>({}))}
 const route={version:1,agentId,task:{taskId,version:1},sourceStaffId:'owner-staff',fromSeq:1,enabled:true,paused:false,expiresAt:new Date(Date.now()+3600000).toISOString()}
 const channel={id:channelId,title:'Owner private operations',ownerId:'owner-staff',kind:'direct',archived:false,lastSeq:0,members:[{staffId:'owner-staff',fromSeq:1},{staffId:'agent:'+agentId,fromSeq:1}]}
 add('team.communication.channel.'+channelId,channel)
 add('team.communication.task.'+channelId+'.'+taskId,{id:taskId,version:1,ownerId:'agent:'+agentId,status:'assigned'})
 add('externalAgent.teamBridge.v1.employeeRoute.'+channelId,route)
 add('externalAgent.teamBridge.v1.channel.'+channelId,{agentId,task:route.task})
 add('externalAgent.teamBridge.v1.grant.'+agentId,{agentId,displayName:'Hermes',storeId:'store',sponsorUserId:'owner',version:1,clientRevision:1,expiresAt:route.expiresAt,revoked:false,actions:['messages.read','messages.send','tasks.read'],staffIds:['owner-staff'],channelIds:[channelId]})
 const narrow=await createOperationsDelegation('store','owner',{activityIds:['special'],expiresAt:route.expiresAt,confirm:'daily_member_specials_and_single_paid_order_30000'},f.db)
 const input={requestId:'44444444-4444-4444-8444-444444444444',channelId,text:'Review today and assign authorized routine work.'}
 const ports={gatewayHealth:async()=>({status:'ok',protocol:'employee_work_trace_v1',maxConcurrency:1,queued:0,running:0})}
 await assert.rejects(()=>submitOperationsTask(narrow.credential,input,f.db,ports),/ROLE_DELEGATION_REQUIRED/)
 let full:any
 const send=jest.fn(async(actor:any,id:string,v:any,...rest:any[])=>{
  assert.equal(actor.staffId,'owner-staff');assert.equal(actor.role,'admin');assert.equal(id,channelId)
  assert.equal(rest.at(-1).id,full.delegation.id)
  const message={id:'native-message',seq:1}; const eventId=require('crypto').createHash('sha256').update(JSON.stringify(['employee_work',id,message.id])).digest('hex')
  add('externalAgent.teamBridge.v1.employeePending.'+eventId,{state:'pending',updatedAt:new Date().toISOString()})
  return message
 })
 const create=jest.fn(async(actor:any,input:any)=>{assert.equal(actor.staffId,'owner-staff');assert.equal(input.kind,'direct');assert.deepEqual(input.members,['agent:'+agentId]);add('team.communication.channel.'+channelId,channel);return channel})
 const spy=jest.spyOn(TeamService,'teamCommunication').mockImplementation(()=>({send,create}) as any)
 try {
  process.env.EMPLOYEE_HERMES_ENABLED='1';process.env.EMPLOYEE_HERMES_STORE_ID='store';process.env.EMPLOYEE_HERMES_AGENT_ID=agentId
  full=await createOperationsDelegation('store','owner',{activityIds:[],expiresAt:route.expiresAt,confirm:'full_store_operations_role'},f.db)
  assert.equal(create.mock.calls.length,0)
  assert.equal((await readOperationsState(full.credential,f.db)).ownerTaskChannels[0].id,channelId)
  await assert.rejects(()=>submitOperationsTask(full.credential,input,f.db,{gatewayHealth:async()=>({status:'ok',protocol:'employee_work_trace_v1',maxConcurrency:4,queued:0,running:0})}),/SINGLE_SLOT_GATEWAY_REQUIRED/)
  assert.equal(send.mock.calls.length,0)
  const submitted=await submitOperationsTask(full.credential,input,f.db,ports)
  assert.equal(submitted.origin,'owner_operations_delegation');assert.equal(submitted.businessCompleted,false)
  assert.equal((await submitOperationsTask(full.credential,input,f.db,ports)).alreadySubmitted,true);assert.equal(send.mock.calls.length,1)
  await assert.rejects(()=>submitOperationsTask(full.credential,{...input,text:'Changed'},f.db,ports),/REQUEST_CONFLICT/)
  await assert.rejects(()=>submitOperationsTask(full.credential,{...input,requesterStaffId:'owner'},f.db,ports))
  const status=await operationsTaskStatus(full.credential,input.requestId,f.db)
  assert.equal(status.execution,null);assert.deepEqual(status.outbound,[]);assert.equal(status.executionCompleted,false);assert.equal(status.independentAcceptance,'not_reviewed')
  f.rows.splice(f.rows.findIndex(r=>r.key==='team.communication.channel.'+channelId),1)
  const bootstrapped=await createOperationsDelegation('store','owner',{activityIds:[],expiresAt:route.expiresAt,confirm:'full_store_operations_role'},f.db)
  assert.equal(create.mock.calls.length,1);assert.equal(bootstrapped.ownerTaskChannels[0].agentId,agentId)
  channel.members.push({staffId:'another-employee',fromSeq:1});f.rows.find(r=>r.key==='team.communication.channel.'+channelId).value=JSON.stringify(channel)
  await assert.rejects(()=>operationsTaskStatus(full.credential,input.requestId,f.db),/PRIVATE_AUDIENCE_REQUIRED/)
 }finally{
  spy.mockRestore()
  for(const [name,value] of Object.entries({EMPLOYEE_HERMES_ENABLED:previous.enabled,EMPLOYEE_HERMES_STORE_ID:previous.store,EMPLOYEE_HERMES_AGENT_ID:previous.agent}))if(value===undefined)delete process.env[name];else process.env[name]=value
 }
})
