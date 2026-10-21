import { createHash } from 'crypto'
import prisma from '../config/database'
import { TeamError, teamCommunication, readTeam, TEAM_PREFIX } from './TeamCommunicationService'
import { readWork, writeWork, listWork, workLock } from './EmployeeWorkspaceStore'
import { reminderStillRelevant } from './EmployeeReminderService'
import { reminderDeliveryView } from './EmployeePushDeviceService'
import { userAccessV2 } from './StaffPermissionV2Service'
import { readStaffAccess } from './StaffPermissionService'

export interface InboxActor { id: string; storeId: string; staffId?: string; role?: string; employeeApp?: boolean }
export interface InboxItem {
  id: string; event: string; kind: string; title: string; url: string; adminUrl?: string
  read: boolean; pending: boolean; createdAt: string; status?: string; domain?: string; objectId?: string; trainingUpdate?: any; delivery?: ReturnType<typeof reminderDeliveryView>
}
// Injected adapters also allow the real database/HTTP contract to be tested without a push transport.
export interface InboxSources {
  approvals(db: any, actor: InboxActor): Promise<any[]>
  trainingRelevant(db: any, storeId: string, reminder: any, staffId: string): Promise<boolean>
}
const digest = (v: string) => createHash('sha256').update(v).digest('hex')
const readKey = (userId: string, id: string) => `inbox.read.${userId}.${id}`
const coveredLegacy = /^(?:hygiene-review:|review:|leave-review:|reimbursement-review:|overtimeRequest-review:|shiftSwap-review:|attendanceCorrection-review:|swap-confirm:|swap-result:)/

/** Never trusts a client role, selected person or an old accessRole object. */
export async function inboxIdentity(db: any, actor: InboxActor) {
  const user = await db.user.findUnique({ where: { id: actor.id }, include: { staff: true } })
  if (!user || !actor.storeId || user.staff && (user.staff.status !== 'active' || user.staff.storeId !== actor.storeId) ||
      user.storeId && user.storeId !== actor.storeId || !user.staff && user.role !== 'admin' ||
      actor.staffId && actor.staffId !== user.staff?.id) throw new TeamError(403, 'INBOX_IDENTITY_REQUIRED')
  return { id: user.id, storeId: actor.storeId, staffId: user.staff?.id, role: user.role }
}

/** Source facts and employee text stay in the owner-only workflow projection. */
export async function projectManagementOwnerTodos(db: any, a: InboxActor): Promise<InboxItem[]> {
  if (a.role !== 'admin' || !a.staffId || a.employeeApp === true) return []
  const owner = await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })
  if (!owner) return []
  const rows = await db.config.findMany({ where: { storeId: a.storeId, key: { startsWith: TEAM_PREFIX + 'workflow.job.' },
    OR: ['awaiting_owner', 'pending_action', 'blocked', 'uncertain'].map(status => ({ value: { contains: `"status":"${status}"` } })) }, select: { key: true, value: true } })
  const result: InboxItem[] = []
  for (const row of rows) {
    const j = JSON.parse(row.value)
    if (j.managementUnavailable && j.operatorUserId === a.id && j.operatorStaffId === a.staffId) {
      const defaults=await readTeam(db,a.storeId,'workflow.defaults')
      if (defaults?.enabled && defaults.ownerUserId===a.id && defaults.ownerStaffId===a.staffId && defaults.version===j.managementUnavailable.defaultsVersion) {
        const event=`management-unassigned:${j.id}`,id=digest(`${a.id}:${event}`),marker=await readWork(a.storeId,readKey(a.id,id),db)
        result.push({id,event,kind:'business_reminder',title:'工作会话缺少可访问负责人 / Penanggung jawab kanal diperlukan',url:'/staff/communication?channel='+encodeURIComponent(j.channelId),adminUrl:'/staff/communication?channel='+encodeURIComponent(j.channelId),read:!!marker,pending:true,createdAt:j.updatedAt,status:j.managementUnavailable.reason,domain:'team_management',objectId:j.id})
      }
      continue
    }
    if ((!j.management && !j.managementIntake) || !['awaiting_owner', 'pending_action','blocked','uncertain'].includes(j.status) || j.operatorUserId !== a.id || j.operatorStaffId !== a.staffId ||
      typeof j.channelId !== 'string' || typeof j.id !== 'string' || !Number.isSafeInteger(j.sourceSeq)) continue
    const [p, c] = await Promise.all([readTeam(db, a.storeId, `workflow.policy.${j.channelId}`), readTeam(db, a.storeId, `channel.${j.channelId}`)])
    if (!p?.management || p.management.ownerStaffId !== a.staffId || p.operatorUserId !== a.id || p.operatorStaffId !== a.staffId ||
      c?.archived || (c?.ownerId !== a.staffId && p.origin !== 'store_default') || !['direct','group','public','meeting'].includes(c?.kind) || !Array.isArray(c?.members) || c.members.length < 2 ||
      p.audienceHash !== digest(JSON.stringify(c.members)) || !Array.isArray(p.employeeIds) || !Array.isArray(p.management.employees) ||
      p.management.employees.length !== p.employeeIds.length || p.employeeIds.some((id: string) => !p.management.employees.some((e: any) => e.staffId === id)) ||
      c.members.some((m: any) => m.staffId !== a.staffId && !p.employeeIds.includes(m.staffId)) ||
      !c.members.some((m: any) => m.staffId === a.staffId) || !c.members.some((m: any) => m.staffId === j.sourceAuthorId) ||
      (!p.employeeIds?.includes(j.sourceAuthorId) && j.sourceAuthorId!==a.staffId) || c.members.some((m: any) => m.fromSeq > j.sourceSeq) || j.sourceSeq < p.management.sourceFloor) continue
    const employee = await db.staff.findFirst({ where: { id: j.sourceAuthorId, storeId: a.storeId, status: 'active', user: { storeId: a.storeId } }, select: { id: true } })
    if (!employee) continue
    const event = `management:${j.id}:${j.status}`, id = digest(`${a.id}:${event}`)
    const marker = await readWork(a.storeId, readKey(a.id, id), db)
    const url = `/staff/communication?channel=${encodeURIComponent(j.channelId)}&workflow=1`
    result.push({ id, event, kind: 'business_reminder', title: ['blocked','uncertain'].includes(j.status) ? 'AI工作处理异常待复核 / Pemrosesan kerja perlu ditinjau' : j.status === 'awaiting_owner' ? 'AI工作协调待决定 / Keputusan kerja diperlukan' : 'AI工作协调待处理 / Tindak lanjut kerja',
      url, adminUrl: url, read: !!marker, pending: true, createdAt: j.updatedAt, domain: 'team_management', objectId: j.id, status: j.status })
  }
  return result
}

export function notificationInbox(db: any = prisma, sources?: InboxSources) {
  const adapters = async (): Promise<InboxSources> => sources || {
    approvals: (await import('./NotificationApprovalService.js')).projectApprovalAwareness,
    trainingRelevant: (await import('./TrainingLibraryStore.js')).trainingUpdateRelevant
  }
  async function collect(actor: InboxActor) {
    const a = await inboxIdentity(db, actor), ports = await adapters()
    let adminTraining = true
    if (actor.employeeApp === false && a.role !== 'admin') {
      const access = await userAccessV2(a, db)
      if (access) adminTraining = access.modes['training.read'] === 'allow'
      else {
        const policy = await readStaffAccess(a.storeId, db), binding = policy.assignments.find(x => x.staffId === a.staffId)
        const role = policy.roles.find(x => x.id === binding?.roleId)
        adminTraining = role ? role.permissions.includes('training.read') : a.role === 'manager'
      }
    }
    const [reminders, projected, channels] = await Promise.all([
      a.staffId ? listWork(a.storeId, `reminder.${a.staffId}.`, db) : [],
      ports.approvals(db, a),
      a.staffId ? teamCommunication(db).channels({ ...a, staffId: a.staffId, employeeApp: true }) : []
    ])
    const items = new Map<string, InboxItem>(), persisted = new Map<string, any>()
    for (const r of reminders) {
      if (!r || r.staffId !== a.staffId || r.userId && r.userId !== a.id || typeof r.id !== 'string' || typeof r.event !== 'string') continue
      persisted.set(r.event, r)
      if (r.event.startsWith('approval-notice:') || coveredLegacy.test(r.event) || r.status === 'cancelled') continue
      if (r.event.startsWith('training-content:')) {
        if (!adminTraining) continue
        if (!await ports.trainingRelevant(db, a.storeId, r, a.staffId!)) continue
      } else if (!await reminderStillRelevant(a.storeId, r, new Date(), db)) continue
      const marker = await readWork(a.storeId, readKey(a.id, r.id), db)
      const destination = new URL(r.url, 'https://inbox.invalid')
      items.set(r.id, { id: r.id, event: r.event,
        kind: r.event.startsWith('team-chat:') ? 'chat' : r.event.startsWith('training-content:') ? 'training_update' : 'business_reminder',
        title: r.title, url: r.url, read: !!marker || r.read === true, pending: false, createdAt: r.createdAt, delivery: reminderDeliveryView({...r,read:!!marker||r.read===true}),
        ...(r.chat ? { domain: 'chat', objectId: r.chat.channelId, adminUrl: `/staff/communication?channel=${encodeURIComponent(r.chat.channelId)}&message=${r.chat.seq}` } : {}),
        ...(r.teamTask ? { domain: 'team_task', objectId: r.teamTask.taskId, adminUrl: '/staff/communication' + destination.search, status: r.teamTask.status, pending: ['assigned', 'changes_requested'].includes(r.teamTask.status) } : {}),
        ...(r.trainingUpdate ? { adminUrl: '/staff/training' + destination.search } : {}),
        ...(r.trainingUpdate ? { trainingUpdate: r.trainingUpdate } : {}) })
    }
    const baseline = await readWork(a.storeId, 'approval.notice.baseline', db)
    for (const entry of projected) {
      if (!entry?.event || entry.userId && entry.userId !== a.id) continue
      const existing = persisted.get(entry.event), id = entry.id || existing?.id || digest(`${a.id}:${entry.event}`)
      const marker = await readWork(a.storeId, readKey(a.id, id), db)
      const historical = entry.kind === 'approval_result' && !existing && (!baseline || Date.parse(entry.createdAt) < Date.parse(baseline.at))
      const url = entry.url?.startsWith('/inbox?') ? `/inbox?notice=${encodeURIComponent(id)}` : entry.url
      items.set(id, { id, event: entry.event, kind: entry.kind, title: entry.title, url,
        adminUrl: entry.adminUrl, read: !!marker || existing?.read === true || historical, pending: entry.pending === true,
        createdAt: entry.createdAt, domain: entry.domain, objectId: entry.objectId, status: entry.businessStatus || entry.status })
    }
    for (const item of await projectManagementOwnerTodos(db, { ...a, employeeApp: actor.employeeApp })) items.set(item.id, item)
    const values = [...items.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt) || x.id.localeCompare(y.id))
    const chats = channels.map((c: any) => ({ id: c.id, title: c.title, unread: c.unread, preview: c.preview,
      url: `/team?channel=${encodeURIComponent(c.id)}`, adminUrl: `/staff/communication?channel=${encodeURIComponent(c.id)}` }))
    const chatUnread = chats.reduce((sum: number, c: any) => sum + c.unread, 0)
    return { a, items: values, chats, counts: {
      unread: chatUnread + values.filter(x => !x.read && x.kind !== 'chat').length,
      chatUnread, trainingUnread: values.filter(x => !x.read && x.kind === 'training_update').length,
      approvalPending: values.filter(x => x.kind === 'approval_request' && x.pending).length
    } }
  }
  return {
    async read(actor: InboxActor) { const { a: _, ...result } = await collect(actor); return result },
    async markRead(actor: InboxActor, id: string) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new TeamError(400, 'INBOX_NOTICE_INVALID')
      return db.$transaction(async (tx: any) => {
        const { a, items } = await notificationInbox(tx, sources)._collect(actor)
        const item = items.find(x => x.id === id)
        if (!item) throw new TeamError(404, 'INBOX_NOTICE_NOT_FOUND')
        if (item.kind === 'chat') throw new TeamError(409, 'INBOX_CHAT_READ_IN_CONVERSATION')
        await workLock(a.storeId, readKey(a.id, id), tx)
        await writeWork(a.storeId, readKey(a.id, id), { userId: a.id, event: item.event, readAt: new Date().toISOString() }, tx)
        // Delivery read state is independent of business pending/approval status.
        if (a.staffId) {
          const key = `reminder.${a.staffId}.${id}`
          await workLock(a.storeId, key, tx)
          const r = await readWork(a.storeId, key, tx)
          if (r && (!r.userId || r.userId === a.id)) await writeWork(a.storeId, key, { ...r, read: true }, tx)
        }
        return { read: true, pending: item.pending }
      })
    },
    _collect: collect
  }
}
