import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { TeamError, TeamTask, TEAM_PREFIX, accessTeamChannel, readTeam, teamCommunication } from '../TeamCommunicationService'
import { readWork, WORK_PREFIX } from '../EmployeeWorkspaceStore'
import { chatRecipientAccess } from '../TeamChatReminderService'
import { projectApprovalAwarenessTarget } from '../NotificationApprovalService'
import { teamWorkItemLink } from '../TeamWorkItemLinks'
import { WorkItemAction, WorkItemContext, WorkItemDependencies, workItemSchemas } from './workItemContract'

const fail = (status: number, code: string): never => { throw new TeamError(status, code) }
const pad = (n: number) => String(n).padStart(12, '0')
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
const safeFailure = (e: unknown) => typeof e === 'string' && /^(404|410|429|4\d\d|5\d\d)$/.test(e) ? 'HTTP_' + e : 'PUSH_DELIVERY_FAILED'
const instant = (value?: string) => value && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? value : null

function taskView(t: TeamTask & { planPaused?: boolean }, now: Date, view: 'current' | 'operation_receipt' = 'current') {
  const deadline = instant(t.deadlineAt), acceptBy = instant(t.acceptByAt)
  const closed = ['completed', 'cancelled'].includes(t.status)
  return { view, id: t.id, channelId: t.channelId, version: t.version, status: t.status, text: t.text,
    assignedStaffId: t.ownerId, reviewerStaffId: t.reviewerId || null, dueDate: t.dueDate,
    deadlineAt: deadline, acceptByAt: acceptBy,
    overdue: closed ? false : deadline ? now.getTime() > Date.parse(deadline) : null,
    // Date-only legacy minutes have no time zone/clock deadline. Do not invent a precise timeout.
    deadlinePrecision: deadline ? 'instant' : t.dueDate ? 'date_only' : 'none',
    acceptanceOverdue: t.status === 'assigned' && !!acceptBy && now.getTime() > Date.parse(acceptBy),
    evidenceRequired: t.evidenceRequired || null, acceptanceCriteria: t.acceptanceCriteria || null,
    planId: t.planId || null, planRevision: t.planRevision || null, planPaused: t.planPaused === true,
    sourceSeq: t.sourceSeq, events: t.events.map(e => ({ action: e.action, by: e.by, at: e.at, note: e.note, sourceSeq: e.sourceSeq, criteriaConfirmed: e.criteriaConfirmed === true })),
    evidenceVerification: 'not_performed', createdAt: t.createdAt, updatedAt: t.updatedAt,
    url: teamWorkItemLink(t.channelId, { employeeTaskId: t.id }) }
}

/** No registration, grant mutation, model call, push transport or independent scheduler. */
export function createWorkItemService(db: any, deps: WorkItemDependencies) {
  function enabled() {
    if (deps.enabled !== true || typeof deps.withActor !== 'function' || typeof deps.assertApprovalTarget !== 'function') fail(403, 'TEAM_WORK_ITEMS_DISABLED')
  }
  const clock = () => deps.now ? deps.now() : new Date()
  async function read<T>(action: WorkItemAction, context: WorkItemContext, operation: (tx: any, actor: any) => Promise<T>) {
    enabled()
    return db.$transaction((tx: any) => deps.withActor(tx, action, context, actor => operation(tx, actor)))
  }
  return {
    isEnabled: () => deps.enabled === true && typeof deps.withActor === 'function' && typeof deps.assertApprovalTarget === 'function',
    async delivery(input: unknown) {
      const v = workItemSchemas.delivery.parse(input)
      return read('delivery.read', v as WorkItemContext, async (tx, actor) => {
        const { c, fromSeq } = await accessTeamChannel(tx, actor, v.channelId!)
        const member = c.members.find(m => m.staffId === v.recipientStaffId)
        if (!member || v.messageSeq! < Math.max(fromSeq, member.fromSeq) || !await chatRecipientAccess(tx, actor.storeId, v.recipientStaffId!)) fail(404, 'TEAM_DELIVERY_NOT_FOUND')
        const message = await readTeam(tx, actor.storeId, `message.${c.id}.${pad(v.messageSeq!)}`)
        if (!message || message.id !== v.messageId) fail(404, 'TEAM_DELIVERY_NOT_FOUND')
        const person = await tx.staff.findFirst({ where: { id: v.recipientStaffId, storeId: actor.storeId, status: 'active' }, select: { userId: true, user: { select: { updatedAt: true } } } })
        if (!person?.userId || !await chatRecipientAccess(tx, actor.storeId, v.recipientStaffId!, person.userId)) fail(404, 'TEAM_DELIVERY_NOT_FOUND')
        const id = digest(`${person.userId}:${v.recipientStaffId}:team-chat:${message.id}`)
        const reminder = await readWork(actor.storeId, `reminder.${v.recipientStaffId}.${id}`, tx)
        if (reminder && (reminder.userId !== person.userId || reminder.staffId !== v.recipientStaffId || reminder.chat?.channelId !== c.id || reminder.chat?.messageId !== message.id || reminder.chat?.seq !== v.messageSeq)) fail(404, 'TEAM_DELIVERY_NOT_FOUND')
        const [deliveryRows, subscriptionRows, cursor, laterRows] = await Promise.all([
          tx.config.findMany({ where: { storeId: actor.storeId, key: { startsWith: WORK_PREFIX + `delivery.${id}.` } }, take: 201 }),
          // Project metadata inside PostgreSQL. Endpoint/auth/key bytes never enter this diagnostic result or process.
          tx.$queryRaw(Prisma.sql`SELECT ("value"::jsonb -> 'active') AS active, ("value"::jsonb -> 'issuedAtMs') AS "issuedAtMs"
            FROM "Config" WHERE "storeId" = ${actor.storeId} AND "key" LIKE ${WORK_PREFIX + 'subscription.%'}
            AND "value"::jsonb ->> 'userId' = ${person.userId} AND "value"::jsonb ->> 'staffId' = ${v.recipientStaffId}
            ORDER BY "key" ASC LIMIT 201`),
          readTeam(tx, actor.storeId, `read.${c.id}.${v.recipientStaffId}`),
          tx.config.findMany({ where: { storeId: actor.storeId, key: { startsWith: TEAM_PREFIX + `message.${c.id}.`, gt: TEAM_PREFIX + `message.${c.id}.${pad(v.messageSeq!)}` } }, orderBy: { key: 'asc' }, take: 201 })
        ])
        if (deliveryRows.length > 200 || subscriptionRows.length > 200) fail(409, 'TEAM_DELIVERY_PROJECTION_LIMIT')
        const deliveries = deliveryRows.map((r: any) => JSON.parse(r.value))
        const subscriptions = subscriptionRows
        const counts = { ready: 0, inactive: 0, stale: 0 }
        for (const s of subscriptions) {
          if (!s.active) counts.inactive++
          else if (!Number.isFinite(s.issuedAtMs) || s.issuedAtMs < person.user.updatedAt.getTime()) counts.stale++
          else counts.ready++
        }
        const accepted = deliveries.filter((d: any) => d.status === 'sent')
        const failed = deliveries.filter((d: any) => d.status === 'failed')
        const later = laterRows.map((r: any) => JSON.parse(r.value)).find((m: any) => m.authorId === v.recipientStaffId)
        const throughSeq = Math.max(0, cursor?.seq || 0)
        return { channelId: c.id, messageId: message.id, messageSeq: message.seq, recipientStaffId: v.recipientStaffId,
          inApp: { reminder: reminder ? 'recorded' : 'not_recorded', status: reminder?.status || null },
          subscriptions: counts,
          push: { state: accepted.length ? failed.length ? 'partial_service_accepted' : 'service_accepted' : failed.length ? 'failed' : reminder?.status === 'pending' ? 'queued' : 'not_confirmed',
            accepted: accepted.length, failed: failed.length, attempts: deliveries.reduce((n: number, d: any) => n + (Number.isSafeInteger(d.attempts) ? d.attempts : 0), 0),
            serviceAcceptedAt: accepted.map((d: any) => d.sentAt).filter(Boolean).sort().at(-1) || null,
            failures: [...new Set(failed.map((d: any) => safeFailure(d.error)))],
            retryAt: failed.map((d: any) => d.nextAttemptAt).filter(Boolean).sort()[0] || null },
          device: 'unknown', read: { state: throughSeq >= message.seq ? 'read' : 'unread', throughSeq, at: cursor?.readAt || null },
          response: { state: later ? 'later_message_observed' : 'not_observed', attribution: 'not_proven', messageId: later?.id || null, seq: later?.seq || null, searchTruncated: laterRows.length > 200 },
          url: teamWorkItemLink(c.id, { messageSeq: message.seq }) }
      })
    },
    async get(input: unknown) {
      const v = workItemSchemas.get.parse(input)
      return read('tasks.read', v as WorkItemContext, async (tx, actor) => {
        const tasks = await teamCommunication(tx).tasks(actor, v.channelId!)
        const task = tasks.find(t => t.id === v.employeeTaskId)
        if (!task) fail(404, 'TEAM_TASK_NOT_FOUND')
        return taskView(task, clock())
      })
    },
    async assign(input: unknown) {
      enabled(); const v = workItemSchemas.assign.parse(input)
      return deps.withActor(db, 'tasks.assign', v as WorkItemContext, async actor => {
        const task = await teamCommunication(db).createTask(actor, v.channelId!, { requestId: v.requestId, roundId: v.roundId, minuteVersion: v.minuteVersion, actionIndex: v.actionIndex })
        return taskView(task, clock(), 'operation_receipt')
      })
    },
    async review(input: unknown) {
      enabled(); const v = workItemSchemas.review.parse(input)
      return deps.withActor(db, 'tasks.review', v as WorkItemContext, async actor => {
        const task = await teamCommunication(db).taskAction(actor, v.channelId!, v.employeeTaskId!, { requestId: v.requestId, expectedVersion: v.expectedVersion, action: v.action, note: v.note, criteriaConfirmed: v.criteriaConfirmed })
        return taskView(task, clock(), 'operation_receipt')
      })
    },
    async approval(input: unknown) {
      const v = workItemSchemas.approval.parse(input)
      return read('approvals.read', v as WorkItemContext, async (tx, actor) => {
        await deps.assertApprovalTarget(tx, actor, v as WorkItemContext, { domain: v.domain!, objectId: v.objectId! })
        const notices = await projectApprovalAwarenessTarget(tx, { id: actor.id, storeId: actor.storeId }, { domain: v.domain!, objectId: v.objectId! })
        return { domain: v.domain, objectId: v.objectId, access: 'read_only', notices, executionGranted: false }
      })
    }
  }
}
