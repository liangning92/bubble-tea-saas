import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { TeamActor, TeamChannel, TeamError, accessTeamChannel, auditTeam, lockTeam, readTeam, writeTeam, TEAM_PREFIX } from './TeamCommunicationService'
import { readWork } from './EmployeeWorkspaceStore'
import { calendarDate, calendarParts, calendarStart, nextCalendarDate, validTimezone } from '../utils/storeDateSettings'

const uuid = z.string().uuid(), instant = z.string().datetime({ offset: true })
const seq = z.number().int().positive().max(999999999999)
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const pad = (n: number) => String(n).padStart(12, '0')
const fail = (code: string): never => { throw new TeamError(409, code) }
const key = (id: string) => `management.action.${uuid.parse(id)}`
const idFor = (seed: string) => { const h = createHash('sha256').update(seed).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` }
const proposalSchema = z.object({ actionId: uuid.optional(), expectedVersion: z.number().int().positive().optional(),
  assignedStaffId: z.string().min(1).max(128).optional(), existingTaskId: uuid.optional(),
  title: z.string().trim().min(1).max(120), nextStep: z.string().trim().min(1).max(600),
  evidenceRequired: z.string().trim().min(1).max(600).nullable(), dueAt: instant.nullable(), deadlineSourceSeq: seq.nullable() }).strict()
export type ManagementActionProposal = z.infer<typeof proposalSchema>
export interface ManagementAction {
  id: string; storeId: string; channelId: string; sourceJobId: string; sourceSeq: number; fromSeq: number
  sourceJobs: { id: string; seq: number }[]; audienceHash: string; channelOwnerId: string; operatorUserId: string; operatorStaffId: string
  assignedStaffId: string; assignedUserId: string; title: string; nextStep: string; evidenceRequired: string | null; dueAt: string | null
  status: 'waiting_details' | 'open' | 'waiting_owner' | 'awaiting_evidence' | 'verified' | 'cancelled'
  version: number; createdAt: string; updatedAt: string; evidence: { sourceSeq: number; attachmentIds: string[]; attachmentReview: 'not_performed' }[]
  events: { action: string; by: string; at: string; note: string; sourceSeq: number[] }[]
  followupHistory?: NonNullable<ManagementAction['followup']>[]
  followup?: { requestId: string; dueAt: string; state: 'pending_followup' | 'claimed' | 'settled';
    deliveryState: 'unknown' | 'in_app' | 'accepted'; leaseToken?: string; leaseUntil?: number; workerId?: string;
    dispatchStartedAt?: string; reminderId?: string; recordedAt?: string }
}
interface SourceJob { management?: { kind: string }; ownerDecision?: { requestId: string; byStaffId: string; text: string; at: string }; id: string; channelId: string; sourceSeq: number; sourceAuthorId: string; operatorUserId: string; operatorStaffId: string }
async function participant(db: any, storeId: string, staffId: string) {
  const person = await db.staff.findFirst({ where: { id: staffId, storeId, status: 'active' }, select: { id: true, name: true, userId: true, user: { select: { id: true, storeId: true } } } })
  if (!person?.userId || person.user?.id !== person.userId || person.user.storeId !== storeId) fail('TEAM_MANAGEMENT_ACTION_MEMBER_UNAVAILABLE')
  return person
}
async function live(db: any, a: TeamActor, id: string, record?: ManagementAction, readOnly = false) {
  // Audit access is intentionally unavailable: an action remains bound to its actual conversation audience.
  const { c, fromSeq } = await accessTeamChannel(db, a, id)
  if (c.archived || !['direct','group','public','meeting'].includes(c.kind)) fail('TEAM_MANAGEMENT_ACTION_CHANNEL_UNAVAILABLE')
  if (record && (record.storeId !== a.storeId || record.channelId !== c.id || record.audienceHash !== hash(c.members) || record.channelOwnerId !== c.ownerId ||
    record.fromSeq < fromSeq || c.members.some(m => m.fromSeq > record.fromSeq) || !c.members.some(m => m.staffId === record.assignedStaffId) ||
    !c.members.some(m => m.staffId === record.operatorStaffId))) fail('TEAM_MANAGEMENT_ACTION_SCOPE_CHANGED')
  let ownerUnavailable = false
  if (record) {
    const employee = await participant(db, a.storeId, record.assignedStaffId)
    if (employee.userId !== record.assignedUserId) fail('TEAM_MANAGEMENT_ACTION_MEMBER_UNAVAILABLE')
    ownerUnavailable = !await db.user.findFirst({ where: { id: record.operatorUserId, storeId: a.storeId, role: 'admin', staff: { id: record.operatorStaffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })
    if (ownerUnavailable && !readOnly) fail('TEAM_MANAGEMENT_ACTION_OWNER_UNAVAILABLE')
  }
  return { c, fromSeq, ownerUnavailable }
}
async function source(db: any, storeId: string, channelId: string, n: number, floor: number) {
  if (n < floor) fail('TEAM_MANAGEMENT_ACTION_SOURCE_RANGE')
  const m = await readTeam(db, storeId, `message.${channelId}.${pad(seq.parse(n))}`)
  if (!m || m.ai) fail('TEAM_MANAGEMENT_ACTION_HUMAN_SOURCE_REQUIRED')
  return m
}
function affirmedClause(clause: string) {
  return !/[?？吗]|不|没|未|別|别|\b(?:jangan|tidak|belum|bukan)\b|\bnot\b|\bno\b|cannot|can't/i.test(clause) &&
    /会|将|承诺|完成|提交|核实|核对|请|要求|akan|selesai|kirim|will|finish|submit|harap|tolong/i.test(clause)
}
async function citedDeadline(db: any, storeId: string, text: string, createdAt: string, proposed: string | null) {
  // Evidence qualification only; unrecognised wording remains eligible for normal AI clarification.
  const clauses = text.match(/[^，,。！？!?；;\n]+[，,。！？!?；;\n]?/g) || []
  if (proposed) {
    const exact = clauses.find(part => part.includes(proposed))
    if (exact && affirmedClause(exact)) return proposed
  }
  const matches = [...text.matchAll(/(今天|明天)\s*([01]\d|2[0-3]):([0-5]\d)(?!\d)|\b(hari\s+ini|besok)\s+(?:(?:pukul|jam)\s+)?([01]\d|2[0-3]):([0-5]\d)(?!\d)/gi)]
  if (matches.length !== 1) return null
  const match = matches[0], clause = clauses.find(part => part.includes(match[0]))
  if (!clause || !affirmedClause(clause)) return null
  const store = await db.store.findUnique({ where: { id: storeId }, select: { timezone: true } })
  if (!validTimezone(store?.timezone) || !Number.isFinite(Date.parse(createdAt))) return null
  const timezone = store.timezone, tomorrow = match[1] === '明天' || match[4]?.toLowerCase() === 'besok'
  const day = nextCalendarDate(calendarDate(new Date(createdAt), timezone), tomorrow ? 1 : 0)
  const hour = Number(match[2] || match[5]), minute = Number(match[3] || match[6])
  const start = calendarStart(day, timezone).getTime(), end = calendarStart(nextCalendarDate(day), timezone).getTime(), found: number[] = []
  // A repeated/missing DST wall time is ambiguous; do not manufacture a promise.
  for (let at = start; at < end; at += 60000) { const part = calendarParts(new Date(at), timezone); if (part.hour === hour && part.minute === minute) found.push(at) }
  if (found.length !== 1 || proposed && Date.parse(proposed) !== found[0]) return null
  return new Date(found[0]).toISOString()
}
const evidenceClaim = /^(?:好的?|好啦|收到|已收到|明白(?:了)?|了解(?:了)?|(?:任务|工作)?(?:我)?(?:已经|已|全都|全部)?完成(?:了|啦)?|做完(?:了)?|ok(?:ay)?|yes|done|finished|siap|baik|oke|sudah\s+selesai(?:\s+semua)?(?:\s+(?:pak|bu|kak|bos))?|beres)$/iu
function substantiveEvidence(text: unknown) {
  if (typeof text !== 'string') return false
  const parts = text.trim().toLowerCase().split(/[，,。.!！?？;；\n]+/).map(s => s.trim()).filter(Boolean)
  return parts.length > 0 && !parts.every(part => evidenceClaim.test(part))
}
function directoryAliases(name: string) {
  const full = name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  return [...new Set([full, full.split(' ')[0]])].filter(alias => alias.length >= 2)
}
async function explicitAssignment(db: any, a: TeamActor, c: TeamChannel, assignedStaffId: string, text: string) {
  const people: { id: string; name: string }[] = await db.staff.findMany({ where: { storeId: a.storeId, status: 'active', id: { in: c.members.map(m => m.staffId) } }, select: { id: true, name: true } })
  const target = people.find(person => person.id === assignedStaffId)
  if (!target) return false
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[ \t]+/g, ' ')
  const clauses = normalized.match(/[^，,。.!?！？；;\n]+[，,。.!?！？；;\n]?/g) || []
  for (const alias of directoryAliases(target.name)) {
    if (people.filter(person => directoryAliases(person.name).includes(alias)).length !== 1) continue
    const escaped = Array.from(alias).map(char => '^$.*+?()[]{}|'.includes(char) || char.charCodeAt(0) === 92 ? String.fromCharCode(92) + char : char).join('')
    const named = new RegExp(`(^|[^a-z0-9_])${escaped}(?=$|[^a-z0-9_])`, 'i')
    for (let i = 0; i < clauses.length; i++) {
      const part = clauses[i]
      if (!named.test(part)) continue
      // A name followed by a comma can address the next instruction, without borrowing another sentence.
      const addressed = part.replace(/[，,\s]+$/g, '').trim() === alias
      const directive = addressed && clauses[i + 1] ? part + clauses[i + 1] : part
      if (/[?？吗]|是否|能否|不|没|未|別|别|\b(?:jangan|tidak|belum|bukan)\b|apakah|bisakah|bolehkah|\b(?:not|no|cannot|can|could|should|would)\b|can't|(?:他|她|员工|老板)说|katanya|bilang|\b(?:said|says|quoted)\b/i.test(directive)) continue
      if (/请|让|安排|指派|负责|交给|harap|tolong|tugaskan|bertugas|tanggung\s+jawab|\b(?:assign|responsible|please|handle)\b/i.test(directive)) return true
    }
  }
  return false
}
async function save(db: any, a: TeamActor, record: ManagementAction, action: string, note: string, refs: number[], now: number) {
  const at = new Date(now).toISOString(); record.updatedAt = at; record.version++
  record.events.push({ action, by: a.staffId, at, note, sourceSeq: refs })
  await writeTeam(db, a.storeId, key(record.id), record)
  await auditTeam(db, a, record.channelId, 'update', { action: 'management_action_' + action, actionId: record.id, version: record.version, status: record.status, sourceSeq: refs })
  return record
}
/** Joins the caller's real transaction. It never sends messages, invokes a model or mutates stock/purchases. */
export async function ensureAction(tx: any, a: TeamActor, snapshot: TeamChannel, job: SourceJob, input: unknown, now = Date.now(), options: { previewOnly?: boolean } = {}) {
  const previewOnly = options.previewOnly === true
  const proposal = proposalSchema.parse(input)
  if (!!proposal.actionId !== !!proposal.expectedVersion) fail('TEAM_MANAGEMENT_ACTION_VERSION_REQUIRED')
  if (job.channelId !== snapshot.id || job.operatorUserId !== a.id || job.operatorStaffId !== a.staffId || a.employeeApp || a.role !== 'admin') fail('TEAM_MANAGEMENT_ACTION_OPERATOR_REQUIRED')
  if (!previewOnly) await lockTeam(tx, a.storeId, 'channel.' + snapshot.id)
  const { c, fromSeq } = await live(tx, a, snapshot.id)
  if (hash(c.members) !== hash(snapshot.members) || c.lastSeq !== snapshot.lastSeq) fail('TEAM_MANAGEMENT_ACTION_SCOPE_CHANGED')
  if (!await tx.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })) fail('TEAM_MANAGEMENT_ACTION_OPERATOR_REQUIRED')
  const m = await source(tx, a.storeId, c.id, job.sourceSeq, Math.max(fromSeq, ...c.members.map(x => x.fromSeq)))
  if (m.id !== job.id || m.authorId !== job.sourceAuthorId || !c.members.some(x => x.staffId === job.sourceAuthorId)) fail('TEAM_MANAGEMENT_ACTION_SOURCE_CHANGED')
  let ownerDecision: SourceJob['ownerDecision'] | undefined
  if (job.ownerDecision) {
    const stored = await readTeam(tx, a.storeId, `workflow.job.${c.id}.${pad(job.sourceSeq)}`)
    if (stored?.ownerDecision?.requestId === job.ownerDecision.requestId && stored.ownerDecision.byStaffId === a.staffId && uuid.safeParse(job.ownerDecision.requestId).success) ownerDecision = stored.ownerDecision
  }
  const originKey = 'management.action.origin.' + uuid.parse(job.id) + (ownerDecision ? '.' + ownerDecision.requestId : ''), digest = hash(proposal)
  if (!previewOnly) await lockTeam(tx, a.storeId, originKey)
  const receipt = await readTeam(tx, a.storeId, originKey)
  if (receipt) {
    if (receipt.hash !== digest) fail('TEAM_REQUEST_CONFLICT')
    const old = await readTeam<ManagementAction>(tx, a.storeId, key(receipt.actionId)); if (!old) fail('TEAM_MANAGEMENT_ACTION_NOT_FOUND')
    await live(tx, a, c.id, old); return old
  }
  const id = proposal.actionId || idFor(`team.management.action.v1:${job.id}`)
  if (!previewOnly) await lockTeam(tx, a.storeId, key(id))
  const old = await readTeam<ManagementAction>(tx, a.storeId, key(id))
  if (proposal.actionId && !old || !proposal.actionId && old) fail('TEAM_MANAGEMENT_ACTION_ORIGIN_CONFLICT')
  if (old) {
    await live(tx, a, c.id, old)
    if (old.version !== proposal.expectedVersion) fail('TEAM_VERSION_CONFLICT')
    if (['verified','cancelled'].includes(old.status)) fail('TEAM_MANAGEMENT_ACTION_CLOSED')
  }
  const assignedStaffId = old?.assignedStaffId || proposal.assignedStaffId || job.sourceAuthorId
  if (!c.members.some(x => x.staffId === assignedStaffId) || old && proposal.assignedStaffId && proposal.assignedStaffId !== old.assignedStaffId) fail('TEAM_MANAGEMENT_ACTION_ASSIGNMENT_REQUIRED')
  if (old && old.assignedStaffId !== job.sourceAuthorId && !ownerDecision && m.authorId !== a.staffId) {
    if (previewOnly) return old
    if (!old.sourceJobs.some(j => j.id === job.id)) old.sourceJobs.push({ id: job.id, seq: job.sourceSeq })
    await save(tx, a, old, 'contribution', 'Participant added information; assignment, promise and acceptance criteria are unchanged', [job.sourceSeq], now)
    await writeTeam(tx, a.storeId, originKey, { actionId: old.id, hash: digest }); return old
  }
  const person = await participant(tx, a.storeId, assignedStaffId)
  let task: any = null
  const audienceFloor = Math.max(fromSeq, ...c.members.map(x => x.fromSeq))
  if (proposal.existingTaskId) {
    task = await readTeam(tx, a.storeId, `task.${c.id}.${proposal.existingTaskId}`)
    if (!task || task.agentTask || task.ownerId !== assignedStaffId || task.fromSeq < audienceFloor || task.planId && !task.audienceIds?.includes(assignedStaffId) || ['cancelled','completed'].includes(task.status)) fail('TEAM_MANAGEMENT_ACTION_TASK_REQUIRED')
  }
  if (assignedStaffId !== job.sourceAuthorId && !task && !(old && (ownerDecision || m.authorId === a.staffId))) {
    const nativeDirective = m.authorId === a.staffId && await explicitAssignment(tx, a, c, assignedStaffId, m.text || '')
    const savedDecision = !!ownerDecision && await explicitAssignment(tx, a, c, assignedStaffId, ownerDecision.text)
    if (!nativeDirective && !savedDecision) fail('TEAM_MANAGEMENT_ACTION_ASSIGNMENT_REQUIRED')
  }
  let dueAt: string | null = task && instant.safeParse(task.deadlineAt).success ? task.deadlineAt : null
  if (proposal.dueAt && task && (task.deadlineAt === proposal.dueAt || task.dueDate === proposal.dueAt)) dueAt = proposal.dueAt
  if (proposal.deadlineSourceSeq) {
    if (proposal.deadlineSourceSeq > c.lastSeq) fail('TEAM_MANAGEMENT_ACTION_SOURCE_RANGE')
    const deadline = await source(tx, a.storeId, c.id, proposal.deadlineSourceSeq, audienceFloor)
    if ([assignedStaffId,a.staffId].includes(deadline.authorId) && typeof deadline.text === 'string') dueAt = await citedDeadline(tx, a.storeId, deadline.text, deadline.createdAt, proposal.dueAt) || dueAt
  }
  if (ownerDecision) dueAt = await citedDeadline(tx, a.storeId, ownerDecision.text, ownerDecision.at, proposal.dueAt) || dueAt
  // Missing/relative deadlines remain questions. A model-supplied timestamp alone is not an employee promise.
  const evidenceRequired = proposal.evidenceRequired || old?.evidenceRequired || task?.evidenceRequired || null
  dueAt ||= old?.dueAt || null
  const at = new Date(now).toISOString()
  const record: ManagementAction = old || { id, storeId: a.storeId, channelId: c.id, sourceJobId: job.id, sourceSeq: job.sourceSeq, fromSeq: job.sourceSeq,
    sourceJobs: [], audienceHash: hash(c.members), channelOwnerId: c.ownerId, operatorUserId: a.id, operatorStaffId: a.staffId, assignedStaffId, assignedUserId: person.userId,
    title: proposal.title, nextStep: proposal.nextStep, evidenceRequired, dueAt, status: 'waiting_details', version: 0, createdAt: at, updatedAt: at, evidence: [], events: [] }
  record.title = proposal.title; record.nextStep = proposal.nextStep; record.evidenceRequired = evidenceRequired; record.dueAt = dueAt
  if (!record.sourceJobs.some(j => j.id === job.id)) record.sourceJobs.push({ id: job.id, seq: job.sourceSeq })
  if (job.management?.kind === 'owner_question') record.status = 'waiting_owner'
  else if (record.status !== 'awaiting_evidence') record.status = dueAt && evidenceRequired ? 'open' : 'waiting_details'
  if (record.followup && record.followup.dueAt !== dueAt) { record.followupHistory = [...record.followupHistory || [], record.followup]; delete record.followup }
  if (previewOnly) return record
  await save(tx, a, record, old ? 'details_confirmed' : 'created', '', [job.sourceSeq], now)
  await writeTeam(tx, a.storeId, originKey, { actionId: id, hash: digest })
  return record
}
export async function listActions(db: any, a: TeamActor, channelId: string) {
  const { c, fromSeq } = await live(db, a, channelId)
  const rows = await db.config.findMany({ where: { storeId: a.storeId, key: { startsWith: TEAM_PREFIX + 'management.action.' } }, orderBy: { key: 'asc' } })
  const found: ManagementAction[] = []
  for (const row of rows) {
    const r: ManagementAction = JSON.parse(row.value)
    if (!r.id || r.channelId !== c.id || r.fromSeq < fromSeq) continue
    try {
      const { ownerUnavailable } = await live(db, a, channelId, r, true)
      if (ownerUnavailable && !['verified', 'cancelled'].includes(r.status)) {
        const canCancelBlocked = !a.employeeApp && !!await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })
        found.push({ ...r, blockedReason: 'responsible_owner_unavailable', canCancelBlocked } as ManagementAction)
      } else found.push(r)
    } catch (e) { if (!(e instanceof TeamError)) throw e }
  }
  return found
}
export async function advanceAction(tx: any, a: TeamActor, channelId: string, actionId: string, expectedVersion: number, input: unknown, now = Date.now()) {
  const v = z.object({ requestId: uuid, action: z.enum(['submit_evidence','verify','cancel']), note: z.string().trim().min(1).max(1000),
    sourceSeq: z.array(seq).max(20).default([]), criteriaConfirmed: z.boolean().default(false) }).strict().parse(input)
  await lockTeam(tx, a.storeId, 'channel.' + uuid.parse(channelId)); await lockTeam(tx, a.storeId, key(actionId))
  const r = await readTeam<ManagementAction>(tx, a.storeId, key(actionId)); if (!r) fail('TEAM_MANAGEMENT_ACTION_NOT_FOUND')
  const { fromSeq, ownerUnavailable } = await live(tx, a, channelId, r, v.action === 'cancel')
  const rk = `management.action.request.${a.staffId}.${v.requestId}`, receipt = await readTeam(tx, a.storeId, rk), digest = hash({ actionId, expectedVersion, ...v })
  if (receipt) { if (receipt.hash !== digest) fail('TEAM_REQUEST_CONFLICT'); return r }
  if (r.version !== expectedVersion) fail('TEAM_VERSION_CONFLICT')
  if (['verified','cancelled'].includes(r.status)) fail('TEAM_MANAGEMENT_ACTION_CLOSED')
  if (v.action === 'submit_evidence') {
    if (a.staffId !== r.assignedStaffId || !v.sourceSeq.length) fail('TEAM_MANAGEMENT_ACTION_EVIDENCE_REQUIRED')
    for (const n of [...new Set(v.sourceSeq)]) {
      const m = await source(tx, a.storeId, channelId, n, Math.max(fromSeq,r.fromSeq))
      if (m.authorId !== a.staffId || (!m.files?.length && !substantiveEvidence(m.text))) fail('TEAM_MANAGEMENT_ACTION_EVIDENCE_REQUIRED')
      if (!r.evidence.some(x => x.sourceSeq === n)) r.evidence.push({ sourceSeq: n, attachmentIds: m.files || [], attachmentReview: 'not_performed' })
    }
    r.status = 'awaiting_evidence'
    if (r.followup) { r.followup.deliveryState = 'accepted'; r.followup.state = 'settled'; delete r.followup.leaseUntil } // Explicit employee evidence submission proves awareness only, never task completion.
  } else {
    const currentAdmin = !a.employeeApp && !!await tx.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })
    const closesUnavailable = v.action === 'cancel' && ownerUnavailable && currentAdmin
    if (!currentAdmin || !closesUnavailable && (a.id !== r.operatorUserId || a.staffId !== r.operatorStaffId)) fail('TEAM_MANAGEMENT_ACTION_OWNER_REQUIRED')
    if (v.action === 'verify' && (!v.criteriaConfirmed || !r.evidence.length || !r.evidenceRequired || r.status !== 'awaiting_evidence')) fail('TEAM_MANAGEMENT_ACTION_HUMAN_VERIFICATION_REQUIRED')
    r.status = v.action === 'verify' ? 'verified' : 'cancelled'
  }
  await save(tx, a, r, v.action === 'verify' ? 'verified' : v.action === 'cancel' ? 'cancelled' : 'evidence_received', v.note, v.sourceSeq, now)
  if (r.status === 'verified' || r.status === 'cancelled') {
    // The channel lock and caller transaction bind action completion to its source jobs.
    // Keep independent owner questions and unrelated action bindings unresolved.
    const { workflowEvent, workflowJobKey } = await import('./TeamWorkflowQueue.js')
    for (const origin of r.sourceJobs) {
      const jobKey = workflowJobKey(channelId, origin.seq), job = await readTeam(tx, a.storeId, jobKey)
      if (!job || job.id !== origin.id || job.channelId !== channelId || job.sourceSeq !== origin.seq || job.managementActionId !== r.id ||
        job.operatorUserId !== r.operatorUserId || job.operatorStaffId !== r.operatorStaffId || job.status !== 'pending_action') continue
      job.status = 'reviewed'; job.version++; job.updatedAt = new Date(now).toISOString(); job.managementActionVersion = r.version
      await writeTeam(tx, a.storeId, jobKey, job)
      await workflowEvent(tx, a.storeId, channelId, { jobId: job.id, sourceSeq: job.sourceSeq, version: job.version, status: job.status,
        managementActionId: r.id, managementActionStatus: r.status }, { read: readTeam, write: writeTeam })
    }
  }
  await writeTeam(tx, a.storeId, rk, { hash: digest, actionId })
  return r
}
function owner(r: ManagementAction): TeamActor { return { id: r.operatorUserId, storeId: r.storeId, staffId: r.operatorStaffId, role: 'admin', employeeApp: false } }
export type ActionEligibility = (tx: any, action: ManagementAction) => Promise<boolean>
async function eligibleAction(tx: any, r: ManagementAction, eligible?: ActionEligibility) {
  const defaults = await readTeam(tx, r.storeId, 'workflow.defaults')
  if (defaults && !defaults.enabled) return false
  const policy = await readTeam(tx, r.storeId, `workflow.policy.${r.channelId}`)
  if (policy && (!policy.enabled || policy.paused)) return false
  if (eligible) return eligible(tx, r)
  return !!policy?.management && !!policy.automaticSend && policy.operatorUserId === r.operatorUserId && policy.operatorStaffId === r.operatorStaffId
}
/** Claim candidates only; caller must recheck its current management policy before dispatch. */
export async function followupDue(tx: any, storeId: string, clock: () => number = Date.now, workerId = 'team-management-worker', eligible?: ActionEligibility) {
  const now = clock(), candidates: ManagementAction[] = []
  const rows = await tx.config.findMany({ where: { storeId, key: { startsWith: TEAM_PREFIX + 'management.action.' } }, orderBy: { key: 'asc' } })
  for (const snapshot of rows.map((row: any) => JSON.parse(row.value) as ManagementAction).filter((r: ManagementAction) => !!r.id).sort((a: ManagementAction,b: ManagementAction) => a.channelId.localeCompare(b.channelId) || a.id.localeCompare(b.id))) {
    if (!snapshot.id || !snapshot.dueAt || snapshot.status !== 'open' || Date.parse(snapshot.dueAt) > now) continue
    if (!await eligibleAction(tx, snapshot, eligible)) continue
    await lockTeam(tx, storeId, 'channel.' + snapshot.channelId); await lockTeam(tx, storeId, key(snapshot.id))
    const r = await readTeam<ManagementAction>(tx, storeId, key(snapshot.id)); if (!r || !r.dueAt || r.status !== 'open' || Date.parse(r.dueAt) > now) continue
    try { await live(tx, owner(r), r.channelId, r) } catch (e) { if (!(e instanceof TeamError)) throw e; continue }
    if (!await eligibleAction(tx, r, eligible)) continue
    const previous = r.followup
    if (previous && (previous.state === 'settled' || previous.dispatchStartedAt || (previous.leaseUntil || 0) > now)) continue
    r.followup = { requestId: previous?.requestId || createHash('sha256').update(`team.management.followup.v1:${r.id}:${r.dueAt}`).digest('hex'), dueAt: r.dueAt, state: 'claimed', deliveryState: 'unknown', leaseToken: randomUUID(), leaseUntil: now + 30000, workerId }
    await save(tx, owner(r), r, 'followup_claimed', 'pending_followup: no delivery or employee violation is inferred', [], now)
    candidates.push(r)
    if (candidates.length >= 10) break
  }
  return candidates
}
async function lockedAction(tx: any, storeId: string, actionId: string) {
  const first = await readTeam<ManagementAction>(tx, storeId, key(actionId)); if (!first) fail('TEAM_MANAGEMENT_ACTION_NOT_FOUND')
  await lockTeam(tx, storeId, 'channel.' + uuid.parse(first.channelId)); await lockTeam(tx, storeId, key(actionId))
  const current = await readTeam<ManagementAction>(tx, storeId, key(actionId))
  if (!current || current.channelId !== first.channelId) fail('TEAM_MANAGEMENT_ACTION_SCOPE_CHANGED')
  return current
}
export async function beginFollowup(tx: any, storeId: string, actionId: string, leaseToken: string, now = Date.now()) {
  const r = await lockedAction(tx, storeId, actionId)
  if (r.status !== 'open' || !r?.followup || r.followup.leaseToken !== leaseToken || (r.followup.leaseUntil || 0) <= now || r.followup.dispatchStartedAt) fail('TEAM_MANAGEMENT_FOLLOWUP_LEASE_REQUIRED')
  await live(tx, owner(r), r.channelId, r)
  r.followup.dispatchStartedAt = new Date(now).toISOString()
  return save(tx, owner(r), r, 'followup_dispatch_started', 'pending_followup', [], now)
}
export async function settleFollowup(tx: any, storeId: string, actionId: string, leaseToken: string, outcome: { state: 'unknown' } | { state: 'in_app'; reminderId: string }, now = Date.now()) {
  const r = await lockedAction(tx, storeId, actionId)
  if (!r?.followup || r.followup.leaseToken !== leaseToken || !r.followup.dispatchStartedAt) fail('TEAM_MANAGEMENT_FOLLOWUP_LEASE_REQUIRED')
  await live(tx, owner(r), r.channelId, r)
  if (r.followup.deliveryState === 'accepted' || r.followup.state === 'settled' && r.followup.deliveryState === 'in_app') return r
  if (outcome.state === 'in_app') {
    let proven = false
    if (outcome.reminderId === r.followup.requestId) {
      const reminder = await readWork(storeId, `reminder.${r.assignedStaffId}.${outcome.reminderId}`, tx)
      proven = !!reminder && reminder.id === r.followup.requestId && reminder.staffId === r.assignedStaffId && reminder.userId === r.assignedUserId
    }
    if (!proven) fail('TEAM_MANAGEMENT_FOLLOWUP_RECEIPT_REQUIRED')
    r.followup.deliveryState = 'in_app'; r.followup.state = 'settled'
    if (outcome.reminderId) r.followup.reminderId = outcome.reminderId
  } else { r.followup.deliveryState = 'unknown'; r.followup.state = 'pending_followup' }
  r.followup.recordedAt = new Date(now).toISOString(); delete r.followup.leaseUntil
  return save(tx, owner(r), r, 'followup_delivery_recorded', outcome.state === 'in_app' ? 'Reminder saved only; delivery/read/completion are not proven' : 'Unknown outcome: no automatic resend or employee violation', [], now)
}
