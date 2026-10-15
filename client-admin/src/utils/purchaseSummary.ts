import { storeCalendarDate } from './storeDateTime'
// Procurement totals are order values, independent of payment confirmation and list filters.
export function summarizePurchases(orders: Array<{status:string;totalAmount:number;createdAt:string}>, today:string, timezone:string) {
  let awaiting=0, todayAmount=0, monthAmount=0
  for (const order of orders) {
    if (['pending','approved','awaiting_receipt'].includes(order.status)) awaiting++
    if (order.status==='cancelled') continue
    const date=storeCalendarDate(order.createdAt,timezone)
    if (date===today) todayAmount+=order.totalAmount
    if (date.slice(0,7)===today.slice(0,7)) monthAmount+=order.totalAmount
  }
  return {awaiting,todayAmount,monthAmount}
}
