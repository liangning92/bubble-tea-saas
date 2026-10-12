import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule: true, default: { $transaction: jest.fn(), order: { findMany: jest.fn(), count: jest.fn() }, config: { findFirst: jest.fn() } } }))
jest.mock('../src/config/env', () => ({ config: { indonesia: { ppnRate: 0.11 } } }))
jest.mock('../src/services/ReferralService', () => ({ processOrderReferralRewards: jest.fn() }))
jest.mock('../src/services/PointsRuleService', () => ({ getOrCreatePointsRule: jest.fn(), calculatePoints: jest.fn() }))
import prisma from '../src/config/database'
import { getOrders, voidOrder } from '../src/services/OrderService'
import { getRevenueSummary } from '../src/services/RevenueService'
import { netReceivedAmount } from '../src/utils/refundAllocation'
const db = prisma as any
const sale = { id: 'o', orderNumber: 'ORD1', storeId: 'a', staffId: 's', paymentMethod: 'cash', finalAmount: 100, items: [], status: 'completed' }
let state: any, failAudit: boolean
beforeEach(() => {
  jest.clearAllMocks(); failAudit = false
  state = { status: 'completed', pending: false, approved: false, cash: [{ id: 'sale', amount: 100, shift: 'morning', createdAt: new Date('2026-10-01T03:00:00Z') }], audits: [] }
  db.config.findFirst.mockResolvedValue(null)
  db.$transaction.mockImplementation(async (fn: any) => {
    const draft = { ...state, cash: [...state.cash], audits: [...state.audits] }
    const tx = {
      order: {
        updateMany: async ({ where, data }: any) => { if (!where.status.in.includes(draft.status)) return { count: 0 }; draft.status = data.status; return { count: 1 } },
        findUnique: async () => ({ id: sale.id }), findUniqueOrThrow: async () => ({ ...sale, status: draft.status })
      },
      config: { findUnique: async () => null },
      refundRequest: { findFirst: async ({ where }: any) => where.status === 'pending' ? (draft.pending ? { id: 'pending' } : null) : (draft.approved ? { id: 'approved' } : null) },
      memberCoupon: { updateMany: async () => ({ count: 0 }) },
      cashEvent: { findMany: async () => [...draft.cash], create: async ({ data }: any) => { draft.cash.push(data) } },
      financeAuditLog: { create: async ({ data }: any) => { if (failAudit) throw Error('audit failure'); draft.audits.push(data) } }
      // No inventory/stock-log methods: any inventory mutation fails this test.
    }
    const result = await fn(tx); state = draft; return result
  })
})
test('void corrects original cash sale without a payout or ingredient mutation and retains audit', async () => {
  await voidOrder('o', 'test', 'System test', 'admin')
  expect(state.status).toBe('cancelled')
  expect(state.cash.reduce((n: number, r: any) => n + r.amount, 0)).toBe(0)
  expect(state.cash[1]).toMatchObject({ type: 'cash_sale', amount: -100, shift: 'morning', createdAt: state.cash[0].createdAt })
  expect(state.audits[0]).toMatchObject({ userId: 'admin', entityType: 'order', entityId: 'o' })
  expect(JSON.parse(state.audits[0].newValue)).toMatchObject({ reasonCode: 'test', inventoryAction: 'unchanged' })
  await expect(voidOrder('o', 'test', 'System test', 'admin')).rejects.toThrow('ORDER_ALREADY_REFUNDED')
  expect(state.cash).toHaveLength(2)
})
test('audit failure rolls back status and all effects', async () => {
  failAudit = true
  await expect(voidOrder('o', 'error', 'Duplicate', 'admin')).rejects.toThrow('audit failure')
  expect(state.status).toBe('completed'); expect(state.cash).toHaveLength(1); expect(state.audits).toHaveLength(0)
})
test.each(['pending', 'approved'])('orders with %s refunds cannot be voided', async flag => {
  state[flag] = true
  await expect(voidOrder('o', 'error', 'Duplicate', 'admin')).rejects.toThrow()
  expect(state.status).toBe('completed'); expect(state.cash).toHaveLength(1)
})
test('missing cash evidence rolls back void', async () => {
  state.cash = []
  await expect(voidOrder('o', 'test', 'Test', 'admin')).rejects.toThrow('VOID_CASH_EVIDENCE_REQUIRED')
  expect(state.status).toBe('completed'); expect(state.audits).toHaveLength(0)
})
test('default list excludes refunded and cancelled orders; explicit refund history remains available', async () => {
  db.order.findMany.mockResolvedValue([]); db.order.count.mockResolvedValue(0)
  await getOrders({ storeId: 'a' })
  expect(db.order.findMany.mock.calls[0][0].where.status).toEqual({ notIn: ['refunded', 'cancelled'] })
  expect(db.order.count.mock.calls[0][0].where.status).toEqual({ notIn: ['refunded', 'cancelled'] })
  await getOrders({ storeId: 'a', status: 'refunded' })
  expect(db.order.findMany.mock.calls[1][0].where.status).toBe('refunded')
})
test('partial refunds reduce revenue and displayed amounts; approved requests only', async () => {
  const partial = { ...sale, refundRequests: [{ status: 'approved', amount: 30 }, { status: 'pending', amount: 20 }] }
  db.order.findMany.mockResolvedValue([partial]); db.order.count.mockResolvedValue(1)
  expect((await getOrders({ storeId: 'a' })).list[0].netAmount).toBe(70)
  expect((await getRevenueSummary('a', new Date('2026-10-01'), new Date('2026-10-02'))).revenue).toBe(70)
  expect(netReceivedAmount({ ...partial, status: 'refunded' })).toBe(0)
  expect(netReceivedAmount({ ...partial, status: 'cancelled' })).toBe(0)
})
