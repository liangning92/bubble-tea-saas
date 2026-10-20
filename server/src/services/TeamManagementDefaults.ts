import { z } from 'zod'
import { TeamActor, TeamChannel, TeamError, readTeam, writeTeam, lockTeam, auditTeam } from './TeamCommunicationService'
import { WorkflowPolicy, workflowHash } from './TeamWorkflowQueue'

const schema = z.object({ requestId: z.string().uuid(), expectedVersion: z.number().int().nonnegative(), enabled: z.boolean(), consent: z.literal(true),
  ownerStaffId: z.string().min(1).max(128), expectedAiConfigVersion: z.number().int().positive().optional(), expectedAiCheckRevision: z.number().int().positive().optional() }).strict()
export interface ManagementDefaults { version: number; enabled: boolean; ownerStaffId: string; ownerUserId: string; aiConfigVersion: number; aiCheckRevision: number; startedAt: string; lastRequestId: string }
const fail = (code: string, status = 409): never => { throw new TeamError(status, code) }
async function owner(db: any, a: TeamActor) {
  if (a.employeeApp || a.role !== 'admin' || !await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })) fail('TEAM_MANAGEMENT_OWNER_REQUIRED', 403)
}
export function teamManagementDefaults(db: any) {
  return {
    async read(a: TeamActor, requestId?: string) {
      await owner(db,a)
      const current = await readTeam<ManagementDefaults>(db,a.storeId,'workflow.defaults') || {version:0,enabled:false,ownerStaffId:null}
      if (!requestId) return current
      z.string().uuid().parse(requestId)
      const receipt=await readTeam(db,a.storeId,`workflow.defaults.request.${a.id}.${requestId}`)
      return {...current,...(receipt ? {requestReceipt:{requestId,version:receipt.result.version,enabled:receipt.result.enabled,ownerStaffId:receipt.result.ownerStaffId}} : {})}
    },
    async save(a: TeamActor, input: unknown) {
      const v = schema.parse(input); await owner(db, a)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'workflow-defaults')
        await owner(tx, a)
        const rk = `workflow.defaults.request.${a.id}.${v.requestId}`, receipt = await readTeam(tx, a.storeId, rk), digest = workflowHash(v)
        if (receipt) { if (receipt.hash !== digest) fail('TEAM_REQUEST_CONFLICT'); return receipt.result }
        const old = await readTeam<ManagementDefaults>(tx, a.storeId, 'workflow.defaults')
        if ((old?.version || 0) !== v.expectedVersion) fail('TEAM_VERSION_CONFLICT')
        const responsible = await tx.user.findFirst({ where: { storeId: a.storeId, role: 'admin', staff: { id: v.ownerStaffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })
        if (!responsible) fail('TEAM_MANAGEMENT_OWNER_REQUIRED', 403)
        await lockTeam(tx, a.storeId, 'ai-budget')
        const { readAiConnection } = await import('./TeamAiService.js')
        const config = await readTeam(tx, a.storeId, 'ai.settings'), connection = config ? await readAiConnection(tx, a.storeId, config) : null
        if (v.enabled && (!config?.enabled || !config.secret || config.region !== 'cn' || config.version !== v.expectedAiConfigVersion || connection?.status !== 'ready' || connection.checkRevision !== v.expectedAiCheckRevision)) fail('TEAM_WORKFLOW_CONNECTION_REQUIRED')
        const result: ManagementDefaults = { version: (old?.version || 0) + 1, enabled: v.enabled, ownerStaffId: v.ownerStaffId, ownerUserId: responsible.id,
          aiConfigVersion: v.expectedAiConfigVersion || old?.aiConfigVersion || 0, aiCheckRevision: v.expectedAiCheckRevision || old?.aiCheckRevision || 0, startedAt: old?.enabled ? old.startedAt : new Date().toISOString(), lastRequestId: v.requestId }
        await writeTeam(tx, a.storeId, 'workflow.defaults', result)
        await writeTeam(tx, a.storeId, rk, { hash: digest, result })
        await auditTeam(tx, a, a.storeId, 'update', { action: 'management_defaults', ...result })
        return result
      })
    }
  }
}
/** Runs under the existing channel transaction. Never adds a member or reads another conversation. */
export async function inheritManagementPolicy(db: any, storeId: string, c: TeamChannel) {
  const defaults = await readTeam<ManagementDefaults>(db, storeId, 'workflow.defaults')
  if (!defaults) return { active: false as const }
  if (!defaults.enabled) return { active: true as const, paused: true as const }
  const existing = await readTeam<WorkflowPolicy>(db, storeId, `workflow.policy.${c.id}`)
  const exception = await readTeam(db, storeId, `workflow.exception.${c.id}`)
  if (exception || existing?.takeover || existing?.origin === 'store_default' && existing.paused) return { active: true as const, paused: true as const }
  const people = await db.staff.findMany({ where: { storeId, id: { in: c.members.map(m => m.staffId) }, status: 'active' },
    select: { id: true, name: true, userId: true, user: { select: { id: true, role: true, storeId: true } } } })
  const bound = people.filter((p: any) => p.user && p.user.id === p.userId && p.user.storeId === storeId)
  const admins = bound.filter((p: any) => p.user.role === 'admin')
  const responsible = admins.find((p: any) => p.id === c.ownerId) || admins.find((p: any) => p.id === defaults.ownerStaffId) || admins.sort((a: any, b: any) => a.id.localeCompare(b.id))[0]
  const unavailable = !responsible || bound.length !== c.members.length || c.archived || !['direct', 'group', 'public', 'meeting'].includes(c.kind)
  if (unavailable) return { active: true as const, unavailable: { reason: !responsible ? 'responsible_member_required' : 'current_members_required', ownerStaffId: defaults.ownerStaffId, ownerUserId: defaults.ownerUserId, defaultsVersion: defaults.version } }
  const employees = bound.filter((p: any) => p.id !== responsible.id).map((p: any) => ({ staffId: p.id, employeeName: p.name.trim(), employeeRecordName: p.name.trim() })).sort((a: any, b: any) => a.staffId.localeCompare(b.staffId))
  if (!employees.length) return { active: true as const, unavailable: { reason: 'work_participant_required', ownerStaffId: defaults.ownerStaffId, ownerUserId: defaults.ownerUserId, defaultsVersion: defaults.version } }
  const definition = { origin: 'store_default' as const, defaultsVersion: defaults.version, automaticSend: true, management: {
    version: 1 as const, employees, region: 'cn' as const, scope: 'daily_management_v1' as const, dataConsent: true as const, ownerStaffId: responsible.id,
    // New processing begins at store consent. Member floors still protect older private history.
    sourceFloor: Math.max(...c.members.map(m => m.fromSeq)), aiCheckRevision: defaults.aiCheckRevision },
    employeeIds: employees.map((p: any) => p.staffId), operatorUserId: responsible.user.id, operatorStaffId: responsible.id,
    audienceHash: workflowHash(c.members), aiConfigVersion: defaults.aiConfigVersion }
  const digest = workflowHash(definition)
  if (existing?.origin === 'store_default' && existing.hash === digest) return { active: true as const, policy: existing }
  const policy: WorkflowPolicy = { ...definition, channelId: c.id, enabled: true, paused: false, consent: true, hash: digest, version: (existing?.version || 0) + 1, epoch: (existing?.epoch || 0) + 1 }
  await writeTeam(db, storeId, `workflow.policy.${c.id}`, policy)
  await auditTeam(db, { id: responsible.user.id, staffId: responsible.id, storeId, role: 'admin', employeeApp: false }, c.id, 'update', { action: 'management_inherited', defaultsVersion: defaults.version, policyVersion: policy.version, audienceHash: policy.audienceHash })
  return { active: true as const, policy }
}
