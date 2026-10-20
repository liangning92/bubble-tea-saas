import { createHash } from 'crypto'
import { z } from 'zod'
import { AgentPrincipal, AgentTaskScope } from '../agentTasks/contract'
import { AgentPilotStamp, assertAgentPilotStamp, readAgentPilot } from '../agentTasks/pilot'
import { agentIdentityHash } from './agentBindings'
import { VerifiedIdentity } from './auth'
import { EventOwner } from './eventsContract'

export const productionAgentBindingKey = 'externalAgent.taskPrincipal.production.v1'
const managerScopes = ['management.assign', 'management.read', 'management.review'] as const
const executorScopes = ['executor.claim', 'executor.evidence', 'executor.report'] as const
const allScopes = [...managerScopes, ...executorScopes] as const
export const productionAgentRegistrationSchema = z.object({
  identityHash: z.string().regex(/^[a-f0-9]{64}$/), agentId: z.string().uuid(), role: z.enum(['manager', 'executor']),
  grantVersion: z.number().int().positive(), clientRevision: z.number().int().positive(),
  scopes: z.array(z.enum(allScopes)).length(3), channelIds: z.array(z.string().uuid()).length(1),
  revoked: z.boolean(), revokedTokenHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(100),
  environment: z.literal('production'), pilotId: z.string().uuid(), expiresAt: z.string().datetime({ offset: true })
}).strict().refine(r => {
  const expected: readonly string[] = r.role === 'manager' ? managerScopes : executorScopes
  return new Set(r.scopes).size === 3 && expected.every(s => r.scopes.includes(s as AgentTaskScope))
}, 'MCP_AGENT_ROLE_SCOPES_REQUIRED')
type Registration = z.infer<typeof productionAgentRegistrationSchema>
type ProductionEventOwner = EventOwner & { pilot: AgentPilotStamp }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const rejected = (): never => { throw Error('MCP_AGENT_GRANT_REJECTED') }
const sameStamp = (a?: AgentPilotStamp, b?: AgentPilotStamp) => !!a && !!b &&
  a.id === b.id && a.startedAt === b.startedAt && a.expiresAt === b.expiresAt

/** No provisioning or activation API. The operator-selected store is fixed at
 * construction; neither JWT claims nor tool/body fields choose a store or pilot. */
export function productionAgentBindings(db: any, options: { storeId: string; now?: () => number }) {
  if (!options.storeId || typeof options.storeId !== 'string') throw Error('MCP_AGENT_STORE_REQUIRED')
  const storeId = options.storeId, now = options.now || Date.now
  type Provenance = { kind: 'token' | 'internal_executor' | 'internal_recovery'; identityHash: string; tokenHash?: string; scopes: readonly string[] }
  const provenance = new WeakMap<AgentPrincipal, Provenance>()
  async function load(database: any) {
    const pilot = await readAgentPilot(database, storeId, now())
    const row = await database.config.findUnique({ where: { storeId_key: { storeId, key: productionAgentBindingKey } } })
    let records: Registration[]
    try { records = z.array(productionAgentRegistrationSchema).min(1).max(20).parse(JSON.parse(row?.value || 'null')) }
    catch { return rejected() }
    if (new Set(records.map(r => r.identityHash)).size !== records.length || new Set(records.map(r => r.agentId)).size !== records.length) rejected()
    // One authoritative channel and immutable T0 apply even to a newly extended grant.
    if (records.some(r => r.pilotId !== pilot.stamp.id || r.channelIds[0] !== pilot.channelId ||
      Date.parse(r.expiresAt) > Date.parse(pilot.stamp.expiresAt) || Date.parse(r.expiresAt) <= Date.parse(pilot.stamp.startedAt))) rejected()
    assertAgentPilotStamp({ pilot: pilot.stamp }, now(), true)
    return { pilot, records }
  }
  function live(r: Registration | undefined, stamp: AgentPilotStamp, p?: AgentPrincipal, scope?: AgentTaskScope, channelId?: string) {
    assertAgentPilotStamp({ pilot: stamp }, now(), true)
    if (!r || r.revoked || now() >= Date.parse(r.expiresAt) || channelId && channelId !== r.channelIds[0] ||
      scope && !r.scopes.includes(scope) || p && (p.storeId !== storeId || p.agentId !== r.agentId || p.role !== r.role ||
        p.grantVersion !== r.grantVersion || p.clientRevision !== r.clientRevision || !sameStamp(p.pilot, stamp) ||
        p.scopes.some(s => !r.scopes.includes(s as AgentTaskScope)) || scope && !p.scopes.includes(scope))) rejected()
  }
  function principal(r: Registration, stamp: AgentPilotStamp, available: readonly string[], origin: Provenance): AgentPrincipal {
    const p: AgentPrincipal = { agentId: r.agentId, role: r.role, storeId, grantVersion: r.grantVersion, clientRevision: r.clientRevision,
      scopes: r.scopes.filter(s => available.includes(s)), pilot: { ...stamp } }
    provenance.set(p, { ...origin, scopes: Object.freeze([...p.scopes]) })
    return p
  }
  async function resolve(who: VerifiedIdentity, tokenScopes: readonly string[], scope?: AgentTaskScope): Promise<AgentPrincipal> {
    const { pilot, records } = await load(db)
    const r = records.find(r => r.identityHash === agentIdentityHash(who)); live(r, pilot.stamp, undefined, scope)
    if (r.revokedTokenHashes.includes(hash(who.tokenId)) || scope && !tokenScopes.includes(scope)) throw Error('MCP_AGENT_TOKEN_REJECTED')
    const p = principal(r, pilot.stamp, tokenScopes, { kind: 'token', identityHash: r.identityHash, tokenHash: hash(who.tokenId), scopes: [] })
    if (!p.scopes.length) throw Error('MCP_AGENT_TOKEN_REJECTED')
    return p
  }
  async function authorize(database: any, p: AgentPrincipal, scope: AgentTaskScope, channelId: string): Promise<AgentPrincipal> {
    const origin = provenance.get(p)
    if (p.storeId !== storeId || !origin) rejected()
    const { pilot, records } = await load(database), r = records.find(r => r.agentId === p.agentId)
    live(r, pilot.stamp, p, scope, channelId)
    if (r.identityHash !== origin.identityHash || !origin.scopes.includes(scope) || p.scopes.some(s => !origin.scopes.includes(s)) ||
      origin.kind === 'token' && r.revokedTokenHashes.includes(origin.tokenHash)) rejected()
    return principal(r, pilot.stamp, p.scopes, origin)
  }
  async function executorFor(database: any, manager: AgentPrincipal, channelId: string): Promise<AgentPrincipal> {
    const p = await authorize(database, manager, 'management.assign', channelId)
    if (p.role !== 'manager') throw Error('MCP_MANAGER_REQUIRED')
    const { pilot, records } = await load(database)
    const candidates = records.filter(r => r.role === 'executor' && !r.revoked && now() < Date.parse(r.expiresAt) && r.channelIds[0] === channelId)
    if (candidates.length !== 1) throw Error('MCP_EXECUTOR_SELECTION_REQUIRED')
    live(candidates[0], pilot.stamp, undefined, 'executor.claim', channelId)
    // Internal dispatch reference only; a real executor JWT must independently resolve its scope intersection.
    return principal(candidates[0], pilot.stamp, candidates[0].scopes, { kind: 'internal_executor', identityHash: candidates[0].identityHash, scopes: [] })
  }
  async function eventOwner(who: VerifiedIdentity, tokenScopes: readonly string[]): Promise<ProductionEventOwner> {
    const p = await resolve(who, tokenScopes, 'management.read')
    if (p.role !== 'manager') throw Error('MCP_EVENTS_MANAGER_REQUIRED')
    return { storeId, agentId: p.agentId, grantVersion: p.grantVersion, clientRevision: p.clientRevision,
      subjectKey: agentIdentityHash(who), tokenHash: hash(who.tokenId), pilot: { ...p.pilot } }
  }
  async function restoreEventOwner(owner: EventOwner & { pilot?: AgentPilotStamp }): Promise<AgentPrincipal> {
    if (owner.storeId !== storeId) rejected()
    const { pilot, records } = await load(db)
    if (!sameStamp(owner.pilot, pilot.stamp)) rejected()
    const r = records.find(r => r.agentId === owner.agentId && r.identityHash === owner.subjectKey)
    if (!r || r.revokedTokenHashes.includes(owner.tokenHash)) throw Error('MCP_EVENT_OWNER_UNAVAILABLE')
    const p = principal(r, pilot.stamp, ['management.read'], { kind: 'token', identityHash: r.identityHash, tokenHash: owner.tokenHash, scopes: [] })
    live(r, pilot.stamp, { ...p, grantVersion: owner.grantVersion, clientRevision: owner.clientRevision }, 'management.read')
    if (p.role !== 'manager') throw Error('MCP_EVENTS_MANAGER_REQUIRED')
    return p
  }
  async function recoveryManager(): Promise<AgentPrincipal> {
    const { pilot, records } = await load(db)
    const candidates = records.filter(r => r.role === 'manager' && !r.revoked && now() < Date.parse(r.expiresAt))
    if (candidates.length !== 1) throw Error('MCP_MANAGER_SELECTION_REQUIRED')
    live(candidates[0], pilot.stamp, undefined, 'management.assign', pilot.channelId)
    // Native recovery of existing outbox only. Never a JWT replacement for review.
    return principal(candidates[0], pilot.stamp, ['management.read', 'management.assign'], { kind: 'internal_recovery', identityHash: candidates[0].identityHash, scopes: [] })
  }
  return { resolve, authorize, executorFor, eventOwner, restoreEventOwner, recoveryManager }
}
