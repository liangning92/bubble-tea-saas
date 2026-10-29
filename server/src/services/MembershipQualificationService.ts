import prisma from '../config/database'

export const MEMBERSHIP_POLICY_KEY = 'membership.qualification.policy.v1'
export interface MembershipPolicy {
  version: number
  enabled: boolean
  minimumPaidAmount: number
  activatedAt: string
  basis: 'completed_order_final_amount'
  qualifyOnce: true
}
export const defaultMembershipPolicy = (): MembershipPolicy => ({
  version: 0,
  enabled: false,
  minimumPaidAmount: 30000,
  activatedAt: '',
  basis: 'completed_order_final_amount',
  qualifyOnce: true,
})
export async function membershipPolicy(
  storeId: string,
  db: any = prisma,
): Promise<MembershipPolicy> {
  const row = await db.config.findUnique({
    where: { storeId_key: { storeId, key: MEMBERSHIP_POLICY_KEY } },
  })
  return row ? JSON.parse(row.value) : defaultMembershipPolicy()
}
export function paidAmountMeetsMembershipPolicy(amount: number, policy: MembershipPolicy) {
  return !!policy.enabled && Number.isSafeInteger(amount) && amount >= policy.minimumPaidAmount
}
export function paidOrderQualifies(order: any, member: any, policy: MembershipPolicy) {
  return (
    order?.status === 'completed' &&
    order.storeId === member?.storeId &&
    order.memberId === member?.id &&
    paidAmountMeetsMembershipPolicy(order.finalAmount, policy)
  )
}
export function membershipActive(member: any) {
  return !!member && member.status === 'active'
}
export async function initialMembershipStatus(storeId: string, db: any = prisma) {
  return (await membershipPolicy(storeId, db)).enabled ? 'pending' : 'active'
}
export async function createEnrollmentMember(storeId: string, data: any, db: any = prisma) {
  return db.$transaction(
    async (tx: any) => {
      await tx.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } })
      const member = await tx.member.create({
        data: { ...data, storeId, status: await initialMembershipStatus(storeId, tx) },
      })
      if (member.status === 'pending') {
        const campaign = await tx.campaign.findFirst({
          where: { storeId, type: 'welcome', status: 'active' },
        })
        let actions: any = {}
        try {
          actions = JSON.parse(campaign?.actions || '{}')
        } catch {}
        await tx.config.create({
          data: {
            storeId,
            key: 'membership.qualification.enrollment.' + member.id,
            category: 'membership',
            value: JSON.stringify({
              memberId: member.id,
              storeId,
              registeredAt: new Date().toISOString(),
              referrerId: data.referredBy || null,
              welcomeCampaignId: campaign?.id || null,
              couponId: actions.couponId || null,
              messageTemplateId: actions.messageTemplateId || null,
              channelType: actions.channelType || 'whatsapp',
            }),
          },
        })
      }
      return member
    },
    { isolationLevel: 'Serializable' },
  )
}
/** Called only in the completed checkout transaction. Never accepts a client-supplied receipt. */
export async function qualifyMembershipAfterPayment(
  db: any,
  storeId: string,
  memberId: string,
  orderId: string,
) {
  const policy = await membershipPolicy(storeId, db)
  if (!policy.enabled) return null
  const [member, order] = await Promise.all([
    db.member.findFirst({ where: { id: memberId, storeId } }),
    db.order.findFirst({ where: { id: orderId, storeId, memberId } }),
  ])
  if (!member || member.status !== 'pending' || !paidOrderQualifies(order, member, policy))
    return null
  const changed = await db.member.updateMany({
    where: { id: memberId, storeId, status: 'pending' },
    data: { status: 'active', points: { increment: 100 } },
  })
  if (changed.count !== 1) return null
  const receipt = {
    memberId,
    storeId,
    orderId,
    orderNumber: order.orderNumber,
    paidAmount: order.finalAmount,
    minimumPaidAmount: policy.minimumPaidAmount,
    welcomePointsAwarded: 100,
    policyVersion: policy.version,
    qualifiedAt: new Date().toISOString(),
    qualifyOnce: true,
    refundPolicy: 'retain_qualification_refer_refund_anomalies_for_review',
  }
  const key = 'membership.qualification.receipt.' + memberId
  await db.config.create({
    data: { storeId, key, value: JSON.stringify(receipt), category: 'membership' },
  })
  await db.pointLog.create({
    data: {
      memberId,
      type: 'earn',
      points: 100,
      orderId,
      note: 'Membership qualification welcome bonus',
    },
  })
  const enrollment = await db.config.findUnique({
    where: { storeId_key: { storeId, key: 'membership.qualification.enrollment.' + memberId } },
  })
  await db.config.create({
    data: {
      storeId,
      key: 'membership.qualification.benefits.' + memberId,
      category: 'membership_benefit_pending',
      value: JSON.stringify({
        memberId,
        storeId,
        orderId,
        status: 'pending',
        sourceEnrollment: enrollment ? JSON.parse(enrollment.value) : {},
        createdAt: new Date().toISOString(),
        notificationState: 'not_sent_requires_existing_no_cost_channel',
      }),
    },
  })
  return receipt
}

/** Durable, transactionally idempotent delivery of the original configured benefits.
 * No message provider/API is invoked here; notification remains explicitly pending. */
export async function processMembershipQualificationBenefits(db: any = prisma) {
  const rows = await db.config.findMany({
    where: {
      key: { startsWith: 'membership.qualification.benefits.' },
      category: 'membership_benefit_pending',
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  for (const row of rows) {
    try {
      await db.$transaction(
        async (tx: any) => {
          const current = await tx.config.findUnique({
            where: { storeId_key: { storeId: row.storeId, key: row.key } },
          })
          if (!current) return
          const job = JSON.parse(current.value)
          if (
            job.status !== 'pending' ||
            (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now())
          )
            return
          if (
            (
              await tx.config.updateMany({
                where: { id: current.id, value: current.value },
                data: { value: current.value },
              })
            ).count !== 1
          )
            throw Error('MEMBERSHIP_BENEFIT_CONFLICT')
          const member = await tx.member.findFirst({
            where: { id: job.memberId, storeId: job.storeId, status: 'active' },
          })
          if (!member) throw Error('MEMBERSHIP_BENEFIT_MEMBER_UNAVAILABLE')
          const source = job.sourceEnrollment || {},
            applied: any = { ...(job.applied || {}) },
            failures: any = {}
          if (source.referrerId && !applied.referralPoints) {
            const inviter = await tx.member.findFirst({
              where: { id: source.referrerId, storeId: job.storeId, status: 'active' },
            })
            if (!inviter) failures.referral = 'MEMBERSHIP_BENEFIT_REFERRER_UNAVAILABLE'
            else {
              await tx.member.update({
                where: { id: inviter.id },
                data: { points: { increment: 500 } },
              })
              await tx.pointLog.create({
                data: {
                  memberId: inviter.id,
                  type: 'earn',
                  points: 500,
                  orderId: job.orderId,
                  note: 'Deferred membership referral: ' + job.memberId,
                },
              })
              applied.referralPoints = 500
            }
          }
          if (source.couponId && !applied.couponId) {
            const campaign = source.welcomeCampaignId
              ? await tx.campaign.findFirst({
                  where: { id: source.welcomeCampaignId, storeId: job.storeId, type: 'welcome' },
                })
              : null
            const coupon = campaign
              ? await tx.coupon.findFirst({
                  where: {
                    id: source.couponId,
                    storeId: job.storeId,
                    status: 'active',
                    validUntil: { gt: new Date() },
                  },
                })
              : null
            if (!campaign) failures.coupon = 'MEMBERSHIP_BENEFIT_CAMPAIGN_UNAVAILABLE'
            else if (!coupon) failures.coupon = 'MEMBERSHIP_BENEFIT_COUPON_UNAVAILABLE'
            else {
              await tx.memberCoupon.upsert({
                where: { memberId_couponId: { memberId: job.memberId, couponId: source.couponId } },
                create: { memberId: job.memberId, couponId: source.couponId, status: 'unused' },
                update: {},
              })
              applied.couponId = source.couponId
            }
          }
          const pending = Object.keys(failures).length > 0
          await tx.config.updateMany({
            where: { id: current.id, value: current.value },
            data: {
              category: pending ? 'membership_benefit_pending' : 'membership_benefit_fulfilled',
              value: JSON.stringify({
                ...job,
                status: pending ? 'pending' : 'fulfilled',
                applied,
                failures,
                ...(pending
                  ? {
                      attempts: (job.attempts || 0) + 1,
                      nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
                    }
                  : { fulfilledAt: new Date().toISOString() }),
                notificationState: source.messageTemplateId
                  ? 'pending_existing_no_cost_channel'
                  : 'not_configured',
              }),
            },
          })
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (error: any) {
      // Delivery failure cannot roll back a paid order. Preserve a recoverable job.
      const current = await db.config.findUnique({
        where: { storeId_key: { storeId: row.storeId, key: row.key } },
      })
      if (!current) continue
      const job = JSON.parse(current.value)
      if (job.status !== 'pending') continue
      await db.config.updateMany({
        where: { id: current.id, value: current.value },
        data: {
          value: JSON.stringify({
            ...job,
            attempts: (job.attempts || 0) + 1,
            lastFailure: String(error.message).slice(0, 200),
            nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
          }),
        },
      })
    }
  }
}
