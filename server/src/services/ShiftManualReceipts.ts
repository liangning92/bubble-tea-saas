import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
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
export async function getHandoverReceipts(db: Pick<PrismaClient, 'config' | 'shiftSession'>, storeId: string, start: Date, end: Date) {
  const sessions = await db.shiftSession.findMany({where:{storeId,status:'closed',closedAt:{gte:start,lt:end}},select:{id:true,shift:true,closedAt:true},orderBy:{closedAt:'desc'}})
  const receipts = await loadManualReceipts(db, storeId, sessions.map(s=>s.id))
  const list = sessions.map(s=>({...s,manualReceipts:receipts.get(s.id) || null}))
  const totals = {cash:0,qris:0,shopeefood:0,gofood:0}
  for (const row of list) if (row.manualReceipts) for (const key of ['cash','qris','shopeefood','gofood'] as const) totals[key] += row.manualReceipts[key]
  return {list,totals,reportedShifts:receipts.size,unreportedShifts:sessions.length-receipts.size,source:'manual_handover',dateBasis:'closedAt',timezone:'Asia/Jakarta'}
}
