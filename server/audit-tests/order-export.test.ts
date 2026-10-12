import { beforeEach, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule:true, default: { order:{findMany:jest.fn(),count:jest.fn()}, shiftSession:{findFirst:jest.fn(),findMany:jest.fn()} } }))
jest.mock('../src/config/env', () => ({config:{jwt:{secret:'synthetic-test-only'}}}))
import prisma from '../src/config/database'
import { getOrders } from '../src/services/OrderService'
const db=prisma as any
beforeEach(()=>{jest.clearAllMocks();db.order.findMany.mockResolvedValue([]);db.order.count.mockResolvedValue(0);db.shiftSession.findMany.mockResolvedValue([])})
test('combines store, historical product, payment, date, status and channel in database query',async()=>{
 await getOrders({storeId:'a',productName:'Tea',paymentMethod:'cash',status:'completed',channelId:'channel',startDate:'2026-10-12T00:00:00+07:00',endDate:'2026-10-12T23:59:59+07:00',page:2,pageSize:100})
 const q=db.order.findMany.mock.calls[0][0]
 expect(q.where).toMatchObject({storeId:'a',items:{some:{productName:{contains:'Tea'}}},paymentMethod:'cash',status:'completed',channelId:'channel'})
 expect(q.where.createdAt.gte.toISOString()).toBe('2026-10-11T17:00:00.000Z')
 expect(q.skip).toBe(100);expect(q.include.items).toBe(true)
 expect(q.orderBy).toEqual([{createdAt:'desc'},{id:'desc'}])
})
test('shift window excludes ambiguous overlap and retains independent time filter',async()=>{
 db.shiftSession.findFirst.mockResolvedValue({id:'s',storeId:'a',openedAt:new Date('2026-10-12T01:00Z'),closedAt:new Date('2026-10-12T09:00Z')})
 db.shiftSession.findMany.mockResolvedValue([{id:'other',openedAt:new Date('2026-10-12T08:00Z'),closedAt:new Date('2026-10-12T10:00Z')}])
 await getOrders({storeId:'a',shiftSessionId:'s',startDate:'2026-10-12T02:00Z'})
 expect(db.shiftSession.findFirst.mock.calls[0][0].where).toEqual({id:'s',storeId:'a'})
 const q=db.order.findMany.mock.calls[0][0]
 expect(q.where.AND).toHaveLength(2);expect(q.where.AND[1].NOT.createdAt.gte.toISOString()).toBe('2026-10-12T08:00:00.000Z')
 expect(q.where.createdAt.gte.toISOString()).toBe('2026-10-12T02:00:00.000Z')
})
test('foreign or missing shift fails before reading orders',async()=>{
 db.shiftSession.findFirst.mockResolvedValue(null)
 await expect(getOrders({storeId:'a',shiftSessionId:'foreign'})).rejects.toThrow('INVALID_ORDER_SHIFT')
 expect(db.order.findMany).not.toHaveBeenCalled()
})
