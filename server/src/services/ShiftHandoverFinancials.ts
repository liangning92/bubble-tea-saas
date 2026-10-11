import { PrismaClient } from '@prisma/client'
import { manualReceiptsSchema } from './ShiftManualReceipts'
export function shiftHandoverFinancials(drawerTotal:number|null, openFloat:number, expenses:number, qris:number|null, shopeefood:number, gofood:number, orderRevenue:number) {
  return {drawerTotal,openFloat,expenses,qris,shopeefood,gofood,orderRevenue,
    actualCashReceived:drawerTotal === null || qris === null ? null : drawerTotal-expenses-openFloat-qris,
    totalRevenue:orderRevenue+shopeefood+gofood,
    cashFormula:'drawerTotal-expenses-openFloat-qris', revenueFormula:'orderRevenue+shopeefood+gofood'}
}
export async function loadOnlineHandoverRevenue(db:Pick<PrismaClient,'shiftSession'|'config'>,storeId:string,start:Date,end:Date) {
  const sessions=await db.shiftSession.findMany({where:{storeId,status:'closed',closedAt:{gte:start,lte:end}},select:{id:true,closedAt:true}})
  if (!sessions.length) return []
  const records=await db.config.findMany({where:{storeId,key:{in:sessions.map(s=>'pos.shift.report:'+s.id)}},select:{key:true,value:true}})
  const byId=new Map(records.map(r=>[r.key.slice('pos.shift.report:'.length),r.value]))
  return sessions.flatMap(s=>{
    const value=byId.get(s.id)
    if (!value) return []
    const report=JSON.parse(value), parsed=manualReceiptsSchema.safeParse(report.manualReceipts)
    if (!parsed.success) return []
    return [{sessionId:s.id,closedAt:s.closedAt!,shopeefood:parsed.data.shopeefood,gofood:parsed.data.gofood}]
  })
}
