import {createHash} from 'crypto'
import {z} from 'zod'
import {formatDate,startOfDay,addDays} from '../../utils/dateUtils'

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)
export const stockOutQuerySchema=z.object({startDate:day.optional(),endDate:day.optional(),inventoryId:z.string().min(1).max(128).optional(),category:z.string().min(1).max(80).optional(),reason:z.string().min(1).max(80).optional()}).strict()
/** Caller must check the live grant and every recipient's inventory access.
 * Aggregate the complete native period in SQL; never call a recent-row preview a daily total. */
export async function employeeStockOutSummary(db:any,storeId:string,raw:unknown={},now=new Date()) {
 const input=stockOutQuerySchema.parse(raw),today=formatDate(now,'YYYY-MM-DD'),startDate=input.startDate||input.endDate||today,endDate=input.endDate||input.startDate||today
 if(startDate>endDate)throw Error('EMPLOYEE_STOCK_DATE_RANGE_INVALID')
 const start=new Date(startDate+'T00:00:00+07:00'),endExclusive=addDays(new Date(endDate+'T00:00:00+07:00'),1)
 const where={inventory:{storeId,...(input.category?{category:input.category}:{})},createdAt:{gte:start,lt:endExclusive},...(input.inventoryId?{inventoryId:input.inventoryId}:{}),...(input.reason?{reason:input.reason}:{})}
 const groups=await db.stockOutLog.groupBy({by:['inventoryId','reason'],where,_sum:{quantity:true},_count:{_all:true},_min:{createdAt:true},_max:{createdAt:true},orderBy:[{inventoryId:'asc'},{reason:'asc'}]})
 const ids=[...new Set(groups.map((r:any)=>r.inventoryId))],materials=ids.length?await db.inventory.findMany({where:{storeId,id:{in:ids}},select:{id:true,name:true,unit:true,category:true}}):[]
 const byId=new Map(materials.map((i:any)=>[i.id,i]))
 const items=groups.map((r:any)=>{const item:any=byId.get(r.inventoryId);if(!item)throw Error('EMPLOYEE_STOCK_SOURCE_CHANGED');return {inventoryId:item.id,name:item.name,unit:item.unit,category:item.category,reason:r.reason,sourceKind:['sale_estimate','sale_estimate_reversal'].includes(r.reason)?'recipe_sales_estimate':'recorded_stock_out',quantity:Number(r._sum.quantity||0),records:r._count._all,firstAt:r._min.createdAt.toISOString(),lastAt:r._max.createdAt.toISOString()}})
 const facts={timeZone:'Asia/Jakarta',asOf:now.toISOString(),startDate,endDate,startAt:start.toISOString(),endExclusive:endExclusive.toISOString(),complete:true,totalRecords:items.reduce((n:number,r:any)=>n+r.records,0),items,note:'Complete stock-out ledger totals for this period, grouped by material and reason. Recipe sales estimates are separately labelled; do not present estimates as employee withdrawals. Do not add quantities with different units. An empty result means no matching ledger records in this period, not missing permission or missing tools. This aggregate does not include operator or note fields; do not claim those fields are blank or infer physical shortages from book balances.'}
 return {...facts,fingerprint:createHash('sha256').update(JSON.stringify({...facts,asOf:undefined})).digest('hex')}
}

export function stockOutPeriodFromQuery(query:string,now=new Date()) {
 const days=query.match(/\d{4}-\d{2}-\d{2}/g)
 if(days?.length)return stockOutQuerySchema.parse({startDate:days[0],endDate:days[1]||days[0]})
 const offset=/昨天|昨日|yesterday|kemarin/i.test(query)?-1:/前天|前日/i.test(query)?-2:0
 const date=formatDate(addDays(startOfDay(now),offset),'YYYY-MM-DD')
 return {startDate:date,endDate:date}
}
