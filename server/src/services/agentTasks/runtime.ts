import { TEAM_PREFIX, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import type { AgentPrincipal, AgentTaskEvent, AgentTaskService, AgentTaskView } from './contract'
import type { createAgentTaskDispatcher } from './dispatch'

export interface EventDeliveryOutcome { state: string; retryAt?: number }
export type PublishTaskEvent = (storeId: string, event: AgentTaskEvent) => Promise<EventDeliveryOutcome[]>

/** Post-commit composition. Explicit recovery is callable by the existing service host;
 * this module creates no worker, timer, subscription or credentials on import.
 */
export function createAgentTaskRuntime(db: any, service: AgentTaskService,
  dispatcher: ReturnType<typeof createAgentTaskDispatcher>, publish: PublishTaskEvent) {
  if (!publish || !dispatcher?.dispatch || !dispatcher?.reconcile) throw Error('AGENT_RUNTIME_DEPENDENCIES_REQUIRED')
  async function publishEvent(storeId: string, event: AgentTaskEvent) {
    if (event.type === 'task.dispatch_ready') return
    // The supplied ID is a lookup, never an event payload supplied by a model/tool caller.
    const stored = await readTeam(db, storeId, `agent.outbox.${event.id}`)
    if (!stored || JSON.stringify(stored.event) !== JSON.stringify(event)) throw Error('AGENT_RUNTIME_OUTBOX_CHANGED')
    let outcomes: EventDeliveryOutcome[] = [], error: string | undefined
    try { outcomes = await publish(storeId, event) } catch { error = 'AGENT_EVENT_DELIVERY_UNCONFIRMED' }
    const states = outcomes.map(o => o.state)
    const accepted = states.length > 0 && states.every(s => s === 'accepted')
    const retryAt = outcomes.map(o => o.retryAt).filter((v): v is number => Number.isFinite(v))
    await db.$transaction(async (tx: any) => {
      await lockTeam(tx, storeId, 'agent.tasks')
      const row = await readTeam(tx, storeId, `agent.outbox.${event.id}`)
      if (!row || JSON.stringify(row.event) !== JSON.stringify(event)) throw Error('AGENT_RUNTIME_OUTBOX_CHANGED')
      await writeTeam(tx, storeId, `agent.outbox.${event.id}`, { ...row,
        delivery: { state: accepted ? 'service_accepted' : !states.length && !error ? 'awaiting_subscription' : 'pending',
          states, ...(error ? { error } : {}), ...(retryAt.length ? { retryAt: Math.min(...retryAt) } : {}) } })
    })
    return { eventId: event.id, accepted, states, error }
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
      const page = await service.events(principal, input)
      for (const event of page.events) {
        if (event.type === 'task.dispatch_ready') {
          if (principal.role !== 'manager') continue
          const current = await service.get(principal, { taskId: event.payload.taskId, authVersion: input.authVersion })
          if (current.runId !== event.payload.runId || current.round !== event.payload.round) continue
          await dispatcher.dispatch(principal, { eventId: event.id, authVersion: input.authVersion })
          await dispatcher.reconcile(principal, { eventId: event.id, authVersion: input.authVersion })
        } else await publishEvent(principal.storeId, event)
      }
      return page
    }
  }
}
