import { createHash } from 'crypto'
import { TeamActor, TeamChannel, TeamError, teamCommunication, readTeam } from '../TeamCommunicationService'
import { bindTeamAgent } from './identity'
import { BridgeAction, BridgeDependencies, BridgeGrant, grantSchema, schemas, TaskRef } from './contract'
import { TEAM_AGENT_PREFIX as prefix, teamReplyEventId } from './events'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const denied = (): never => { throw new TeamError(403, 'TEAM_AGENT_ACCESS_DENIED') }
async function read(db: any, storeId: string, key: string) {
  const r = await db.config.findUnique({ where: { storeId_key: { storeId, key: prefix + key } } })
  return r ? JSON.parse(r.value) : null
}
async function put(db: any, storeId: string, key: string, value: unknown) {
  await db.config.upsert({ where: { storeId_key: { storeId, key: prefix + key } }, create: { storeId, key: prefix + key, category: 'staff', value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
}
export function createTeamAgentBridge(db: any, deps: BridgeDependencies) {
  const native = teamCommunication(db), now = deps.now || Date.now
  async function grant(database: any, action: BridgeAction) {
    if (deps.enabled !== true) denied()
    const g = grantSchema.parse(await deps.resolveGrant(database))
    if (g.revoked || Date.parse(g.expiresAt) <= now() || !g.actions.includes(action)) denied()
    const sponsor = await database.user.findFirst({ where: { id: g.sponsorUserId, storeId: g.storeId, role: { in: ['admin', 'manager'] } }, select: { id: true, staff: { select: { id: true, storeId: true, status: true } } } })
    if (!sponsor?.staff || sponsor.staff.status !== 'active' || sponsor.staff.storeId !== g.storeId) denied()
    return g
  }
  async function authorize(database: any, g: BridgeGrant, action: BridgeAction, task?: TaskRef, channelId?: string, currentChannel?: TeamChannel) {
    const fresh = await grant(database, action)
    if (fresh.agentId !== g.agentId || fresh.storeId !== g.storeId || fresh.sponsorUserId !== g.sponsorUserId || fresh.version !== g.version || fresh.clientRevision !== g.clientRevision || hash(fresh) !== hash(g)) denied()
    if (task) await deps.tasks.assert(database, fresh, task, channelId)
    if (channelId) {
      const created = await read(database, g.storeId, 'channel.' + channelId)
      if (created?.agentId !== g.agentId || !task || created.task?.taskId !== task.taskId) denied()
      // Check the exact native snapshot returned to callers, including create receipt replay.
      const c = currentChannel || await readTeam(database, g.storeId, 'channel.' + channelId)
      if (!c || c.archived || !c.members.some((m: any) => m.staffId === 'agent:' + g.agentId) ||
        c.members.some((m: any) => m.staffId !== 'agent:' + g.agentId && !g.staffIds.includes(m.staffId))) denied()
      const humans = c.members.filter((m: any) => m.staffId !== 'agent:' + g.agentId).map((m: any) => m.staffId)
      const active = await database.staff.findMany({ where: { storeId: g.storeId, id: { in: humans }, status: 'active' }, select: { id: true } })
      if (active.length !== new Set(humans).size) denied()
    }
  }
  async function actor(action: BridgeAction, task?: TaskRef, channelId?: string, replyToSeq?: number) {
    const g = await grant(db, action)
    await authorize(db, g, action, task, channelId)
    const a: TeamActor = { id: g.sponsorUserId, storeId: g.storeId, staffId: 'agent:' + g.agentId, role: 'agent' }
    bindTeamAgent(a, { action, agentId: g.agentId, grantVersion: g.version, clientRevision: g.clientRevision, name: g.displayName, context: task ? { task, replyToSeq } : undefined,
      created: async (database, c) => { await authorize(database, g, action, task); await put(database, g.storeId, 'channel.' + c.id, { agentId: g.agentId, task, createdAt: new Date(now()).toISOString() }) },
      check: database => authorize(database, g, action, task, channelId),
      channel: (database, c) => authorize(database, g, action, task, c.id, c) })
    return { a, g }
  }
  return {
    async withActor<T>(action: BridgeAction, task: TaskRef, channelId: string, operation: (actor: TeamActor) => Promise<T>): Promise<T> {
      const { a } = await actor(action, task, channelId)
      return operation(a)
    },
    async directory(input: unknown) {
      schemas.directory.parse(input)
      const { g } = await actor('directory.read')
      return db.staff.findMany({ where: { storeId: g.storeId, id: { in: g.staffIds }, status: 'active' },
        select: { id: true, name: true, position: true, user: { select: { role: true } } }, orderBy: { name: 'asc' } })
    },
    async channels(input: unknown) {
      const v = schemas.channels.parse(input), { g } = await actor('conversations.read', v.task)
      const created = await db.config.findMany({ where: { storeId: g.storeId, key: { startsWith: prefix + 'channel.' } }, take: 501 })
      if (created.length > 500) throw new TeamError(409, 'TEAM_CHANNEL_LIMIT')
      const ids = new Set<string>(g.channelIds)
      for (const row of created) if (JSON.parse(row.value).agentId === g.agentId) ids.add(row.key.slice((prefix + 'channel.').length))
      const result = []
      for (const id of ids) {
        try { await authorize(db, g, 'conversations.read', v.task, id) }
        catch (error) { if (error instanceof TeamError && error.status === 403) continue; throw error }
        const c = await readTeam(db, g.storeId, 'channel.' + id)
        result.push({ id: c.id, title: c.title, kind: c.kind, version: c.version, lastSeq: c.lastSeq,
          fromSeq: c.members.find((m: any) => m.staffId === 'agent:' + g.agentId).fromSeq })
      }
      return result
    },
    async create(input: unknown) {
      const v = schemas.create.parse(input), { a, g } = await actor('conversation.create', v.task)
      if (v.members.some(id => !g.staffIds.includes(id))) denied()
      const c = await native.create(a, { requestId: v.requestId, title: v.title, kind: 'group', members: v.members })
      return c
    },
    async messages(input: unknown) {
      const v = schemas.messages.parse(input), { a } = await actor('messages.read', v.task, v.channelId)
      return native.messages(a, v.channelId, v.afterSeq)
    },
    async attachment(input: unknown) {
      const v = schemas.attachment.parse(input), { a } = await actor('attachments.read', v.task, v.channelId)
      const file = await native.attachment(a, v.channelId, v.fileId)
      // Storage transport is injected; no host-specific path or public file URL.
      if (file.size > 2 * 1024 * 1024) throw new TeamError(413, 'TEAM_ATTACHMENT_TOO_LARGE')
      const bytes = await deps.readAttachment(a.storeId, v.fileId)
      if (bytes.byteLength > 2 * 1024 * 1024) throw new TeamError(413, 'TEAM_ATTACHMENT_TOO_LARGE')
      // Recheck after I/O so revocation while loading does not disclose the file.
      await actor('attachments.read', v.task, v.channelId)
      return { fileId: v.fileId, type: file.type, size: bytes.byteLength, encoding: 'base64', content: Buffer.from(bytes).toString('base64') }
    },
    async send(input: unknown) {
      const v = schemas.send.parse(input), { a } = await actor('messages.send', v.task, v.channelId, v.replyToSeq)
      // Requiring a visible source ensures replies cannot cite pre-membership history.
      if (v.replyToSeq !== undefined) {
        const page = await native.messages(a, v.channelId, v.replyToSeq - 1)
        if (!page.messages.some((m: any) => m.seq === v.replyToSeq)) denied()
      }
      const result = await native.send(a, v.channelId, { requestId: v.requestId, text: v.text, files: [], expectedLastSeq: v.expectedLastSeq })
      // Wake failure must not turn a committed message into an apparent failed write.
      try { deps.messageCommitted?.(a.storeId) } catch { /* persisted native reminder is recoverable */ }
      return { ...result, task: v.task, replyToSeq: v.replyToSeq, delivery: 'stored' }
    },
    async receipts(input: unknown) {
      const v = schemas.receipts.parse(input), { a } = await actor('receipts.read', v.task, v.channelId)
      return { device: 'unknown', receipts: await native.receipts(a, v.channelId) }
    },
    async markRead(input: unknown) {
      const v = schemas.markRead.parse(input), { a } = await actor('agent.read', v.task, v.channelId)
      return native.markRead(a, v.channelId, v.throughSeq) // only the agent's own cursor
    },
    async changes(input: unknown) {
      const v = schemas.changes.parse(input), { a, g } = await actor('changes.read', v.task, v.channelId)
      const page = await native.messages(a, v.channelId, v.afterSeq)
      const events = []
      for (const message of page.messages) {
        if (message.authorId === a.staffId || message.agent) continue
        const eventId = teamReplyEventId(g.agentId, v.task.taskId, v.channelId, message.id)
        // Pending was committed atomically with the employee message, not created by this scan.
        const pending = await read(db, g.storeId, 'pending.' + eventId)
        if (!pending) throw new TeamError(409, 'TEAM_REPLY_OUTBOX_MISSING')
        events.push({ eventId, name: 'team.message_created', timestamp: message.createdAt,
          data: { taskId: v.task.taskId, channelId: v.channelId, messageId: message.id, seq: message.seq }, cursor: message.seq })
      }
      return { events, nextCursor: page.cursor, hasMore: page.hasMore, followupState: 'pending', execution: 'not_started' }
    }
  }
}
