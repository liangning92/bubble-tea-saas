import { createHash } from 'crypto'
import { TeamActor, TeamTask, readTeam, writeTeam, lockTeam, auditTeam } from './TeamCommunicationService'
import { writeWork, readWork } from './EmployeeWorkspaceStore'
import { inspectionAdmin, inspectionCurrent, inspectionFail, inspectionHash } from './PackagingInspectionSnapshot'
import { TeamError } from './TeamCommunicationService'
import { releaseInspectionPlan } from './PackagingInspectionCapacity'

export const inspectionJobKey = (id: string) => 'workflow.inspection.job.' + id
export async function inspectionJob(db: any, storeId: string, id: string) {
  const job = await readTeam(db, storeId, inspectionJobKey(id))
  if (!job) inspectionFail('INSPECTION_NOT_FOUND', 404)
  return job
}
export async function inspectionEvent(db: any, storeId: string, job: any, state: string, now = new Date(), code?: string) {
  job.state = state; job.version++; job.updatedAt = now.toISOString()
  job.events = [...job.events, { state, at: job.updatedAt, ...(code ? { code } : {}) }].slice(-100)
  if (code) job.code = code
  await writeTeam(db, storeId, inspectionJobKey(job.id), job)
  if (state === 'queued' || state === 'processing') await writeTeam(db, storeId, 'inspection.pending.' + job.id, { id: job.id })
  else {
    await db.config.deleteMany({ where: { storeId, key: 'team.communication.inspection.pending.' + job.id } })
    await releaseInspectionPlan(db, storeId, job.policy.channelId, job.id)
  }
}
/** Keep immutable history out of the bounded active plan/task windows; old IDs remain readable/exportable. */
export async function archiveInspection(db: any, storeId: string, job: any, task?: TeamTask) {
  if (job.planId) {
    const key = `operationPlan.${job.policy.channelId}.${job.planId}`, plan = await readTeam(db, storeId, key)
    if (plan?.inspectionId === job.id) {
      await writeTeam(db, storeId, `inspection.planArchive.${job.policy.channelId}.${plan.id}`, { ...plan, inspectionArchived: true })
      await db.config.deleteMany({ where: { storeId, key: 'team.communication.' + key } })
    }
  }
  if (task) {
    await writeTeam(db, storeId, `inspection.taskArchive.${task.channelId}.${task.id}`, task)
    await db.config.deleteMany({ where: { storeId, key: `team.communication.task.${task.channelId}.${task.id}` } })
  }
}
/** Backup admins may cancel invalid work only. They never gain the designated reviewer's approval power. */
export async function inspectionCleanupActor(db: any, storeId: string, job: any, staffId: string) {
  const user = await db.user.findFirst({ where: { storeId, role: 'admin', staff: { id: staffId, storeId, status: 'active' } }, select: { id: true } })
  if (!user) inspectionFail('INSPECTION_ADMIN_REQUIRED', 403)
  const a = { id: user.id, storeId, staffId, role: 'admin' }
  if (a.id !== job.policy.operatorId || staffId !== job.policy.reviewerId) {
    let invalid = false
    try { await inspectionCurrent(db, storeId, job, new Date(), false) } catch (error) { if (!(error instanceof TeamError)) throw error; invalid = true }
    if (!invalid) inspectionFail('INSPECTION_REVIEWER_REQUIRED', 403)
  }
  return a
}
export async function inspectionPlanGuard(db: any, a: TeamActor, plan: any, action: string) {
  await db.store.update({ where: { id: a.storeId }, data: { updatedAt: new Date() } })
  const job = await inspectionJob(db, a.storeId, plan.inspectionId)
  await inspectionAdmin(db, a)
  if (a.staffId !== job.policy.reviewerId || a.id !== job.policy.operatorId || job.planId !== plan.id ||
      inspectionHash(plan.content) !== job.planHash) inspectionFail('INSPECTION_REVIEWER_REQUIRED', 403)
  if (action !== 'pause') {
    if (action === 'resume' && job.state === 'published') await inspectionCurrent(db, a.storeId, job, new Date(), false)
    else {
      if (action !== 'publish' || job.state !== 'awaiting_approval') inspectionFail('INSPECTION_TRANSITION')
      await inspectionCurrent(db, a.storeId, job, new Date())
      if (plan.content.items.some((i: any) => Date.parse(i.acceptByAt) <= Date.now() || Date.parse(i.deadlineAt) <= Date.now())) inspectionFail('INSPECTION_DRAFT_DEADLINE_EXPIRED')
    }
  }
  return job
}
export async function inspectionReminderState(db: any, storeId: string, plan: any, paused: boolean) {
  const job = await inspectionJob(db, storeId, plan.inspectionId), r = reminderKey(job)
  const saved = await readWork(storeId, r.key, db)
  // Resume restores the inbox entry; it never repeats an already delivered external push.
  if (saved) await writeWork(storeId, r.key, { ...saved, status: paused ? 'cancelled' : 'in_app' }, db)
}
const reminderKey = (job: any) => {
  const event = 'packaging-inspection:' + job.id
  const id = createHash('sha256').update(`${job.policy.assigneeId}:${event}`).digest('hex')
  return { event, id, key: `reminder.${job.policy.assigneeId}.${id}` }
}
/** Approval, task, provenance and reminder outbox are committed by the caller's one transaction. */
export async function inspectionPublished(db: any, a: TeamActor, plan: any) {
  const job = await inspectionJob(db, a.storeId, plan.inspectionId)
  if (plan.taskIds.length !== 1) inspectionFail('INSPECTION_SINGLE_TASK_REQUIRED')
  const task = await readTeam<TeamTask>(db, a.storeId, `task.${plan.channelId}.${plan.taskIds[0]}`)
  task.inspectionId = job.id
  await writeTeam(db, a.storeId, `task.${plan.channelId}.${task.id}`, task)
  job.taskId = task.id
  const r = reminderKey(job)
  if (!await readWork(a.storeId, r.key, db)) await writeWork(a.storeId, r.key, {
    id: r.id, staffId: job.policy.assigneeId, event: r.event, title: 'Pemeriksaan persediaan kemasan menunggu konfirmasi',
    url: '/team-communication', createdAt: new Date().toISOString(), expiresAt: task.deadlineAt, read: false, status: 'pending'
  }, db)
  await inspectionEvent(db, a.storeId, job, 'published')
  await auditTeam(db, a, plan.channelId, 'update', { action: 'inspection_approved', jobId: job.id,
    snapshotHash: job.snapshot.hash, planId: plan.id, taskId: task.id, reminderId: r.id })
}
export async function inspectionReminderRelevant(db: any, storeId: string, reminder: any, now = new Date()) {
  if (!reminder.event?.startsWith('packaging-inspection:')) return true
  try {
    const job = await inspectionJob(db, storeId, reminder.event.slice('packaging-inspection:'.length))
    await inspectionCurrent(db, storeId, job, now, false)
    const task = await readTeam<TeamTask>(db, storeId, `task.${job.policy.channelId}.${job.taskId}`)
    const plan = await readTeam(db, storeId, `operationPlan.${job.policy.channelId}.${job.planId}`)
    return job.state === 'published' && plan?.status === 'published' && task?.inspectionId === job.id &&
      task.ownerId === reminder.staffId && !['completed', 'cancelled'].includes(task.status) &&
      !!task.deadlineAt && Date.parse(task.deadlineAt) > now.getTime()
  } catch { return false }
}
export async function inspectionTaskGuard(db: any, a: TeamActor, task: TeamTask, action: string) {
  await db.store.update({ where: { id: a.storeId }, data: { updatedAt: new Date() } })
  const job = await inspectionJob(db, a.storeId, task.inspectionId!)
  if (job.taskId !== task.id || job.policy.channelId !== task.channelId) inspectionFail('INSPECTION_TASK_MISMATCH')
  if (['cancel', 'return', 'complete'].includes(action)) {
    await inspectionAdmin(db, a)
    if (a.id !== job.policy.operatorId || a.staffId !== job.policy.reviewerId) inspectionFail('INSPECTION_REVIEWER_REQUIRED', 403)
  }
  if (action !== 'cancel') await inspectionCurrent(db, a.storeId, job, new Date(), false)
  const count = job.countId ? await db.inventoryCount.findFirst({ where: { id: job.countId, storeId: a.storeId }, include: { items: true } }) : null
  if (action === 'submit' && (!count || count.status !== 'pending_review' || count.items.length !== job.policy.inventoryIds.length ||
      count.items.some((i: any) => i.countedQty === null || !i.countedAt || i.countedBy !== task.ownerId || !job.policy.inventoryIds.includes(i.inventoryId)))) {
    inspectionFail('INSPECTION_COUNT_SUBMISSION_REQUIRED')
  }
  // Stock adjustment remains a separate explicit count approval. Task completion never calls it.
  if (action === 'complete' && count?.status !== 'completed') inspectionFail('INSPECTION_COUNT_APPROVAL_REQUIRED')
  if (action === 'return' && count?.status === 'completed') inspectionFail('INSPECTION_COUNT_ALREADY_APPROVED')
  if (action === 'return' && count?.status === 'pending_review') await db.inventoryCount.update({ where: { id: count.id }, data: { status: 'in_progress' } })
  if (action === 'cancel' || action === 'complete') {
    if (action === 'cancel' && job.countId) await db.inventoryCount.updateMany({ where: { id: job.countId, storeId: a.storeId,
      status: { in: ['in_progress', 'pending_review'] } }, data: { status: 'cancelled' } })
    const r = reminderKey(job), reminder = await readWork(a.storeId, r.key, db)
    if (reminder) await writeWork(a.storeId, r.key, { ...reminder, status: 'cancelled' }, db)
    await inspectionEvent(db, a.storeId, job, action === 'complete' ? 'completed' : 'cancelled')
  }
}
/** Applied inside every generic count mutation too, so the old inventory endpoints cannot bypass ownership. */
export async function inspectionCountGuard(db: any, storeId: string, countId: string, staffId: string | undefined, action: string) {
  const link = await readTeam(db, storeId, 'inspection.count.' + countId)
  if (!link) return
  const job = await inspectionJob(db, storeId, link.jobId)
  await lockTeam(db, storeId, 'channel.' + job.policy.channelId)
  await db.store.update({ where: { id: storeId }, data: { updatedAt: new Date() } })
  const task = await readTeam<TeamTask>(db, storeId, `task.${job.policy.channelId}.${job.taskId}`)
  if (job.countId !== countId || !task || task.inspectionId !== job.id) inspectionFail('INSPECTION_COUNT_LINK_INVALID')
  if (action === 'complete' || action === 'cancel') {
    if (action === 'cancel') await inspectionCleanupActor(db, storeId, job, staffId!)
    else {
      if (staffId !== job.policy.reviewerId) inspectionFail('INSPECTION_REVIEWER_REQUIRED', 403)
      await inspectionAdmin(db, { id: job.policy.operatorId, staffId, storeId, role: 'admin' })
    }
  } else if (staffId !== task.ownerId) inspectionFail('INSPECTION_ASSIGNEE_REQUIRED', 403)
  if (action === 'cancel') return
  await inspectionCurrent(db, storeId, job, new Date(), false)
  const plan = await readTeam(db, storeId, `operationPlan.${task.channelId}.${task.planId}`)
  if (plan?.status !== 'published') inspectionFail('INSPECTION_PLAN_PAUSED')
  if (action === 'complete' ? task.status !== 'submitted' : !['accepted', 'changes_requested'].includes(task.status)) inspectionFail('INSPECTION_TASK_TRANSITION')
  if (action === 'complete') {
    const count = await db.inventoryCount.findUnique({ where: { id: countId }, include: { items: true } })
    if (count?.status !== 'pending_review' || count.items.length !== job.policy.inventoryIds.length || count.items.some((i: any) =>
      i.countedQty === null || !i.countedAt || i.countedBy !== task.ownerId || !job.policy.inventoryIds.includes(i.inventoryId))) inspectionFail('INSPECTION_COUNT_SUBMISSION_REQUIRED')
  }
}
export async function inspectionCountCancelled(db: any, storeId: string, countId: string, staffId: string) {
  const link = await readTeam(db, storeId, 'inspection.count.' + countId)
  if (!link) return
  const job = await inspectionJob(db, storeId, link.jobId), a = await inspectionCleanupActor(db, storeId, job, staffId)
  const task = await readTeam<TeamTask>(db, storeId, `task.${job.policy.channelId}.${job.taskId}`)
  if (task && !['completed', 'cancelled'].includes(task.status)) {
    task.status = 'cancelled'; task.version++; task.updatedAt = new Date().toISOString()
    task.events.push({ action: 'cancel', by: staffId, at: task.updatedAt, note: 'Linked inventory count explicitly cancelled by administrator', sourceSeq: [] })
    await writeTeam(db, storeId, `task.${task.channelId}.${task.id}`, task)
  }
  const r = reminderKey(job), reminder = await readWork(storeId, r.key, db)
  if (reminder) await writeWork(storeId, r.key, { ...reminder, status: 'cancelled' }, db)
  await inspectionEvent(db, storeId, job, 'cancelled')
  await archiveInspection(db, storeId, job, task || undefined)
  await auditTeam(db, a, job.id, 'update', { action: 'inspection_count_cancelled', countId, taskId: job.taskId,
    cleanupByBackupAdmin: a.id !== job.policy.operatorId })
}
