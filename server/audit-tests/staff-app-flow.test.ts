import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule: true, default: {
  staff: { findFirst: jest.fn() }, attendance: { findFirst: jest.fn() },
  schedule: { findMany: jest.fn() }, shift: { findMany: jest.fn() }, announcement: { findMany: jest.fn() }
} }))
jest.mock('../src/config/env', () => ({ config: { jwt: { secret: 'synthetic-test-only' } } }))
jest.mock('../src/middlewares/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
  authorize: () => (_req: any, _res: any, next: any) => next(),
  canAccessStore: (user: any, id: string) => user.role === 'admin' || user.storeId === id
}))
import prisma from '../src/config/database'
import { staffRouter } from '../src/routes/staff'
import announcementRouter from '../src/routes/announcement'
import { staffPermissionForRequest } from '../src/services/StaffPermissionCatalog'
const db = prisma as any
async function call(router: any, path: string, query = {}) {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.get)
  const req: any = { query, user: { id: 'user-demo', role: 'staff', storeId: 'store-demo', staffId: 'staff-demo' } }
  const res: any = { statusCode: 200, status(n: number) { this.statusCode = n; return this }, json(data: any) { this.data = data; return this } }
  for (const entry of layer.route.stack) { let next = false; await entry.handle(req, res, () => { next = true }); if (!next) break }
  return res
}
beforeEach(() => {
  jest.clearAllMocks()
  db.staff.findFirst.mockResolvedValue({ id: 'staff-demo', storeId: 'store-demo' })
  db.attendance.findFirst.mockResolvedValue(null)
  db.schedule.findMany.mockResolvedValue([])
  db.shift.findMany.mockResolvedValue([{ key: 'custom', name: 'Custom shift', startTime: '09:30', endTime: '17:30' }])
  db.announcement.findMany.mockResolvedValue([])
})
test('Monday and Sunday schedules retain custom shift keys and configured times across a full WIB week', async () => {
  db.schedule.findMany.mockResolvedValue([{ date: new Date('2026-10-04T17:00:00Z'), shift: 'custom' }, { date: new Date('2026-10-11T00:00:00Z'), shift: 'custom' }])
  const res = await call(staffRouter, '/schedule/my', { weekStart: '2026-10-05' })
  expect(res.statusCode).toBe(200)
  expect(res.data.data.monday).toBe('custom')
  expect(res.data.data.sunday).toBe('custom')
  expect(res.data.data.shiftDetails[0].startTime).toBe('09:30')
  expect(db.schedule.findMany.mock.calls[0][0].where.date).toEqual({ gte: new Date('2026-10-04T17:00:00Z'), lte: new Date('2026-10-11T16:59:59.999Z') })
})
test('invalid schedule date returns a useful 400 without database queries', async () => {
  const res = await call(staffRouter, '/schedule/my', { weekStart: '2026-02-30' })
  expect(res.statusCode).toBe(400)
  expect(db.schedule.findMany).not.toHaveBeenCalled()
})
test('today attendance reads latest own record within a complete WIB day', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-10T18:00:00Z'))
  try {
    await call(staffRouter, '/attendance/today')
    expect(db.attendance.findFirst.mock.calls[0][0]).toEqual({ where: { staffId: 'staff-demo', checkInTime: { gte: new Date('2026-10-10T17:00:00Z'), lte: new Date('2026-10-11T16:59:59.999Z') } }, orderBy: { checkInTime: 'desc' } })
  } finally { jest.useRealTimers() }
})
test('personal home and announcement reads require personal permissions', () => {
  expect(staffPermissionForRequest('GET', '/staff/overview/monthly')).toBe('personal.profile')
  expect(staffPermissionForRequest('GET', '/announcement/active')).toBe('personal.messages')
})
test('employee announcement query cannot select another store', async () => {
  const res = await call(announcementRouter, '/active', { storeId: 'other-store' })
  expect(res.statusCode).toBe(403)
  expect(db.announcement.findMany).not.toHaveBeenCalled()
})
