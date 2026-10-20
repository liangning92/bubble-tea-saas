import { AdminActor, deny, emptyState, Repository, State, stateSchema } from './contract'

const key = 'externalAgent.access.v1'
// No default/global Prisma import: caller must explicitly provide a database connection.
// PostgreSQL transaction and store lock serialize all config, revoke and audit mutations.
export function postgresExternalRepository(db: any): Repository {
  return {
    transaction(storeId, work) {
      if (!storeId) deny('EXTERNAL_IDENTITY_REQUIRED')
      return db.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}), hashtext(${storeId}))`
        return work({
          async requireAdmin(actor: AdminActor) {
            if (!actor.id || actor.employeeApp || actor.storeId !== storeId) deny('EXTERNAL_ADMIN_REQUIRED')
            const user = await tx.user.findFirst({ where: { id: actor.id, storeId, role: 'admin' }, select: { id: true } })
            const staff = await tx.staff.findFirst({ where: { userId: actor.id, storeId, status: 'active' }, select: { id: true } })
            if (!user || !staff) deny('EXTERNAL_ADMIN_REQUIRED')
          },
          async load(): Promise<State> {
            const row = await tx.config.findUnique({ where: { storeId_key: { storeId, key } } })
            if (!row) return emptyState()
            // Corrupt state fails closed rather than resetting authorization versions.
            let raw: unknown
            try { raw = JSON.parse(row.value) } catch { deny('EXTERNAL_STATE_INVALID', 503) }
            const parsed = stateSchema.safeParse(raw)
            if (!parsed.success || parsed.data.registrations.some(r => r.storeIds[0] !== storeId)) deny('EXTERNAL_STATE_INVALID', 503)
            return parsed.data as State
          },
          async save(state) {
            const value = JSON.stringify(stateSchema.parse(state))
            await tx.config.upsert({ where: { storeId_key: { storeId, key } },
              create: { storeId, key, value, category: 'externalAgent' }, update: { value } })
          }
        })
      })
    }
  }
}
