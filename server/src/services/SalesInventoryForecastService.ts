import {actualInventorySince,ACTUAL_CALIBRATED_PREFIX} from './ActualInventoryPolicy'
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar'
import {inventoryUsageMode} from '../utils/inventoryUsagePolicy'
import {validatePackage} from '../utils/inventoryUnits'
import {CALIBRATED_PREFIX} from './UnifiedInventoryService'
/** Demand comes from closed business-day sales, never from batch issues or processing. */
export async function salesInventoryForecast(db:any,storeId:string,days:number,now:Date,settings:any){
 const {startOfDay,addDays,dayCount}=await inventoryBusinessCalendar(storeId,db)
 const actualSince=await actualInventorySince(db,storeId),calibrationPrefix=actualSince?ACTUAL_CALIBRATED_PREFIX:CALIBRATED_PREFIX
 const end=startOfDay(now),windowStart=addDays(end,-days)
 const flow=await db.config.findUnique({where:{storeId_key:{storeId,key:'employee_inventory_flow_started_at'}}})
 const begun=flow?new Date(flow.value):end
 // A partially observed first day cannot be a complete sample day.
 const firstDay=startOfDay(begun),completeStart=begun>firstDay?addDays(firstDay,1):firstDay
 const start=new Date(Math.max(windowStart.getTime(),completeStart.getTime()))
 const evidenceStart=new Date(Math.max(begun.getTime(),Math.min(start.getTime(),addDays(end,-settings.stagnantDays).getTime())))
 const [materials,snapshots,losses,orders,metadata]=await Promise.all([
  db.inventory.findMany({where:{storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}]},orderBy:{name:'asc'}}),
  db.orderConsumptionSnapshot.findMany({where:{storeId,createdAt:{gte:evidenceStart,lt:end}}}),
  db.stockOutLog.findMany({where:{inventory:{storeId},reason:{in:['loss','expired']},createdAt:{gte:start,lt:end}}}),
  db.purchaseOrder.findMany({where:{storeId,status:{in:['pending','approved','awaiting_receipt']}},include:{items:true}}),
  db.config.findMany({where:{storeId,OR:[{key:{startsWith:calibrationPrefix}},{key:{startsWith:'inventoryPackage:'}}]}})
 ])
 const uncovered=await db.order.count({where:{storeId,status:{in:['paid','completed']},createdAt:{gte:start,lt:end},id:{notIn:snapshots.map((s:any)=>s.orderId)}}})
 const samples=new Map<string,Date>(materials.map((mat:any)=>{const created=mat.createdAt||start,day=startOfDay(created),full=created>day?addDays(day,1):day;return [mat.id,new Date(Math.max(start.getTime(),full.getTime()))]}))
 const totals=new Map<string,{quantity:number;unit:string;last:Date}>();let incomplete=uncovered>0
 for(const snapshot of snapshots){
  if(snapshot.reversedAt)continue
  if(snapshot.createdAt>=start&&JSON.parse(snapshot.issues).length)incomplete=true
  for(const entry of JSON.parse(snapshot.materials)){
   if(snapshot.createdAt>=start&&!samples.has(entry.inventoryId))incomplete=true
   if(!Number.isFinite(entry.quantity)||entry.quantity<=0)continue
   const old=totals.get(entry.inventoryId)
   if(old&&old.unit!==entry.unit)incomplete=true
   totals.set(entry.inventoryId,{quantity:(old?.quantity||0)+(snapshot.createdAt>=(samples.get(entry.inventoryId)||start)?entry.quantity:0),unit:entry.unit,last:!old||snapshot.createdAt>old.last?snapshot.createdAt:old.last})
  }
 }
 return materials.map((mat:any)=>{
  const sampleStart=samples.get(mat.id)!,historyDays=Math.max(0,dayCount(sampleStart,end))
  const use=totals.get(mat.id),mode=inventoryUsageMode(mat)
  const recipeComplete=!incomplete&&(!use||use.unit===mat.unit)
  const totalUsage=recipeComplete?Math.max(0,use?.quantity||0):0
  const dailyUsage=historyDays&&recipeComplete?totalUsage/historyDays:0
  const calibratedAt=metadata.find((m:any)=>m.key===calibrationPrefix+mat.id)?.value||null
  const predictionAvailable=historyDays>=7&&recipeComplete&&!!calibratedAt&&mode!=='self_produced'
  const dynamicSafetyStock=predictionAvailable?dailyUsage*settings.lowStockWarningDays:0
  const effectiveSafetyStock=Math.max(mat.safetyStock||0,mat.minStock||0,dynamicSafetyStock)
  const incoming=orders.filter((o:any)=>o.status==='approved'||o.status==='awaiting_receipt'||o.paidAt).flatMap((o:any)=>o.items).filter((i:any)=>i.inventoryId===mat.id)
  const onOrderQty=incoming.reduce((sum:number,i:any)=>sum+Math.max(0,i.quantity-(i.receivedQty||0)),0)
  let suggestedReorderQty=Math.max(0,effectiveSafetyStock-Math.max(0,mat.currentStock)-onOrderQty)
  const raw=metadata.find((m:any)=>m.key==='inventoryPackage:'+mat.id)
  if(raw&&suggestedReorderQty){const pack=validatePackage(JSON.parse(raw.value),mat.unit);if(pack)suggestedReorderQty=Math.ceil(suggestedReorderQty/pack.quantity)*pack.quantity}
  const lossUsage=losses.filter((l:any)=>l.inventoryId===mat.id).reduce((sum:number,l:any)=>sum+l.quantity,0)
  return {inventoryId:mat.id,id:mat.id,name:mat.name,unit:mat.unit,avgCost:Number(mat.avgCost),category:mat.category,currentStock:mat.currentStock,safetyStock:mat.safetyStock,totalUsage,dailyUsage,historyDays,requestedHistoryDays:days,insufficientHistory:historyDays<7,noUsageHistory:historyDays===0||!recipeComplete,historyStart:historyDays?sampleStart.toISOString():null,historyEnd:end.toISOString(),lastUsageAt:use?.last.toISOString()||null,dynamicSafetyStock,effectiveSafetyStock,daysUntilStockOut:predictionAvailable&&dailyUsage>0?Math.max(0,mat.currentStock/dailyUsage):null,suggestedReorderQty,onOrderQty,orderPackQuantity:raw?validatePackage(JSON.parse(raw.value),mat.unit)?.quantity||null:null,calibratedAt,calibrationRequired:mode!=='self_produced'&&!calibratedAt,predictionAvailable,recipeComplete,lossUsage,lossPercent:totalUsage+lossUsage>0?lossUsage/(totalUsage+lossUsage)*100:null,basis:'closed_day_sales_recipe'}
 }).sort((a:any,b:any)=>(a.daysUntilStockOut??Infinity)-(b.daysUntilStockOut??Infinity))
}
