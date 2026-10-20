import { createHash } from 'crypto'
import { inventoryBusinessCalendar } from '../utils/inventoryBusinessCalendar'
import { TeamActor, TeamError, accessTeamChannel, readTeam } from './TeamCommunicationService'
import { readPolicyV2 } from './StaffPermissionV2Service'
import { effectiveAccess } from './StaffPermissionV2Core'
import { COUNT_OBSERVATION_PREFIX } from '../utils/countObservation'
import { readAiConnection } from './TeamAiService'

export const inspectionHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const inspectionFail = (code: string, status = 409): never => { throw new TeamError(status, code) }
export interface InspectionPolicy {
  version: number; enabled: boolean; channelId: string; inventoryIds: string[]; assigneeId: string
  operatorId: string; reviewerId: string; hour: number; maxCountAgeDays: number; snapshotMaxAgeMinutes: number
  acceptWithinHours: number; completeWithinHours: number; aiConfigVersion: number; aiCheckRevision: number
  audienceHash: string; ruleVersion: 1
}
export function inspectionActor(storeId: string, p: InspectionPolicy): TeamActor {
  return { storeId, id: p.operatorId, staffId: p.reviewerId, role: 'admin' }
}
export async function inspectionAdmin(db: any, a: TeamActor) {
  if (a.role !== 'admin' || a.employeeApp || !await db.user.findFirst({ where: {
    id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' }
  }, select: { id: true } })) inspectionFail('INSPECTION_ADMIN_REQUIRED', 403)
}
/** Fresh DB grants; client role claims and previously issued tokens cannot grant count access. */
export async function inspectionAssignee(db: any, storeId: string, staffId: string) {
  const person = await db.staff.findFirst({ where: { id: staffId, storeId, status: 'active' },
    select: { id: true, user: { select: { id: true, role: true, storeId: true } } } })
  if (!person?.user || person.user.storeId !== storeId || person.user.role === 'admin') inspectionFail('INSPECTION_ASSIGNEE_UNAVAILABLE', 403)
  const policy = await readPolicyV2(storeId, db)
  if (policy?.active) {
    const modes = effectiveAccess(policy, staffId).modes
    if (modes['inventory.count'] !== 'allow' || modes['inventory.read'] !== 'allow') inspectionFail('INSPECTION_COUNT_PERMISSION_REQUIRED', 403)
  } else {
    // First release requires an explicit active grant. No permissive legacy fallback.
    inspectionFail('INSPECTION_ACTIVE_ACCESS_POLICY_REQUIRED', 403)
  }
  return person
}
export async function inspectionScope(db: any, storeId: string, p: InspectionPolicy, requireEnabled = true) {
  if (requireEnabled && !p.enabled) inspectionFail('INSPECTION_DISABLED')
  const a = inspectionActor(storeId, p)
  await inspectionAdmin(db, a)
  await inspectionAssignee(db, storeId, p.assigneeId)
  const { c } = await accessTeamChannel(db, a, p.channelId)
  // Stock facts are private to this designated pair in this first release.
  if (c.archived || c.members.length !== 2 || !c.members.some(m => m.staffId === p.assigneeId) ||
      inspectionHash(c.members) !== p.audienceHash) inspectionFail('INSPECTION_AUDIENCE_CHANGED')
  return { a, c }
}
/** Pure SELECT projection. Never calls alert refresh/forecast writers or exposes costs, staff or orders. */
export async function packagingSnapshot(db: any, storeId: string, p: InspectionPolicy, now = new Date()) {
  await inspectionScope(db, storeId, p)
  const calendar = await inventoryBusinessCalendar(storeId, db)
  const inventory = await db.inventory.findMany({ where: { storeId, category: 'packaging', id: { in: p.inventoryIds },
    OR: [{ type: { not: 'semi_finished' } }, { processRecipeId: null }] }, orderBy: { id: 'asc' },
    select: { id: true, name: true, unit: true, currentStock: true, safetyStock: true, minStock: true,
      updatedAt: true, ledgerSequence: true, ledgerEpoch: true } })
  if (inventory.length !== p.inventoryIds.length || !inventory.length) inspectionFail('INSPECTION_INVALID_PACKAGING_SELECTION')
  const items = []
  for (const i of inventory) {
    const count = await db.inventoryCountItem.findFirst({ where: { inventoryId: i.id, countedAt: { not: null },
      countedQty: { not: null }, inventoryCount: { storeId, status: 'completed' } }, orderBy: { countedAt: 'desc' },
      select: { id: true, countedQty: true, countedAt: true, inventoryCountId: true } })
    const observation = count ? await db.config.findUnique({ where: { storeId_key: { storeId, key: COUNT_OBSERVATION_PREFIX + count.id } } }) : null
    let unitMatches = false
    try {
      const evidence = observation && JSON.parse(observation.value)
      unitMatches = !!evidence && [1, 2, 3, 4].includes(evidence.version) && evidence.ledgerUnit === i.unit && evidence.countId === count.inventoryCountId &&
        evidence.countedQty === count.countedQty && evidence.observedAt === count.countedAt.toISOString()
    } catch { /* Invalid evidence remains unknown. */ }
    const validCount = count && unitMatches && count.countedAt <= now
    const arrivals = await db.purchaseOrderItem.findMany({ where: { inventoryId: i.id, purchaseOrder: {
      storeId, status: { in: ['approved', 'awaiting_receipt'] } } }, orderBy: { id: 'asc' },
      select: { quantity: true, receivedQty: true, purchaseOrder: { select: { expectedDate: true } } } })
    const pendingArrivals = arrivals.filter((v: any) => v.quantity > v.receivedQty).map((v: any) => ({
      quantity: Math.max(0, v.quantity - v.receivedQty), expectedAt: v.purchaseOrder.expectedDate?.toISOString() || null }))
    const quality: string[] = []
    if (!validCount) quality.push('no_valid_count')
    else if (calendar.dayCount(count.countedAt, now) > p.maxCountAgeDays) quality.push('count_stale')
    if (pendingArrivals.some((v: any) => !v.expectedAt)) quality.push('arrival_date_unknown')
    if (![i.currentStock, i.minStock, i.safetyStock].every(Number.isFinite) || !i.unit.trim()) inspectionFail('INSPECTION_INVALID_STOCK_DATA')
    if (i.currentStock < 0) quality.push('negative_stock')
    if (i.currentStock <= Math.max(i.minStock, i.safetyStock)) quality.push('below_threshold')
    quality.push('bulk_issue_usage_not_daily_consumption')
    items.push({ inventoryId: i.id, name: i.name, unit: i.unit, quantity: i.currentStock,
      minStock: i.minStock, safetyStock: i.safetyStock, updatedAt: i.updatedAt.toISOString(),
      ledgerSequence: String(i.ledgerSequence), ledgerEpoch: String(i.ledgerEpoch),
      lastValidCount: validCount ? { countId: count.inventoryCountId, countedAt: count.countedAt.toISOString(), quantity: count.countedQty } : null,
      pendingArrivals, quality })
  }
  const data = { schema: 'packaging.inspection.snapshot.v1', storeId, businessDate: calendar.formatDate(now), timezone: calendar.timezone, items }
  return { ...data, capturedAt: now.toISOString(), hash: inspectionHash(data) }
}
export async function inspectionCurrent(db: any, storeId: string, job: any, now: Date, checkSnapshot = true) {
  const p: InspectionPolicy = await readTeam(db, storeId, 'inspection.policy')
  if (!p || inspectionHash(p) !== job.policyHash) inspectionFail('INSPECTION_POLICY_CHANGED')
  await inspectionScope(db, storeId, p)
  if (checkSnapshot) {
    await inspectionAiReady(db, storeId, p)
    const elapsed = now.getTime() - Date.parse(job.snapshot.capturedAt)
    if (elapsed < 0 || elapsed > p.snapshotMaxAgeMinutes * 60000) inspectionFail('INSPECTION_SNAPSHOT_EXPIRED')
    if ((await packagingSnapshot(db, storeId, p, now)).hash !== job.snapshot.hash) inspectionFail('INSPECTION_SNAPSHOT_CHANGED')
  }
  return p
}
export async function inspectionAiReady(db: any, storeId: string, p: InspectionPolicy) {
  const config = await readTeam(db, storeId, 'ai.settings')
  const connection = config && await readAiConnection(db, storeId, config)
  if (!config?.enabled || !config.secret || config.version !== p.aiConfigVersion || connection?.status !== 'ready' ||
      connection.checkRevision !== p.aiCheckRevision) inspectionFail('INSPECTION_AI_CONNECTION_CHANGED')
}
