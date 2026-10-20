import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { TeamActor, TeamError, readTeam, writeTeam, lockTeam, accessTeamChannel, auditTeam, teamCommunication, TEAM_PREFIX } from './TeamCommunicationService'
import { teamAi, readAiConnection } from './TeamAiService'
import { ensureAction, followupDue, beginFollowup, settleFollowup, listActions } from './TeamManagementActions'
import { readWork, writeWork } from './EmployeeWorkspaceStore'
import { managementConsentSchema, assertManagementAudience, assertManagementFresh, managementPrivateText, managementContext } from './TeamManagementContext'
import { managementResultSchema, managementHash, ManagementAuthorization, assertManagementReplyBoundary } from './TeamManagementPolicy'
import { routineConsentSchema, assertRoutineAudience, assertRoutineFresh, routineContext, routineReplySchema, ROUTINE_REPLIES, RoutineAuthorization } from './TeamRoutinePolicy'
import { operationContent, teamOperations } from './TeamOperationsService'
import { WorkflowPolicy, WorkflowJob, WorkflowBillingAttempt, workflowHash as hash, workflowPad as pad, workflowJobKey, workflowEvent } from './TeamWorkflowQueue'

const fail = (code: string, status = 409): never => { throw new TeamError(status, code) }
const uuid = z.string().uuid(), seq = z.number().int().positive().max(999999999999)
const ports = { read: readTeam, write: writeTeam }
const resultSchema = z.object({ replyText: z.string().trim().min(1).max(1800), summaryZh: z.string().trim().min(1).max(1000),
  suggestedTask: z.object({ category: z.enum(['communication', 'training', 'inspection']), text: z.string().trim().min(1).max(600),
    evidenceRequired: z.string().trim().min(1).max(400), acceptanceCriteria: z.string().trim().min(1).max(600) }).strict().nullable(),
  exceptions: z.array(z.string().trim().min(1).max(200)).max(8) }).strict()
const policySchema = z.object({ expectedVersion: z.number().int().nonnegative(), enabled: z.boolean(), paused: z.boolean(),
  expectedAiConfigVersion: z.number().int().positive().optional(), expectedAiCheckRevision: z.number().int().positive().optional(),
  automaticSend: z.boolean(), routine: routineConsentSchema.optional(), management: managementConsentSchema.optional(), consent: z.literal(true), employeeIds: z.array(z.string().min(1).max(128)).min(1).max(20) }).strict()
const actionSchema = z.object({ requestId: uuid, expectedVersion: z.number().int().positive(),
  action: z.enum(['approve_reply', 'approve_task', 'dismiss', 'retry', 'reconcile', 'owner_decision']), approved: z.boolean().default(false),
  acknowledgePossibleCharge: z.boolean().default(false), note: z.string().trim().min(1).max(500),
  replyText: z.string().trim().min(1).max(1800).optional(), content: operationContent.optional() }).strict()
const derivedId = (id: string, suffix: string) => {
  const bytes = createHash('sha256').update(`team-workflow.v1:${id}:${suffix}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const h = bytes.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
const roundAttempts = (j: WorkflowJob) => j.attempt - (j.ownerDecision?.attemptFloor ?? 0)
const replyRequestId = (j: WorkflowJob) => derivedId(j.id, j.ownerDecision ? 'reply-owner-' + j.ownerDecision.requestId : 'reply')
/** Project every attempt, including legacy jobs whose earlier IDs are derivable.
 * Never turn an unresolved earlier reservation into "not started" when a later
 * attempt fails before transport. Reading projections performs no provider call. */
async function refreshBilling(db: any, storeId: string, j: WorkflowJob) {
  const before = JSON.stringify([j.billingStatus, j.billingAttempts])
  const attempts: WorkflowBillingAttempt[] = []
  for (let n = 1; n <= j.attempt; n++) {
    const requestId = n === j.attempt && j.aiRequestId ? j.aiRequestId : derivedId(j.id, 'model-' + n)
    const previous = j.billingAttempts?.find(a => a.requestId === requestId)
    const draft = await readTeam(db, storeId, `aiDraft.${j.operatorStaffId}.${requestId}`)
    const fallback = previous || { attempt: n, requestId, status: 'not_started', billingStatus: 'not_started' as const }
    attempts.push(draft ? { attempt: n, requestId, status: draft.status,
      billingStatus: draft.usage ? 'usage_recorded' : 'possible',
      ...(draft.usage ? { usage: { inputTokens: draft.usage.inputTokens, outputTokens: draft.usage.outputTokens, estimatedUsd: draft.usage.estimatedUsd } } : {}),
      ...(draft.error ? { error: draft.error } : {}) } : fallback)
  }
  j.billingAttempts = attempts
  j.billingStatus = attempts.some(a => a.billingStatus === 'possible') ? 'possible' :
    attempts.some(a => a.billingStatus === 'usage_recorded') ? 'usage_recorded' : 'not_started'
  return before !== JSON.stringify([j.billingStatus, j.billingAttempts])
}
async function admin(db: any, a: TeamActor, id: string) {
  if (a.role !== 'admin' || a.employeeApp || !await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin' }, select: { id: true } })) fail('TEAM_WORKFLOW_ADMIN_REQUIRED', 403)
  return accessTeamChannel(db, a, id)
}
async function rows(db: any, storeId: string, prefix: string, after = '', take?: number) {
  return (await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + prefix, ...(after ? { gt: TEAM_PREFIX + prefix + after } : {}) } },
    orderBy: { key: 'asc' }, ...(take ? { take } : {}) })).map((r: any) => JSON.parse(r.value))
}
async function save(db: any, storeId: string, j: WorkflowJob, now: number) {
  j.version++; j.updatedAt = new Date(now).toISOString()
  await writeTeam(db, storeId, workflowJobKey(j.channelId, j.sourceSeq), j)
  await workflowEvent(db, storeId, j.channelId, { jobId: j.id, sourceSeq: j.sourceSeq, version: j.version, status: j.status }, ports)
  return j
}
async function visibleJob(db: any, a: TeamActor, id: string, sourceSeq: number, floor: number): Promise<WorkflowJob> {
  const j = await readTeam<WorkflowJob>(db, a.storeId, workflowJobKey(id, seq.parse(sourceSeq)))
  if (!j || j.sourceSeq < floor || j.operatorUserId !== a.id || j.operatorStaffId !== a.staffId) fail('TEAM_WORKFLOW_JOB_NOT_FOUND', 404)
  return j
}
function operator(storeId: string, j: WorkflowJob): TeamActor {
  return { id: j.operatorUserId, staffId: j.operatorStaffId, storeId, role: 'admin', employeeApp: false }
}
async function scope(db: any, storeId: string, j: WorkflowJob, epoch?: number, now = Date.now(), ownerDecision = false) {
  const a = operator(storeId, j), { c, fromSeq } = await admin(db, a, j.channelId)
  const p = await readTeam<WorkflowPolicy>(db, storeId, `workflow.policy.${j.channelId}`)
  if (p?.automaticSend) {
    // The store stop also revokes earlier explicit routine/management policies.
    // This read may run under ai-budget; the final send acquires defaults first.
    const defaults = await readTeam(db, storeId, 'workflow.defaults')
    if (defaults && !defaults.enabled || p.origin === 'store_default' && (!defaults?.enabled || defaults.version !== p.defaultsVersion || await readTeam(db,storeId,`workflow.exception.${j.channelId}`))) fail('TEAM_WORKFLOW_PAUSED')
  }
  if (!p?.enabled || p.paused || epoch !== undefined && p.epoch !== epoch) fail('TEAM_WORKFLOW_PAUSED')
  if (p.hash !== j.policyHash || p.operatorUserId !== a.id || p.operatorStaffId !== a.staffId || hash(c.members) !== p.audienceHash ||
    c.archived || !(p.employeeIds.includes(j.sourceAuthorId) || p.management && j.sourceAuthorId === p.operatorStaffId) ||
    j.sourceSeq < fromSeq || c.members.some(m => m.fromSeq > j.sourceSeq)) fail('TEAM_WORKFLOW_SCOPE_CHANGED')
  const person = await db.staff.findFirst({ where: { id: j.sourceAuthorId, storeId, status: 'active' }, select: { user: { select: { role: true } } } })
  if (!person?.user || person.user.role === 'admin' && !p.automaticSend || j.sourceAuthorId === p.operatorStaffId && !p.management) fail('TEAM_WORKFLOW_EMPLOYEE_UNAVAILABLE')
  const config = await readTeam(db, storeId, 'ai.settings')
  if (!config?.enabled || !config.secret || config.version !== p.aiConfigVersion) fail('TEAM_AI_CONFIG_CHANGED')
  const message = await readTeam(db, storeId, `message.${j.channelId}.${pad(j.sourceSeq)}`)
  if (!message || message.id !== j.id || message.authorId !== j.sourceAuthorId || message.ai || !message.text ||
    hash({ text: message.text, files: message.files }) !== j.sourceHash) fail('TEAM_WORKFLOW_SOURCE_CHANGED')
  if (p.automaticSend) {
    const consent = p.management || p.routine
    if (p.management) {
      await assertManagementAudience(db, a, c, { ...p, management: p.management })
      // An explicit owner decision binds the latest channel context below; it is not an old automatic response being silently rebased.
      if (!ownerDecision) assertManagementFresh(c, j.ownerDecision?.contextLastSeq ?? j.sourceSeq, j.ownerDecision?.at ?? j.createdAt, now)
    } else {
      assertRoutineFresh(c, j.sourceSeq, j.createdAt, now)
      await assertRoutineAudience(db, a, c, p)
      await routineContext(db, a, c, p, j.sourceSeq)
    }
    const connection = await readAiConnection(db, storeId, config)
    if (config.region !== 'cn' || connection?.status !== 'ready' || connection.checkRevision !== consent?.aiCheckRevision) fail('TEAM_ROUTINE_CN_CONNECTION_REQUIRED')
  }
  return { a, p, c, message }
}
// Existing message/plan services open transactions. Here their whole operation joins
// the already-held channel transaction, so approval and its effects commit together.
function atomicServices(tx: any) {
  // Do not inherit Prisma's client proxy: assigning $transaction on its
  // prototype can replace the shared client's method with a closed transaction.
  const db: any = { config: tx.config, staff: tx.staff, user: tx.user, financeAuditLog: tx.financeAuditLog, store: tx.store, inventory: tx.inventory, purchaseOrderItem: tx.purchaseOrderItem, schedule: tx.schedule, shift: tx.shift, shiftSession: tx.shiftSession, hygieneTask: tx.hygieneTask, hygieneTemplate: tx.hygieneTemplate }
  db.$transaction = async (fn: (inner: any) => Promise<any>) => fn(db)
  return { messages: teamCommunication(db), operations: teamOperations(db) }
}
function parseResult(d: any, sourceSeq: number) {
  if (!d || d.status !== 'ready') fail('TEAM_AI_DRAFT_NOT_READY')
  if (d.kind === 'management') {
    const result = managementResultSchema.parse(JSON.parse(d.text))
    // The job binds the authoritative source; model citation typography is data.
    result.summaryZh = '#' + sourceSeq + ' ' + result.summaryZh
    return { replyText: result.replyText, summaryZh: result.summaryZh, suggestedTask: null, exceptions: [], management: result } as WorkflowJob['result']
  }
  if (d.kind === 'routine') {
    const { replyCode } = routineReplySchema.parse(JSON.parse(d.text))
    return { replyText: ROUTINE_REPLIES[replyCode], routineCode: replyCode, summaryZh: '#' + sourceSeq + ' 员工报告例行状态，未经主管核实。', suggestedTask: null, exceptions: [] } as WorkflowJob['result']
  }
  const result = resultSchema.parse(JSON.parse(d.text))
  if (!result.summaryZh.includes('#' + sourceSeq)) fail('TEAM_WORKFLOW_SOURCE_CITATION_REQUIRED')
  return result as WorkflowJob['result']
}

/** Default inert: only an explicitly launched, single-store worker calls runBatch. */
export function teamWorkflow(db: any = prisma, ai = teamAi(db), clock = () => Date.now()) {
  return {
    async policy(a: TeamActor, id: string) {
      await admin(db, a, id)
      return await readTeam(db, a.storeId, `workflow.policy.${id}`) || { channelId: id, version: 0, enabled: false, paused: true, automaticSend: false }
    },
    async savePolicy(a: TeamActor, id: string, input: unknown) {
      const v = policySchema.parse(input)
      if (v.automaticSend ? Number(!!v.routine) + Number(!!v.management) !== 1 || !!v.routine && v.employeeIds.length !== 1 : !!v.routine || !!v.management) fail('TEAM_ROUTINE_CONSENT_REQUIRED', 400)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { c } = await admin(tx, a, id), old = await readTeam<WorkflowPolicy>(tx, a.storeId, `workflow.policy.${id}`)
        if ((old?.version || 0) !== v.expectedVersion) fail('TEAM_VERSION_CONFLICT')
        const employeeIds = [...new Set(v.employeeIds)].sort()
        if (v.enabled && !v.paused && employeeIds.some(s => !c.members.some(m => m.staffId === s))) fail('TEAM_MEMBER_UNAVAILABLE', 403)
        const people = await tx.staff.findMany({ where: { id: { in: employeeIds }, storeId: a.storeId, status: 'active' }, select: { id: true, user: { select: { role: true } } } })
        if (v.enabled && !v.paused && (people.length !== employeeIds.length || people.some((s: any) => !s.user || s.user.role === 'admin' && !v.automaticSend))) fail('TEAM_WORKFLOW_EMPLOYEE_REQUIRED', 403)
        // Same lock order as AI publication; connection/config cannot change
        // between consent verification and committing an active policy.
        if (v.enabled && !v.paused) await lockTeam(tx, a.storeId, 'ai-budget')
        const config = await readTeam(tx, a.storeId, 'ai.settings')
        if (v.enabled && !v.paused && (c.archived || !config?.enabled || !config.secret)) fail('TEAM_AI_NOT_CONFIGURED')
        if (v.enabled && !v.paused) {
          const connection = await readAiConnection(tx, a.storeId, config)
          if (v.expectedAiConfigVersion !== config.version || !v.expectedAiCheckRevision || connection?.status !== 'ready' ||
            connection.checkRevision !== v.expectedAiCheckRevision) fail('TEAM_WORKFLOW_CONNECTION_REQUIRED')
        }
        const management = v.automaticSend && v.management ? { ...v.management, sourceFloor: c.lastSeq + 1, aiCheckRevision: v.expectedAiCheckRevision || 0 } : undefined
        const routine = v.automaticSend && v.routine ? { ...v.routine!, sourceFloor: c.lastSeq + 1, aiCheckRevision: v.expectedAiCheckRevision || old?.routine?.aiCheckRevision || 0 } : undefined
        const definition = { ...(routine ? { automaticSend: true, routine } : {}), ...(management ? { automaticSend: true, management } : {}), employeeIds, operatorUserId: a.id, operatorStaffId: a.staffId, audienceHash: hash(c.members), aiConfigVersion: config?.version || 0 }
        const p: WorkflowPolicy = { ...definition, channelId: id, version: (old?.version || 0) + 1, epoch: (old?.epoch || 0) + 1,
          enabled: v.enabled, paused: v.paused, automaticSend: v.automaticSend, consent: true, hash: hash(definition) }
        if (p.automaticSend && p.enabled && !p.paused) {
          if (p.management) await assertManagementAudience(tx, a, c, { ...p, management: p.management })
          else await assertRoutineAudience(tx, a, c, p)
          if (config.region !== 'cn') fail('TEAM_ROUTINE_CN_CONNECTION_REQUIRED')
        }
        if (old?.origin === 'store_default') {
          p.origin = old.origin; p.defaultsVersion = old.defaultsVersion
          await writeTeam(tx,a.storeId,`workflow.exception.${id}`,{mode:v.paused?'paused':v.enabled&&!v.automaticSend?'manual':'disabled',byStaffId:a.staffId,at:new Date().toISOString()})
        }
        await writeTeam(tx, a.storeId, `workflow.policy.${id}`, p)
        await workflowEvent(tx, a.storeId, id, { policyVersion: p.version, enabled: p.enabled, paused: p.paused }, ports)
        await auditTeam(tx, a, id, 'update', { action: 'workflow_policy', version: p.version, enabled: p.enabled, paused: p.paused, employeeIds, automaticSend: p.automaticSend, ...(routine ? { routine } : {}), ...(management ? { management } : {}) })
        return p
      })
    },
    async jobs(a: TeamActor, id: string, after = 0, requestId?: string) {
      const { fromSeq } = await admin(db, a, id)
      z.number().int().nonnegative().max(999999999999).parse(after)
      const page: WorkflowJob[] = await rows(db, a.storeId, `workflow.job.${id}.`, pad(Math.max(after, fromSeq - 1)), 101)
      const visible = page.slice(0, 100).filter(j => j.operatorUserId === a.id && j.operatorStaffId === a.staffId)
      await Promise.all(visible.map(j => refreshBilling(db, a.storeId, j)))
      const currentPolicy = await readTeam(db, a.storeId, `workflow.policy.${id}`)
      const receipt = requestId ? await readTeam(db, a.storeId, `workflow.request.${a.staffId}.${uuid.parse(requestId)}`) : null
      const original = receipt?.receipt as WorkflowJob | undefined
      const requestReceipt = original && original.channelId === id && original.sourceSeq >= fromSeq && original.operatorUserId === a.id && original.operatorStaffId === a.staffId ? { requestId, sourceSeq: original.sourceSeq } : undefined
      return { ...(requestReceipt ? {requestReceipt} : {}), jobs: visible, management: !!currentPolicy?.management, takeover: currentPolicy?.takeover || null, worker: await readTeam(db, a.storeId, 'workflow.worker'), cursor: page.slice(0, 100).at(-1)?.sourceSeq || Math.max(after, fromSeq - 1), hasMore: page.length > 100, automaticSend: !!(await readTeam(db, a.storeId, `workflow.policy.${id}`))?.automaticSend }
    },
    async events(a: TeamActor, id: string, after = 0) {
      const { fromSeq } = await admin(db, a, id)
      z.number().int().nonnegative().max(999999999999).parse(after)
      const page = await rows(db, a.storeId, `workflow.event.${id}.`, pad(after), 101)
      return { events: page.slice(0, 100).filter(e => !e.detail.sourceSeq || e.detail.sourceSeq >= fromSeq),
        cursor: page.slice(0, 100).at(-1)?.cursor || after, hasMore: page.length > 100, delivery: 'authenticated_cursor_pull', automaticSend: !!(await readTeam(db, a.storeId, `workflow.policy.${id}`))?.automaticSend }
    },
    async action(a: TeamActor, id: string, sourceSeq: number, input: unknown) {
      const v = actionSchema.parse(input)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { fromSeq } = await admin(tx, a, id), j = await visibleJob(tx, a, id, sourceSeq, fromSeq)
        await refreshBilling(tx, a.storeId, j)
        const key = `workflow.request.${a.staffId}.${v.requestId}`, requestHash = hash({ id, sourceSeq, ...v })
        const old = await readTeam(tx, a.storeId, key)
        if (old) { if (old.hash !== requestHash) fail('TEAM_REQUEST_CONFLICT'); return old.receipt || j }
        if (v.expectedVersion !== j.version) fail('TEAM_VERSION_CONFLICT')
        if (v.action === 'owner_decision') {
          if (managementPrivateText(v.note)) fail('TEAM_MANAGEMENT_PRIVATE_REVIEW_REQUIRED', 400)
          const expiredDecision = j.status === 'blocked' && j.error === 'TEAM_MANAGEMENT_SOURCE_EXPIRED' && !!j.ownerDecision
          if (!(j.status === 'awaiting_owner' || expiredDecision) || !j.management || v.replyText || v.content) fail('TEAM_MANAGEMENT_OWNER_DECISION_REQUIRED', 400)
          const priorDraft = j.aiRequestId ? await readTeam(tx, a.storeId, `aiDraft.${j.operatorStaffId}.${j.aiRequestId}`) : null
          // A new business decision is not permission to repeat an unresolved transport.
          if (j.billingStatus === 'possible' || j.billingAttempts?.some(a => ['pending', 'uncertain'].includes(a.status)) || priorDraft && ['pending', 'uncertain'].includes(priorDraft.status)) fail('TEAM_WORKFLOW_RECOVERY_REVIEW_REQUIRED')
          const { p, c } = await scope(tx, a.storeId, j, undefined, clock(), true)
          if (!p.management || p.management.ownerStaffId !== a.staffId) fail('TEAM_MANAGEMENT_OWNER_REQUIRED', 403)
          if (j.ownerDecision) j.ownerDecisionHistory = [...(j.ownerDecisionHistory || []), j.ownerDecision]
          j.ownerDecision = { attemptFloor: j.attempt, text: v.note, byStaffId: a.staffId, at: new Date(clock()).toISOString(), requestId: v.requestId, contextLastSeq: c.lastSeq }
          j.management.waitingMessageId = j.replyMessageId
          delete j.replyMessageId; delete j.error; delete j.leaseToken; delete j.leaseUntil
          j.status = 'queued'; j.nextAttemptAt = 0; j.publicationRetries = 0
        } else if (v.action === 'dismiss') {
          if (j.status === 'processing') fail('TEAM_WORKFLOW_PROCESSING')
          j.status = 'dismissed'
        } else if (v.action === 'reconcile') {
          if (!v.approved || !['uncertain', 'blocked'].includes(j.status)) fail('TEAM_WORKFLOW_RECONCILE_REQUIRED', 400)
          const { p } = await scope(tx, a.storeId, j)
          const stored = await readTeam(tx, a.storeId, `aiDraft.${a.staffId}.${j.aiRequestId}`)
          j.result = parseResult(stored, j.sourceSeq)
          j.status = 'awaiting_approval'; j.claimEpoch = p.epoch
          delete j.error; delete j.leaseToken; delete j.leaseUntil
        } else if (v.action === 'retry') {
          if (!v.acknowledgePossibleCharge || !v.approved) fail('TEAM_WORKFLOW_RETRY_CONFIRM_REQUIRED', 400)
          if (!['uncertain', 'blocked', 'retry_wait'].includes(j.status) || roundAttempts(j) >= 3) fail('TEAM_WORKFLOW_RETRY_LIMIT')
          await scope(tx, a.storeId, j)
          j.status = 'queued'; j.nextAttemptAt = 0; delete j.error
        } else {
          if (!v.approved || j.status !== 'awaiting_approval' || !j.result) fail('TEAM_WORKFLOW_APPROVAL_REQUIRED', 400)
          await scope(tx, a.storeId, j, j.claimEpoch)
          const services = atomicServices(tx)
          if (v.action === 'approve_reply') {
            if (j.replyMessageId || v.content) fail('TEAM_WORKFLOW_ALREADY_APPROVED')
            const draftId = derivedId(j.id, 'reply')
            const original = await readTeam(tx, a.storeId, `aiDraft.${a.staffId}.${j.aiRequestId}`)
            if (!original || original.status !== 'ready') fail('TEAM_AI_DRAFT_NOT_READY')
            const text = v.replyText || j.result.replyText
            await writeTeam(tx, a.storeId, `aiDraft.${a.staffId}.${draftId}`, { ...original, id: draftId, kind: 'draft', text, workflowJobId: j.id })
            const message = await services.messages.send(a, id, { requestId: draftId, text, files: [] }, draftId)
            j.replyMessageId = message.id
          } else {
            if (j.planId || !v.content || v.replyText || !j.result.suggestedTask || j.result.exceptions.length) fail('TEAM_WORKFLOW_TASK_REVIEW_REQUIRED', 400)
            if (v.content.items.length !== 1 || v.content.items[0].ownerId !== j.sourceAuthorId || v.content.reviewerId !== a.staffId) fail('TEAM_WORKFLOW_TASK_SCOPE_REQUIRED', 400)
            const plan = await services.operations.import(a, id, { requestId: derivedId(j.id, 'plan-import'), expectedVersion: 0, content: v.content })
            const published = await services.operations.action(a, id, plan.id, { requestId: derivedId(j.id, 'plan-publish'), expectedVersion: plan.version, action: 'publish', approved: true, note: v.note })
            j.planId = published.id
          }
          if (j.replyMessageId && (!j.result.suggestedTask || j.planId)) j.status = 'reviewed'
        }
        await refreshBilling(tx, a.storeId, j)
        await save(tx, a.storeId, j, clock())
        await writeTeam(tx, a.storeId, key, { hash: requestHash, jobId: j.id, ...(v.action === 'owner_decision' ? { receipt: j } : {}) })
        await auditTeam(tx, a, id, 'update', { action: 'workflow_' + v.action, jobId: j.id, note: v.note, requestId: v.requestId, approved: v.approved })
        return j
      })
    },
    async process(storeId: string, channelId: string, sourceSeq: number) {
      const prepared = await db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'channel.' + uuid.parse(channelId))
        const j = await readTeam<WorkflowJob>(tx, storeId, workflowJobKey(channelId, sourceSeq)), now = clock()
        if (!j || !['queued', 'retry_wait', 'processing'].includes(j.status)) return null
        // Pause/disable blocks execution, not accounting reconciliation. Jobs and
        // exports also derive this projection when no consumer remains alive.
        const billingChanged = await refreshBilling(tx, storeId, j)
        if (j.nextAttemptAt && j.nextAttemptAt > now || j.status === 'processing' && j.leaseUntil! > now) {
          if (billingChanged) await save(tx, storeId, j, now)
          return null
        }
        const p = await readTeam<WorkflowPolicy>(tx, storeId, `workflow.policy.${channelId}`)
        if (!p?.enabled || p.paused) {
          if (j.status === 'processing') {
            // The live-lease guard above already returned. A stopped owner must
            // not leave a human-taken-over job permanently impossible to close.
            j.status = 'blocked'; j.error = 'TEAM_WORKFLOW_PAUSED'
            delete j.leaseToken; delete j.leaseUntil
            await save(tx, storeId, j, now)
          } else if (billingChanged) await save(tx, storeId, j, now)
          return null
        }
        if (p.automaticSend) {
          // Channel lock serializes claims across all worker processes. No second in-flight call in the same conversation.
          const active: WorkflowJob[] = (await tx.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + `workflow.job.${channelId}.` }, value: { contains: '"status":"processing"' } } })).map((r: any) => JSON.parse(r.value))
          if (active.some(other => other.id !== j.id && other.status === 'processing' && other.leaseUntil > now)) return null
        }
        const stored = j.aiRequestId ? await readTeam(tx, storeId, `aiDraft.${j.operatorStaffId}.${j.aiRequestId}`) : null
        try { await scope(tx, storeId, j, undefined, now) } catch (e) {
          if (!(e instanceof TeamError)) throw e
          j.status = 'blocked'; j.error = e.message; await save(tx, storeId, j, now); return null
        }
        if (j.status === 'processing') {
          const d = stored
          if (d && d.status !== 'ready') {
            j.status = d.status === 'blocked' ? 'blocked' : 'uncertain'; j.error = 'TEAM_WORKFLOW_RECOVERY_REVIEW_REQUIRED'
            await save(tx, storeId, j, now); return null
          }
          // No stored draft proves transport never started; ready drafts are reused.
        } else {
          if (roundAttempts(j) >= 3) { j.status = 'blocked'; j.error = 'TEAM_WORKFLOW_RETRY_LIMIT'; await save(tx, storeId, j, now); return null }
          j.attempt++; j.aiRequestId = derivedId(j.id, 'model-' + j.attempt)
        }
        if (j.timing) j.timing.claimedAt = new Date(now).toISOString()
        j.status = 'processing'; j.claimEpoch = p.epoch; j.leaseToken = randomUUID(); j.leaseUntil = now + 120000
        await refreshBilling(tx, storeId, j)
        await save(tx, storeId, j, now)
        return j
      }) as WorkflowJob | null
      if (!prepared) return null
      let result: WorkflowJob['result'], error: string | undefined
      try {
        const policy = await readTeam<WorkflowPolicy>(db, storeId, `workflow.policy.${channelId}`)
        const d = await ai.generate(operator(storeId, prepared), channelId,
          { requestId: prepared.aiRequestId, kind: policy?.management ? 'management' : policy?.automaticSend ? 'routine' : 'workflow', consent: true, sourceSeq: [prepared.sourceSeq] }, async (tx: any) => {
            const current = await readTeam<WorkflowJob>(tx, storeId, workflowJobKey(channelId, sourceSeq))
            if (current?.status !== 'processing' || current.leaseToken !== prepared.leaseToken || current.leaseUntil! <= clock()) fail('TEAM_WORKFLOW_LEASE_CHANGED')
            await scope(tx, storeId, prepared, prepared.claimEpoch, clock())
          })
        result = parseResult(d, prepared.sourceSeq)
      } catch (e) { error = e instanceof TeamError ? e.message : 'TEAM_WORKFLOW_RESULT_REVIEW_REQUIRED' }
      try { return await db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'channel.' + channelId)
        const j = await readTeam<WorkflowJob>(tx, storeId, workflowJobKey(channelId, sourceSeq))
        if (!j) return j
        const billingChanged = await refreshBilling(tx, storeId, j)
        if (j.leaseToken !== prepared.leaseToken || j.status !== 'processing') {
          if (billingChanged) await save(tx, storeId, j, clock())
          return j
        }
        try {
          const current = await scope(tx, storeId, j, prepared.claimEpoch, clock())
          if (current.p.automaticSend && j.leaseUntil! <= clock()) fail('TEAM_WORKFLOW_LEASE_CHANGED')
        } catch (e) {
          if (!(e instanceof TeamError)) throw e
          error = e.message; result = undefined
        }
        const d = await readTeam(tx, storeId, `aiDraft.${j.operatorStaffId}.${j.aiRequestId}`)
        if (j.timing && d) {
          if (d.modelStartedAt) j.timing.modelStartedAt = d.modelStartedAt
          if (d.modelCompletedAt) j.timing.modelCompletedAt = d.modelCompletedAt
        }
        if (result && !error) {
          j.result = result; delete j.error
          const { a, p } = await scope(tx, storeId, j, prepared.claimEpoch, clock())
          if (p.management) {
            if (!result.management || !d?.managementFactsFingerprint) fail('TEAM_MANAGEMENT_RESULT_REQUIRED')
            const parsed = result.management, context = await readTeam(tx, storeId, `channel.${channelId}`)
            if (parsed.kind === 'no_reply') {
              const currentFacts=await managementContext(tx,a,context,{...p,management:p.management},j.sourceSeq,j.ownerDecision?.at,j.ownerDecision?.contextLastSeq)
              if(currentFacts.factsFingerprint!==d.managementFactsFingerprint) fail('TEAM_MANAGEMENT_FACTS_CHANGED')
              j.management = {...parsed,summary:parsed.summaryZh,knownFacts:d.managementKnownFacts||[],originalText:(await readTeam(tx,storeId,`message.${channelId}.${pad(j.sourceSeq)}`)).text,factsFingerprint:d.managementFactsFingerprint,contextLastSeq:context.lastSeq}
              j.status='reviewed';delete j.leaseToken;delete j.leaseUntil
              await auditTeam(tx,a,channelId,'update',{action:'workflow_management_observed',jobId:j.id})
              return save(tx,storeId,j,clock())
            }
            if (parsed.kind === 'pending_action' && parsed.action && (!parsed.action.dueAt || !parsed.action.evidenceRequired)) {
              result.replyText += '\nUntuk tindak lanjut ini, kapan batas waktunya (tanggal dan jam), dan bukti apa yang akan diberikan?'
              parsed.replyText=result.replyText
            }
            assertManagementReplyBoundary(result.replyText)
            const draftId = replyRequestId(j), original = await readTeam(tx, storeId, `aiDraft.${a.staffId}.${j.aiRequestId}`)
            const authorization: ManagementAuthorization = { jobId: j.id, sourceSeq: j.sourceSeq, policyHash: p.hash, policyVersion: p.version, epoch: p.epoch,
              textHash: managementHash(result.replyText), factsFingerprint: d.managementFactsFingerprint, contextLastSeq: context.lastSeq,
              ...(j.ownerDecision ? { decisionRequestId: j.ownerDecision.requestId } : {}) }
            await writeTeam(tx, storeId, `aiDraft.${a.staffId}.${draftId}`, { ...original, id: draftId, kind: 'draft', text: result.replyText, workflowJobId: j.id, managementAuthorization: authorization })
            const message = await atomicServices(tx).messages.send(a, channelId, { requestId: draftId, text: result.replyText, files: [] }, draftId, undefined, authorization)
            j.management = { ...parsed, knownFacts:d.managementKnownFacts||[], summary: parsed.summaryZh, originalText: (await readTeam(tx, storeId, `message.${channelId}.${pad(j.sourceSeq)}`)).text,
              factsFingerprint: d.managementFactsFingerprint, contextLastSeq: message.seq, ...(j.management?.waitingMessageId ? {waitingMessageId:j.management.waitingMessageId} : {}) }
            if (parsed.action) {
              const {details,...proposal}=parsed.action
              const currentChannel=await readTeam(tx,storeId,`channel.${channelId}`)
              const action=await ensureAction(tx,a,currentChannel,{...j,management:{kind:parsed.kind!}},{...proposal,nextStep:details,evidenceRequired:proposal.evidenceRequired||null,dueAt:proposal.dueAt||null,deadlineSourceSeq:proposal.deadlineSourceSeq||null},clock())
              j.managementActionId=action.id;j.managementActionVersion=action.version
            }
            j.replyMessageId = message.id; j.automaticReply = true; j.sentAt = new Date(clock()).toISOString()
            j.sendLatencyMs = Math.max(0, clock() - Date.parse(j.createdAt)); if (j.timing) j.timing.replyWrittenAt = j.sentAt
            j.status = parsed.kind === 'owner_question' ? 'awaiting_owner' : parsed.kind === 'pending_action' ? 'pending_action' : 'reviewed'
            await auditTeam(tx, a, channelId, 'update', { action: 'workflow_management_sent', jobId: j.id, kind: parsed.kind, messageId: message.id, factsFingerprint: d.managementFactsFingerprint })
          } else if (p.automaticSend) {
            if (!result.routineCode || result.exceptions.length || result.suggestedTask) fail('TEAM_ROUTINE_REPLY_INVALID')
            const draftId = derivedId(j.id, 'reply'), original = await readTeam(tx, storeId, `aiDraft.${a.staffId}.${j.aiRequestId}`)
            const authorization: RoutineAuthorization = { jobId: j.id, sourceSeq: j.sourceSeq, policyHash: p.hash, policyVersion: p.version, epoch: p.epoch, replyCode: result.routineCode }
            await writeTeam(tx, storeId, `aiDraft.${a.staffId}.${draftId}`, { ...original, id: draftId, kind: 'draft', text: result.replyText, workflowJobId: j.id, routineAuthorization: authorization })
            const message = await atomicServices(tx).messages.send(a, channelId, { requestId: draftId, text: result.replyText, files: [] }, draftId, authorization)
            if (j.timing) j.timing.replyWrittenAt = new Date(clock()).toISOString()
            j.replyMessageId = message.id; j.automaticReply = true; j.sentAt = new Date(clock()).toISOString()
            j.sendLatencyMs = Math.max(0, clock() - Date.parse(j.createdAt)); j.status = 'reviewed'
            await auditTeam(tx, a, channelId, 'update', { action: 'workflow_routine_sent', authorization, messageId: message.id, sendLatencyMs: j.sendLatencyMs })
          } else j.status = 'awaiting_approval'
        }
        else {
          j.error = error || 'TEAM_WORKFLOW_RESULT_REVIEW_REQUIRED'
          // Only failures with no provider reservation/draft can be retried safely.
          const safe = !d && ['TEAM_AI_RATE_LIMIT', 'TEAM_AI_BUDGET_LIMIT', 'TEAM_AI_NOT_CONFIGURED'].includes(j.error)
          j.status = d && ['pending', 'uncertain'].includes(d.status) ? 'uncertain' : safe && roundAttempts(j) < 3 ? 'retry_wait' : 'blocked'
          if (j.status === 'retry_wait') j.nextAttemptAt = clock() + 30000 * 2 ** (roundAttempts(j) - 1)
        }
        delete j.leaseToken; delete j.leaseUntil
        return save(tx, storeId, j, clock())
      }) } catch (publicationError) {
        // A transaction error can have an uncertain commit outcome. Re-read
        // under the same channel lock before releasing only our own claim.
        // Never repeat transport: only a complete saved ready result qualifies.
        const reconciled = await db.$transaction(async (tx: any) => {
          await lockTeam(tx, storeId, 'channel.' + channelId)
          const j = await readTeam<WorkflowJob>(tx, storeId, workflowJobKey(channelId, sourceSeq))
          if (!j) return null
          const receipt = await readTeam(tx, storeId, `request.${j.operatorStaffId}.${replyRequestId(j)}`)
          if (['reviewed', 'awaiting_owner', 'pending_action'].includes(j.status) && j.replyMessageId && receipt?.message?.id === j.replyMessageId) return j
          if (j.status !== 'processing' || j.leaseToken !== prepared.leaseToken || j.replyMessageId) return null
          const d = await readTeam(tx, storeId, `aiDraft.${j.operatorStaffId}.${j.aiRequestId}`)
          if (d?.status !== 'ready') return null
          await refreshBilling(tx, storeId, j)
          if (receipt) {
            j.status = 'uncertain'; j.error = 'TEAM_WORKFLOW_PUBLICATION_OUTCOME_UNCERTAIN'
            delete j.leaseToken; delete j.leaseUntil
          } else if (publicationError instanceof TeamError) {
            // A rejected scope/fact proof is not a transient database rollback.
            // Reusing its old ready result can never make changed facts current.
            j.status = 'blocked'; j.error = publicationError.message
            delete j.leaseToken; delete j.leaseUntil
          } else {
            j.publicationRetries = (j.publicationRetries || 0) + 1
            j.error = 'TEAM_WORKFLOW_PUBLICATION_RETRY'
            if (j.publicationRetries >= 3) {
              j.status = 'blocked'; j.error = 'TEAM_WORKFLOW_PUBLICATION_REVIEW_REQUIRED'
              delete j.leaseToken; delete j.leaseUntil
            } else j.leaseUntil = clock() // confirmed no final receipt; allow the next batch to reuse ready result
          }
          await save(tx, storeId, j, clock())
          return null
        }).catch(() => null) // No fresh database proof means no recovery or automatic retry.
        if (reconciled) return reconciled
        throw publicationError
      }
    },
    async runBatch(storeId: string, limit = 10) {
      z.string().min(1).max(128).parse(storeId); z.number().int().min(1).max(20).parse(limit)
      const candidates: WorkflowJob[] = (await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' },
        OR: ['queued', 'retry_wait', 'processing'].map(status => ({ value: { contains: `"status":"${status}"` } })) },
        orderBy: [{ updatedAt: 'asc' }, { key: 'asc' }] })).map((r: any) => JSON.parse(r.value))
      const output = []
      const groups = [...new Set(candidates.map(j => j.channelId))].map(channelId => ({
        jobs: candidates.filter(j => j.channelId === channelId).sort((a, b) => a.sourceSeq - b.sourceSeq)
      }))
      // Only actual results consume the batch budget. Future retries, paused
      // policies and live leases must not starve a newly arrived conversation.
      while (groups.length && output.length < limit) {
        const wave = groups.splice(0, Math.min(6, limit - output.length))
        const results = await Promise.all(wave.map(async group => {
          while (group.jobs.length) {
            const j = group.jobs.shift()!
            const processed = await this.process(storeId, j.channelId, j.sourceSeq)
            if (processed) return { id: processed.id, status: processed.status }
          }
          return null
        }))
        output.push(...results.filter(Boolean))
        groups.push(...wave.filter(group => group.jobs.length))
      }
      const due=await db.$transaction((tx:any)=>followupDue(tx,storeId,clock,'team-management-worker',async(inner:any,r:any)=>{const p=await readTeam(inner,storeId,`workflow.policy.${r.channelId}`),d=await readTeam(inner,storeId,'workflow.defaults');return (!d||d.enabled)&&!!p?.enabled&&!p.paused&&!await readTeam(inner,storeId,`workflow.exception.${r.channelId}`)&&(p.origin!=='store_default'||!!d?.enabled&&d.version===p.defaultsVersion)}))
      for (const candidate of due) await db.$transaction(async(tx:any)=>{
        await lockTeam(tx,storeId,'channel.'+candidate.channelId)
        await lockTeam(tx,storeId,'workflow-defaults')
        const policy=await readTeam(tx,storeId,`workflow.policy.${candidate.channelId}`),defaults=await readTeam(tx,storeId,'workflow.defaults')
        if (defaults && !defaults.enabled || !policy?.enabled || policy.paused || policy.origin==='store_default'&&(!defaults?.enabled||defaults.version!==policy.defaultsVersion)||await readTeam(tx,storeId,`workflow.exception.${candidate.channelId}`)) return
        const action=await beginFollowup(tx,storeId,candidate.id,candidate.followup!.leaseToken!,clock()), id=action.followup!.requestId
        const key=`reminder.${action.assignedStaffId}.${id}`
        if (!await readWork(storeId,key,tx)) await writeWork(storeId,key,{id,userId:action.assignedUserId,staffId:action.assignedStaffId,event:`management-followup:${action.id}:${action.version}`,title:'工作行动待更新 / Pembaruan tindakan kerja diperlukan',url:'/team?channel='+encodeURIComponent(action.channelId)+'&work=1',createdAt:new Date(clock()).toISOString(),read:false,status:'pending',managementAction:{channelId:action.channelId,actionId:action.id,version:action.version}},tx)
        const settled=await settleFollowup(tx,storeId,action.id,action.followup!.leaseToken!,{state:'in_app',reminderId:id},clock())
        const reminder=await readWork(storeId,key,tx)
        await writeWork(storeId,key,{...reminder,managementAction:{...reminder.managementAction,version:settled.version}},tx)
        await writeWork(storeId,'notification.chat.pending',{eventId:id},tx)
      })
      const currentRows = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' },
        OR: ['queued', 'retry_wait', 'processing', 'awaiting_approval', 'awaiting_owner', 'pending_action', 'blocked', 'uncertain'].map(status => ({ value: { contains: `\"status\":\"${status}\"` } })) } })
      const terminalRows = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' },
        OR: ['reviewed', 'dismissed'].map(status => ({ value: { contains: `\"status\":\"${status}\"` } })) }, orderBy: { updatedAt: 'desc' }, take: 100 })
      const observed: WorkflowJob[] = [...currentRows, ...terminalRows].map((r: any) => JSON.parse(r.value))
      const recentSends = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' }, value: { contains: '"automaticReply":true' } }, orderBy: { updatedAt: 'desc' }, take: 20 })
      const states: Record<string, number> = {}, now = clock()
      for (const j of observed) states[j.status] = (states[j.status] || 0) + 1
      const ages = observed.filter(j => ['queued', 'retry_wait', 'processing'].includes(j.status)).map(j => Math.max(0, now - Date.parse(j.createdAt)))
      const recent: WorkflowJob[] = recentSends.map((r: any) => JSON.parse(r.value)).filter(j => typeof j.sendLatencyMs === 'number')
      const heartbeat = { running: true, checkedAt: new Date(now).toISOString(), states, stateScope: 'all_unresolved_and_latest_100_terminal', terminalWindow: 100, latencyWindow: 20,
        totalJobs: await db.config.count({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' } } }), oldestPendingAgeMs: ages.length ? Math.max(...ages) : 0,
        recentAutomaticSendLatencyMs: recent.map(j => j.sendLatencyMs), processed: output.length, error: null }
      await writeTeam(db, storeId, 'workflow.worker', heartbeat)
      // Durable, deduplicated alert transitions reuse the channel event feed. No new employee messages or notifications.
      const previousAlerts = await db.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'workflow.worker.alert.' } }, select: { key: true } })
      for (const channelId of [...new Set<string>([...observed.map(j => j.channelId), ...previousAlerts.map((r: any) => r.key.slice((TEAM_PREFIX + 'workflow.worker.alert.').length))])]) await db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'channel.' + channelId)
        const p = await readTeam(tx, storeId, `workflow.policy.${channelId}`)
        const enabled = p?.enabled && !p.paused
        const delayed = enabled && observed.some(j => j.channelId === channelId && ['queued', 'retry_wait', 'processing'].includes(j.status) && now - Date.parse(j.createdAt) > 60000)
        const reviewRequired = observed.some(j => j.channelId === channelId && ['uncertain', 'blocked'].includes(j.status))
        const state = { delayed: !!delayed, reviewRequired }, key = `workflow.worker.alert.${channelId}`
        const previous = await readTeam(tx, storeId, key)
        if (JSON.stringify(previous) !== JSON.stringify(state)) {
          await writeTeam(tx, storeId, key, state)
          await workflowEvent(tx, storeId, channelId, { workerAlert: state }, ports)
        }
      })
      return output
    },
    async export(a: TeamActor, id: string, after = 0) {
      z.number().int().nonnegative().max(999999999999).parse(after)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(id))
        const { fromSeq } = await admin(tx, a, id)
        const page: WorkflowJob[] = await rows(tx, a.storeId, `workflow.job.${id}.`, pad(Math.max(after, fromSeq - 1)), 51)
        const jobs = page.slice(0, 50).filter(j => j.operatorUserId === a.id && j.operatorStaffId === a.staffId)
        await Promise.all(jobs.map(j => refreshBilling(tx, a.storeId, j)))
        const actions = (await listActions(tx, a, id)).map(r => ({id:r.id, status:r.status, assignedStaffId:r.assignedStaffId, title:r.title, nextStep:r.nextStep, dueAt:r.dueAt, evidenceRequired:r.evidenceRequired, evidence:r.evidence, version:r.version, followup:r.followup ? {state:r.followup.state, deliveryState:r.followup.deliveryState} : null}))
        const details = []
        for (const j of jobs) details.push({ sourceSeq: j.sourceSeq, status: j.status, error: j.error, attempt: j.attempt,
          knownSystemSnapshots:j.management?.knownFacts||[], managementActionId:j.managementActionId||null, aiDraftUnverified: j.result?.summaryZh || null, exceptions: j.result?.exceptions || [], replyApproved: !!j.replyMessageId && !j.automaticReply, automaticReply: !!j.automaticReply, sentAt: j.sentAt, sendLatencyMs: j.sendLatencyMs,
          billingStatus: j.billingStatus, billingAttempts: j.billingAttempts, task: j.planId ? await atomicServices(tx).operations.export(a, id, j.planId) : null })
        const labels: Record<string, string> = { awaiting_owner: '等待负责人决定', pending_action: '待处理行动（未执行业务操作）', queued: '排队中', processing: '处理中', retry_wait: '等待安全重试', awaiting_approval: '待人工处理', reviewed: '草稿已人工处理（任务验收另计）', uncertain: '结果不明，可能已计费', blocked: '已阻断，待复核', dismissed: '已人工关闭' }
        const billingLabels = { not_started: '尚未调用', possible: '存在未决费用风险，待核对', usage_recorded: '已有用量记录（以供应商账单为准）' }
        return { channelId: id, generatedAt: new Date(clock()).toISOString(), automaticSend: !!(await readTeam(tx, a.storeId, `workflow.policy.${id}`))?.automaticSend,
          cursor: page.slice(0, 50).at(-1)?.sourceSeq || Math.max(after, fromSeq - 1), hasMore: page.length > 50,
          title: '员工沟通处理纪要', source: 'manual_admin_export', details, actions,
          operatingBoundaries: { inventoryIsPhysicalCount:false, completionRequiresEvidenceAndHumanVerification:true, deviceDeliveryVerified:false, autonomousDotSupervisionVerified:false, profitCalculated:false },
          textZh: (actions.length ? '行动跟进（记录状态，不代表已执行或已送达）：\n' + actions.map(r=>`${r.title}；负责人 ${r.assignedStaffId}；状态 ${r.status}；期限 ${r.dueAt||'待明确'}；下一步 ${r.nextStep}；证据 ${r.evidenceRequired||'待明确'}；已提交证据条目 ${r.evidence.length}`).join('\n')+'\n\n' : '') + details.map(d => `消息 #${d.sourceSeq}：${labels[d.status]}；费用：${billingLabels[d.billingStatus]}；未决尝试：${d.billingAttempts.filter(a => a.billingStatus === 'possible').map(a => a.attempt).join('、') || '无'}；AI 草稿（员工陈述，未核实）：${d.aiDraftUnverified || '尚无'}；回复${d.automaticReply ? '已依持续授权自动发送' : d.replyApproved ? '已人工批准发送' : '未发送'}；异常：${d.error || d.exceptions.join('；') || '无'}${d.task ? '\n' + d.task.summaryZh : ''}`).join('\n\n') }
      })
    }
  }
}
