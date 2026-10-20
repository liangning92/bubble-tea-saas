import { createHash } from 'crypto'
import prisma from '../config/database'
import { TeamError } from './TeamCommunicationService'
import { readWork, writeWork, workLock } from './EmployeeWorkspaceStore'

interface DeviceActor { id: string; storeId: string; staffId?: string; issuedAtMs?: number }
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const fail = (status: number, code: string): never => { throw new TeamError(status, code) }

// "sent" is the push provider's acceptance, never evidence of device arrival.
export function reminderDeliveryView(r: any) {
  const push = r.status === 'sent' ? 'service_accepted' : r.status === 'partially_sent' ? 'partial'
    : r.status === 'delivery_failed' ? 'failed' : r.status === 'pending' ? 'queued'
      : r.status === 'in_app' ? 'not_confirmed' : 'not_attempted'
  return { inApp: true, push, device: 'unknown' as const, read: r.read === true }
}

export function employeePushDevice(db: any = prisma, clock: () => Date = () => new Date()) {
  async function identity(actor: DeviceActor, tx = db) {
    const user = await tx.user.findUnique({ where: { id: actor.id }, include: { staff: true } })
    if (!user?.staff || user.staff.status !== 'active' || user.staff.id !== actor.staffId ||
        user.staff.userId !== user.id || user.staff.storeId !== actor.storeId ||
        user.storeId && user.storeId !== actor.storeId ||
        !Number.isFinite(actor.issuedAtMs) || user.updatedAt.getTime() > actor.issuedAtMs!) fail(403, 'PUSH_DEVICE_IDENTITY_REQUIRED')
    return { id: user.id, staffId: user.staff.id, storeId: actor.storeId, issuedAtMs: actor.issuedAtMs! }
  }
  async function configuration(storeId: string, tx = db) {
    const keys = await readWork(storeId, 'push-keys', tx)
    return { configured: typeof keys?.publicKey === 'string' && !!keys.publicKey && typeof keys?.privateKey === 'string' && !!keys.privateKey,
      publicKey: typeof keys?.publicKey === 'string' ? keys.publicKey : null }
  }
  async function subscription(a: Awaited<ReturnType<typeof identity>>, id?: string, tx = db) {
    const s = id ? await readWork(a.storeId, `subscription.${id}`, tx) : null
    if (!s || s.staffId !== a.staffId || s.userId !== a.id) return { state: 'not_registered' as const }
    const user = await tx.user.findUnique({ where: { id: a.id }, select: { updatedAt: true } })
    const state = !s.active ? 'inactive' : !Number.isFinite(s.issuedAtMs) || s.issuedAtMs < user.updatedAt.getTime() ? 'stale' : 'ready'
    return { state, updatedAt: s.updatedAt || null }
  }
  async function testView(a: Awaited<ReturnType<typeof identity>>, subscriptionId: string, testId: string, tx = db) {
    const t = await readWork(a.storeId, `push-device.test.${testId}`, tx)
    if (!t || t.userId !== a.id || t.staffId !== a.staffId || t.subscriptionId !== subscriptionId) return null
    const [r, d] = await Promise.all([
      readWork(a.storeId, `reminder.${a.staffId}.${t.reminderId}`, tx),
      readWork(a.storeId, `delivery.${t.reminderId}.${subscriptionId}`, tx)
    ])
    return { id: t.id, createdAt: t.createdAt, status: r?.status || 'pending', push: d?.status === 'sent' ? 'service_accepted' : reminderDeliveryView(r || {}).push,
      serviceAcceptedAt: d?.status === 'sent' ? d.sentAt : null, attempts: d?.attempts || 0,
      // These are authenticated reports from the local service worker, not a human read receipt.
      deviceReportedDisplayedAt: t.deviceReportedDisplayedAt || null, deviceReportedOpenedAt: t.deviceReportedOpenedAt || null }
  }
  return {
    async config(actor: DeviceActor) { const a = await identity(actor); return configuration(a.storeId) },
    async check(actor: DeviceActor, input: { subscriptionId?: string; testId?: string }) {
      const a = await identity(actor), config = await configuration(a.storeId), s = await subscription(a, input.subscriptionId)
      const last = input.subscriptionId && await readWork(a.storeId, `push-device.last.${a.id}.${input.subscriptionId}`, db)
      const id = input.testId || last?.testId
      return { configured: config.configured, subscription: s,
        test: input.subscriptionId && id ? await testView(a, input.subscriptionId, id) : null }
    },
    async createTest(actor: DeviceActor, input: { subscriptionId: string; requestId: string }) {
      return db.$transaction(async (tx: any) => {
        const a = await identity(actor, tx), id = hash(`${a.id}:${input.requestId}`), key = `push-device.test.${id}`
        await workLock(a.storeId, `push-device.rate.${a.id}`, tx)
        const existing = await readWork(a.storeId, key, tx)
        if (existing) {
          if (existing.userId !== a.id || existing.staffId !== a.staffId || existing.subscriptionId !== input.subscriptionId) fail(409, 'PUSH_TEST_REQUEST_CHANGED')
          return { id, createdAt: existing.createdAt, repeated: true }
        }
        if (!(await configuration(a.storeId, tx)).configured) fail(409, 'PUSH_NOT_CONFIGURED')
        if ((await subscription(a, input.subscriptionId, tx)).state !== 'ready') fail(409, 'PUSH_DEVICE_RECONNECT')
        const last = await readWork(a.storeId, `push-device.rate.${a.id}`, tx), now = clock()
        if (last?.createdAt && now.getTime() - Date.parse(last.createdAt) < 60000) fail(429, 'PUSH_TEST_COOLDOWN')
        const createdAt = now.toISOString(), event = `push-test:${id}`, reminderId = hash(`${a.staffId}:${event}`)
        await writeWork(a.storeId, key, { id, userId: a.id, staffId: a.staffId, subscriptionId: input.subscriptionId,
          reminderId, createdAt, requestedByUserId: a.id, requestedByStaffId: a.staffId }, tx)
        await writeWork(a.storeId, `push-device.rate.${a.id}`, { testId: id, createdAt }, tx)
        await writeWork(a.storeId, `push-device.last.${a.id}.${input.subscriptionId}`, { testId: id }, tx)
        await writeWork(a.storeId, `reminder.${a.staffId}.${reminderId}`, {
          id: reminderId, staffId: a.staffId, userId: a.id, event, title: 'YOUME — Tes notifikasi',
          url: `/profile?pushTest=${id}`, createdAt, expiresAt: new Date(now.getTime() + 300000).toISOString(),
          read: false, status: 'pending', pushTest: { testId: id, subscriptionId: input.subscriptionId, userId: a.id }
        }, tx)
        // Reuse the existing committed pending scan. No new process or transport.
        await writeWork(a.storeId, 'notification.chat.pending', { eventId: reminderId }, tx)
        return { id, createdAt, repeated: false }
      })
    },
    async receipt(actor: DeviceActor, id: string, input: { subscriptionId: string; phase: 'displayed' | 'opened' }) {
      return db.$transaction(async (tx: any) => {
        const a = await identity(actor, tx), key = `push-device.test.${id}`
        await workLock(a.storeId, key, tx)
        const test = await readWork(a.storeId, key, tx)
        if (!test || test.userId !== a.id || test.staffId !== a.staffId || test.subscriptionId !== input.subscriptionId) fail(404, 'PUSH_TEST_NOT_FOUND')
        if (clock().getTime() - Date.parse(test.createdAt) > 86400000) fail(410, 'PUSH_TEST_EXPIRED')
        const field = input.phase === 'displayed' ? 'deviceReportedDisplayedAt' : 'deviceReportedOpenedAt'
        if (!test[field]) await writeWork(a.storeId, key, { ...test, [field]: clock().toISOString() }, tx)
        return { recorded: true }
      })
    }
  }
}
