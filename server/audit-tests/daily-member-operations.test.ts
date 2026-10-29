import {applyDailyMembershipPolicy} from '../src/services/DailyMembershipOperationsService'
import { test, jest } from '@jest/globals'
import * as TeamService from '../src/services/TeamCommunicationService'
import assert from 'node:assert/strict'
import {
  createOperationsDelegation,
  readOperationsState,
  revokeOperationsDelegation,
  operationsOwnerState,
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
const apply = () => ({requestId:'a4a64991-ed04-4f4d-82bd-f7ff77d7136a',expectedPolicyVersion:0,activities:[{id:'special',version:1}],minimumPaidAmount:30000,memberOnly:true})
const configure=(f:any,input:any=apply())=>f.db.$transaction((tx:any)=>applyDailyMembershipPolicy(tx,{id:'normal-backend-fixture',storeId:'store',ownerId:'owner',activityIds:['special']},input))
test('normal backend membership policy is atomic and idempotent without changing product prices or schedules',async()=>{
 const f=fixture(),result=await configure(f);assert.equal(result.policy.minimumPaidAmount,30000);assert.equal(result.policy.qualifyOnce,true);assert.equal(result.activities[0].memberOnly,true)
 for(const key of ['rule','weekdays','productIds','channels','status'])assert.deepEqual(result.activities[0][key],f.activity[key as keyof typeof f.activity])
 assert.equal((await configure(f)).alreadyApplied,true)
})
test('normal backend rejects stale activity versions atomically',async()=>{
 const f=fixture();await assert.rejects(()=>configure(f,{...apply(),activities:[{id:'special',version:3}]}),/VERSION_CHANGED/);assert.equal(f.rows.some(r=>r.key===MEMBERSHIP_POLICY_KEY),false)
})
test('retired per-activity connection enrollment cannot create credentials',async()=>{
 const f=fixture();await assert.rejects(()=>createOperationsDelegation('store','owner',{activityIds:['special'],expiresAt:null,confirm:'daily_member_specials_and_single_paid_order_30000'},f.db));assert.equal(f.rows.some(r=>r.key.startsWith('store.operations.delegation.')),false)
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
  const f=fixture();await configure(f)
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
  const f=fixture();await configure(f)
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
test('workbench uses only real owner authority and native private channel; retired flags and trial expiry cannot block tasks', async () => {
 const f=fixture(), add=(key:string,value:any)=>f.rows.push({id:String(f.rows.length+1),storeId:'store',key,value:JSON.stringify(value)})
 const channelId='11111111-1111-4111-8111-111111111111', agentId='22222222-2222-4222-8222-222222222222', taskId='33333333-3333-4333-8333-333333333333'
 const previous={enabled:process.env.EMPLOYEE_HERMES_ENABLED,store:process.env.EMPLOYEE_HERMES_STORE_ID,agent:process.env.EMPLOYEE_HERMES_AGENT_ID}
 const settingsRow=f.rows.find(r=>r.key==='team.communication.ai.agent.settings')
 const settings=JSON.parse(settingsRow.value);settings.operationProfile='custom';settings.employeeBridgeEnabled=false;settings.expiresAt='2000-01-01T00:00:00Z';settings.permissions={};settingsRow.value=JSON.stringify(settings)
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
 const input={requestId:'44444444-4444-4444-8444-444444444444',channelId,text:'Review today and assign authorized routine work.'}
 const ports={gatewayHealth:async()=>({status:'ok',protocol:'hermes_native_api_v1',maxConcurrency:2,queued:0,running:0})}
 let full:any
 const send=jest.fn(async(actor:any,id:string,v:any,...rest:any[])=>{
  assert.equal(actor.staffId,'owner-staff');assert.equal(actor.role,'admin');assert.equal(id,channelId)
  assert.equal(rest.at(-1).id,full.delegation.id)
  const message={id:'native-message',seq:1}; const eventId=require('crypto').createHash('sha256').update(JSON.stringify(['store',id,message.id])).digest('hex')
  add('team.communication.nativeAgent.job.'+eventId,{id:eventId,channelId:id,messageId:message.id,state:'queued',updatedAt:new Date().toISOString()})
  return message
 })
 const create=jest.fn(async(actor:any,input:any)=>{assert.equal(actor.staffId,'owner-staff');assert.equal(input.kind,'direct');assert.deepEqual(input.members,['agent:'+agentId]);add('team.communication.channel.'+channelId,channel);return channel})
 const spy=jest.spyOn(TeamService,'teamCommunication').mockImplementation(()=>({send,create}) as any)
 try {
  process.env.EMPLOYEE_HERMES_ENABLED='1';process.env.EMPLOYEE_HERMES_STORE_ID='store';process.env.EMPLOYEE_HERMES_AGENT_ID=agentId
  full=await createOperationsDelegation('store','owner',{activityIds:[],expiresAt:route.expiresAt,confirm:'full_store_operations_role'},f.db)
  assert.equal(create.mock.calls.length,0)
  assert.equal((await readOperationsState(full.credential,f.db)).ownerTaskChannels[0].id,channelId)
  await assert.rejects(()=>submitOperationsTask(full.credential,input,f.db,{gatewayHealth:async()=>({status:'ok',protocol:'employee_work_trace_v1',maxConcurrency:4,queued:0,running:0})}),/GATEWAY_UNAVAILABLE/)
  assert.equal(send.mock.calls.length,0)
  const submitted=await submitOperationsTask(full.credential,input,f.db,ports)
  assert.equal(submitted.origin,'owner_operations_delegation');assert.equal(submitted.businessCompleted,false)
  assert.equal((await submitOperationsTask(full.credential,input,f.db,ports)).alreadySubmitted,true);assert.equal(send.mock.calls.length,1)
  await assert.rejects(()=>submitOperationsTask(full.credential,{...input,text:'Changed'},f.db,ports),/REQUEST_CONFLICT/)
  await assert.rejects(()=>submitOperationsTask(full.credential,{...input,requesterStaffId:'owner'},f.db,ports))
  const status=await operationsTaskStatus(full.credential,input.requestId,f.db)
  assert.equal(status.execution.phase,'queued');assert.deepEqual(status.operationReceipts,[]);assert.equal(status.executionCompleted,false);assert.equal(status.independentAcceptance,'not_reviewed')
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
