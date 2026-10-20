import { createHash } from 'crypto'
import prisma from '../config/database'
import { TeamError, teamCommunication } from './TeamCommunicationService'
import { readWork, writeWork, listWork, workLock } from './EmployeeWorkspaceStore'
import { reminderStillRelevant } from './EmployeeReminderService'
import { userAccessV2 } from './StaffPermissionV2Service'
import { readStaffAccess } from './StaffPermissionService'

export interface InboxActor { id: string; storeId: string; staffId?: string; role?: string; employeeApp?: boolean }
export interface InboxItem {
  id: string; event: string; kind: string; title: string; url: string; adminUrl?: string
  read: boolean; pending: boolean; createdAt: string; status?: string; domain?: string; objectId?: string; trainingUpdate?: any
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
        title: r.title, url: r.url, read: !!marker || r.read === true, pending: false, createdAt: r.createdAt,
        ...(r.chat ? { domain: 'chat', objectId: r.chat.channelId, adminUrl: `/staff/communication?channel=${encodeURIComponent(r.chat.channelId)}` } : {}),
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
