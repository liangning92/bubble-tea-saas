import { createHash } from 'crypto'
import { z } from 'zod'
import { AgentPrincipal, AgentTaskScope } from '../agentTasks/contract'
import { VerifiedIdentity } from './auth'
import { EventOwner } from './eventsContract'

const key = 'externalAgent.taskPrincipal.v1'
const scopes = ['management.assign', 'management.read', 'management.review', 'executor.claim', 'executor.evidence', 'executor.report'] as const
const registration = z.object({ identityHash: z.string().regex(/^[a-f0-9]{64}$/), agentId: z.string().uuid(), role: z.enum(['manager', 'executor']),
  grantVersion: z.number().int().positive(), clientRevision: z.number().int().positive(), scopes: z.array(z.enum(scopes)).max(6),
  channelIds: z.array(z.string().uuid()).min(1).max(20), revoked: z.boolean(), revokedTokenHashes: z.array(z.string()).max(100),
  environment: z.literal('isolated-test') }).strict()
const sha = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex')
export const agentIdentityHash = (who: Pick<VerifiedIdentity, 'issuer' | 'clientId' | 'subject'>) => sha([who.issuer, who.clientId, who.subject])

// No enrollment API. Test fixtures only; future real bindings need separately authorized provisioning.
export function isolatedAgentBindings(db: any) {
  async function rows(database: any, where: any) {
    const found = await database.config.findMany({ where: { key, ...where }, take: 100 })
    if (found.length >= 100) throw Error('MCP_AGENT_REGISTRY_LIMIT')
    return found.flatMap((row: any) => z.array(registration).max(20).parse(JSON.parse(row.value)).map(r => ({ ...r, storeId: row.storeId })))
  }
  function principal(r: any): AgentPrincipal { return { agentId: r.agentId, role: r.role, storeId: r.storeId, grantVersion: r.grantVersion, clientRevision: r.clientRevision, scopes: r.scopes } }
  function requireLive(r: any, p?: AgentPrincipal, scope?: string, channelId?: string) {
    if (!r || r.revoked || p && (r.agentId !== p.agentId || r.role !== p.role || r.grantVersion !== p.grantVersion || r.clientRevision !== p.clientRevision) ||
      scope && !r.scopes.includes(scope) || channelId && !r.channelIds.includes(channelId)) throw Error('MCP_AGENT_GRANT_REJECTED')
  }
  return {
    async resolve(who: VerifiedIdentity, tokenScopes: readonly string[], scope?: AgentTaskScope) {
      const found = (await rows(db, {})).filter(r => r.identityHash === agentIdentityHash(who))
      if (found.length !== 1) throw Error('MCP_AGENT_IDENTITY_AMBIGUOUS')
      const r = found[0]; requireLive(r, undefined, scope)
      if (r.revokedTokenHashes.includes(sha(who.tokenId)) || scope && !tokenScopes.includes(scope)) throw Error('MCP_AGENT_TOKEN_REJECTED')
      return principal(r)
    },
    // Inject into the backend's mandatory authorize dependency; the backend remains responsible for task/channel facts.
    async authorize(database: any, p: AgentPrincipal, scope: AgentTaskScope, channelId: string) {
      const found = (await rows(database, { storeId: p.storeId })).filter(r => r.agentId === p.agentId)
      if (found.length !== 1) throw Error('MCP_AGENT_IDENTITY_AMBIGUOUS')
      requireLive(found[0], p, scope, channelId); return principal(found[0])
    },
    async eventOwner(who: VerifiedIdentity, tokenScopes: readonly string[]): Promise<EventOwner> {
      const p = await this.resolve(who, tokenScopes, 'management.read')
      if (p.role !== 'manager') throw Error('MCP_EVENTS_MANAGER_REQUIRED')
      return { storeId: p.storeId, agentId: p.agentId, grantVersion: p.grantVersion, clientRevision: p.clientRevision, subjectKey: agentIdentityHash(who), tokenHash: sha(who.tokenId) }
    },
    async executorFor(database: any, manager: AgentPrincipal, channelId: string): Promise<AgentPrincipal> {
      await this.authorize(database, manager, 'management.assign', channelId)
      if (manager.role !== 'manager') throw Error('MCP_MANAGER_REQUIRED')
      const found = (await rows(database, { storeId: manager.storeId })).filter(r => r.role === 'executor' && !r.revoked && r.channelIds.includes(channelId) && r.scopes.includes('executor.claim'))
      if (found.length !== 1) throw Error('MCP_EXECUTOR_SELECTION_REQUIRED')
      return principal(found[0])
    },
    async restoreEventOwner(owner: EventOwner): Promise<AgentPrincipal> {
      const found = (await rows(db, { storeId: owner.storeId })).filter(r => r.agentId === owner.agentId && r.identityHash === owner.subjectKey)
      if (found.length !== 1) throw Error('MCP_EVENT_OWNER_UNAVAILABLE')
      if (found[0].revokedTokenHashes.includes(owner.tokenHash)) throw Error('MCP_EVENT_TOKEN_REVOKED')
      const p = principal(found[0]); requireLive(found[0], { ...p, grantVersion: owner.grantVersion, clientRevision: owner.clientRevision }, 'management.read')
      if (p.role !== 'manager') throw Error('MCP_EVENTS_MANAGER_REQUIRED')
      return p
    }
  }
}
export const isolatedAgentBindingKey = key
