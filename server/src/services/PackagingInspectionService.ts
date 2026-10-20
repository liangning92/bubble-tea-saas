import { randomUUID } from 'crypto'
import { z } from 'zod'
import prisma from '../config/database'
import { inventoryBusinessCalendar } from '../utils/inventoryBusinessCalendar'
import { TeamActor, TeamError, readTeam, writeTeam, lockTeam, accessTeamChannel, auditTeam } from './TeamCommunicationService'
import { teamAi } from './TeamAiService'
import { teamOperations, OperationPlan } from './TeamOperationsService'
import { createInventoryCount } from './InventoryCountService'
import { InspectionPolicy, inspectionActor, inspectionAdmin, inspectionAssignee, inspectionScope,
  inspectionCurrent, inspectionAiReady, packagingSnapshot, inspectionFail, inspectionHash } from './PackagingInspectionSnapshot'
import { inspectionJob, inspectionJobKey, inspectionEvent, archiveInspection, inspectionCleanupActor } from './PackagingInspectionGuard'
import { reserveInspectionPlan } from './PackagingInspectionCapacity'

const uuid = z.string().uuid(), identity = z.string().min(1).max(128)
const policyInput = z.discriminatedUnion('enabled', [
  z.object({ expectedVersion: z.number().int().nonnegative(), enabled: z.literal(false) }).strict(),
  z.object({ expectedVersion: z.number().int().nonnegative(), enabled: z.literal(true), consent: z.literal(true),
    channelId: uuid, assigneeId: identity, inventoryIds: z.array(identity).min(1).max(20),
    hour: z.number().int().min(0).max(23), maxCountAgeDays: z.number().int().min(1).max(90),
    snapshotMaxAgeMinutes: z.number().int().min(5).max(120), acceptWithinHours: z.number().int().min(1).max(24),
    completeWithinHours: z.number().int().min(1).max(48), expectedAiConfigVersion: z.number().int().positive(),
    expectedAiCheckRevision: z.number().int().positive() }).strict()
])
const jobRows = async (db: any, storeId: string) => (await db.config.findMany({ where: { storeId,
  key: { startsWith: 'team.communication.workflow.inspection.job.' } }, orderBy: { createdAt: 'desc' }, take: 400 }))
  .map((r: any) => JSON.parse(r.value))
// Services joining an existing transaction must never open an independent transaction.
const joined = (tx: any) => ({ config: tx.config, staff: tx.staff, user: tx.user, financeAuditLog: tx.financeAuditLog,
  store: tx.store, inventory: tx.inventory, inventoryCount: tx.inventoryCount, $transaction: (fn: any) => fn(tx) })

export function packagingInspection(db: any = prisma, ai = teamAi(db), clock = () => new Date()) {
  const readPolicy = (storeId: string) => readTeam<InspectionPolicy>(db, storeId, 'inspection.policy')
  return {
    async policy(a: TeamActor) {
      await inspectionAdmin(db, a)
      return await readPolicy(a.storeId) || { version: 0, enabled: false, ruleVersion: 1 }
    },
    async savePolicy(a: TeamActor, input: unknown) {
      const v = policyInput.parse(input)
      if (v.enabled && (new Set(v.inventoryIds).size !== v.inventoryIds.length || v.acceptWithinHours > v.completeWithinHours)) inspectionFail('INSPECTION_INVALID_POLICY', 400)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'inspection-policy')
        await tx.store.update({ where: { id: a.storeId }, data: { updatedAt: new Date() } })
        await inspectionAdmin(tx, a)
        const old = await readTeam<InspectionPolicy>(tx, a.storeId, 'inspection.policy')
        if ((old?.version || 0) !== v.expectedVersion) inspectionFail('TEAM_VERSION_CONFLICT')
        let p: InspectionPolicy
        if (!v.enabled) p = { ...(old || {}), version: (old?.version || 0) + 1, enabled: false, ruleVersion: 1 } as InspectionPolicy
        else {
          const { c } = await accessTeamChannel(tx, a, v.channelId)
          p = { version: (old?.version || 0) + 1, enabled: true, ruleVersion: 1, channelId: v.channelId,
            inventoryIds: [...v.inventoryIds].sort(), assigneeId: v.assigneeId, operatorId: a.id, reviewerId: a.staffId,
            hour: v.hour, maxCountAgeDays: v.maxCountAgeDays, snapshotMaxAgeMinutes: v.snapshotMaxAgeMinutes,
            acceptWithinHours: v.acceptWithinHours, completeWithinHours: v.completeWithinHours,
            aiConfigVersion: v.expectedAiConfigVersion, aiCheckRevision: v.expectedAiCheckRevision, audienceHash: inspectionHash(c.members) }
          await inspectionScope(tx, a.storeId, p)
          await inspectionAiReady(tx, a.storeId, p)
          await packagingSnapshot(tx, a.storeId, p, clock())
        }
        await writeTeam(tx, a.storeId, 'inspection.policy', p)
        await auditTeam(tx, a, a.storeId, 'update', { action: 'inspection_policy', version: p.version, enabled: p.enabled,
          ...(p.enabled ? { inventoryIds: p.inventoryIds, assigneeId: p.assigneeId, channelId: p.channelId, ruleVersion: p.ruleVersion } : {}) })
        return p
      })
    },
    async snapshot(a: TeamActor) {
      await inspectionAdmin(db, a)
      const p = await readPolicy(a.storeId)
      if (!p?.enabled || p.operatorId !== a.id) inspectionFail('INSPECTION_DISABLED')
      return packagingSnapshot(db, a.storeId, p, clock())
    },
    async jobs(a: TeamActor) {
      await inspectionAdmin(db, a)
      const jobs = await jobRows(db, a.storeId)
      return { jobs, worker: await readTeam(db, a.storeId, 'inspection.worker') }
    },
    async dismiss(a: TeamActor, id: string, input: unknown) {
      uuid.parse(id)
      const v = z.object({ expectedVersion: z.number().int().positive(), note: z.string().trim().min(1).max(500) }).strict().parse(input)
      const initial = await inspectionJob(db, a.storeId, id)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + initial.policy.channelId)
        await inspectionAdmin(tx, a)
        const job = await inspectionJob(tx, a.storeId, id)
        await inspectionCleanupActor(tx, a.storeId, job, a.staffId)
        if (job.version !== v.expectedVersion) inspectionFail('TEAM_VERSION_CONFLICT')
        if (['processing', 'published', 'completed', 'cancelled', 'dismissed'].includes(job.state)) inspectionFail('INSPECTION_TRANSITION')
        await inspectionEvent(tx, a.storeId, job, 'dismissed', clock())
        await archiveInspection(tx, a.storeId, job)
        await auditTeam(tx, a, id, 'update', { action: 'inspection_dismissed', note: v.note, aiRequestId: job.aiRequestId })
        return job
      })
    },
    /** One durable job per store calendar date and rule version; no synthetic employee message. */
    async enqueueDaily(storeId: string) {
      const p = await readPolicy(storeId)
      if (!p?.enabled) return null
      const now = clock(), calendar = await inventoryBusinessCalendar(storeId, db)
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: calendar.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now))
      if (hour < p.hour) return null
      const day = calendar.formatDate(now), digest = inspectionHash([storeId, day, p.ruleVersion])
      const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'channel.' + p.channelId)
        await lockTeam(tx, storeId, 'inspection-policy')
        const repeated = await readTeam(tx, storeId, inspectionJobKey(id))
        if (repeated) return repeated
        if (inspectionHash(await readTeam(tx, storeId, 'inspection.policy')) !== inspectionHash(p)) inspectionFail('INSPECTION_POLICY_CHANGED')
        await inspectionAiReady(tx, storeId, p)
        const snapshot = await packagingSnapshot(tx, storeId, p, now)
        const job = { id, version: 0, state: 'queued', businessDate: day, ruleVersion: p.ruleVersion, policy: p,
          policyHash: inspectionHash(p), snapshot, events: [], createdAt: now.toISOString(), updatedAt: now.toISOString(), attempt: 0 }
        await inspectionEvent(tx, storeId, job, 'queued', now)
        await auditTeam(tx, inspectionActor(storeId, p), id, 'create', { action: 'inspection_enqueued', businessDate: day, snapshotHash: snapshot.hash })
        return job
      })
    },
    async process(storeId: string, id: string) {
      const initial = await inspectionJob(db, storeId, id), lease = randomUUID()
      const claimed = await db.$transaction(async (tx: any) => {
        await lockTeam(tx, storeId, 'channel.' + initial.policy.channelId)
        const job = await inspectionJob(tx, storeId, id), now = clock()
        if (job.state === 'processing' && Date.parse(job.leaseUntil) <= now.getTime()) {
          await inspectionEvent(tx, storeId, job, 'uncertain', now, 'INSPECTION_WORKER_INTERRUPTED')
          return null
        }
        if (job.state !== 'queued') return null
        try {
          await inspectionCurrent(tx, storeId, job, now)
          await reserveInspectionPlan(tx, inspectionActor(storeId, job.policy), job.policy.channelId, job.id)
        } catch (error) {
          if (!(error instanceof TeamError)) throw error
          await inspectionEvent(tx, storeId, job, 'blocked', now, error.message); return null
        }
        job.lease = lease; job.leaseUntil = new Date(now.getTime() + 120000).toISOString()
        job.aiRequestId = randomUUID(); job.attempt++
        await inspectionEvent(tx, storeId, job, 'processing', now)
        return job
      })
      if (!claimed) return null
      const a = inspectionActor(storeId, claimed.policy)
      const guard = async (tx: any) => {
        const current = await inspectionJob(tx, storeId, id)
        if (current.state !== 'processing' || current.lease !== lease || Date.parse(current.leaseUntil) <= clock().getTime()) inspectionFail('INSPECTION_LEASE_LOST')
        await inspectionCurrent(tx, storeId, current, clock())
      }
      try {
        const draft = await ai.packaging(a, claimed.policy.channelId, claimed.aiRequestId, claimed.snapshot, guard)
        return await db.$transaction(async (tx: any) => {
          await lockTeam(tx, storeId, 'channel.' + claimed.policy.channelId)
          const job = await inspectionJob(tx, storeId, id)
          await guard(tx)
          if (draft.status !== 'ready') inspectionFail('INSPECTION_AI_SCOPE_CHANGED')
          const { summaryZh } = z.object({ summaryZh: z.string().trim().min(1).max(600) }).strict().parse(JSON.parse(draft.text))
          const p = job.policy, at = clock().getTime()
          const content = { schema: 'team.operations.plan.v1', title: `包材盘点核实 · ${job.businessDate}`,
            objective: summaryZh, reviewerId: p.reviewerId, items: [{ key: 'packaging-count',
              text: 'Periksa persediaan fisik kemasan yang ditugaskan. Isi semua jumlah pada sesi stok opname yang terhubung; laporkan perbedaan dan bukti. Jangan mengubah stok atau memesan barang.',
              ownerId: p.assigneeId, acceptByAt: new Date(at + p.acceptWithinHours * 3600000).toISOString(),
              deadlineAt: new Date(at + p.completeWithinHours * 3600000).toISOString(),
              evidenceRequired: 'Sesi stok opname terkait, jumlah setiap kemasan, catatan dan foto melalui pesan pribadi ini.',
              acceptanceCriteria: '主管核实全部包材实盘记录及证据；差异须走独立的盘点批准，不能凭 AI 草稿修改库存。' }] }
          const plan: OperationPlan = await teamOperations(joined(tx)).import(a, p.channelId,
            { requestId: job.aiRequestId, expectedVersion: 0, content }, job.id)
          plan.inspectionId = job.id
          await writeTeam(tx, storeId, `operationPlan.${p.channelId}.${plan.id}`, plan)
          job.planId = plan.id; job.planHash = inspectionHash(plan.content)
          await inspectionEvent(tx, storeId, job, 'awaiting_approval', clock())
          return job
        })
      } catch (error) {
        return db.$transaction(async (tx: any) => {
          await lockTeam(tx, storeId, 'channel.' + claimed.policy.channelId)
          const job = await inspectionJob(tx, storeId, id)
          if (job.state !== 'processing' || job.lease !== lease) return job
          const draft = await readTeam(tx, storeId, `aiDraft.${a.staffId}.${job.aiRequestId}`)
          const code = error instanceof TeamError ? error.message : 'INSPECTION_PROCESS_FAILED'
          await inspectionEvent(tx, storeId, job, draft?.status === 'pending' || draft?.status === 'uncertain' ? 'uncertain' : 'blocked', clock(), code)
          return job
        })
      }
    },
    async linkCount(a: TeamActor, channelId: string, taskId: string, input: unknown) {
      uuid.parse(channelId); uuid.parse(taskId)
      const v = z.object({ requestId: uuid, expectedVersion: z.number().int().positive() }).strict().parse(input)
      return db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'channel.' + channelId)
        await tx.store.update({ where: { id: a.storeId }, data: { updatedAt: new Date() } })
        await accessTeamChannel(tx, a, channelId)
        const task = await readTeam(tx, a.storeId, `task.${channelId}.${taskId}`)
        if (!task?.inspectionId || task.ownerId !== a.staffId) inspectionFail('INSPECTION_ASSIGNEE_REQUIRED', 403)
        const person = await inspectionAssignee(tx, a.storeId, a.staffId)
        if (person.user.id !== a.id) inspectionFail('INSPECTION_ASSIGNEE_REQUIRED', 403)
        const job = await inspectionJob(tx, a.storeId, task.inspectionId)
        await inspectionCurrent(tx, a.storeId, job, clock(), false)
        const plan = await readTeam(tx, a.storeId, `operationPlan.${channelId}.${task.planId}`)
        if (job.state !== 'published' || plan?.status !== 'published' || !['accepted', 'changes_requested'].includes(task.status)) inspectionFail('INSPECTION_TASK_TRANSITION')
        const requestKey = `inspection.countRequest.${a.staffId}.${v.requestId}`, repeated = await readTeam(tx, a.storeId, requestKey)
        if (repeated && repeated.taskId !== taskId) inspectionFail('TEAM_REQUEST_CONFLICT')
        if (job.countId) return { countId: job.countId, task }
        if (task.version !== v.expectedVersion) inspectionFail('TEAM_VERSION_CONFLICT')
        const now = clock(), count = await createInventoryCount({ storeId: a.storeId, period: 'ad_hoc', startDate: now, endDate: now,
          inventoryIds: job.policy.inventoryIds, notes: `Packaging inspection ${job.id}` }, joined(tx))
        job.countId = count.id; task.inventoryCountId = count.id; task.version++; task.updatedAt = now.toISOString()
        await writeTeam(tx, a.storeId, `task.${channelId}.${task.id}`, task)
        await writeTeam(tx, a.storeId, inspectionJobKey(job.id), job)
        await writeTeam(tx, a.storeId, 'inspection.count.' + count.id, { jobId: job.id, taskId, createdBy: a.staffId })
        await writeTeam(tx, a.storeId, requestKey, { taskId, countId: count.id })
        await auditTeam(tx, a, channelId, 'create', { action: 'inspection_count_linked', jobId: job.id, taskId, countId: count.id })
        return { countId: count.id, task }
      })
    },
    async runBatch(storeId: string) {
      if (!storeId || storeId.length > 128) inspectionFail('INSPECTION_STORE_REQUIRED', 400)
      let error: string | undefined
      try { await this.enqueueDaily(storeId) } catch (e) { if (!(e instanceof TeamError)) throw e; error = e.message }
      const pending = await db.config.findMany({ where: { storeId, key: { startsWith: 'team.communication.inspection.pending.' } }, orderBy: { createdAt: 'asc' }, take: 10 })
      for (const row of pending) await this.process(storeId, JSON.parse(row.value).id)
      const all = await jobRows(db, storeId), states: Record<string, number> = {}
      for (const job of all) states[job.state] = (states[job.state] || 0) + 1
      const heartbeat = { checkedAt: clock().toISOString(), states, ...(error ? { error } : {}), ruleVersion: 1 }
      await writeTeam(db, storeId, 'inspection.worker', heartbeat)
      return heartbeat
    }
  }
}
