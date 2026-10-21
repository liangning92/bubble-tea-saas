import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { readWork } from './EmployeeWorkspaceStore'
import { assertManagementSend, ManagementAuthorization } from './TeamManagementPolicy'
import { assertRoutineSend, RoutineAuthorization } from './TeamRoutinePolicy'
import { enqueueTeamWorkflow, workflowEvent } from './TeamWorkflowQueue'
import { enqueueChatReminders } from './TeamChatReminderService'
import { recordTeamAgentReply } from './teamAgentBridge/events'
import { teamAgentIdentity, teamAgentProvenance, teamAgentChannelCreated, teamAgentTaskAuthority } from './teamAgentBridge/identity'
import { enqueueTeamTaskReminder } from './TeamTaskReminderService'

export const TEAM_PREFIX = 'team.communication.'
export async function isTeamAttachment(db: any, storeId: string, id: string, file: any) {
  if (file?.purpose === 'team') return true
  // Also protect pre-purpose records if an older build already granted them to a chat.
  return !!await db.config.findFirst({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'fileGrant.', contains: `.${id}.` } }, select: { id: true } })
}
export interface TeamActor {
  id: string; storeId: string; staffId: string; role: string; employeeApp?: boolean
  accessRole?: { permissions: string[]; version?: number; modes?: Record<string, string> } | null
}
export interface TeamMember { staffId: string; fromSeq: number }
export interface TeamChannel {
  id: string; title: string; kind: 'direct' | 'group' | 'public' | 'meeting'
  ownerId: string; members: TeamMember[]; lastSeq: number; version: number
  archived: boolean; round: { id: string; title: string; fromSeq: number; startedAt: string; participants: string[] } | null
  createdAt: string
}
export interface TeamTask {
  id: string; channelId: string; roundId: string; minuteVersion: number; actionIndex: number
  text: string; ownerId: string; dueDate: string; sourceSeq: number[]; fromSeq: number
  status: 'assigned' | 'accepted' | 'submitted' | 'changes_requested' | 'completed' | 'cancelled'
  version: number; createdAt: string; updatedAt: string
  events: { action: string; by: string; at: string; note: string; sourceSeq: number[]; criteriaConfirmed?: boolean }[]
  planId?: string; planRevision?: number; reviewerId?: string; acceptByAt?: string; deadlineAt?: string
  evidenceRequired?: string; acceptanceCriteria?: string; audienceIds?: string[]
  /** Independent execution principal; mutations use the agent task service exclusively. */
  agentTask?: import('./agentTasks/contract').AgentTaskState
}
export class TeamError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const fail = (status: number, message: string): never => { throw new TeamError(status, message) }
const uuid = z.string().uuid()
const staffId = z.string().min(1).max(128)
const seq = z.number().int().min(0).max(999999999999)
export const createChannelSchema = z.object({
  requestId: uuid, title: z.string().trim().min(1).max(120),
  kind: z.enum(['direct', 'group', 'public', 'meeting']), members: z.array(staffId).min(1).max(100)
}).strict()
export const messageSchema = z.object({
  requestId: uuid, text: z.string().trim().max(4000).default(''), files: z.array(uuid).max(5).default([]), expectedLastSeq: seq.optional(), takeover: z.boolean().optional()
}).strict().refine(v => v.text.length > 0 || v.files.length > 0, 'EMPTY_MESSAGE')
export const minutesSchema = z.object({
  requestId: uuid, expectedVersion: z.number().int().positive(), title: z.string().trim().min(1).max(120),
  decisions: z.array(z.string().trim().min(1).max(1000)).max(40),
  pending: z.array(z.string().trim().min(1).max(1000)).max(40),
  actions: z.array(z.object({ text: z.string().trim().min(1).max(1000), ownerId: staffId,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sourceSeq: z.array(seq).min(1).max(20) }).strict()).max(40),
  sourceSeq: z.array(seq).max(100), status: z.enum(['draft', 'confirmed'])
}).strict()
type DB = any
const pad = (n: number) => String(n).padStart(12, '0')
export const canTeam = (a: TeamActor, permission: string) => !a.employeeApp && (a.role === 'admin' ||
  (a.accessRole?.version === 2 ? a.accessRole.modes?.[permission] === 'allow' : a.accessRole?.permissions.includes(permission) === true))
const channelKey = (id: string) => `channel.${id}`
async function read<T = any>(db: DB, storeId: string, key: string): Promise<T | null> {
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: TEAM_PREFIX + key } } })
  return row ? JSON.parse(row.value) : null
}
async function write(db: DB, storeId: string, key: string, value: unknown) {
  const valueText = JSON.stringify(value)
  await db.config.upsert({ where: { storeId_key: { storeId, key: TEAM_PREFIX + key } },
    create: { storeId, key: TEAM_PREFIX + key, category: 'staff', value: valueText }, update: { value: valueText } })
  return value
}
async function lock(db: DB, storeId: string, key: string) {
  await write(db, storeId, `lock.${key}`, { at: new Date().toISOString() })
}
async function list(db: DB, storeId: string, prefix: string, take = 500) {
  const rows = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + prefix } },
    orderBy: { key: 'asc' }, ...(take ? { take } : {}) })
  return rows.map((r: any) => JSON.parse(r.value))
}
async function identity(db: DB, actor: TeamActor) {
  const agent = await teamAgentIdentity(db, actor)
  if (agent) return agent
  if (!actor.id || !actor.storeId || !actor.staffId) fail(403, 'TEAM_IDENTITY_REQUIRED')
  const employee = await db.staff.findFirst({ where: { id: actor.staffId, userId: actor.id, storeId: actor.storeId, status: 'active' },
    select: { id: true, name: true } })
  if (!employee) fail(403, 'TEAM_IDENTITY_REQUIRED')
  return employee
}
async function activeMembers(db: DB, storeId: string, ids: string[]) {
  const members = await db.staff.findMany({ where: { id: { in: ids }, storeId, status: 'active' }, select: { id: true, name: true } })
  if (members.length !== new Set(ids).size) fail(403, 'TEAM_MEMBER_UNAVAILABLE')
  return members
}
async function audit(db: DB, a: TeamActor, id: string, action: string, detail: unknown) {
  await db.financeAuditLog.create({ data: { storeId: a.storeId, userId: a.id, action,
    entityType: 'team_communication', entityId: id, description: 'Team communication access/change', newValue: JSON.stringify(teamAgentProvenance(a) ? { ...(detail as object), agent: teamAgentProvenance(a) } : detail) } })
}
async function channel(db: DB, a: TeamActor, id: string, auditReason?: string) {
  uuid.parse(id); await identity(db, a)
  const c = await read<TeamChannel>(db, a.storeId, channelKey(id))
  if (!c) fail(404, 'TEAM_CHANNEL_NOT_FOUND')
  const member = c.members.find(m => m.staffId === a.staffId)
  if (auditReason !== undefined) {
    if (!canTeam(a, 'team.audit') || auditReason.trim().length < 5 || auditReason.length > 500) fail(403, 'TEAM_AUDIT_REQUIRED')
    await audit(db, a, id, 'view', { reason: auditReason, lastSeq: c.lastSeq, kind: c.kind })
  } else if (!member) fail(403, 'TEAM_MEMBERSHIP_REQUIRED')
  return { c, fromSeq: auditReason === undefined ? member!.fromSeq : 1 }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function assertOperationScope(db: DB, a: TeamActor, c: TeamChannel, input: unknown) {
  const scope = z.object({ planId: uuid, taskId: uuid, planVersion: z.number().int().positive(), taskVersion: z.number().int().positive() }).passthrough().parse(input)
  const p = await read(db, a.storeId, `operationPlan.${c.id}.${scope.planId}`)
  const t: TeamTask = await read(db, a.storeId, `task.${c.id}.${scope.taskId}`)
  if (!p || !t || p.status !== 'published' || p.approvedRevision !== p.revision || p.version !== scope.planVersion ||
    t.version !== scope.taskVersion || t.planId !== p.id || t.planRevision !== p.revision || ['completed', 'cancelled'].includes(t.status)) fail(409, 'TEAM_PLAN_SCOPE_CHANGED')
  if (c.archived || digest(c.members) !== p.audienceHash || !t.audienceIds?.includes(a.staffId)) fail(409, 'TEAM_PLAN_AUDIENCE_CHANGED')
  return { p, t }
}
function manage(a: TeamActor, c: TeamChannel) {
  if (c.ownerId !== a.staffId && !canTeam(a, 'team.manage')) fail(403, 'TEAM_HOST_REQUIRED')
}
async function messageRows(db: DB, storeId: string, id: string, after: number, limit: number, until?: number) {
  const prefix = TEAM_PREFIX + `message.${id}.`
  return (await db.config.findMany({ where: { storeId, key: { startsWith: prefix, gt: prefix + pad(after),
    ...(until !== undefined ? { lte: prefix + pad(until) } : {}) } }, orderBy: { key: 'asc' }, take: limit }))
    .map((r: any) => JSON.parse(r.value))
}
export type OwnAiHandling = { state: 'queued' | 'processing' | 'needs_review' | 'understood' | 'replied' | 'waiting_owner' | 'pending_action' | 'paused'; updatedAt: string }
/** Read-only source status. Never project a colleague's job or an audit-only history floor. */
export async function projectOwnAiHandling(db: DB, a: TeamActor, c: TeamChannel, messages: any[]) {
  const member = c.members.find(m => m.staffId === a.staffId)
  const own = member && !c.archived ? messages.filter(m => m.channelId === c.id && m.authorId === a.staffId && !m.ai && Number.isSafeInteger(m.seq) && m.seq >= member.fromSeq) : []
  const output = new Map<string, OwnAiHandling>()
  if (!own.length) return output
  const prefix = `workflow.job.${c.id}.`, settings = [`workflow.policy.${c.id}`, 'workflow.defaults', `workflow.exception.${c.id}`]
  const keys = [...own.map(m => TEAM_PREFIX + prefix + pad(m.seq)), ...settings.map(key => TEAM_PREFIX + key)]
  const rows = await db.config.findMany({ where: { storeId: a.storeId, key: { in: keys } }, select: { key: true, value: true } })
  const records = new Map<string, any>(rows.map((row: any) => [row.key.slice(TEAM_PREFIX.length), JSON.parse(row.value)]))
  const p = records.get(settings[0]), defaults = records.get(settings[1]), exception = records.get(settings[2])
  const paused = p?.paused === true || p?.enabled === false || defaults?.enabled === false || !!exception
  for (const m of own) {
    const j = records.get(prefix + pad(m.seq))
    if (!j || j.id !== m.id || j.channelId !== c.id || j.sourceSeq !== m.seq || j.sourceAuthorId !== a.staffId || typeof j.updatedAt !== 'string' || !Number.isFinite(Date.parse(j.updatedAt))) continue
    let state: OwnAiHandling['state'] | undefined
    if (j.status === 'pending_action') state = 'pending_action'
    else if (j.status === 'awaiting_owner') state = 'waiting_owner'
    else if (['blocked', 'uncertain', 'awaiting_approval'].includes(j.status)) state = 'needs_review'
    else if (j.replyMessageId) state = 'replied'
    else if (j.status === 'reviewed' && (j.management?.kind === 'no_reply' || j.result?.management?.kind === 'no_reply')) state = 'understood'
    else if (j.status === 'processing') state = 'processing'
    else if (['queued', 'retry_wait'].includes(j.status)) state = paused ? 'paused' : 'queued'
    if (state) output.set(m.id, { state, updatedAt: j.updatedAt })
  }
  return output
}
async function closeRound(db: DB, a: TeamActor, c: TeamChannel) {
  if (!c.round) fail(409, 'TEAM_NO_OPEN_ROUND')
  const r = c.round
  const draft = { id: r.id, channelId: c.id, title: r.title, startedAt: r.startedAt, endedAt: new Date().toISOString(),
    participants: r.participants, fromSeq: r.fromSeq, toSeq: c.lastSeq, version: 1, status: 'draft',
    source: 'manual', decisions: [], pending: [], actions: [], sourceSeq: [], updatedBy: a.staffId }
  await write(db, a.storeId, `minutes.${c.id}.${r.id}`, draft)
  await write(db, a.storeId, `minuteVersion.${c.id}.${r.id}.000001`, draft)
  c.round = null; c.version++
  await write(db, a.storeId, channelKey(c.id), c)
  await audit(db, a, c.id, 'update', { action: 'close_round', roundId: r.id })
  return draft
}

/** All content is store-scoped; the injected DB is used by isolated integration tests. */
export function teamCommunication(db: DB = prisma) {
  return {
    async audits(a: TeamActor) {
      await identity(db, a)
      if (!canTeam(a, 'team.audit')) fail(403, 'TEAM_AUDIT_REQUIRED')
      return db.financeAuditLog.findMany({ where: { storeId: a.storeId, entityType: 'team_communication' }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, userId: true, entityId: true, action: true, createdAt: true, newValue: true } })
    },
    async directory(a: TeamActor) {
      await identity(db, a)
      return db.staff.findMany({ where: { storeId: a.storeId, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 1000 })
    },
    async channels(a: TeamActor, administration = false) {
      await identity(db, a)
      if (administration && !canTeam(a, 'team.manage') && !canTeam(a, 'team.audit')) fail(403, 'TEAM_ADMIN_REQUIRED')
      const all: TeamChannel[] = await list(db, a.storeId, 'channel.')
      const visible = all.filter(c => administration || c.members.some(m => m.staffId === a.staffId))
      return Promise.all(visible.map(async c => {
        const membership = c.members.find(m => m.staffId === a.staffId)
        const readSeq = (await read(db, a.storeId, `read.${c.id}.${a.staffId}`))?.seq || 0
        const prefix = TEAM_PREFIX + `message.${c.id}.`
        const [unread, latest] = membership ? await Promise.all([
          db.config.count({ where: { storeId: a.storeId, key: { startsWith: prefix, gt: prefix + pad(Math.max(readSeq, membership.fromSeq - 1)) },
            value: { not: { contains: `"authorId":${JSON.stringify(a.staffId)}` } } } }),
          db.config.findFirst({ where: { storeId: a.storeId, key: { startsWith: prefix, gte: prefix + pad(membership.fromSeq) } }, orderBy: { key: 'desc' } })
        ]) : [0, null]
        const message = latest ? JSON.parse(latest.value) : null
        return { ...c, unread, preview: message ? { text: [...message.text].slice(0, 120).join(''), authorName: message.authorName,
          createdAt: message.createdAt, hasFiles: message.files?.length > 0 } : null,
          member: !!membership, canEdit: c.ownerId === a.staffId || canTeam(a, 'team.manage'), canAudit: canTeam(a, 'team.audit') }
      }))
    },
    async create(a: TeamActor, input: unknown) {
      const v = createChannelSchema.parse(input)
      await identity(db, a)
      const ids = [...new Set([a.staffId, ...v.members])].sort()
      if (v.kind === 'direct' && ids.length !== 2) fail(400, 'TEAM_DIRECT_TWO_MEMBERS')
      if (v.kind === 'public' && !canTeam(a, 'team.manage')) fail(403, 'TEAM_ADMIN_REQUIRED')
      if (ids.length > 100) fail(400, 'TEAM_MEMBER_LIMIT')
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'create')
        await identity(tx, a)
        const requestKey = `create.${a.staffId}.${v.requestId}`, creationHash = digest({ ...v, ...(teamAgentProvenance(a) ? { agent: teamAgentProvenance(a) } : {}) })
        const existing = await read(tx, a.storeId, requestKey)
        if (existing) { if (existing.hash !== creationHash) fail(409, 'TEAM_REQUEST_CONFLICT'); return (await channel(tx, a, existing.channel.id)).c }
        await activeMembers(tx, a.storeId, ids.filter(id => !teamAgentProvenance(a) || id !== a.staffId))
        if ((await list(tx, a.storeId, 'channel.', 501)).length >= 500) fail(409, 'TEAM_CHANNEL_LIMIT')
        if (v.kind === 'direct') {
          const found = (await list(tx, a.storeId, 'channel.')).find((c: TeamChannel) => c.kind === 'direct' && !c.archived && c.members.map(m => m.staffId).sort().join('|') === ids.join('|'))
          if (found) { await write(tx, a.storeId, requestKey, { hash: creationHash, channel: found }); return found }
        }
        const now = new Date().toISOString()
        const c: TeamChannel = { id: randomUUID(), title: v.title, kind: v.kind, ownerId: a.staffId,
          members: ids.map(id => ({ staffId: id, fromSeq: 1 })), lastSeq: 0, version: 1, archived: false, createdAt: now,
          round: v.kind === 'meeting' ? { id: randomUUID(), title: v.title, fromSeq: 1, startedAt: now, participants: ids } : null }
        await write(tx, a.storeId, channelKey(c.id), c)
        await write(tx, a.storeId, requestKey, { hash: creationHash, channel: c })
        await teamAgentChannelCreated(tx, a, c)
        await audit(tx, a, c.id, 'create', { kind: c.kind, members: ids })
        return c
      })
    },
    async messages(a: TeamActor, id: string, after: number, auditReason?: string) {
      seq.parse(after)
      const { c, fromSeq } = await channel(db, a, id, auditReason)
      const rows = await messageRows(db, a.storeId, id, Math.max(after, fromSeq - 1), 101)
      const sourceMessages = rows.slice(0, 100), member = c.members.find(m => m.staffId === a.staffId)
      // Existing incremental polls must refresh saved source statuses without replaying message history.
      const messagePrefix = TEAM_PREFIX + `message.${id}.`
      const refreshRows = member && !c.archived && after >= member.fromSeq ? await db.config.findMany({ where: { storeId: a.storeId,
        key: { startsWith: messagePrefix, gte: messagePrefix + pad(member.fromSeq), lte: messagePrefix + pad(after) },
        value: { contains: '"authorId":' + JSON.stringify(a.staffId) } }, orderBy: { key: 'desc' }, take: 100, select: { value: true } }) : []
      const refreshSources = refreshRows.map((row: any) => JSON.parse(row.value)).filter((m: any) => m.channelId === id && m.authorId === a.staffId && !m.ai && m.seq >= member!.fromSeq && m.seq <= after)
      const handling = await projectOwnAiHandling(db, a, c, [...sourceMessages, ...refreshSources])
      const messages = sourceMessages.map(({ aiHandling: _untrusted, ...m }: any) => ({ ...m, ...(handling.has(m.id) ? { aiHandling: handling.get(m.id) } : {}) }))
      const aiHandlingUpdates = refreshSources.map((m: any) => ({ messageId: m.id, seq: m.seq, aiHandling: handling.get(m.id) || null }))
      return { channel: c, messages, aiHandlingUpdates, cursor: messages.at(-1)?.seq ?? Math.max(after, fromSeq - 1), hasMore: rows.length > 100,
        canEdit: c.ownerId === a.staffId || canTeam(a, 'team.manage'), audit: auditReason !== undefined }
    },
    async send(a: TeamActor, id: string, input: unknown, aiDraftId?: string, routineAuthorization?: RoutineAuthorization, managementAuthorization?: ManagementAuthorization) {
      const v = messageSchema.parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c } = await channel(tx, a, id)
        const requestKey = `request.${a.staffId}.${v.requestId}`
        const old = await read(tx, a.storeId, requestKey), hash = digest({ id, ...v, ...(teamAgentProvenance(a) ? { agent: teamAgentProvenance(a) } : {}) })
        if (old) { if (old.hash !== hash) fail(409, 'TEAM_REQUEST_CONFLICT'); return old.message }
        if (teamAgentProvenance(a) && v.expectedLastSeq !== c.lastSeq) fail(409, 'TEAM_MESSAGE_CONTEXT_CHANGED')
        // Serialize the final automatic effect with store revocation, before
        // acquiring ai-budget (defaults saves use defaults -> ai-budget).
        if (routineAuthorization || managementAuthorization) {
          await lock(tx, a.storeId, 'workflow-defaults')
          const defaults = await read(tx, a.storeId, 'workflow.defaults')
          if (defaults && !defaults.enabled) fail(409, 'TEAM_WORKFLOW_PAUSED')
        }
        const policy = await read(tx, a.storeId, `workflow.policy.${id}`)
        const humanDraftRequiresFreshContext = !routineAuthorization && !managementAuthorization && policy?.enabled && policy.automaticSend && policy.operatorStaffId === a.staffId
        const humanTakeover = !routineAuthorization && !managementAuthorization && (policy?.origin !== 'store_default' || v.takeover === true) && policy?.enabled && policy.automaticSend && policy.operatorStaffId === a.staffId && !policy.paused
        if (humanTakeover && !aiDraftId && v.expectedLastSeq !== c.lastSeq) fail(409, 'TEAM_MESSAGE_CONTEXT_CHANGED')
        let ai: { provider: string; model: string; draftId: string; approvedBy?: string; routineAuthorization?: RoutineAuthorization; managementAuthorization?: ManagementAuthorization; authorizedBy?: string } | undefined
        if (aiDraftId) {
          uuid.parse(aiDraftId)
          if (a.role !== 'admin' || a.employeeApp || v.requestId !== aiDraftId || v.files.length) fail(403, 'TEAM_AI_ADMIN_REQUIRED')
          await lock(tx, a.storeId, 'ai-budget')
          const draft = await read(tx, a.storeId, `aiDraft.${a.staffId}.${aiDraftId}`)
          const settings = await read(tx, a.storeId, 'ai.settings')
          if (!draft || draft.channelId !== id || draft.status !== 'ready' || draft.kind !== 'draft') fail(409, 'TEAM_AI_DRAFT_NOT_READY')
          if (humanDraftRequiresFreshContext && draft.contextLastSeq !== c.lastSeq) fail(409, 'TEAM_MESSAGE_CONTEXT_CHANGED')
          if (!settings?.enabled || settings.version !== draft.configVersion) fail(409, 'TEAM_AI_CONFIG_CHANGED')
          if (c.members.some(member => member.fromSeq > draft.sourceFloor) || digest(c.members) !== draft.audienceHash) fail(403, 'TEAM_AI_AUDIENCE_CHANGED')
          if (draft.operation) await assertOperationScope(tx, a, c, draft.operation)
          if (managementAuthorization) {
            await assertManagementSend(tx, a, c, draft, managementAuthorization, v.text)
            ai = { provider: 'minimax', model: draft.model, draftId: aiDraftId, managementAuthorization, authorizedBy: a.staffId }
          } else if (routineAuthorization) {
            await assertRoutineSend(tx, a, c, draft, routineAuthorization, v.text)
            ai = { provider: 'minimax', model: draft.model, draftId: aiDraftId, routineAuthorization, authorizedBy: a.staffId }
          } else {
            if (draft.routineAuthorization || draft.managementAuthorization) fail(403, 'TEAM_ROUTINE_INTERNAL_SEND_REQUIRED')
            ai = { provider: 'minimax', model: draft.model, draftId: aiDraftId, approvedBy: a.staffId }
          }
        }
        if (c.archived || c.kind === 'meeting' && !c.round) fail(409, 'TEAM_CHANNEL_CLOSED')
        await lock(tx, a.storeId, 'rate.' + a.staffId)
        const rateKey = 'rate.' + a.staffId, now = Date.now()
        const recent: number[] = ((await read(tx, a.storeId, rateKey)) || []).filter((at: number) => at > now - 60000)
        if (recent.length >= 30) fail(429, 'TEAM_RATE_LIMIT')
        for (const fileId of v.files) {
          const file = await readWork(a.storeId, `file.${fileId}`, tx)
          if (!file || file.staffId !== a.staffId || file.purpose !== 'team') fail(403, 'TEAM_FILE_FORBIDDEN')
        }
        if (c.lastSeq >= 999999999999) fail(409, 'TEAM_MESSAGE_LIMIT')
        if (!c.round) c.round = { id: randomUUID(), title: c.title, fromSeq: c.lastSeq + 1, startedAt: new Date(now).toISOString(), participants: c.members.map(m => m.staffId) }
        if (!c.round.participants.includes(a.staffId)) c.round.participants.push(a.staffId)
        const employee = await identity(tx, a)
        const message = { id: randomUUID(), requestId: v.requestId, channelId: id, seq: ++c.lastSeq, roundId: c.round.id,
          authorId: a.staffId, authorName: employee.name, text: v.text, files: v.files, createdAt: new Date(now).toISOString(), ...(ai ? { ai } : {}), ...(teamAgentProvenance(a) ? { agent: teamAgentProvenance(a) } : {}) }
        await write(tx, a.storeId, `message.${id}.${pad(message.seq)}`, message)
        const sourceWrittenAt = new Date().toISOString() // Write completion inside the atomic message/job transaction, not a separate commit.
        for (const f of v.files) await write(tx, a.storeId, `fileGrant.${id}.${f}.${pad(message.seq)}`, { seq: message.seq })
        await write(tx, a.storeId, channelKey(id), c)
        await write(tx, a.storeId, requestKey, { hash, message })
        await write(tx, a.storeId, rateKey, [...recent, now])
        if (ai) {
          const key = `aiDraft.${a.staffId}.${aiDraftId}`, draft = await read(tx, a.storeId, key)
          await write(tx, a.storeId, key, { ...draft, status: 'sent', sentMessageId: message.id, ...(routineAuthorization || managementAuthorization ? { automaticallySentAt: new Date(now).toISOString() } : { approvedAt: new Date(now).toISOString() }) })
          await audit(tx, a, id, 'update', { action: managementAuthorization ? 'management_authorized_send' : routineAuthorization ? 'routine_authorized_send' : 'ai_publish', draftId: aiDraftId, messageId: message.id, ...(managementAuthorization || routineAuthorization ? { authorization: managementAuthorization || routineAuthorization } : {}) })
        }
        if (humanTakeover) {
          const takeover = { byStaffId: a.staffId, at: new Date().toISOString(), sourceSeq: message.seq, reason: 'human_message' }
          const paused = { ...policy, paused: true, version: policy.version + 1, epoch: policy.epoch + 1, takeover }
          await write(tx, a.storeId, `workflow.policy.${id}`, paused)
          await workflowEvent(tx, a.storeId, id, { policyVersion: paused.version, paused: true, takeover }, { read, write })
          await audit(tx, a, id, 'update', { action: 'workflow_human_takeover', takeover, policyVersion: paused.version })
        }
        if (!teamAgentProvenance(a)) await enqueueTeamWorkflow(tx, a, c, { ...message, sourceWrittenAt }, { read, write })
        if (teamAgentProvenance(a)) await audit(tx, a, id, 'create', { action: 'agent_message', messageId: message.id, seq: message.seq })
        await recordTeamAgentReply(tx, a.storeId, c, message)
        await enqueueChatReminders(tx, a.storeId, c, message)
        return message
      })
    },
    async markRead(a: TeamActor, id: string, value: number) {
      seq.parse(value)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await channel(tx, a, id)
        if (value > c.lastSeq || value < fromSeq - 1) fail(400, 'TEAM_READ_RANGE')
        const key = `read.${id}.${a.staffId}`, old = await read(tx, a.storeId, key)
        return write(tx, a.storeId, key, { seq: Math.max(old?.seq || 0, value), readAt: new Date().toISOString() })
      })
    },
    async receipts(a: TeamActor, id: string) {
      const { c } = await channel(db, a, id)
      return Promise.all(c.members.map(async m => ({ staffId: m.staffId, ...(await read(db, a.storeId, `read.${id}.${m.staffId}`) || { seq: 0 }) })))
    },
    async updateMembers(a: TeamActor, id: string, input: unknown) {
      const v = z.object({ expectedVersion: z.number().int().positive(), members: z.array(staffId).min(1).max(100), ownerId: staffId, archived: z.boolean() }).strict().parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        await identity(tx, a)
        const c = await read<TeamChannel>(tx, a.storeId, channelKey(id))
        if (!c) fail(404, 'TEAM_CHANNEL_NOT_FOUND')
        manage(a, c)
        if (c.version !== v.expectedVersion) fail(409, 'TEAM_VERSION_CONFLICT')
        const ids = [...new Set(v.members)]
        if (c.kind === 'direct' && ids.sort().join('|') !== c.members.map(m => m.staffId).sort().join('|')) fail(400, 'TEAM_DIRECT_FIXED_MEMBERS')
        if (!ids.includes(v.ownerId)) fail(400, 'TEAM_KEEP_HOST')
        if (v.ownerId !== c.ownerId && c.kind === 'direct') fail(400, 'TEAM_DIRECT_FIXED_MEMBERS')
        await activeMembers(tx, a.storeId, ids.filter(id => !c.members.some(member => member.staffId === id)))
        if (v.ownerId !== c.ownerId) await activeMembers(tx, a.storeId, [v.ownerId])
        c.ownerId = v.ownerId
        c.members = ids.map(id => c.members.find(m => m.staffId === id) || { staffId: id, fromSeq: c.lastSeq + 1 })
        if (v.archived && c.round) await closeRound(tx, a, c)
        c.archived = v.archived; c.version++
        await write(tx, a.storeId, channelKey(id), c)
        await audit(tx, a, id, 'update', { action: 'members', members: ids, archived: c.archived })
        return c
      })
    },
    async round(a: TeamActor, id: string, action: 'start' | 'close', expectedVersion: number) {
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c } = await channel(tx, a, id); manage(a, c)
        if (c.version !== expectedVersion) fail(409, 'TEAM_VERSION_CONFLICT')
        if (c.archived) fail(409, 'TEAM_CHANNEL_CLOSED')
        if (action === 'close') return closeRound(tx, a, c)
        if (c.round) fail(409, 'TEAM_ROUND_ALREADY_OPEN')
        c.round = { id: randomUUID(), title: c.title, fromSeq: c.lastSeq + 1, startedAt: new Date().toISOString(), participants: c.members.map(m => m.staffId) }
        c.version++
        await write(tx, a.storeId, channelKey(id), c)
        return c
      })
    },
    async minutes(a: TeamActor, id: string, auditReason?: string) {
      const { fromSeq } = await channel(db, a, id, auditReason)
      // New members cannot obtain a summary of messages from before they joined.
      return (await list(db, a.storeId, `minutes.${id}.`, 0)).filter(m => m.fromSeq >= fromSeq).sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    },
    async saveMinutes(a: TeamActor, id: string, roundId: string, input: unknown, auditReason?: string) {
      uuid.parse(roundId); const v = minutesSchema.parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await channel(tx, a, id, auditReason); manage(a, c)
        const key = `minutes.${id}.${roundId}`, old = await read(tx, a.storeId, key)
        if (!old || old.fromSeq < fromSeq) fail(404, 'TEAM_MINUTES_NOT_FOUND')
        const requestKey = `minuteRequest.${a.staffId}.${v.requestId}`, hash = digest({ id, roundId, ...v })
        const repeated = await read(tx, a.storeId, requestKey)
        if (repeated) { if (repeated.hash !== hash) fail(409, 'TEAM_REQUEST_CONFLICT'); return repeated.value }
        if (old.version !== v.expectedVersion) fail(409, 'TEAM_VERSION_CONFLICT')
        const references = [...new Set([...v.sourceSeq, ...v.actions.flatMap(action => action.sourceSeq)])]
        for (const n of references) if (n < old.fromSeq || n > old.toSeq || !await read(tx, a.storeId, `message.${id}.${pad(n)}`)) fail(400, 'TEAM_SOURCE_RANGE')
        await activeMembers(tx, a.storeId, [...new Set(v.actions.map(action => action.ownerId))])
        for (const action of v.actions) if (!Number.isFinite(Date.parse(action.dueDate + 'T00:00:00Z')) || new Date(action.dueDate + 'T00:00:00Z').toISOString().slice(0, 10) !== action.dueDate) fail(400, 'TEAM_DUE_DATE')
        const { requestId: _, expectedVersion: __, ...content } = v
        const value = { ...old, ...content, version: old.version + 1, source: 'manual', updatedBy: a.staffId, updatedAt: new Date().toISOString() }
        await write(tx, a.storeId, key, value)
        await write(tx, a.storeId, `minuteVersion.${id}.${roundId}.${String(value.version).padStart(6, '0')}`, value)
        await write(tx, a.storeId, requestKey, { hash, value })
        await audit(tx, a, id, 'update', { action: 'minutes', roundId, version: value.version, status: value.status })
        return value
      })
    },
    async minuteVersions(a: TeamActor, id: string, roundId: string, auditReason?: string) {
      uuid.parse(roundId); const { fromSeq } = await channel(db, a, id, auditReason)
      const m = await read(db, a.storeId, `minutes.${id}.${roundId}`)
      if (!m || m.fromSeq < fromSeq) fail(404, 'TEAM_MINUTES_NOT_FOUND')
      return list(db, a.storeId, `minuteVersion.${id}.${roundId}.`, 0)
    },
    async tasks(a: TeamActor, id: string, auditReason?: string) {
      const { c, fromSeq } = await channel(db, a, id, auditReason)
      const authority = await teamAgentTaskAuthority(db, a, 'tasks.read')
      const plans = new Map<string, any>()
      const tasks = (await list(db, a.storeId, `task.${id}.`, 201)).filter((t: TeamTask) => !t.agentTask && t.fromSeq >= fromSeq && (!t.planId || auditReason !== undefined || t.audienceIds?.includes(authority?.staffId || a.staffId)))
      for (const t of tasks) if (t.planId && !plans.has(t.planId)) plans.set(t.planId, await read(db, a.storeId, `operationPlan.${id}.${t.planId}`))
      return tasks.map(t => ({ ...t, ...(t.planId ? { planPaused: plans.get(t.planId)?.status !== 'published' || plans.get(t.planId)?.revision !== t.planRevision || plans.get(t.planId)?.audienceHash !== digest(c.members) } : {}) }))
        .sort((a: TeamTask, b: TeamTask) => b.createdAt.localeCompare(a.createdAt))
    },
    async createTask(a: TeamActor, id: string, input: unknown) {
      const v = z.object({ requestId: uuid, roundId: uuid, minuteVersion: z.number().int().positive(), actionIndex: z.number().int().min(0).max(39) }).strict().parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await channel(tx, a, id)
        const authority = await teamAgentTaskAuthority(tx, a, 'tasks.assign')
        manage(authority?.sponsor || a, c)
        if (c.archived) fail(409, 'TEAM_CHANNEL_CLOSED')
        const requestKey = `taskRequest.${a.staffId}.${v.requestId}`, hash = digest({ id, ...v })
        const previous = await read(tx, a.storeId, requestKey)
        if (previous) {
          if (previous.hash !== hash) fail(409, 'TEAM_REQUEST_CONFLICT')
          const task = await read(tx, a.storeId, `task.${id}.${previous.taskId}`)
          if (!task || task.fromSeq < fromSeq) fail(404, 'TEAM_TASK_NOT_FOUND')
          if (task.agentTask) fail(403, 'TEAM_AGENT_TASK_PRINCIPAL_REQUIRED')
          return task
        }
        const m = await read(tx, a.storeId, `minutes.${id}.${v.roundId}`)
        if (!m || m.fromSeq < fromSeq) fail(404, 'TEAM_MINUTES_NOT_FOUND')
        if (m.version !== v.minuteVersion) fail(409, 'TEAM_VERSION_CONFLICT')
        if (m.status !== 'confirmed' || !m.actions[v.actionIndex]) fail(409, 'TEAM_CONFIRMED_ACTION_REQUIRED')
        const action = m.actions[v.actionIndex]
        if (!c.members.some(member => member.staffId === action.ownerId && member.fromSeq <= m.fromSeq)) fail(403, 'TEAM_TASK_OWNER_ACCESS')
        await activeMembers(tx, a.storeId, [action.ownerId])
        // Unchanged action snapshots deduplicate across minute versions and double clicks.
        const originKey = `taskOrigin.${id}.${v.roundId}.${digest(action)}`, existing = await read(tx, a.storeId, originKey)
        if (existing) {
          const task = await read(tx, a.storeId, `task.${id}.${existing.taskId}`)
          if (!task || task.fromSeq < fromSeq) fail(404, 'TEAM_TASK_NOT_FOUND')
          if (task.agentTask) fail(403, 'TEAM_AGENT_TASK_PRINCIPAL_REQUIRED')
          await write(tx, a.storeId, requestKey, { hash, taskId: existing.taskId })
          return task
        }
        if ((await list(tx, a.storeId, `task.${id}.`, 201)).length >= 200) fail(409, 'TEAM_TASK_LIMIT')
        const at = new Date().toISOString()
        const task: TeamTask = { id: randomUUID(), channelId: id, roundId: v.roundId, minuteVersion: m.version, actionIndex: v.actionIndex,
          ...action, fromSeq: m.fromSeq, status: 'assigned', version: 1, createdAt: at, updatedAt: at,
          events: [{ action: 'assign', by: a.staffId, at, note: '', sourceSeq: action.sourceSeq }] }
        await write(tx, a.storeId, `task.${id}.${task.id}`, task)
        await write(tx, a.storeId, originKey, { taskId: task.id })
        await write(tx, a.storeId, requestKey, { hash, taskId: task.id })
        await enqueueTeamTaskReminder(tx, a.storeId, c, task, a.staffId)
        await audit(tx, a, id, 'create', { action: 'task', taskId: task.id, roundId: v.roundId, minuteVersion: m.version })
        return task
      })
    },
    async taskAction(a: TeamActor, id: string, taskId: string, input: unknown) {
      uuid.parse(taskId)
      const v = z.object({ requestId: uuid, expectedVersion: z.number().int().positive(),
        action: z.enum(['accept', 'submit', 'return', 'complete', 'cancel']), note: z.string().trim().max(1000).default(''), sourceSeq: z.array(seq).max(20).default([]), criteriaConfirmed: z.boolean().default(false) }).strict().parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c, fromSeq } = await channel(tx, a, id)
        const authority = await teamAgentTaskAuthority(tx, a, 'tasks.review')
        if (authority && !['return', 'complete'].includes(v.action)) fail(403, 'TEAM_AGENT_REVIEW_ONLY')
        const key = `task.${id}.${taskId}`, task: TeamTask = await read(tx, a.storeId, key)
        if (!task || task.fromSeq < fromSeq || task.planId && !task.audienceIds?.includes(authority?.staffId || a.staffId)) fail(404, 'TEAM_TASK_NOT_FOUND')
        if (task.agentTask) fail(403, 'TEAM_AGENT_TASK_PRINCIPAL_REQUIRED')
        const { criteriaConfirmed, ...legacyInput } = v
        const requestKey = `taskRequest.${a.staffId}.${v.requestId}`, hash = digest({ id, taskId, ...legacyInput, ...(criteriaConfirmed ? { criteriaConfirmed: true } : {}) })
        const old = await read(tx, a.storeId, requestKey)
        if (old) { if (old.hash !== hash) fail(409, 'TEAM_REQUEST_CONFLICT'); return task }
        if (c.archived) fail(409, 'TEAM_CHANNEL_CLOSED')
        if (task.version !== v.expectedVersion) fail(409, 'TEAM_VERSION_CONFLICT')
        if (['completed', 'cancelled'].includes(task.status)) fail(409, 'TEAM_TASK_CLOSED')
        if (task.planId && v.action !== 'cancel') {
          const p = await read(tx, a.storeId, `operationPlan.${id}.${task.planId}`)
          if (!p || p.status !== 'published' || p.revision !== task.planRevision) fail(409, 'TEAM_PLAN_PAUSED')
          if (digest(c.members) !== p.audienceHash) fail(409, 'TEAM_PLAN_AUDIENCE_CHANGED')
        }
        if (v.action === 'accept' || v.action === 'submit') {
          if (task.ownerId !== a.staffId) fail(403, 'TEAM_TASK_ASSIGNEE_REQUIRED')
          if (v.action === 'accept' && task.status !== 'assigned' || v.action === 'submit' && !['accepted', 'changes_requested'].includes(task.status)) fail(409, 'TEAM_TASK_TRANSITION')
          if (v.action === 'submit' && (!v.note || !v.sourceSeq.length)) fail(400, 'TEAM_TASK_EVIDENCE_REQUIRED')
          for (const n of v.sourceSeq) {
            const message = await read(tx, a.storeId, `message.${id}.${pad(n)}`)
            if (!message || n < fromSeq || n < task.fromSeq || message.authorId !== a.staffId) fail(400, 'TEAM_TASK_EVIDENCE_REQUIRED')
          }
        } else {
          manage(authority?.sponsor || a, c)
          if (task.planId && ['return', 'complete'].includes(v.action) && task.reviewerId !== (authority?.staffId || a.staffId)) fail(403, 'TEAM_PLAN_REVIEWER_REQUIRED')
          if (task.planId && v.action === 'complete' && (!v.criteriaConfirmed || !v.note)) fail(400, 'TEAM_PLAN_CRITERIA_REQUIRED')
          if (['return', 'complete'].includes(v.action) && task.status !== 'submitted') fail(409, 'TEAM_TASK_TRANSITION')
          if (['return', 'cancel'].includes(v.action) && !v.note) fail(400, 'TEAM_TASK_NOTE_REQUIRED')
          if (v.sourceSeq.length) fail(400, 'TEAM_INVALID_INPUT')
        }
        if (task.events.length >= 100) fail(409, 'TEAM_TASK_HISTORY_LIMIT')
        const at = new Date().toISOString(), states = { accept: 'accepted', submit: 'submitted', return: 'changes_requested', complete: 'completed', cancel: 'cancelled' } as const
        task.status = states[v.action]; task.version++; task.updatedAt = at
        task.events.push({ action: v.action, by: a.staffId, at, note: v.note, sourceSeq: v.sourceSeq, ...(v.criteriaConfirmed ? { criteriaConfirmed: true } : {}) })
        await write(tx, a.storeId, key, task)
        await write(tx, a.storeId, requestKey, { hash, taskId })
        await enqueueTeamTaskReminder(tx, a.storeId, c, task, a.staffId)
        await audit(tx, a, id, 'update', { action: 'task', taskId, version: task.version, status: task.status })
        return task
      })
    },
    async attachment(a: TeamActor, id: string, fileId: string, auditReason?: string) {
      uuid.parse(fileId); const { fromSeq } = await channel(db, a, id, auditReason)
      const prefix = TEAM_PREFIX + `fileGrant.${id}.${fileId}.`
      const grant = await db.config.findFirst({ where: { storeId: a.storeId, key: { startsWith: prefix, gte: prefix + pad(fromSeq) } }, select: { id: true } })
      if (!grant) fail(403, 'TEAM_FILE_FORBIDDEN')
      const file = await readWork(a.storeId, `file.${fileId}`, db)
      if (!file) fail(404, 'TEAM_FILE_NOT_FOUND')
      return file
    }
  }
}
// Shared protected persistence and channel checks for the communication-only AI service.
export { read as readTeam, write as writeTeam, lock as lockTeam, channel as accessTeamChannel, audit as auditTeam }
