import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { TeamError, TeamTask, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import { prepareDispatchEvent } from '../hermesTransport/client'
import type { AdmissionResult, PreparedDispatch, RunMapping, StatusResult } from '../hermesTransport/types'
import type { AgentPrincipal, AgentTaskDependencies, AgentTaskEvent } from './contract'
import { assertAgentPilotStamp } from './pilot'

const inputSchema = z.object({ eventId: z.string().uuid(), authVersion: z.number().int().positive() }).strict()
export interface DispatchRecord {
  eventId: string; taskId: string; runId: string; preparedAt: string; prepared: PreparedDispatch
  target: { origin: string; identityId: string; credentialGeneration: number; dockerDesktopHost?: boolean }
  requestedBy: { agentId: string; grantVersion: number; clientRevision: number }
  state: 'in_flight' | 'admitted' | 'admission_unknown' | 'rejected'
  mapping?: RunMapping; admission?: AdmissionResult; lastStatus?: StatusResult; updatedAt: string
}
export interface DispatchTransport {
  dispatch(prepared: PreparedDispatch): Promise<AdmissionResult>
  status(mapping: RunMapping): Promise<StatusResult>
}
const fail = (code: string, status = 409): never => { throw new TeamError(status, code) }

/** Explicit composition only: no startup, timer, credentials, or network on import.
 * A persisted in_flight reservation is uncertain after restart, never permission to POST again.
 */
export function createAgentTaskDispatcher(db: any, dependencies: Pick<AgentTaskDependencies, 'authorize' | 'now'> & Partial<Pick<AgentTaskDependencies, 'executorFor'>>,
  profile: string, transport: DispatchTransport, target: DispatchRecord['target']) {
  if (!dependencies?.authorize || !transport?.dispatch || !transport?.status) throw Error('AGENT_DISPATCH_DEPENDENCIES_REQUIRED')
  const binding = z.object({ origin: z.string().url(), identityId: z.string().min(1).max(128), credentialGeneration: z.number().int().positive(), dockerDesktopHost: z.boolean().optional() }).strict().parse(target)
  const origin = new URL(binding.origin)
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
    !(origin.protocol === 'https:' || origin.protocol === 'http:' && (['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || binding.dockerDesktopHost === true && origin.hostname === 'host.docker.internal'))) throw Error('AGENT_DISPATCH_TARGET_INVALID')
  const fixedTarget = { origin: origin.origin, identityId: binding.identityId, credentialGeneration: binding.credentialGeneration }
  const assertTarget = (r: DispatchRecord) => {
    if (!r.target || r.target.origin !== fixedTarget.origin || r.target.identityId !== fixedTarget.identityId ||
      r.target.credentialGeneration !== fixedTarget.credentialGeneration || r.prepared.profile !== profile) fail('AGENT_DISPATCH_TARGET_CHANGED')
  }
  const now = dependencies.now || Date.now
  const at = () => new Date(now()).toISOString()
  const key = (eventId: string) => `agent.dispatch.${eventId}`
  async function scope(tx: any, principal: AgentPrincipal, eventId: string, authVersion: number) {
    const outbox = await readTeam(tx, principal.storeId, `agent.outbox.${eventId}`)
    if (!outbox || outbox.event?.id !== eventId || outbox.event.type !== 'task.dispatch_ready') fail('AGENT_DISPATCH_EVENT_NOT_FOUND', 404)
    const p = await dependencies.authorize(tx, principal, 'management.assign', outbox.channelId)
    assertAgentPilotStamp(p, now())
    if (!p || p.agentId !== principal.agentId || p.storeId !== principal.storeId || p.role !== 'manager' ||
      p.grantVersion !== authVersion || p.clientRevision !== principal.clientRevision || !p.scopes.includes('management.assign') ||
      outbox.managerId !== p.agentId) fail('AGENT_DISPATCH_AUTH_CHANGED', 403)
    const task = await readTeam<TeamTask>(tx, p.storeId, `task.${outbox.channelId}.${outbox.event.payload.taskId}`)
    const channel = await readTeam(tx, p.storeId, `channel.${outbox.channelId}`)
    if (!task?.agentTask || !channel || channel.archived || task.agentTask.managerId !== p.agentId) fail('AGENT_DISPATCH_SCOPE_CHANGED', 403)
    if ((p.pilot || task.agentTask.pilot) && JSON.stringify(p.pilot) !== JSON.stringify(task.agentTask.pilot)) fail('AGENT_DISPATCH_PILOT_CHANGED', 403)
    if (p.pilot) {
      if (!dependencies.executorFor) fail('AGENT_DISPATCH_EXECUTOR_CHANGED', 403)
      const executor = await dependencies.executorFor(tx, p, outbox.channelId)
      if (executor.role !== 'executor' || executor.agentId !== task.agentTask.executorId || executor.storeId !== p.storeId ||
        !executor.scopes.includes('executor.claim') || JSON.stringify(executor.pilot) !== JSON.stringify(p.pilot)) fail('AGENT_DISPATCH_EXECUTOR_CHANGED', 403)
      assertAgentPilotStamp(executor, now(), true)
    }
    return { p, task, outbox }
  }
  async function audit(tx: any, p: AgentPrincipal, record: DispatchRecord, action: string) {
    await tx.financeAuditLog.create({ data: { storeId: p.storeId, userId: 'agent:' + p.agentId, action: 'update',
      entityType: 'agent_task_dispatch', entityId: record.taskId, description: action,
      newValue: JSON.stringify({ actorType: 'agent', agentId: p.agentId, eventId: record.eventId,
        runId: record.runId, state: record.state, action }) } })
  }
  async function saved(tx: any, p: AgentPrincipal, r: DispatchRecord, action: string) {
    r.updatedAt = at(); await writeTeam(tx, p.storeId, key(r.eventId), r); await audit(tx, p, r, action)
  }
  async function blocked(tx: any, p: AgentPrincipal, record: DispatchRecord, outbox: any) {
    if (!outbox) return
    const t = await readTeam<TeamTask>(tx, p.storeId, `task.${outbox.channelId}.${record.taskId}`)
    if (t?.agentTask?.runId === record.runId && ['assigned', 'running'].includes(t.agentTask.state)) {
      t.agentTask.error = record.state === 'rejected' ? 'AGENT_TRANSPORT_REJECTED' : 'AGENT_TRANSPORT_ADMISSION_UNKNOWN'
      t.version++; t.updatedAt = at()
      await writeTeam(tx, p.storeId, `task.${outbox.channelId}.${record.taskId}`, t)
      const cursor = await readTeam(tx, p.storeId, 'agent.event.cursor')
      const sequence = (cursor?.sequence || 0) + 1
      if (!Number.isSafeInteger(sequence)) fail('AGENT_DISPATCH_EVENT_SEQUENCE_INVALID')
      const event: AgentTaskEvent = { id: randomUUID(), sequence, occurredAt: at(), type: record.state === 'rejected' ? 'task.failed' : 'task.blocked',
        payload: { taskId: t.id, runId: record.runId, round: t.agentTask.round, taskVersion: t.version } }
      await writeTeam(tx, p.storeId, 'agent.event.cursor', { sequence })
      await writeTeam(tx, p.storeId, `agent.event.${String(sequence).padStart(12, '0')}`, event)
      await writeTeam(tx, p.storeId, `agent.outbox.${event.id}`, { event, status: 'pending', executorId: t.agentTask.executorId, managerId: t.agentTask.managerId, channelId: t.channelId })
    }
  }
  return {
    async dispatch(principal: AgentPrincipal, input: z.infer<typeof inputSchema>): Promise<DispatchRecord> {
      const v = inputSchema.parse(input)
      const reservation = await db.$transaction(async (tx: any) => {
        await lockTeam(tx, principal.storeId, 'agent.tasks')
        const { p, task, outbox } = await scope(tx, principal, v.eventId, v.authVersion)
        const previous = await readTeam<DispatchRecord>(tx, p.storeId, key(v.eventId))
        if (previous) { assertTarget(previous); return { previous } }
        const x = task.agentTask!, e: AgentTaskEvent = outbox.event
        if (x.state !== 'assigned' || task.status !== 'assigned' || x.runId !== e.payload.runId ||
          x.eventId !== e.id || x.round !== e.payload.round || task.version !== e.payload.taskVersion ||
          Date.parse(x.plan.deadlineAt) <= now()) fail('AGENT_DISPATCH_RUN_CHANGED')
        const prepared = prepareDispatchEvent(profile, e, { taskId: task.id, runId: x.runId, eventId: x.eventId,
          round: x.round, taskVersion: task.version, executorId: x.executorId, leaseVersion: x.leaseVersion })
        const record: DispatchRecord = { eventId: e.id, taskId: task.id, runId: x.runId,
          preparedAt: at(), updatedAt: at(), prepared, state: 'in_flight', target: fixedTarget,
          requestedBy: { agentId: p.agentId, grantVersion: p.grantVersion, clientRevision: p.clientRevision } }
        await saved(tx, p, record, 'agent_dispatch_reserved')
        return { record }
      })
      if (reservation.previous) return reservation.previous
      const record = reservation.record!
      // Authorization can expire while reservation/credential setup is awaiting.
      // A denied preflight is known not sent; never turn it into a retry opportunity.
      try { await db.$transaction(async (tx: any) => { await scope(tx, principal, v.eventId, v.authVersion) }) }
      catch (error) {
        await db.$transaction(async (tx: any) => {
          await lockTeam(tx, principal.storeId, 'agent.tasks')
          const current = await readTeam<DispatchRecord>(tx, principal.storeId, key(v.eventId))
          if (current?.state === 'in_flight' && current.prepared.bodySha256 === record.prepared.bodySha256) {
            current.state = 'rejected'; current.admission = { kind: 'rejected', reason: 'request', httpStatus: 403, dispatch: current.prepared }
            await saved(tx, principal, current, 'agent_dispatch_preflight_denied_not_sent')
          }
        })
        throw error
      }
      let result: AdmissionResult
      try { result = await transport.dispatch(record.prepared) }
      catch { result = { kind: 'admission_unknown', reason: 'network_or_timeout', dispatch: record.prepared } }
      // Hermes may already have claimed/reported. Save the original transport receipt independently;
      // never turn an HTTP status into a business transition or overwrite a later round.
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, principal.storeId, 'agent.tasks')
        const current = await readTeam<DispatchRecord>(tx, principal.storeId, key(v.eventId))
        if (!current || current.prepared.bodySha256 !== record.prepared.bodySha256 || !['in_flight', 'admission_unknown'].includes(current.state)) fail('AGENT_DISPATCH_RECEIPT_CHANGED')
        current.admission = result; current.state = result.kind === 'accepted' ? 'admitted' : result.kind
        if (result.kind === 'accepted') current.mapping = result.mapping
        await saved(tx, principal, current, 'agent_dispatch_' + current.state)
        // This is a transport receipt, not task acceptance or Events callback delivery.
        const outbox = await readTeam(tx, principal.storeId, `agent.outbox.${v.eventId}`)
        if (outbox) await writeTeam(tx, principal.storeId, `agent.outbox.${v.eventId}`, { ...outbox, transportState: current.state })
        if (result.kind !== 'accepted') await blocked(tx, principal, current, outbox)
        return current
      })
    },
    async reconcile(principal: AgentPrincipal, input: z.infer<typeof inputSchema>): Promise<DispatchRecord> {
      const v = inputSchema.parse(input)
      const record = await db.$transaction(async (tx: any) => {
        await lockTeam(tx, principal.storeId, 'agent.tasks'); await scope(tx, principal, v.eventId, v.authVersion)
        const r = await readTeam<DispatchRecord>(tx, principal.storeId, key(v.eventId))
        if (!r) fail('AGENT_DISPATCH_RECEIPT_NOT_FOUND', 404)
        assertTarget(r)
        return r
      })
      if (!record.mapping) {
        // Allow the bounded HTTP attempt to finish before recording a lost receipt as unknown.
        if (record.state !== 'in_flight' || now() - Date.parse(record.preparedAt) < 120000) return record
        return db.$transaction(async (tx: any) => {
          await lockTeam(tx, principal.storeId, 'agent.tasks')
          const { p, outbox } = await scope(tx, principal, v.eventId, v.authVersion)
          const r = await readTeam<DispatchRecord>(tx, p.storeId, key(v.eventId))
          if (!r) fail('AGENT_DISPATCH_RECEIPT_NOT_FOUND', 404)
          if (r.state === 'in_flight') {
            r.state = 'admission_unknown'; await saved(tx, p, r, 'agent_dispatch_lost_receipt')
            await blocked(tx, p, r, outbox)
          }
          return r
        })
      } // No run ID: never blind POST, even beyond Hermes retention.
      let result: StatusResult
      try { result = await transport.status(record.mapping) }
      catch { result = { kind: 'status_unknown', mapping: record.mapping, reason: 'network_or_timeout' } }
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, principal.storeId, 'agent.tasks'); const { p } = await scope(tx, principal, v.eventId, v.authVersion)
        const r = await readTeam<DispatchRecord>(tx, p.storeId, key(v.eventId))
        if (!r?.mapping || r.mapping.hermesRunId !== record.mapping!.hermesRunId) fail('AGENT_DISPATCH_RECEIPT_CHANGED')
        r.lastStatus = result; await saved(tx, p, r, 'agent_dispatch_status_checked'); return r
      })
    }
  }
}
