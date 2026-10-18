import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { readWork } from './EmployeeWorkspaceStore'

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
  requestId: uuid, text: z.string().trim().max(4000).default(''), files: z.array(uuid).max(5).default([])
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
    entityType: 'team_communication', entityId: id, description: 'Team communication access/change', newValue: JSON.stringify(detail) } })
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
function manage(a: TeamActor, c: TeamChannel) {
  if (c.ownerId !== a.staffId && !canTeam(a, 'team.manage')) fail(403, 'TEAM_HOST_REQUIRED')
}
async function messageRows(db: DB, storeId: string, id: string, after: number, limit: number, until?: number) {
  const prefix = TEAM_PREFIX + `message.${id}.`
  return (await db.config.findMany({ where: { storeId, key: { startsWith: prefix, gt: prefix + pad(after),
    ...(until !== undefined ? { lte: prefix + pad(until) } : {}) } }, orderBy: { key: 'asc' }, take: limit }))
    .map((r: any) => JSON.parse(r.value))
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
        return { ...c, unread: membership ? Math.max(0, c.lastSeq - Math.max(readSeq, membership.fromSeq - 1)) : 0,
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
        const requestKey = `create.${a.staffId}.${v.requestId}`
        const existing = await read(tx, a.storeId, requestKey)
        if (existing) { if (existing.hash !== digest(v)) fail(409, 'TEAM_REQUEST_CONFLICT'); return (await channel(tx, a, existing.channel.id)).c }
        await activeMembers(tx, a.storeId, ids)
        if ((await list(tx, a.storeId, 'channel.', 501)).length >= 500) fail(409, 'TEAM_CHANNEL_LIMIT')
        if (v.kind === 'direct') {
          const found = (await list(tx, a.storeId, 'channel.')).find((c: TeamChannel) => c.kind === 'direct' && !c.archived && c.members.map(m => m.staffId).sort().join('|') === ids.join('|'))
          if (found) { await write(tx, a.storeId, requestKey, { hash: digest(v), channel: found }); return found }
        }
        const now = new Date().toISOString()
        const c: TeamChannel = { id: randomUUID(), title: v.title, kind: v.kind, ownerId: a.staffId,
          members: ids.map(id => ({ staffId: id, fromSeq: 1 })), lastSeq: 0, version: 1, archived: false, createdAt: now,
          round: v.kind === 'meeting' ? { id: randomUUID(), title: v.title, fromSeq: 1, startedAt: now, participants: ids } : null }
        await write(tx, a.storeId, channelKey(c.id), c)
        await write(tx, a.storeId, requestKey, { hash: digest(v), channel: c })
        await audit(tx, a, c.id, 'create', { kind: c.kind, members: ids })
        return c
      })
    },
    async messages(a: TeamActor, id: string, after: number, auditReason?: string) {
      seq.parse(after)
      const { c, fromSeq } = await channel(db, a, id, auditReason)
      const rows = await messageRows(db, a.storeId, id, Math.max(after, fromSeq - 1), 101)
      const messages = rows.slice(0, 100)
      return { channel: c, messages, cursor: messages.at(-1)?.seq ?? Math.max(after, fromSeq - 1), hasMore: rows.length > 100,
        canEdit: c.ownerId === a.staffId || canTeam(a, 'team.manage'), audit: auditReason !== undefined }
    },
    async send(a: TeamActor, id: string, input: unknown) {
      const v = messageSchema.parse(input)
      return db.$transaction(async (tx: DB) => {
        await lock(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c } = await channel(tx, a, id)
        const requestKey = `request.${a.staffId}.${v.requestId}`
        const old = await read(tx, a.storeId, requestKey), hash = digest({ id, ...v })
        if (old) { if (old.hash !== hash) fail(409, 'TEAM_REQUEST_CONFLICT'); return old.message }
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
          authorId: a.staffId, authorName: employee.name, text: v.text, files: v.files, createdAt: new Date(now).toISOString() }
        await write(tx, a.storeId, `message.${id}.${pad(message.seq)}`, message)
        for (const f of v.files) await write(tx, a.storeId, `fileGrant.${id}.${f}.${pad(message.seq)}`, { seq: message.seq })
        await write(tx, a.storeId, channelKey(id), c)
        await write(tx, a.storeId, requestKey, { hash, message })
        await write(tx, a.storeId, rateKey, [...recent, now])
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
