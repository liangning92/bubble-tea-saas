import type { BridgeAction, TaskRef } from './contract'
import type { TeamActor, TeamChannel } from '../TeamCommunicationService'

// Request-local capability, never deserialized from a JWT or HTTP/tool body.
// Only the bridge constructs it after checking the fresh action/data grant.
type Binding = { action: BridgeAction; agentId: string; grantVersion: number; name: string; clientRevision: number; context?: { task: TaskRef; replyToSeq?: number }; check(db: any): Promise<void>; channel(db: any, channel: TeamChannel): Promise<void>; outbound(db:any,channel:TeamChannel,input:{text:string;files:string[]}):Promise<void>; created?(db: any, channel: TeamChannel): Promise<void> }
const trusted = new WeakMap<TeamActor, Binding>()
export function bindTeamAgent(actor: TeamActor, binding: Binding): TeamActor {
  trusted.set(actor, binding)
  return actor
}
export async function teamAgentIdentity(db: any, actor: TeamActor) {
  const binding = trusted.get(actor)
  if (!binding) return null
  await binding.check(db)
  return { id: actor.staffId, name: binding.name }
}
export function teamAgentProvenance(actor: TeamActor) {
  const binding = trusted.get(actor)
  return binding ? { agentId: binding.agentId, grantVersion: binding.grantVersion, clientRevision: binding.clientRevision, ...binding.context } : undefined
}

export async function teamAgentChannelAccess(db: any, actor: TeamActor, channel: TeamChannel) {
  const binding = trusted.get(actor)
  if (binding) await binding.channel(db, channel)
}

export async function teamAgentChannelCreated(db: any, actor: TeamActor, channel: TeamChannel) {
  const binding = trusted.get(actor)
  if (binding) { await binding.check(db); await binding.created?.(db, channel) }
}

export async function teamAgentOutbound(db:any,actor:TeamActor,channel:TeamChannel,input:{text:string;files:string[]}) {
  const binding=trusted.get(actor)
  if(binding) await binding.outbound(db,channel,input)
}

/** Narrow native task seam. Never grants role=agent global manager powers. */
export async function teamAgentTaskAuthority(db: any, actor: TeamActor, action: 'tasks.read' | 'tasks.assign' | 'tasks.review') {
  const binding = trusted.get(actor)
  if (!binding) return null
  if (binding.action !== action) throw Error('TEAM_AGENT_ACTION_MISMATCH')
  await binding.check(db)
  const user = await db.user.findFirst({ where: { id: actor.id, storeId: actor.storeId, role: { in: ['admin', 'manager'] } }, include: { staff: true } })
  if (!user?.staff || user.staff.status !== 'active' || user.staff.storeId !== actor.storeId) throw Error('TEAM_AGENT_SPONSOR_REQUIRED')
  const sponsor: TeamActor = { id: user.id, staffId: user.staff.id, storeId: actor.storeId, role: user.role }
  const { userAccessV2 } = await import('../StaffPermissionV2Service.js')
  const v2 = await userAccessV2(sponsor, db)
  if (v2) sponsor.accessRole = { version: 2, modes: v2.modes, permissions: [] }
  else {
    const { readStaffAccess } = await import('../StaffPermissionService.js')
    const policy = await readStaffAccess(actor.storeId, db), assigned = policy.assignments.find(x => x.staffId === sponsor.staffId)
    const role = policy.roles.find(x => x.id === assigned?.roleId)
    if (role) sponsor.accessRole = { permissions: role.permissions }
  }
  return { sponsor, staffId: sponsor.staffId, role: sponsor.role, accessRole: sponsor.accessRole, agent: teamAgentProvenance(actor) }
}
