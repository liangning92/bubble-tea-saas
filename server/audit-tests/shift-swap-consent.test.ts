import { beforeEach, expect, jest, test } from '@jest/globals'
import express from 'express'

const mockDb: any = {
  staff: { findMany: jest.fn(), findUnique: jest.fn() },
  shiftSwap: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  shift: { findMany: jest.fn() },
  schedule: { updateMany: jest.fn() }, $transaction: jest.fn()
}
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))
jest.mock('../src/middlewares/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'user', staffId: req.headers['x-staff'] || 'A', storeId: req.headers['x-store'] || 'store', role: req.headers['x-role'] || 'staff' }; next() },
  authorize: () => (req: any, res: any, next: any) => req.user.role === 'admin' ? next() : res.sendStatus(403)
}))
jest.mock('../src/middlewares/resourceStore', () => ({ requireResourceStore: () => (_req: any, _res: any, next: any) => next() }))
jest.mock('../src/services/EmployeeAttendanceService', () => ({ snapshotAttendance: jest.fn(), reconcileLate: jest.fn() }))
jest.mock('../src/services/StaffConfigService', () => ({ isFeatureEnabled: jest.fn(() => false) }))
import { shiftSwapRouter } from '../src/routes/staffCorrection'
import { staffPermissionForRequest } from '../src/services/StaffPermissionCatalog'
// Invoke the actual Express middleware stack without binding a socket or database.
function request(_app: any) {
  const build = (method: string, path: string) => {
    const headers: any = {}; let body: any = {}
    const run = async () => {
      const layer = (shiftSwapRouter as any).stack.find((l: any) => l.route?.methods[method.toLowerCase()] && l.match(path.replace(/^\/shift-swap/, '') || '/'))
      if (!layer) throw new Error('Missing route')
      const req: any = { method, path, headers, body, query: {}, params: layer.params }
      let status = 200, result: any, sent = false
      const res: any = { status(code: number) { status = code; return this }, json(data: any) { result = data; sent = true; return this }, sendStatus(code: number) { status = code; sent = true; return this } }
      for (const middleware of layer.route.stack) {
        let next = false
        await middleware.handle(req, res, (error?: Error) => { if (error) throw error; next = true })
        if (sent || !next) break
      }
      return { status, body: result }
    }
    const chain: any = { set(key: string, value: string) { headers[key] = value; return chain }, send(value: any) { body = value; return run() }, then(resolve: any, reject: any) { return run().then(resolve, reject) } }
    return chain
  }
  return { get: (path: string) => build('GET', path), post: (path: string) => build('POST', path), put: (path: string) => build('PUT', path) }
}
const app = express(); app.use(express.json()); app.use('/shift-swap', shiftSwapRouter)
const version = '2026-10-18T10:00:00.000Z'
const swap = { id: 'swap', staffId: 'A', targetStaffId: 'B', storeId: 'store', status: 'pending', targetConfirmed: false, updatedAt: new Date(version), originalDate: new Date('2026-10-20T00:00:00+07:00'), targetDate: new Date('2026-10-21T00:00:00+07:00'), originalShift: 'morning', targetShift: 'evening' }
beforeEach(() => {
  jest.clearAllMocks()
  mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb))
  mockDb.shiftSwap.findUnique.mockResolvedValue({ ...swap })
  mockDb.shiftSwap.findUniqueOrThrow.mockResolvedValue({ ...swap })
  mockDb.shiftSwap.findMany.mockResolvedValue([])
  mockDb.shiftSwap.updateMany.mockResolvedValue({ count: 1 })
  mockDb.schedule.updateMany.mockResolvedValue({ count: 1 })
  mockDb.shift.findMany.mockResolvedValue([])
  mockDb.staff.findMany.mockResolvedValue([])
  mockDb.staff.findUnique.mockResolvedValue({ id: 'B', storeId: 'store', status: 'active' })
})
test('colleague picker is available through personal schedule permission', () => {
  expect(staffPermissionForRequest('GET', '/shift-swap/colleagues')).toBe('personal.schedule')
})
test('new mutual swaps require a colleague', async () => {
  const result = await request(app).post('/shift-swap').send({ originalDate: '2026-10-20', targetDate: '2026-10-21', originalShift: 'morning', targetShift: 'evening' })
  expect(result.status).toBe(400); expect(mockDb.shiftSwap.create).not.toHaveBeenCalled()
})
test.each([{ id: 'A', storeId: 'store', status: 'active' }, { id: 'B', storeId: 'other', status: 'active' }, { id: 'B', storeId: 'store', status: 'resigned' }])('rejects invalid colleague %p', async target => {
  mockDb.staff.findUnique.mockResolvedValue(target)
  const result = await request(app).post('/shift-swap').send({ originalDate: '2026-10-20', targetDate: '2026-10-21', originalShift: 'morning', targetShift: 'evening', targetStaffId: target.id })
  expect(result.status).toBe(400); expect(mockDb.shiftSwap.create).not.toHaveBeenCalled()
})
test.each(['approve', 'reject'])('admin cannot %s before colleague agrees even when old configuration disabled confirmation', async action => {
  if (action === 'reject') mockDb.shiftSwap.updateMany.mockResolvedValue({ count: 0 })
  const result = await request(app).put(`/shift-swap/swap/${action}`).set('x-role', 'admin').send({})
  // Reject atomically enforces the condition, while approve checks the snapshot first.
  if (action === 'reject') {
    expect(result.status).toBe(409)
    expect(mockDb.shiftSwap.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pending', targetConfirmed: true }) }))
  } else { expect(result.status).toBe(409); expect(mockDb.schedule.updateMany).not.toHaveBeenCalled() }
})
test('B agreement is conditional on the exact revision and never changes schedules', async () => {
  const result = await request(app).put('/shift-swap/swap/confirm').set('x-staff', 'B').send({ agree: true, expectedVersion: version })
  expect(result.status).toBe(200)
  expect(mockDb.shiftSwap.updateMany).toHaveBeenCalledWith({ where: { id: 'swap', storeId: 'store', targetStaffId: 'B', status: 'pending', targetConfirmed: false, updatedAt: new Date(version) }, data: { targetConfirmed: true } })
  expect(mockDb.schedule.updateMany).not.toHaveBeenCalled()
})
test('B disagreement ends the process without admin review or schedule changes', async () => {
  const result = await request(app).put('/shift-swap/swap/confirm').set('x-staff', 'B').send({ agree: false, expectedVersion: version })
  expect(result.status).toBe(200)
  expect(mockDb.shiftSwap.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'peer_rejected' } }))
  expect(mockDb.schedule.updateMany).not.toHaveBeenCalled()
})
test.each([{ staff: 'A', store: 'store' }, { staff: 'B', store: 'other' }])('only B from this store may respond: %p', async actor => {
  const result = await request(app).put('/shift-swap/swap/confirm').set('x-staff', actor.staff).set('x-store', actor.store).send({ agree: true, expectedVersion: version })
  expect(result.status).toBe(403); expect(mockDb.shiftSwap.updateMany).not.toHaveBeenCalled()
})
test('stale and duplicate responses cannot overwrite another decision', async () => {
  mockDb.shiftSwap.updateMany.mockResolvedValue({ count: 0 })
  expect((await request(app).put('/shift-swap/swap/confirm').set('x-staff', 'B').send({ agree: true, expectedVersion: version })).status).toBe(409)
})
test('both A and B histories are scoped to this store', async () => {
  await request(app).get('/shift-swap/my').set('x-staff', 'B')
  expect(mockDb.shiftSwap.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store', OR: [{ staffId: 'B' }, { targetStaffId: 'B' }] } }))
})
test('admin queue excludes pending invitations without agreement', async () => {
  await request(app).get('/shift-swap').set('x-role', 'admin')
  expect(mockDb.shiftSwap.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ status: { not: 'pending' } }, { targetConfirmed: true }] }) }))
})
test('final approval conditionally claims the agreed revision and exchanges both schedules in a transaction', async () => {
  mockDb.shiftSwap.findUnique.mockResolvedValue({ ...swap, targetConfirmed: true })
  expect((await request(app).put('/shift-swap/swap/approve').set('x-role', 'admin').send({})).status).toBe(200)
  expect(mockDb.shiftSwap.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ targetConfirmed: true, updatedAt: new Date(version) }) }))
  expect(mockDb.schedule.updateMany).toHaveBeenCalledTimes(2)
  expect(mockDb.schedule.updateMany.mock.calls[0][0]).toMatchObject({ where: { staffId: 'A' }, data: { shift: 'evening' } })
  expect(mockDb.schedule.updateMany.mock.calls[1][0]).toMatchObject({ where: { staffId: 'B' }, data: { shift: 'morning' } })
})
test('missing schedule reports conflict, leaving the transaction to roll back', async () => {
  mockDb.shiftSwap.findUnique.mockResolvedValue({ ...swap, targetConfirmed: true }); mockDb.schedule.updateMany.mockResolvedValue({ count: 0 })
  expect((await request(app).put('/shift-swap/swap/approve').set('x-role', 'admin').send({})).status).toBe(409)
})
