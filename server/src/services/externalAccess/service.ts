import { randomUUID } from 'crypto'
import { AdminActor, Audit, deny, Registration, Repository, settingsInput } from './contract'

// Control-plane only. No credential issuer, token acceptance, model provider or external network.
export function externalAccess(repository: Repository) {
  const audit = (actor: AdminActor, r: Registration, action: Audit['action']): Audit => ({
    at: new Date().toISOString(), actorId: actor.id, registrationId: r.id, version: r.version, action
  })
  return {
    async list(actor: AdminActor) {
      return repository.transaction(actor.storeId, async tx => { await tx.requireAdmin(actor); return (await tx.load()).registrations })
    },
    async audits(actor: AdminActor) {
      return repository.transaction(actor.storeId, async tx => { await tx.requireAdmin(actor); return (await tx.load()).audits.slice(-200) })
    },
    async save(actor: AdminActor, raw: unknown, registrationId?: string) {
      const input = settingsInput.parse(raw)
      return repository.transaction(actor.storeId, async tx => {
        await tx.requireAdmin(actor)
        if (input.storeIds[0] !== actor.storeId) deny('EXTERNAL_STORE_SCOPE')
        // Explicit production gate: saving enabled=true must never silently grant access.
        if (input.enabled) deny('EXTERNAL_PRODUCTION_AUTH_NOT_IMPLEMENTED', 409)
        const state = await tx.load(), old = state.registrations.find(r => r.id === registrationId)
        if (registrationId && !old) deny('EXTERNAL_NOT_FOUND', 404)
        if ((old?.version ?? 0) !== input.expectedVersion) deny('EXTERNAL_VERSION_CONFLICT', 409)
        if (!old && state.registrations.length >= 50) deny('EXTERNAL_REGISTRATION_LIMIT', 409)
        const { expectedVersion, ...config } = input
        // Every edit freezes execution and invalidates prior authorization/check evidence.
        const record: Registration = { ...config, id: old?.id ?? randomUUID(), version: expectedVersion + 1,
          authVersion: (old?.authVersion ?? 0) + 1,
          clientRevision: (old?.clientRevision ?? 0) + 1,
          authState: 'unconfigured', executionState: 'frozen', connectionState: 'not_tested', updatedBy: actor.id }
        state.registrations = [...state.registrations.filter(r => r.id !== record.id), record]
        state.audits.push(audit(actor, record, 'save')); await tx.save(state)
        return record
      })
    },
    async revoke(actor: AdminActor, registrationId: string, expectedVersion: number) {
      return repository.transaction(actor.storeId, async tx => {
        await tx.requireAdmin(actor)
        const state = await tx.load(), r = state.registrations.find(r => r.id === registrationId)
        if (!r) deny('EXTERNAL_NOT_FOUND', 404)
        if (r.version !== expectedVersion) deny('EXTERNAL_VERSION_CONFLICT', 409)
        r.version++; r.authVersion++; r.enabled = false; r.authState = 'revoked'; r.executionState = 'frozen'
        r.connectionState = 'not_tested'; r.updatedBy = actor.id
        state.audits.push(audit(actor, r, 'revoke')); await tx.save(state); return r
      })
    },
    async validate(actor: AdminActor, registrationId: string, expectedVersion: number) {
      return repository.transaction(actor.storeId, async tx => {
        await tx.requireAdmin(actor)
        const state = await tx.load(), r = state.registrations.find(r => r.id === registrationId)
        if (!r) deny('EXTERNAL_NOT_FOUND', 404)
        if (r.version !== expectedVersion) deny('EXTERNAL_VERSION_CONFLICT', 409)
        if (r.clientType !== 'mcp_compatible') deny('EXTERNAL_ADAPTER_REQUIRED', 409)
        r.connectionState = 'configuration_validated'
        state.audits.push(audit(actor, r, 'validate')); await tx.save(state)
        return { status: 'configuration_validated', productionEnabled: false, authenticated: false, version: r.version,
          tools: r.tools, transport: 'not_implemented', eventWakeup: false }
      })
    },
    async invoke(): Promise<never> { return deny('EXTERNAL_PRODUCTION_AUTH_NOT_IMPLEMENTED', 503) }
  }
}
