import { z } from 'zod'
import { TeamError, readTeam, writeTeam, lockTeam } from '../TeamCommunicationService'
import type { AdmissionBinding, AdmissionBindings } from '../hermesTransport/types'

/** Server-only composition dependency. Reuses the original run reservation; no memory fallback. */
export function persistentAdmissionBindings(db: any, storeId: string): AdmissionBindings {
  const runId = z.string().uuid()
  const key = (id: string) => `agent.transport.binding.${runId.parse(id)}`
  return {
    async bindOnce(backendRunId, binding) {
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'agent.tasks')
        const original = await readTeam<AdmissionBinding>(tx, storeId, key(backendRunId))
        if (original) return original
        const refs = binding.dispatch.references
        const reservation = await readTeam(tx, storeId, `agent.dispatch.${refs.eventId}`)
        if (!reservation || reservation.runId !== backendRunId || refs.backendRunId !== backendRunId ||
          reservation.prepared.body !== binding.dispatch.body || reservation.prepared.idempotencyKey !== binding.dispatch.idempotencyKey ||
          reservation.prepared.bodySha256 !== binding.dispatch.bodySha256 || reservation.target?.origin !== binding.origin ||
          !/^[a-f0-9]{64}$/.test(binding.authScopeHash)) throw new TeamError(409, 'AGENT_ADMISSION_RESERVATION_REQUIRED')
        await writeTeam(tx, storeId, key(backendRunId), binding)
        await tx.financeAuditLog.create({ data: { storeId, userId: 'agent:' + reservation.requestedBy.agentId,
          action: 'create', entityType: 'agent_task_transport', entityId: reservation.taskId,
          description: 'agent_admission_bound', newValue: JSON.stringify({ actorType: 'agent', runId: backendRunId,
            taskId: reservation.taskId, eventId: refs.eventId }) } })
        return binding
      })
    },
    async load(backendRunId) {
      return await readTeam<AdmissionBinding>(db, storeId, key(backendRunId)) || undefined
    }
  }
}
