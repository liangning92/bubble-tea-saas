import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { dailyNightHandoverIds } from '../utils/dailyOnlineRevenue'
import { businessCalendarDate } from '../utils/revenueDateRange'
export const manualReceiptsSchema = z.object({cash:z.number().int().min(0).max(2147483647),qris:z.number().int().min(0).max(2147483647),shopeefood:z.number().int().min(0).max(2147483647),gofood:z.number().int().min(0).max(2147483647)}).strict()
export async function loadManualReceipts(db: Pick<PrismaClient, 'config'>, storeId: string, sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, z.infer<typeof manualReceiptsSchema>>()
  const records = await db.config.findMany({where:{storeId,key:{in:sessionIds.map(id=>'pos.shift.report:'+id)}},select:{key:true,value:true}})
  const result = new Map<string, z.infer<typeof manualReceiptsSchema>>()
  for (const row of records) {
    try { const parsed = manualReceiptsSchema.safeParse(JSON.parse(row.value).manualReceipts); if (parsed.success) result.set(row.key.slice('pos.shift.report:'.length), parsed.data) } catch {}
  }
  return result
}
export async function getHandoverReceipts(db: Pick<PrismaClient, 'config' | 'shiftSession' | 'shift'>, storeId: string, start: Date, end: Date,timezone='Asia/Jakarta') {
  const sessions = await db.shiftSession.findMany({where:{storeId,status:'closed',closedAt:{gte:start,lte:end}},select:{id:true,shift:true,openedAt:true,closedAt:true,actualCash:true,openFloat:true},orderBy:{closedAt:'desc'}})
  const receipts = await loadManualReceipts(db, storeId, sessions.map(s=>s.id))
  const basisRecords = sessions.length ? await db.config.findMany({where:{storeId,key:{in:sessions.map(s=>'pos.shift.report:'+s.id)}},select:{key:true,value:true}}) : []
  const bases = new Map(basisRecords.flatMap(r=>{try{return [[r.key.slice('pos.shift.report:'.length),JSON.parse(r.value).manualReceiptsCashBasis] as const]}catch{return []}}))
  const definitions=await db.shift.findMany({where:{storeId},select:{key:true,name:true,nameZh:true,nameId:true,startTime:true}})
  const nightlyIds=dailyNightHandoverIds(sessions,definitions,timezone)
  const list = sessions.map(s=>({...s,definition:definitions.find(d=>d.key===s.shift)||null,
    actualCashReceived:s.actualCash===null ? null : s.actualCash-s.openFloat,
    onlineRevenueCounted:nightlyIds.has(s.id),
    manualReceipts:receipts.get(s.id) || null,manualReceiptsCashBasis:bases.get(s.id) || 'cash_receipts'}))
  const totals = {cash:0,qris:0,shopeefood:0,gofood:0}
  for (const row of list) if (row.manualReceipts) {
    totals.cash+=row.manualReceipts.cash
    totals.qris+=row.manualReceipts.qris
    if(row.onlineRevenueCounted) {totals.shopeefood+=row.manualReceipts.shopeefood;totals.gofood+=row.manualReceipts.gofood}
  }
  const incompleteCashShifts=list.filter(row=>row.actualCashReceived===null).length
  const actualCashReceived=incompleteCashShifts ? null : list.reduce((sum,row)=>sum+row.actualCashReceived!,0)
  return {list,totals,actualCashReceived,incompleteCashShifts,reportedShifts:receipts.size,unreportedShifts:sessions.length-receipts.size,
    range:{startDate:businessCalendarDate(start,timezone),endDate:businessCalendarDate(end,timezone)},
    source:'manual_handover',onlineRevenueBasis:'daily_night_handover',dateBasis:'closedAt',timezone}
}
