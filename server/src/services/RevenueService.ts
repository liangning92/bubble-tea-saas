import { DEFAULT_TIMEZONE, calendarParts } from '../utils/storeDateSettings'
import { loadOnlineHandoverRevenue } from './ShiftHandoverFinancials'
import {netReceivedAmount} from '../utils/refundAllocation'
import {requireVerifiedReceiptIncome} from './ReceiptFinancialEvidenceService'
import prisma from '../config/database'
import { RECEIVED_RECEIPT_PREFIX } from './ReceivedReceiptService'
import { orderRequestFingerprint } from './OrderReplayService'
import { RevenueDateError, businessCalendarDate } from '../utils/revenueDateRange'

// Channel revenue by date range
export async function getRevenueByChannel(storeId: string, startDate: Date, endDate: Date,timezone=DEFAULT_TIMEZONE) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: { in: ['completed', 'paid'] },
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    include: { channel: true, refundRequests: {where:{status:{in:['approved','paid']}}} }
  })

  await requireVerifiedReceiptIncome(orders)

  // Group by channel
  const channelMap: Record<string, { revenue: number; orders: number }> = {}

  for (const order of orders) {
    const channelName = order.channel?.name || order.channelId || 'POS'
    if (!channelMap[channelName]) {
      channelMap[channelName] = { revenue: 0, orders: 0 }
    }
    channelMap[channelName].revenue += netReceivedAmount(order)
    channelMap[channelName].orders += 1
  }

  const handovers=await loadOnlineHandoverRevenue(prisma,storeId,startDate,endDate,timezone)
  for (const key of ['shopeefood','gofood'] as const) {
    const amount=handovers.reduce((sum,row)=>sum+row[key],0)
    if (amount) channelMap[key+'_manual']={revenue:amount,orders:0}
  }
  return Object.entries(channelMap).map(([channel, data]) => ({
    channel,
    revenue: data.revenue,
    orders: data.orders,
    avgOrderValue: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0
  }))
}

// Get revenue summary by time period
export async function getRevenueSummary(storeId: string, startDate: Date, endDate: Date,timezone=DEFAULT_TIMEZONE) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: { in: ['completed', 'paid'] },
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    include:{refundRequests:{where:{status:{in:['approved','paid']}}}}
  })

  await requireVerifiedReceiptIncome(orders)
  const orderRevenue = orders.reduce((sum, o) => sum + netReceivedAmount(o), 0)
  const handovers=await loadOnlineHandoverRevenue(prisma,storeId,startDate,endDate,timezone)
  const shopeefood=handovers.reduce((sum,row)=>sum+row.shopeefood,0)
  const gofood=handovers.reduce((sum,row)=>sum+row.gofood,0)
  const totalRevenue = orderRevenue+shopeefood+gofood
  const totalOrders = orders.length
  const avgOrderValue = totalOrders > 0 ? Math.round(orderRevenue / totalOrders) : 0

  return {
    revenue: totalRevenue,
    orderRevenue,shopeefood,gofood,onlineDateBasis:'closedAt',
    orders: totalOrders,
    avgOrderValue
  }
}

// Compare revenue between two periods
export async function compareRevenue(storeId: string, currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date,timezone=DEFAULT_TIMEZONE) {
  const [current, previous] = await Promise.all([
    getRevenueSummary(storeId, currentStart, currentEnd,timezone),
    getRevenueSummary(storeId, previousStart, previousEnd,timezone)
  ])

  const revenueChange = previous.revenue > 0
    ? ((current.revenue - previous.revenue) / previous.revenue) * 100
    : 0
  const ordersChange = previous.orders > 0
    ? ((current.orders - previous.orders) / previous.orders) * 100
    : 0

  return {
    current,
    previous,
    revenueChange: Math.round(revenueChange * 10) / 10,
    ordersChange: Math.round(ordersChange * 10) / 10
  }
}

// Get daily revenue trend
export async function getDailyRevenue(storeId: string, startDate: Date, endDate: Date,timezone=DEFAULT_TIMEZONE) {
  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: { in: ['completed', 'paid'] },
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    include:{refundRequests:{where:{status:{in:['approved','paid']}}}}
  })

  await requireVerifiedReceiptIncome(orders)

  // Group by date
  const dailyMap: Record<string, { revenue: number; orders: number }> = {}

  for (const order of orders) {
    const dateStr = businessCalendarDate(order.createdAt,timezone)
    if (!dailyMap[dateStr]) {
      dailyMap[dateStr] = { revenue: 0, orders: 0 }
    }
    dailyMap[dateStr].revenue += netReceivedAmount(order)
    dailyMap[dateStr].orders += 1
  }

  const handovers=await loadOnlineHandoverRevenue(prisma,storeId,startDate,endDate,timezone)
  const orderDaily=new Map(Object.entries(dailyMap).map(([day,value])=>[day,value.revenue]))
  for (const row of handovers) {
    const day=businessCalendarDate(row.closedAt,timezone)
    dailyMap[day] ||= {revenue:0,orders:0}
    dailyMap[day].revenue += row.shopeefood+row.gofood
  }
  return Object.entries(dailyMap)
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
      avgOrderValue: data.orders > 0 ? Math.round((orderDaily.get(date) || 0) / data.orders) : 0
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Visits are independent of refund amounts; a completed/refunded purchase still occurred.
export async function getPurchaseHours(storeId: string, startDate: Date, endDate: Date,timezone=DEFAULT_TIMEZONE,filters:{paymentMethod?:string;channelId?:string}={}) {
  const startDay = businessCalendarDate(startDate,timezone)
  const endDay = businessCalendarDate(endDate,timezone)
  const first = Date.parse(`${startDay}T00:00:00Z`)
  const count = Math.round((Date.parse(`${endDay}T00:00:00Z`) - first) / 86400000) + 1
  if (count > 366) throw new RevenueDateError('Purchase analysis supports up to 366 calendar days')
  const days = Array.from({ length: count }, (_, index) => ({ date: new Date(first + index * 86400000).toISOString().slice(0, 10), customers: 0, orders: 0,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, customers: 0, orders: 0 })) }))
  const byDay = new Map(days.map(day => [day.date, day]))
  // The protected cashier receipt retains actual sale time when upload was delayed.
  const receiptRows = await prisma.config.findMany({ where: { storeId, key: { startsWith: RECEIVED_RECEIPT_PREFIX } }, select: { key: true, value: true } })
  const receipts = new Map<string, { at: Date; fingerprint: string; amount: number }>()
  for (const row of receiptRows) {
    const receipt = JSON.parse(row.value).receipt
    const at = new Date(receipt.occurredAt)
    if (!Number.isFinite(at.getTime()) || row.key !== RECEIVED_RECEIPT_PREFIX + receipt.orderNumber) throw new Error('PURCHASE_RECEIPT_TIME_INVALID')
    receipts.set(receipt.orderNumber, { at, fingerprint: orderRequestFingerprint(receipt.request), amount: receipt.grandTotal })
  }
  const scope = {storeId,...(filters.paymentMethod?{paymentMethod:filters.paymentMethod}:{}),...(filters.channelId?{channelId:filters.channelId==='none'?null:filters.channelId}:{})}
  const select = { id: true, orderNumber: true, createdAt: true, customerCount: true, requestFingerprint: true, finalAmount: true }
  const status = { in: ['completed', 'paid', 'refunded'] }
  const orders = await prisma.order.findMany({ where: { ...scope, status, createdAt: { gte: startDate, lte: endDate } }, select })
  const known = new Set(orders.map(order => order.orderNumber))
  const delayed = [...receipts].filter(([number, receipt]) => !known.has(number) && receipt.at >= startDate && receipt.at <= endDate).map(([number]) => number)
  for (let offset = 0; offset < delayed.length; offset += 500) orders.push(...await prisma.order.findMany({ where: { ...scope, status, orderNumber: { in: delayed.slice(offset, offset + 500) } }, select }))
  for (const order of orders) {
    const receipt = receipts.get(order.orderNumber)
    const matched = receipt && receipt.fingerprint === order.requestFingerprint && receipt.amount === order.finalAmount
    const at = matched ? receipt.at : order.createdAt
    if (at < startDate || at > endDate) continue
    const day = byDay.get(businessCalendarDate(at,timezone))!
    const hour = calendarParts(at,timezone).hour
    const customers = order.customerCount > 0 ? order.customerCount : 1
    day.hours[hour].customers += customers
    day.hours[hour].orders += 1
    day.customers += customers
    day.orders += 1
  }
  return { timezone, startDate: startDay, endDate: endDay, totalCustomers: days.reduce((sum, day) => sum + day.customers, 0), totalOrders: days.reduce((sum, day) => sum + day.orders, 0), days }
}
