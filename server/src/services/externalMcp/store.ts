import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { stateSchema, deny } from '../externalAccess/contract'
import { teamCommunication, TeamActor } from '../TeamCommunicationService'
import { VerifiedIdentity } from './auth'

const registrationKey = 'externalAgent.access.v1'
export const bindingKey = (who: Pick<VerifiedIdentity, 'issuer' | 'clientId' | 'subject'>) =>
  'externalAgent.mcp.binding.v1.' + createHash('sha256').update(JSON.stringify([who.issuer, who.clientId, who.subject])).digest('hex')
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
const bindingSchema = z.object({ registrationId: z.string().uuid(), userId: z.string().min(1).max(128), staffId: z.string().min(1).max(128),
  version: z.number().int().positive(), authVersion: z.number().int().positive(), clientRevision: z.number().int().positive(),
  taskIds: z.array(z.string().uuid()).min(1).max(10), revoked: z.boolean(), revokedTokenHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(100),
  // An isolated enrollment is never sufficient to turn on production access.
  environment: z.literal('isolated-test') }).strict()
export interface BoundIdentity { userId: string; staffId: string; subjectHash: string; clientHash: string; configVersion: number; storeId: string; registrationId: string; bindingVersion: number; authVersion: number; clientRevision: number }

export function taskResourceStore(db: any) {
  async function transaction<T>(who: VerifiedIdentity, work: (tx: any, bound: BoundIdentity, grant: z.infer<typeof bindingSchema>, actor: TeamActor, channels: string[]) => Promise<T>) {
    const key = bindingKey(who)
    // storeId is determined by a unique server-owned binding, never from tool arguments or JWT store claims.
    const rows = await db.config.findMany({ where: { key }, select: { storeId: true }, take: 2 })
    if (rows.length !== 1) deny('MCP_BINDING_UNAVAILABLE')
    const storeId = rows[0].storeId
    return db.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registrationKey}), hashtext(${storeId}))`
      const row = await tx.config.findUnique({ where: { storeId_key: { storeId, key } } })
      const grant = bindingSchema.parse(JSON.parse(row?.value ?? 'null'))
      if (grant.revoked || grant.revokedTokenHashes.includes(tokenHash(who.tokenId))) deny('MCP_AUTHORIZATION_REVOKED')
      const config = await tx.config.findUnique({ where: { storeId_key: { storeId, key: registrationKey } } })
      const state = stateSchema.parse(JSON.parse(config?.value ?? 'null')), r = state.registrations.find(r => r.id === grant.registrationId)
      if (!r || r.authState === 'revoked' || r.storeIds.length !== 1 || r.storeIds[0] !== storeId ||
        r.authVersion !== grant.authVersion || r.clientRevision !== grant.clientRevision || r.clientType !== 'mcp_compatible' || !r.tools.includes('tasks.read')) deny('MCP_AUTHORIZATION_CHANGED')
      // In this stage registrations remain disabled/frozen; the handler can run only in the guarded test harness.
      const user = await tx.user.findFirst({ where: { id: grant.userId, storeId }, select: { id: true } })
      const staff = await tx.staff.findFirst({ where: { id: grant.staffId, userId: grant.userId, storeId, status: 'active' }, select: { id: true } })
      if (!user || !staff) deny('MCP_SUBJECT_UNAVAILABLE')
      const bound = { userId: user.id, staffId: staff.id, subjectHash: tokenHash(who.subject), clientHash: tokenHash(who.clientId), configVersion: r.version, storeId, registrationId: r.id, bindingVersion: grant.version, authVersion: grant.authVersion, clientRevision: grant.clientRevision }
      // Do not inherit admin capabilities, even when the delegated user is an administrator.
      const actor: TeamActor = { id: user.id, storeId, staffId: staff.id, role: 'staff', employeeApp: true }
      return work(tx, bound, grant, actor, r.channelIds)
    })
  }
  async function audit(tx: any, bound: BoundIdentity, action: string, result: string, taskId?: string) {
    const key = 'externalAgent.mcp.audit.v1.' + randomUUID()
    await tx.config.create({ data: { storeId: bound.storeId, key, category: 'externalAgent', value: JSON.stringify({
      at: new Date().toISOString(), userId: bound.userId, staffId: bound.staffId, subjectHash: bound.subjectHash, clientHash: bound.clientHash, configVersion: bound.configVersion, registrationId: bound.registrationId, bindingVersion: bound.bindingVersion,
      authVersion: bound.authVersion, clientRevision: bound.clientRevision, action, result, ...(taskId ? { taskId } : {})
    }) } })
  }
  return {
    async authorize(who: VerifiedIdentity) { return transaction(who, async (tx, bound) => { await audit(tx, bound, 'request', 'authenticated'); return bound }) },
    async readTask(who: VerifiedIdentity, channelId: string, taskId: string) {
      // Denial is returned from the transaction so its audit commits, then rejected outside it.
      const result = await transaction(who, async (tx, bound, grant, actor, channels) => {
        try {
          if (!channels.includes(channelId) || !grant.taskIds.includes(taskId)) deny('MCP_TASK_SCOPE')
          const tasks = await teamCommunication(tx).tasks(actor, channelId)
          const task = tasks.find(t => t.id === taskId)
          if (!task) deny('MCP_TASK_UNAVAILABLE', 404)
          const data = { id: task.id, version: task.version, status: task.status, text: String(task.text).slice(0, 1000), dueDate: String(task.dueDate ?? '').slice(0, 40) }
          await audit(tx, bound, 'task.read', 'allowed', taskId)
          return { data }
        } catch {
          await audit(tx, bound, 'task.read', 'denied', taskId)
          return { denied: true }
        }
      })
      if ('denied' in result) deny('MCP_TASK_UNAVAILABLE', 403)
      return result.data
    }
  }
}
