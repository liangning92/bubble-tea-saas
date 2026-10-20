import { createHash } from 'crypto'
import { canUseManagementRoute } from './ManagementRouteAccess'
import { ACCESS_ROUTE_MANIFEST } from './StaffPermissionRouteManifest'
import { userAccessV2 } from './StaffPermissionV2Service'
import { readStaffAccess } from './StaffPermissionService'
import { STAFF_BASIC_PERMISSIONS } from './StaffPermissionCatalog'
import { requireApprovalCapability } from './StaffActionApprovalService'
import { employeeAppAccess } from './EmployeeAppAccess'
import { hasManagementAccess } from '../utils/managementAccess'
import { blocksSelfApproval } from '../utils/refundApprovalAccess'
import { listWork, readWork, writeWork, workLock } from './EmployeeWorkspaceStore'

export interface ApprovalAwareness {
  id: string
  event: string
  kind: 'approval_request' | 'approval_result'
  domain: string
  objectId: string
  title: string
  url: string
  adminUrl: string
  pending: boolean
  status: string
  createdAt: string
}
type ActorInput = { id: string; storeId: string; employeeApp?: boolean; issuedAtMs?: number }
type CurrentActor = ActorInput & { role: string; staffId: string; accessRole: any }
type Node = {
  domain: string; row: any; route: string; ownRoute?: string
  adminUrl: string; staffUrl?: string; owners: string[]
  pending: boolean; result: boolean; stage?: string
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const iso = (value: any) => value ? new Date(value).toISOString() : ''
const own = (actor: CurrentActor, ids: string[]) => ids.some(id => id === actor.id || !!actor.staffId && id === actor.staffId)

// The caller's role, staffId and accessRole are deliberately not accepted as grants.
async function currentActor(db: any, input: ActorInput): Promise<CurrentActor | null> {
  if (!input?.id || !input.storeId) return null
  const user = await db.user.findUnique({ where: { id: input.id }, include: { staff: true } })
  if (!user || !['admin', 'manager', 'cashier', 'staff'].includes(user.role) ||
      user.staff && user.staff.status !== 'active' ||
      typeof input.issuedAtMs === 'number' && user.updatedAt.getTime() > input.issuedAtMs ||
      !!(user.staff?.storeId || user.storeId) && (user.staff?.storeId || user.storeId) !== input.storeId ||
      user.role !== 'admin' && !(user.staff?.storeId || user.storeId)) return null
  if (!await db.store.findUnique({ where: { id: input.storeId }, select: { id: true } })) return null
  const actor: CurrentActor = { id: user.id, role: user.role, staffId: user.staff?.id || '', storeId: input.storeId, employeeApp: input.employeeApp === true, accessRole: null }
  actor.accessRole = await userAccessV2(actor, db)
  if (!actor.accessRole && actor.role !== 'admin' && actor.staffId) {
    const policy = await readStaffAccess(actor.storeId, db)
    const binding = policy.assignments.find(a => a.staffId === actor.staffId)
    if (binding) {
      const role = policy.roles.find(r => r.id === binding.roleId)
      if (!role || role.baseRole !== actor.role) return null
      actor.accessRole = { ...role, permissions: [...role.permissions, ...STAFF_BASIC_PERMISSIONS] }
    }
  }
  return actor
}

function routeAllowed(actor: CurrentActor, routeKey: string): boolean {
  const declaration = ACCESS_ROUTE_MANIFEST[routeKey]
  if (!declaration) return false
  const spec = { ...declaration, routeKey }
  const access = actor.employeeApp ? employeeAppAccess(actor.role) : actor.accessRole
  const user = { ...actor, role: actor.employeeApp ? 'staff' : actor.role, accessRole: access }
  if (!canUseManagementRoute(user, spec)) return false
  if (user.role === 'admin') return true
  if (spec.ownerOnly) return false
  if (access?.version === 2) return !spec.permission || access.modes[spec.permission] === 'allow'
  if (!(spec.legacyRoles || []).includes(user.role)) return false
  // Match legacy authentication's configured restriction, without trusting a
  // permission object supplied by the client or reading through the global DB.
  return !access || !spec.legacyPermission || spec.legacyPermission.startsWith('__') || access.permissions.includes(spec.legacyPermission)
}

const ordinary = [
  ['leave', 'PUT /api/leave/approve/:id', 'GET /api/leave/my', '/staff/attendance/leave', '/leave'],
  ['overtimeRequest', 'PUT /api/overtime/:id/approve', 'GET /api/overtime/my', '/staff/attendance/overtime', '/overtime'],
  ['attendanceCorrection', 'PUT /api/staff-correction/:id/approve', 'GET /api/staff-correction/my', '/staff/attendance/correction', '/attendance/correction'],
  ['reimbursement', 'PUT /api/reimbursement/approve/:id', 'GET /api/reimbursement/my', '/staff/salary/reimbursement', '/reimbursement'],
] as const
const managementReadRoutes: Record<string, string> = {
  leave: 'GET /api/leave/list', overtimeRequest: 'GET /api/overtime',
  attendanceCorrection: 'GET /api/staff-correction', reimbursement: 'GET /api/reimbursement/list',
  shiftSwap: 'GET /api/shift-swap', hygiene: 'GET /api/hygiene/tasks',
  inventoryCount: 'GET /api/inventory-counts', profile: 'GET /api/staff-work/admin',
  appeal: 'GET /api/staff-work/admin', staffActionApproval: 'GET /api/staff-permissions/approvals',
  refundRequest: 'GET /api/orders/refund-requests',
}

async function nodes(db: any, storeId: string, target?: {domain: string; objectId: string}): Promise<Node[]> {
  const result: Node[] = []
  const selected = (domain: string) => !target || target.domain === domain
  const object = target ? { id: target.objectId } : {}
  // Select only lifecycle/identity fields. Never project request text, money,
  // payroll, identity documents, photos, notes or serialized approval payloads.
  for (const [domain, route, ownRoute, adminUrl, staffUrl] of ordinary) {
    if (!selected(domain)) continue
    const rows = await db[domain].findMany({ where: { storeId, ...object }, select: { id: true, staffId: true, status: true, createdAt: true, updatedAt: true } })
    for (const row of rows) result.push({ domain, row, route, ownRoute, adminUrl, staffUrl, owners: [row.staffId], pending: row.status === 'pending', result: ['approved', 'rejected', 'paid'].includes(row.status) })
  }
  for (const row of selected('shiftSwap') ? await db.shiftSwap.findMany({ where: { storeId, ...object }, select: { id: true, staffId: true, targetStaffId: true, targetConfirmed: true, status: true, createdAt: true, updatedAt: true } }) : []) {
    const peer = row.status === 'pending' && !!row.targetStaffId && !row.targetConfirmed
    result.push({ domain: 'shiftSwap', row, route: peer ? 'PUT /api/shift-swap/:id/confirm' : 'PUT /api/shift-swap/:id/approve', ownRoute: 'GET /api/shift-swap/my', adminUrl: '/staff/attendance/shift-swap', staffUrl: '/shift-swap', owners: [row.staffId, row.targetStaffId].filter(Boolean), pending: peer || row.status === 'pending' && !!row.targetStaffId && row.targetConfirmed, result: ['approved', 'rejected', 'peer_rejected', 'cancelled'].includes(row.status), stage: peer ? 'peer' : 'manager' })
  }
  for (const row of selected('hygiene') ? await db.hygieneTask.findMany({ where: { storeId, ...object }, select: { id: true, staffId: true, completedBy: true, date: true, status: true, createdAt: true, updatedAt: true } }) : []) {
    result.push({ domain: 'hygiene', row, route: 'PUT /api/hygiene/tasks/:id/approve', ownRoute: 'GET /api/hygiene/tasks/my', adminUrl: `/hygiene/today?date=${encodeURIComponent(row.date)}`, staffUrl: `/hygiene?date=${encodeURIComponent(row.date)}`, owners: [row.staffId, row.completedBy].filter(Boolean), pending: row.status === 'pending_approval', result: ['approved', 'rejected'].includes(row.status) })
  }
  for (const row of selected('inventoryCount') ? await db.inventoryCount.findMany({ where: { storeId, ...object }, select: { id: true, status: true, createdAt: true, updatedAt: true, items: { select: { countedBy: true } } } }) : []) {
    result.push({ domain: 'inventoryCount', row, route: 'POST /api/inventory-counts/:id/complete', ownRoute: 'GET /api/inventory-counts/:id', adminUrl: `/inventory/count?countId=${encodeURIComponent(row.id)}`, staffUrl: `/inventory/count?countId=${encodeURIComponent(row.id)}`, owners: row.items.map((item: any) => item.countedBy).filter(Boolean), pending: row.status === 'pending_review', result: ['completed', 'cancelled'].includes(row.status) })
  }
  for (const domain of ['profile', 'appeal']) {
    if (!selected(domain)) continue
    const records = target ? [await readWork(storeId, `${domain}.${target.objectId}`, db)] : await listWork(storeId, `${domain}.`, db)
    for (const row of records.filter(Boolean)) {
      result.push({ domain, row, route: 'PUT /api/staff-work/admin/:kind/:id/review', ownRoute: domain === 'profile' ? 'GET /api/staff-work/my/profile-submissions' : 'GET /api/staff-work/my/attendance', adminUrl: '/staff/attendance/workspace', staffUrl: domain === 'profile' ? '/profile/documents' : '/attendance/appeals', owners: [row.staffId], pending: row.status === 'pending', result: ['approved', 'rejected'].includes(row.status) })
    }
  }
  const actionRows = selected('staffActionApproval') ? await db.staffActionApproval.findMany({ where: { storeId, ...object }, select: { id: true, applicantId: true, action: true, targetId: true, status: true, expiresAt: true, createdAt: true, executedAt: true } }) : []
  // StaffActionApproval has no updatedAt/rejectedAt. Its native service writes
  // an audit event on authorize/reject; read only its identity and timestamp.
  const actionTimes = actionRows.some((r: any) => r.status !== 'pending') ? await db.financeAuditLog.findMany({ where: { storeId, entityType: 'staff_action_approval', entityId: { in: actionRows.filter((r: any) => r.status !== 'pending').map((r: any) => r.id) } }, select: { entityId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }) : []
  for (const row of actionRows) {
    if (row.status !== 'pending') row.reviewedAt = row.executedAt || actionTimes.find((r: any) => r.entityId === row.id)?.createdAt || row.createdAt
    result.push({ domain: 'staffActionApproval', row, route: 'POST /api/staff-permissions/approvals/:id/approve', ownRoute: 'GET /api/staff-permissions/approvals/:id', adminUrl: '/approvals', staffUrl: '/approvals', owners: [row.applicantId], pending: row.status === 'pending' && row.expiresAt > new Date(), result: ['authorized', 'executed', 'rejected'].includes(row.status) })
  }
  for (const row of selected('refundRequest') ? await db.refundRequest.findMany({ where: { order: { storeId }, ...object }, select: { id: true, requestedBy: true, status: true, createdAt: true, updatedAt: true } }) : []) {
    result.push({ domain: 'refundRequest', row, route: 'POST /api/orders/refund-requests/:id/approve', ownRoute: 'GET /api/orders/refund-requests', adminUrl: '/finance/orders?tab=refunds', owners: [row.requestedBy], pending: row.status === 'pending', result: ['approved', 'rejected'].includes(row.status) })
  }
  return result
}

async function actionable(db: any, actor: CurrentActor, node: Node) {
  if (node.stage === 'peer') return node.row.targetStaffId === actor.staffId && routeAllowed(actor, node.route)
  // An employee app header never appoints a manager, including for the personal
  // StaffActionApproval transport routes whose service has an independent gate.
  if (actor.employeeApp) return false
  if (!routeAllowed(actor, node.route)) return false
  if (node.domain === 'staffActionApproval') {
    if (blocksSelfApproval(actor, node.row.applicantId, node.row.action)) return false
    await requireApprovalCapability(actor, node.row.action, true, db)
    const applicant = await currentActor(db, { id: node.row.applicantId, storeId: actor.storeId })
    if (!applicant) return false
    await requireApprovalCapability(applicant, node.row.action, false, db)
    if (node.row.action === 'orders.refund') return !!await db.refundRequest.findFirst({ where: { id: node.row.targetId, status: 'pending', order: { storeId: actor.storeId } }, select: { id: true } })
    if (node.row.action === 'members.balance') return !!await db.member.findFirst({ where: { id: node.row.targetId, storeId: actor.storeId }, select: { id: true } })
    return node.row.action === 'orders.discount'
  }
  if (node.domain === 'refundRequest') {
    if (blocksSelfApproval(actor, node.row.requestedBy, 'orders.refund')) return false
    if (actor.accessRole?.version === 2 && (actor.accessRole.modes['orders.refund'] !== 'allow' || actor.accessRole.modes['approvals.approve'] !== 'allow')) return false
  }
  return true
}

async function project(db: any, input: ActorInput, snapshot?: Node[]): Promise<ApprovalAwareness[]> {
  const actor = await currentActor(db, input)
  if (!actor) return []
  const management = !actor.employeeApp && hasManagementAccess(actor.role, actor.accessRole)
  const result: ApprovalAwareness[] = []
  for (const node of snapshot || await nodes(db, actor.storeId)) {
    let pending = false
    if (node.pending) {
      try { pending = await actionable(db, actor, node) } catch (error: any) {
        if (![400, 403, 404].includes(error.status)) throw error
      }
    }
    const isResult = node.result && own(actor, node.owners) && (node.domain === 'refundRequest' || !!node.ownRoute && routeAllowed(actor, node.ownRoute))
    if (!pending && !isResult) continue
    const kind = pending ? 'approval_request' : 'approval_result'
    const version = [node.row.status, node.stage || '', iso(node.row.updatedAt || node.row.reviewedAt || node.row.executedAt || node.row.createdAt), iso(node.row.expiresAt)].join(':')
    const event = `approval-notice:${node.domain}:${node.row.id}:${kind}:${digest(version)}`
    // Employee push always opens a real employee route. Management execution
    // stays in its separately authorized admin surface; an inbox card only
    // exposes the current generic node/result and never grants execution.
    const id = digest(`${actor.id}:${event}`)
    const inbox = `/inbox?notice=${id}`
    const objectUrl = (base: string) => `${base}${base.includes('?') ? '&' : '?'}noticeObject=${encodeURIComponent(node.row.id)}`
    const staffCanLocate = !!node.staffUrl && (node.stage === 'peer' || isResult) && !(node.domain === 'hygiene' && node.row.staffId !== actor.staffId)
    const url = staffCanLocate ? objectUrl(node.staffUrl) : inbox
    const adminUrl = management && routeAllowed(actor, managementReadRoutes[node.domain]) ? objectUrl(node.adminUrl) : inbox
    result.push({ id, event, kind, domain: node.domain, objectId: node.row.id, status: node.row.status, title: pending ? 'Pengajuan perlu ditindaklanjuti / 有申请待处理' : 'Hasil pengajuan diperbarui / 申请结果已更新', url, adminUrl, pending, createdAt: iso(pending ? node.row.updatedAt || node.row.createdAt : node.row.reviewedAt || node.row.executedAt || node.row.updatedAt || node.row.createdAt) })
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

/** Live business-state projection; reading a notice never completes a node. */
export async function projectApprovalAwareness(db: any, actor: ActorInput): Promise<ApprovalAwareness[]> {
  return project(db, actor)
}

/** Worker hook. No transport, push keys, accounts, or business mutations. */
export async function collectApprovalNotices(db: any, storeId: string): Promise<number> {
  if (typeof db.$transaction === 'function') return db.$transaction((tx: any) => collectApprovalNotices(tx, storeId), { timeout: 30000 })
  await workLock(storeId, 'approval.notice.baseline', db)
  let baseline = await readWork(storeId, 'approval.notice.baseline', db)
  if (!baseline) baseline = await writeWork(storeId, 'approval.notice.baseline', { at: new Date().toISOString() }, db)
  const staff = await db.staff.findMany({ where: { storeId, status: 'active' }, select: { id: true, userId: true } })
  const snapshot = await nodes(db, storeId)
  let created = 0
  for (const person of staff) {
    for (const notice of await project(db, { id: person.userId, storeId }, snapshot)) {
      if (notice.kind === 'approval_result' && notice.createdAt < baseline.at) continue
      const key = `reminder.${person.id}.${notice.id}`
      await workLock(storeId, key, db)
      if (await readWork(storeId, key, db)) continue
      await writeWork(storeId, key, { ...notice, businessStatus: notice.status, staffId: person.id, userId: person.userId, read: false, status: 'pending' }, db)
      created++
    }
  }
  return created
}

/** Inbox and delivery must call this again, immediately before exposing/sending. */
export async function approvalNoticeRelevant(db: any, storeId: string, reminder: any, staffId?: string): Promise<boolean> {
  if (typeof reminder?.event !== 'string' || !reminder.event.startsWith('approval-notice:') || typeof reminder.domain !== 'string' || typeof reminder.objectId !== 'string' || !reminder.userId || !reminder.staffId || staffId && reminder.staffId !== staffId) return false
  const employee = await db.staff.findFirst({ where: { id: reminder.staffId, userId: reminder.userId, storeId, status: 'active' }, select: { id: true } })
  if (!employee) return false
  const current = await project(db, { id: reminder.userId, storeId }, await nodes(db, storeId, { domain: reminder.domain, objectId: reminder.objectId }))
  return current.some(notice => notice.id === reminder.id && notice.event === reminder.event && notice.kind === reminder.kind && notice.domain === reminder.domain && notice.objectId === reminder.objectId && notice.url === reminder.url && notice.adminUrl === reminder.adminUrl && notice.title === reminder.title)
}
