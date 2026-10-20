import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { TeamActor, TeamTask, TeamError, readTeam, writeTeam, lockTeam, accessTeamChannel, auditTeam } from './TeamCommunicationService'
import { inspectionPlanGuard, inspectionPublished, inspectionReminderState } from './PackagingInspectionGuard'
import { operationPlanCapacity, releaseInspectionPlan } from './PackagingInspectionCapacity'

const uuid = z.string().uuid(), staff = z.string().min(1).max(128)
const instant = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)))
export const operationContent = z.object({
  schema: z.literal('team.operations.plan.v1'), title: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(1).max(800), reviewerId: staff,
  items: z.array(z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), text: z.string().trim().min(1).max(600),
    ownerId: staff, acceptByAt: instant, deadlineAt: instant,
    evidenceRequired: z.string().trim().min(1).max(400), acceptanceCriteria: z.string().trim().min(1).max(600)
  }).strict().refine(v => Date.parse(v.acceptByAt) <= Date.parse(v.deadlineAt), 'ACCEPT_AFTER_DEADLINE')).min(1).max(20)
}).strict().refine(v => new Set(v.items.map(i => i.key)).size === v.items.length, 'DUPLICATE_ITEM_KEY')
export interface OperationPlan {
  id: string; channelId: string; version: number; revision: number; status: 'draft' | 'published' | 'paused'
  content: z.infer<typeof operationContent>; audienceHash: string; fromSeq: number; taskIds: string[]
  createdBy: string; updatedAt: string; approvedBy?: string; approvedAt?: string; approvedRevision?: number
  automaticMessages: false
  memberIds: string[]
  inspectionId?: string
  inspectionArchived?: boolean
}
const fail = (code: string, status = 409): never => { throw new TeamError(status, code) }
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const planKey = (c: string, p: string) => `operationPlan.${c}.${p}`
const visiblePlan = (p: OperationPlan, a: TeamActor, floor: number) => p.fromSeq >= floor && p.memberIds?.includes(a.staffId)
const visibleTask = (t: TeamTask, a: TeamActor, floor: number) => t.fromSeq >= floor && t.audienceIds?.includes(a.staffId)
async function rows(db: any, storeId: string, prefix: string, max = 1001): Promise<any[]> {
  return (await db.config.findMany({ where: { storeId, key: { startsWith: 'team.communication.' + prefix } }, orderBy: { key: 'asc' }, take: max }))
    .map((r: any) => JSON.parse(r.value))
}
async function admin(db: any, a: TeamActor, id: string) {
  if (a.role !== 'admin' || a.employeeApp) fail('TEAM_PLAN_ADMIN_REQUIRED', 403)
  const ctx = await accessTeamChannel(db, a, id)
  if (!await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin' }, select: { id: true } })) fail('TEAM_PLAN_ADMIN_REQUIRED', 403)
  return ctx
}
async function get(db: any, a: TeamActor, id: string, pid: string, floor: number): Promise<OperationPlan> {
  uuid.parse(pid)
  const p = await readTeam<OperationPlan>(db, a.storeId, planKey(id, pid)) || await readTeam<OperationPlan>(db, a.storeId, `inspection.planArchive.${id}.${pid}`)
  if (!p || !visiblePlan(p, a, floor)) fail('TEAM_PLAN_NOT_FOUND', 404)
  return p
}
async function tasksFor(db: any, a: TeamActor, p: OperationPlan): Promise<TeamTask[]> {
  const tasks = await Promise.all(p.taskIds.map(async t => await readTeam<TeamTask>(db, a.storeId, `task.${p.channelId}.${t}`) || await readTeam<TeamTask>(db, a.storeId, `inspection.taskArchive.${p.channelId}.${t}`)))
  if (tasks.some(t => !t)) fail('TEAM_PLAN_TASK_MISSING')
  return tasks as TeamTask[]
}
const open = (t: TeamTask) => !['completed', 'cancelled'].includes(t.status)
// Keep full history for write-side closure checks; project each public response separately.
async function publicPlan(db: any, a: TeamActor, p: OperationPlan, floor: number, loaded?: TeamTask[]) {
  const snapshotIds = new Set(p.taskIds)
  const tasks = (loaded || await tasksFor(db, a, p)).filter(t => snapshotIds.has(t.id) && visibleTask(t, a, floor))
  const inspection = p.inspectionId ? await readTeam(db, a.storeId, 'workflow.inspection.job.' + p.inspectionId) : null
  return { ...p, taskIds: tasks.map(t => t.id), ...(inspection ? { inspectionSnapshot: inspection.snapshot } : {}) }
}
const visibleEscalations = (records: any[], tasks: TeamTask[]) => records.filter(r => tasks.some(t => t.id === r.taskId && t.planRevision === r.revision))
async function validateMembers(db: any, a: TeamActor, c: any, content: OperationPlan['content']) {
  const ids = [...new Set([content.reviewerId, ...content.items.map(i => i.ownerId)])]
  if (ids.some(id => !c.members.some((m: any) => m.staffId === id))) fail('TEAM_PLAN_MEMBER_REQUIRED', 403)
  const people = await db.staff.findMany({ where: { id: { in: ids }, storeId: a.storeId, status: 'active' }, select: { id: true } })
  if (people.length !== ids.length) fail('TEAM_MEMBER_UNAVAILABLE', 403)
  const reviewer = await db.staff.findFirst({ where: { id: content.reviewerId, storeId: a.storeId }, select: { user: { select: { role: true } } } })
  if (content.reviewerId !== c.ownerId && reviewer?.user?.role !== 'admin') fail('TEAM_PLAN_REVIEWER_REQUIRED', 403)
}
async function save(db: any, a: TeamActor, p: OperationPlan, action: string) {
  if (p.version > 100) fail('TEAM_PLAN_VERSION_LIMIT')
  await writeTeam(db, a.storeId, planKey(p.channelId, p.id), p)
  await writeTeam(db, a.storeId, `operationVersion.${p.channelId}.${p.id}.${String(p.version).padStart(6, '0')}`, p)
  await auditTeam(db, a, p.channelId, 'update', { action, planId: p.id, revision: p.revision, version: p.version, status: p.status })
  return p
}

/** No timer, provider call, external callback or business-data mutation. */
export function teamOperations(db: any = prisma) {
  return {
    async list(a: TeamActor, id: string) {
      const { fromSeq } = await admin(db, a, id)
      const plans = (await rows(db, a.storeId, `operationPlan.${id}.`, 51)).filter((p: OperationPlan) => visiblePlan(p, a, fromSeq))
      const archived = await db.config.findMany({ where: { storeId: a.storeId, key: { startsWith: `team.communication.inspection.planArchive.${id}.` } }, orderBy: { createdAt: 'desc' }, take: 20 })
      plans.push(...archived.map((r: any) => JSON.parse(r.value)).filter((p: OperationPlan) => visiblePlan(p, a, fromSeq)))
      return Promise.all(plans.map(p => publicPlan(db, a, p, fromSeq)))
    },
    async import(a: TeamActor, id: string, input: unknown, inspectionReservationId?: string) {
      const v = z.object({ requestId: uuid, planId: uuid.optional(), expectedVersion: z.number().int().min(0), content: operationContent }).strict().parse(input)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await admin(tx, a, id)
        await lockTeam(tx, a.storeId, `operation-request.${a.staffId}.${v.requestId}`)
        if (c.archived) fail('TEAM_CHANNEL_CLOSED')
        const rk = `operationRequest.${a.staffId}.${v.requestId}`, digest = hash({ id, ...v }), repeated = await readTeam(tx, a.storeId, rk)
        if (repeated) { if (repeated.hash !== digest) fail('TEAM_REQUEST_CONFLICT'); return publicPlan(tx, a, await get(tx, a, id, repeated.planId, fromSeq), fromSeq) }
        const previous = v.planId ? await get(tx, a, id, v.planId, fromSeq) : null
        if (previous?.inspectionId) fail('INSPECTION_DRAFT_IMMUTABLE')
        if ((previous?.version || 0) !== v.expectedVersion) fail('TEAM_VERSION_CONFLICT')
        if (previous?.status === 'published') fail('TEAM_PLAN_PAUSE_BEFORE_REVISION')
        if (previous && (await tasksFor(tx, a, previous)).some(open)) fail('TEAM_PLAN_OPEN_TASKS')
        if (!previous) await operationPlanCapacity(tx, a, id, inspectionReservationId)
        await validateMembers(tx, a, c, v.content)
        const p: OperationPlan = { id: previous?.id || randomUUID(), channelId: id, version: (previous?.version || 0) + 1,
          revision: (previous?.revision || 0) + 1, status: 'draft', content: v.content, audienceHash: hash(c.members),
          fromSeq: c.lastSeq + 1, taskIds: previous?.taskIds || [], createdBy: a.staffId,
          updatedAt: new Date().toISOString(), automaticMessages: false, memberIds: c.members.map((m: any) => m.staffId) }
        await save(tx, a, p, 'operation_import')
        if (!previous && inspectionReservationId) await releaseInspectionPlan(tx, a.storeId, id, inspectionReservationId)
        await writeTeam(tx, a.storeId, rk, { hash: digest, planId: p.id })
        return publicPlan(tx, a, p, fromSeq)
      })
    },
    async action(a: TeamActor, id: string, pid: string, input: unknown) {
      const v = z.object({ requestId: uuid, expectedVersion: z.number().int().positive(), action: z.enum(['publish', 'pause', 'resume']),
        approved: z.boolean().default(false), note: z.string().trim().min(1).max(500) }).strict().parse(input)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await admin(tx, a, id), p = await get(tx, a, id, pid, fromSeq)
        await lockTeam(tx, a.storeId, `operation-request.${a.staffId}.${v.requestId}`)
        const rk = `operationRequest.${a.staffId}.${v.requestId}`, digest = hash({ id, pid, ...v }), repeated = await readTeam(tx, a.storeId, rk)
        if (repeated) { if (repeated.hash !== digest) fail('TEAM_REQUEST_CONFLICT'); return publicPlan(tx, a, p, fromSeq) }
        if (c.archived) fail('TEAM_CHANNEL_CLOSED')
        if (p.version !== v.expectedVersion) fail('TEAM_VERSION_CONFLICT')
        if (p.inspectionArchived) fail('INSPECTION_PLAN_ARCHIVED')
        if (p.inspectionId) await inspectionPlanGuard(tx, a, p, v.action)
        if (v.action === 'pause') {
          if (p.status !== 'published') fail('TEAM_PLAN_TRANSITION')
          p.status = 'paused'
        } else {
          if (!v.approved) fail('TEAM_PLAN_APPROVAL_REQUIRED', 400)
          if (p.status !== (v.action === 'publish' ? 'draft' : 'paused')) fail('TEAM_PLAN_TRANSITION')
          if (hash(c.members) !== p.audienceHash) fail('TEAM_PLAN_AUDIENCE_CHANGED')
          await validateMembers(tx, a, c, p.content)
          if (v.action === 'publish') {
            if ((await tasksFor(tx, a, p)).some(open)) fail('TEAM_PLAN_OPEN_TASKS')
            if ((await rows(tx, a.storeId, `task.${id}.`, 201)).length + p.content.items.length > 200) fail('TEAM_TASK_LIMIT')
            const at = new Date().toISOString()
            for (const [i, item] of p.content.items.entries()) {
              const task: TeamTask = { id: randomUUID(), channelId: id, roundId: p.id, minuteVersion: p.revision, actionIndex: i,
                text: item.text, ownerId: item.ownerId, dueDate: item.deadlineAt.slice(0, 10), sourceSeq: [], fromSeq: Math.max(p.fromSeq, c.lastSeq + 1),
                status: 'assigned', version: 1, createdAt: at, updatedAt: at, planId: p.id, planRevision: p.revision,
                reviewerId: p.content.reviewerId, acceptByAt: new Date(item.acceptByAt).toISOString(), deadlineAt: new Date(item.deadlineAt).toISOString(),
                evidenceRequired: item.evidenceRequired, acceptanceCriteria: item.acceptanceCriteria,
                audienceIds: p.memberIds,
                events: [{ action: 'assign', by: a.staffId, at, note: v.note, sourceSeq: [] }] }
              await writeTeam(tx, a.storeId, `task.${id}.${task.id}`, task)
              p.taskIds.push(task.id)
            }
            p.approvedBy = a.staffId; p.approvedAt = at; p.approvedRevision = p.revision
          }
          p.status = 'published'
        }
        p.version++; p.updatedAt = new Date().toISOString()
        await save(tx, a, p, 'operation_' + v.action)
        if (p.inspectionId && v.action === 'publish') await inspectionPublished(tx, a, p)
        if (p.inspectionId && v.action !== 'publish') await inspectionReminderState(tx, a.storeId, p, v.action === 'pause')
        await auditTeam(tx, a, id, 'update', { action: 'operation_decision', planId: pid, note: v.note })
        await writeTeam(tx, a.storeId, rk, { hash: digest, planId: p.id })
        return publicPlan(tx, a, p, fromSeq)
      })
    },
    async scan(a: TeamActor, id: string, pid: string, input: unknown) {
      const v = z.object({ requestId: uuid, expectedVersion: z.number().int().positive() }).strict().parse(input)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await admin(tx, a, id), p = await get(tx, a, id, pid, fromSeq)
        await lockTeam(tx, a.storeId, `operation-request.${a.staffId}.${v.requestId}`)
        const rk = `operationRequest.${a.staffId}.${v.requestId}`, digest = hash({ id, pid, scan: v }), repeated = await readTeam(tx, a.storeId, rk)
        if (repeated) {
          if (repeated.hash !== digest) fail('TEAM_REQUEST_CONFLICT')
          if (repeated.scope?.revision !== p.revision || repeated.scope?.fromSeq !== p.fromSeq || repeated.scope?.audienceHash !== p.audienceHash) fail('TEAM_PLAN_SCOPE_CHANGED')
          const visible = (await tasksFor(tx, a, p)).filter(t => visibleTask(t, a, fromSeq))
          return { ...repeated.result, records: visibleEscalations(repeated.result.records, visible) }
        }
        if (p.version !== v.expectedVersion) fail('TEAM_VERSION_CONFLICT')
        if (p.status !== 'published' || c.archived) fail('TEAM_PLAN_PAUSED')
        const records = await rows(tx, a.storeId, `operationEscalation.${id}.${pid}.`), tasks = await tasksFor(tx, a, p)
        const people = await tx.staff.findMany({ where: { storeId: a.storeId, status: 'active', id: { in: c.members.map((m: any) => m.staffId) } }, select: { id: true, user: { select: { role: true } } } })
        const active = new Set(people.map((s: any) => s.id)), now = Date.now(), current = new Set<string>(), at = new Date(now).toISOString()
        const reviewerAvailable = active.has(p.content.reviewerId) && (p.content.reviewerId === c.ownerId || people.some((s: any) => s.id === p.content.reviewerId && s.user?.role === 'admin'))
        for (const t of tasks.filter(t => t.planRevision === p.revision && open(t))) {
          const kind = !active.has(t.ownerId) || !reviewerAvailable ? 'member_unavailable' :
            t.status === 'assigned' && now > Date.parse(t.acceptByAt!) ? 'unacknowledged' :
            now > Date.parse(t.deadlineAt!) ? t.status === 'submitted' ? 'review_overdue' : 'overdue' : null
          if (!kind) continue
          const key = `operationEscalation.${id}.${pid}.${t.id}.${t.version}.${kind}`; current.add(key)
          const existing = records.find(r => r.key === key)
          if (!existing) {
            if (records.length >= 1000) fail('TEAM_PLAN_ESCALATION_LIMIT')
            const record = { id: randomUUID(), key, planId: pid, revision: p.revision, taskId: t.id, taskVersion: t.version,
              kind, status: 'open', at, assigneeId: kind === 'review_overdue' ? t.reviewerId : t.ownerId, supervisorId: p.content.reviewerId,
              events: [{ status: 'open', at }] }
            records.push(record); await writeTeam(tx, a.storeId, key, record)
          } else if (existing.status === 'resolved') {
            if (existing.events.length >= 100) fail('TEAM_PLAN_ESCALATION_LIMIT')
            existing.status = 'open'; existing.events.push({ status: 'open', at }); await writeTeam(tx, a.storeId, key, existing)
          }
        }
        for (const r of records) if (r.status === 'open' && !current.has(r.key)) {
          if (r.events.length >= 100) fail('TEAM_PLAN_ESCALATION_LIMIT')
          r.status = 'resolved'; r.resolvedAt = at; r.events.push({ status: 'resolved', at }); await writeTeam(tx, a.storeId, r.key, r)
        }
        const visible = tasks.filter(t => visibleTask(t, a, fromSeq))
        const result = { checkedAt: at, automaticMessages: false, records: visibleEscalations(records, visible) }
        const scope = { revision: p.revision, fromSeq: p.fromSeq, audienceHash: p.audienceHash }
        await writeTeam(tx, a.storeId, `operationScan.${id}.${pid}`, { checkedAt: at, ...scope, memberIds: p.memberIds })
        await writeTeam(tx, a.storeId, rk, { hash: digest, result, scope })
        await auditTeam(tx, a, id, 'update', { action: 'operation_scan', planId: pid, open: result.records.filter(r => r.status === 'open').length })
        return result
      })
    },
    async export(a: TeamActor, id: string, pid: string) {
      // Snapshot the plan and task state under the same channel lock as mutations.
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { fromSeq } = await admin(tx, a, id), p = await get(tx, a, id, pid, fromSeq)
        const allTasks = await tasksFor(tx, a, p), tasks = allTasks.filter(t => visibleTask(t, a, fromSeq))
        const people = await tx.staff.findMany({ where: { storeId: a.storeId, id: { in: [...new Set([p.content.reviewerId, ...tasks.map(t => t.ownerId)])] } }, select: { id: true, name: true } })
        const name = (id: string) => people.find((person: any) => person.id === id)?.name || id
        const labels: Record<string, string> = { assigned: '待接收', accepted: '执行中', submitted: '待验收', changes_requested: '待补充', completed: '主管已验收', cancelled: '已取消' }
        const details = []
        for (const t of tasks) {
          const submitted = [...t.events].reverse().find(e => e.action === 'submit'), review = [...t.events].reverse().find(e => ['complete', 'return', 'cancel'].includes(e.action))
          const evidence = []
          for (const n of submitted?.sourceSeq || []) {
            const m = await readTeam(tx, a.storeId, `message.${id}.${String(n).padStart(12, '0')}`)
            evidence.push(m ? { seq: n, authorId: m.authorId, text: m.text, createdAt: m.createdAt, hasAttachment: !!m.files.length } : { seq: n, missing: true })
          }
          details.push({ ...t, ownerName: name(t.ownerId), reviewerName: name(t.reviewerId || ''), employeeStatement: submitted?.note || '', evidence, humanReview: review || null })
        }
        const escalations = visibleEscalations(await rows(tx, a.storeId, `operationEscalation.${id}.${pid}.`), tasks)
        const states = Object.fromEntries(Object.keys(labels).map(s => [s, tasks.filter(t => t.status === s).length]))
        const planStates = { draft: '草稿', published: '已发布', paused: '已暂停' }
        const summaryZh = [`计划：${p.content.title}；内容版本：${p.revision}；状态：${planStates[p.status]}；统计仅覆盖当前账号有权查看的任务`,
          ...Object.entries(states).map(([s, n]) => `${labels[s]}：${n}`),
          '员工口述与证据不等于主管验收；附件未发送给模型；升级记录以最近一次人工检查为准。',
          ...details.map(t => `${t.text}｜负责人 ${t.ownerName}｜${labels[t.status]}｜员工陈述：${t.employeeStatement || '无提交'}｜证据：${t.evidence.map(e => '#' + e.seq).join('、') || '无'}｜主管记录：${t.humanReview?.note || '尚无'}`)].join('\n')
        const snapshots = (await rows(tx, a.storeId, `operationVersion.${id}.${pid}.`, 101)).filter(v => visiblePlan(v, a, fromSeq))
        const versions = await Promise.all(snapshots.map(v => publicPlan(tx, a, v, fromSeq, allTasks)))
        await auditTeam(tx, a, id, 'view', { action: 'operation_export', planId: pid, version: p.version })
        const lastScan = await readTeam(tx, a.storeId, `operationScan.${id}.${pid}`)
        const checkedAt = lastScan?.revision === p.revision && visiblePlan(lastScan, a, fromSeq) ? lastScan.checkedAt : null
        return { schema: 'team.operations.result.v1', generatedAt: new Date().toISOString(), lastEscalationCheckAt: checkedAt, plan: await publicPlan(tx, a, p, fromSeq, allTasks), versions, states, tasks: details, historyScope: 'current_membership_only',
          escalations, summaryZh, automaticMessages: false, returnMode: 'manual_admin_export' }
      })
    }
  }
}
