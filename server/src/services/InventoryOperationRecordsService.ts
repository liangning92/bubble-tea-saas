import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '../config/database'
import { jakartaDay } from '../utils/operationDate'
import { parseBusinessDate } from '../utils/businessDate'
import { registeredStockOutReasons } from './TodayStockOutService'
import { getInventoryCountById } from './InventoryCountService'
import { loadInventoryActors } from '../utils/inventoryActors'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { try { parseBusinessDate(v); return true } catch { return false } })
export const operationQuerySchema = z.object({
  kind:z.enum(['in','out','purchase','count']),
  startDate:day.default(() => jakartaDay()), endDate:day.default(() => jakartaDay()),
  inventoryId:z.string().max(150).optional(), page:z.coerce.number().int().min(1).max(1000000).default(1)
}).refine(q => q.startDate <= q.endDate, 'INVALID_DATE_RANGE')
type Query = z.infer<typeof operationQuerySchema>
export function businessNote(value: string | null) {
  if (!value) return ''
  try { const parsed = JSON.parse(value); return typeof parsed === 'string' ? parsed : typeof parsed?.note === 'string' ? parsed.note : '' } catch { return value }
}
// One normalized line per material. Page by document, aggregate over the complete filter.
function source(storeId:string,kind:Query['kind']) {
  if (kind==='in'||kind==='out') {
    const table=kind==='in'?Prisma.sql`"StockInLog"`:Prisma.sql`"StockOutLog"`
    const reason=kind==='out'?Prisma.sql`l.reason`:Prisma.sql`'receipt'::text`
    return Prisma.sql`SELECT l.id, l.id AS "lineId", l."inventoryId", i.name, i.unit, l.quantity,
      COALESCE(l."occurredOn"::date, (l."createdAt" + interval '7 hours')::date)::text AS "businessDate",
      l."createdAt", l."staffId" AS "actorId", l.note, ${reason} AS reason,
      NULL::text AS status, NULL::text AS "orderNumber", NULL::text AS "supplierName", NULL::float8 AS "systemQty", NULL::float8 AS "receivedQty", NULL::timestamp AS "countedAt"
      FROM ${table} l JOIN "Inventory" i ON i.id=l."inventoryId"
      WHERE i."storeId"=${storeId} ${kind==='out'?Prisma.sql`AND l.reason IN (${Prisma.join(registeredStockOutReasons)})`:Prisma.empty}`
  }
  if(kind==='purchase') return Prisma.sql`SELECT p.id, x.id AS "lineId", x."inventoryId", i.name, i.unit, x.quantity,
    COALESCE(p."purchasedOn"::date, (p."createdAt" + interval '7 hours')::date)::text AS "businessDate",
    p."createdAt", p."createdBy" AS "actorId", p.note, NULL::text AS reason, p.status,
    p."orderNumber", s.name AS "supplierName", NULL::float8 AS "systemQty", x."receivedQty", NULL::timestamp AS "countedAt"
    FROM "PurchaseOrder" p JOIN "PurchaseOrderItem" x ON x."purchaseOrderId"=p.id
    JOIN "Inventory" i ON i.id=x."inventoryId" AND i."storeId"=p."storeId"
    LEFT JOIN "Supplier" s ON s.id=p."supplierId" AND s."storeId"=p."storeId"
    WHERE p."storeId"=${storeId}`
  return Prisma.sql`SELECT c.id, x.id AS "lineId", x."inventoryId", i.name, i.unit, x."countedQty" AS quantity,
    (c."startDate" + interval '7 hours')::date::text AS "businessDate",
    c."createdAt", x."countedBy" AS "actorId", x.note, NULL::text AS reason, c.status,
    NULL::text AS "orderNumber", NULL::text AS "supplierName", x."systemQty", NULL::float8 AS "receivedQty", x."countedAt"
    FROM "InventoryCount" c JOIN "InventoryCountItem" x ON x."inventoryCountId"=c.id
    JOIN "Inventory" i ON i.id=x."inventoryId" AND i."storeId"=c."storeId"
    WHERE c."storeId"=${storeId} AND c.status <> 'in_progress'`
}
export async function operationRecords(storeId:string,query:Query,db:any=prisma) {
  if(!storeId) throw new Error('STORE_REQUIRED')
  const base=source(storeId,query.kind)
  const filtered=Prisma.sql`WITH source AS (${base}), filtered AS (SELECT * FROM source WHERE "businessDate">=${query.startDate} AND "businessDate"<=${query.endDate}
    ${query.inventoryId?Prisma.sql`AND "inventoryId"=${query.inventoryId}`:Prisma.empty})`
  return db.$transaction(async(tx:any)=>{
    const totals=await tx.$queryRaw(Prisma.sql`${filtered} SELECT COUNT(DISTINCT id)::int AS total FROM filtered`)
    const total=totals[0].total, page=Math.min(query.page,Math.max(1,Math.ceil(total/20)))
    const rows:any[]=await tx.$queryRaw(Prisma.sql`${filtered}, documents AS (
      SELECT id, MAX("businessDate") AS date, MAX("createdAt") AS entered FROM filtered GROUP BY id ORDER BY date DESC, entered DESC, id DESC LIMIT 20 OFFSET ${(page-1)*20}
    ) SELECT source.* FROM source JOIN documents ON documents.id=source.id ORDER BY source."businessDate" DESC, source."createdAt" DESC, source.id DESC, source."lineId" DESC`)
    const summary=await tx.$queryRaw(Prisma.sql`${filtered} SELECT "inventoryId", name, unit, SUM(quantity)::float8 AS quantity, COUNT(*)::int AS "recordCount", COUNT(quantity)::int AS "recordedCount" FROM filtered GROUP BY "inventoryId",name,unit ORDER BY name,"inventoryId"`)
    const actors=await loadInventoryActors(tx,storeId,rows.map(r=>r.actorId))
    const documents=new Map<string,any>()
    for(const r of rows){
      let document=documents.get(r.id)
      if(!document){document={id:r.id,businessDate:r.businessDate,createdAt:r.createdAt,status:r.status,orderNumber:r.orderNumber,supplierName:r.supplierName,operator:actors.get(r.actorId)||null,note:businessNote(r.note),items:[]};documents.set(r.id,document)}
      document.items.push({id:r.lineId,inventoryId:r.inventoryId,name:r.name,unit:r.unit,quantity:r.quantity,reason:r.reason,operator:actors.get(r.actorId)||null,note:businessNote(r.note),systemQty:r.systemQty,receivedQty:r.receivedQty,countedAt:r.countedAt})
    }
    if(query.kind==='count') for(const document of documents.values()) {
      const count=await getInventoryCountById(document.id,storeId)
      if(count)document.countDetails={reviewHistory:count.reviewHistory,items:count.items.map((item:any)=>({id:item.id,inventoryId:item.inventoryId,systemQty:item.systemQty,countedQty:item.countedQty,variance:item.variance,countedAt:item.countedAt,countedByActor:item.countedByActor,note:businessNote(item.note),inventory:{id:item.inventory.id,name:item.inventory.name,unit:item.inventory.unit}}))}
    }
    return {list:[...documents.values()],summary,total,page,pageSize:20,timezone:'Asia/Jakarta'}
  },{isolationLevel:'RepeatableRead'})
}
