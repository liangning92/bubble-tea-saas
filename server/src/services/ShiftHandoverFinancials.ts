import { PrismaClient } from '@prisma/client'
import { getHandoverReceipts } from './ShiftManualReceipts'
export function shiftHandoverFinancials(drawerTotal:number|null, openFloat:number, expenses:number, qris:number|null, shopeefood:number, gofood:number, orderRevenue:number) {
  return {drawerTotal,openFloat,expenses,qris,shopeefood,gofood,orderRevenue,
    // Counted drawer cash already excludes QRIS and cash spent during the shift.
    actualCashReceived:drawerTotal === null ? null : drawerTotal-openFloat,
    totalRevenue:orderRevenue+shopeefood+gofood,
    cashFormula:'drawerTotal-openFloat', revenueFormula:'orderRevenue+shopeefood+gofood'}
}
export async function loadOnlineHandoverRevenue(db:Pick<PrismaClient,'shiftSession'|'config'|'shift'>,storeId:string,start:Date,end:Date,timezone='Asia/Jakarta') {
  const {list}=await getHandoverReceipts(db,storeId,start,end,timezone)
  return list.filter(row=>row.onlineRevenueCounted && row.manualReceipts).map(row=>({
    sessionId:row.id,closedAt:row.closedAt!,shopeefood:row.manualReceipts!.shopeefood,gofood:row.manualReceipts!.gofood
  }))
}
