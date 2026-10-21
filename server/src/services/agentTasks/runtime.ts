import { randomUUID } from 'node:crypto'
import { TEAM_PREFIX, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import type { AgentPrincipal, AgentTaskEvent, AgentTaskService, AgentTaskView } from './contract'
import type { createAgentTaskDispatcher } from './dispatch'

export interface EventDeliveryOutcome { state: string; retryAt?: number }
export type PublishTaskEvent = (storeId: string, event: AgentTaskEvent) => Promise<EventDeliveryOutcome[]>

/** Post-commit composition. Explicit recovery is callable by the existing service host;
 * this module creates no worker, timer, subscription or credentials on import.
 */
export function createAgentTaskRuntime(db: any, service: AgentTaskService & { supervise?: (p: AgentPrincipal, input: {taskId:string;runId:string;round:number;expectedVersion:number;authVersion:number}) => Promise<AgentTaskView> },
  dispatcher: ReturnType<typeof createAgentTaskDispatcher>, publish: PublishTaskEvent) {
  if (!publish || !dispatcher?.dispatch || !dispatcher?.reconcile) throw Error('AGENT_RUNTIME_DEPENDENCIES_REQUIRED')
  async function publishEvent(storeId: string, event: AgentTaskEvent) {
    if (event.type === 'task.dispatch_ready') return { eventId: event.id, accepted: true, states: [] as string[] }
    const claim = randomUUID()
    const acquired = await db.$transaction(async (tx: any) => {
      await lockTeam(tx, storeId, 'agent.tasks')
      const row = await readTeam(tx, storeId, `agent.outbox.${event.id}`)
      if (!row || JSON.stringify(row.event) !== JSON.stringify(event)) throw Error('AGENT_RUNTIME_OUTBOX_CHANGED')
      const prior = row.delivery
      if (prior?.state === 'service_accepted') return { ready: false, accepted: true, states: prior.states || ['accepted'] }
      if (prior?.state === 'sending' && prior.until > Date.now()) return { ready: false, accepted: false, states: ['sending'], retryAt: prior.until }
      if (prior?.retryAt > Date.now()) return { ready: false, accepted: false, states: prior.states || [], retryAt: prior.retryAt }
      const attempt = (prior?.attempt || 0) + 1
      await writeTeam(tx, storeId, `agent.outbox.${event.id}`, { ...row,
        delivery: { state: 'sending', claim, attempt, until: Date.now() + 120000, states: prior?.states || [] } })
      return { ready: true, attempt }
    })
    if (!acquired.ready) return { eventId: event.id, accepted: acquired.accepted!, states: acquired.states!, retryAt: acquired.retryAt }
    let outcomes: EventDeliveryOutcome[] = [], error: string | undefined
    try { outcomes = await publish(storeId, event) } catch { error = 'AGENT_EVENT_DELIVERY_UNCONFIRMED' }
    const states = outcomes.map(o => o.state)
    const accepted = states.length > 0 && states.every(s => s === 'accepted')
    const retryAt = outcomes.map(o => o.retryAt).filter((v): v is number => Number.isFinite(v))
    return db.$transaction(async (tx: any) => {
      await lockTeam(tx, storeId, 'agent.tasks')
      const row = await readTeam(tx, storeId, `agent.outbox.${event.id}`)
      if (!row || JSON.stringify(row.event) !== JSON.stringify(event)) throw Error('AGENT_RUNTIME_OUTBOX_CHANGED')
      if (row.delivery?.state === 'service_accepted') return { eventId: event.id, accepted: true, states: row.delivery.states || ['accepted'] }
      // A superseded attempt may complete later, but cannot overwrite a newer receipt.
      if (row.delivery?.claim !== claim) return { eventId: event.id, accepted: false, states: row.delivery?.states || ['sending'], retryAt: row.delivery?.until }
      const nextAt = retryAt.length ? Math.min(...retryAt) : undefined
      await writeTeam(tx, storeId, `agent.outbox.${event.id}`, { ...row,
        delivery: { state: accepted ? 'service_accepted' : !states.length && !error ? 'awaiting_subscription' : 'pending',
          attempt: acquired.attempt, states, ...(error ? { error } : {}), ...(nextAt ? { retryAt: nextAt } : {}) } })
      return { eventId: event.id, accepted, states, error, retryAt: nextAt }
    })
  }
  async function publishRun(storeId: string, result: AgentTaskView) {
    const rows = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'agent.outbox.' } } })
    for (const row of rows) {
      const e: AgentTaskEvent = JSON.parse(row.value).event
      if (e?.payload?.taskId === result.taskId && e.payload.runId === result.runId && e.payload.round === result.round &&
        (!result.report || e.payload.reportId === result.report.id && e.payload.reportVersion === result.report.version)) await publishEvent(storeId, e)
    }
  }
  const wrapped: AgentTaskService = {
    ...service,
    async assign(p, input) {
      const result = await service.assign(p, input) // Business transaction has committed.
      await dispatcher.dispatch(p, { eventId: result.dispatch.eventId, authVersion: input.authVersion })
      await publishRun(p.storeId, result)
      return result
    },
    async review(p, input) {
      // Only an explicit manager rework may refresh terminal evidence for this
      // exact legacy deadline failure. Background recovery never downgrades unknown.
      if (input.decision === 'rework' && input.programFailureId) {
        const current = await service.get(p, { taskId: input.taskId, authVersion: input.authVersion })
        if (current.state === 'unknown' && current.error === 'AGENT_TASK_PROGRAM_REPORT_DEADLINE_UNKNOWN' &&
          current.runId === input.runId && current.round === input.round && current.taskVersion === input.expectedVersion &&
          current.programFailure?.id === input.programFailureId && current.programFailure.version === input.programFailureVersion) {
          await dispatcher.reconcile(p, { eventId: current.dispatch.eventId, authVersion: input.authVersion })
        }
      }
      const result = await service.review(p, input)
      if (input.decision === 'rework') {
        await dispatcher.dispatch(p, { eventId: result.dispatch.eventId, authVersion: input.authVersion })
        await publishRun(p.storeId, result)
      }
      return result
    },
    async report(p, input) {
      const result = await service.report(p, input)
      await publishRun(p.storeId, result)
      return result
    }
  }
  return {
    service: wrapped,
    /** Recover only currently authorized durable events; old IDs never create new runs. */
    async recoverOutbox(principal: AgentPrincipal, input: Parameters<AgentTaskService['events']>[1]) {
      // The durable cursor may already be past dispatch_ready. Poll only this
      // store's singleton current run, never replay admission or scan other tasks.
      let reconciledEventId: string | undefined
      if (principal.role === 'manager') {
        const singleton = await readTeam<any>(db, principal.storeId, 'agent.task.code.STOCK-RO-001')
        if (singleton?.taskId) {
          const current = await service.get(principal, { taskId: singleton.taskId, authVersion: input.authVersion })
          const dispatch = await readTeam<any>(db, principal.storeId, `agent.dispatch.${current.dispatch.eventId}`)
          if (['assigned', 'running'].includes(current.state) && !current.report && dispatch?.mapping && dispatch.runId === current.runId) {
            await dispatcher.reconcile(principal, { eventId: current.dispatch.eventId, authVersion: input.authVersion })
            reconciledEventId = current.dispatch.eventId
            if (service.supervise) {
              const fresh = await service.get(principal, { taskId: current.taskId, authVersion: input.authVersion })
              try { await service.supervise(principal, { taskId: fresh.taskId, runId: fresh.runId, round: fresh.round, expectedVersion: fresh.taskVersion, authVersion: input.authVersion }) }
              catch (error: any) { if (!['AGENT_TASK_VERSION_CONFLICT', 'AGENT_TASK_RUN_CHANGED'].includes(error?.message)) throw error }
            }
          }
        }
      }
      const page = await service.events(principal, input)
      let nextCursor = input.after
      for (const event of page.events) {
        if (event.type === 'task.dispatch_ready') {
          if (principal.role !== 'manager') { nextCursor = event.sequence; continue }
          const current = await service.get(principal, { taskId: event.payload.taskId, authVersion: input.authVersion })
          if (current.runId !== event.payload.runId || current.round !== event.payload.round) { nextCursor = event.sequence; continue }
          await dispatcher.dispatch(principal, { eventId: event.id, authVersion: input.authVersion })
          if (reconciledEventId !== event.id) await dispatcher.reconcile(principal, { eventId: event.id, authVersion: input.authVersion })
        } else {
          const delivery = await publishEvent(principal.storeId, event)
          if (!delivery.accepted) return { ...page, nextCursor, hasMore: true, pendingEventId: event.id, retryAt: delivery.retryAt }
        }
        nextCursor = event.sequence
      }
      return { ...page, nextCursor: page.nextCursor }
    }
  }
}
