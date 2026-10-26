import {actualInventorySince,ACTUAL_CALIBRATED_PREFIX} from './ActualInventoryPolicy'
import {inventoryUsageMode} from '../utils/inventoryUsagePolicy'
import {consumeInventoryBatches} from './InventoryBatchService'
export const UNIFIED_INVENTORY_KEY='inventory_unified_stock_v1'
export const CALIBRATED_PREFIX='inventory_calibrated_v1:'
export async function unifiedInventorySince(db:any,storeId:string):Promise<Date|null>{
 const record=await db.config.findUnique({where:{storeId_key:{storeId,key:UNIFIED_INVENTORY_KEY}}})
 if(!record)return null
 const date=new Date(record.value)
 if(!Number.isFinite(date.getTime()))throw Error('INVALID_INVENTORY_POLICY')
 return date
}
export async function calibrationAt(db:any,storeId:string,inventoryId:string):Promise<Date|null>{
 const record=await db.config.findUnique({where:{storeId_key:{storeId,key:(await actualInventorySince(db,storeId)?ACTUAL_CALIBRATED_PREFIX:CALIBRATED_PREFIX)+inventoryId}}})
 return record?new Date(record.value):null
}
/** Internal movements never change estimated whole-store raw-equivalent stock.
 * Late orders included in an approved physical observation must not deduct again. */
export async function applySaleEstimate(db:any,storeId:string,snapshot:any){
 if(await actualInventorySince(db,storeId))return
 const since=await unifiedInventorySince(db,storeId)
 if(!since||snapshot.createdAt<since)return
 for(const material of JSON.parse(snapshot.materials).sort((a:any,b:any)=>a.inventoryId.localeCompare(b.inventoryId))){
  const inv=await db.inventory.findFirst({where:{id:material.inventoryId,storeId}})
  if(!inv||inv.unit!==material.unit)throw Error('INVALID_FROZEN_INVENTORY')
  if(inventoryUsageMode(inv)==='self_produced'||!material.quantity)continue
  if(!Number.isFinite(material.quantity)||material.quantity<0)throw Error('INVALID_FROZEN_QUANTITY')
  await db.inventory.update({where:{id:inv.id},data:{currentStock:{increment:0}}})
  const observed=await calibrationAt(db,storeId,inv.id)
  if(observed&&snapshot.createdAt<=observed)continue
  const current=await db.inventory.findUniqueOrThrow({where:{id:inv.id}})
  // Book shortage must not block a real sale. Batch depletion is only an estimate.
  const available=Math.min(Math.max(0,current.currentStock),material.quantity)
  const batchAllocations=available>0?await consumeInventoryBatches(db,current,available):[]
  await db.inventory.update({where:{id:inv.id},data:{currentStock:{decrement:material.quantity}}})
  await db.stockOutLog.create({data:{inventoryId:inv.id,operationId:'sale-estimate:'+snapshot.id+':'+inv.id,quantity:material.quantity,reason:'sale_estimate',note:JSON.stringify({version:1,kind:'sale-estimate',snapshotId:snapshot.id,consumedAt:snapshot.createdAt,unit:inv.unit,batchAllocations,unitCost:Number(inv.avgCost),totalAmount:Math.round(material.quantity*Number(inv.avgCost))})}})
 }
}
export async function reverseSaleEstimate(db:any,snapshot:any){
 if(await actualInventorySince(db,snapshot.storeId))return
 for(const material of JSON.parse(snapshot.materials).sort((a:any,b:any)=>a.inventoryId.localeCompare(b.inventoryId))){
  const original=await db.stockOutLog.findUnique({where:{operationId:'sale-estimate:'+snapshot.id+':'+material.inventoryId}})
  if(!original)continue
  const inv=await db.inventory.findFirst({where:{id:material.inventoryId,storeId:snapshot.storeId}})
  if(!inv)throw Error('INVENTORY_STORE_MISMATCH')
  await db.inventory.update({where:{id:inv.id},data:{currentStock:{increment:0}}})
  const observed=await calibrationAt(db,snapshot.storeId,inv.id)
  if(observed&&snapshot.createdAt<=observed)continue
  await db.inventory.update({where:{id:inv.id},data:{currentStock:{increment:original.quantity}}})
  const detail=JSON.parse(original.note||'{}')
  for(const allocation of detail.batchAllocations||[]){
   const batch=await db.batch.findFirst({where:{id:allocation.id,inventoryId:inv.id}})
   if(batch)await db.batch.update({where:{id:batch.id},data:{quantity:{increment:allocation.quantity},status:'active'}})
  }
  await db.stockOutLog.create({data:{inventoryId:inv.id,operationId:'reverse-estimate:'+snapshot.id+':'+inv.id,quantity:-original.quantity,reason:'sale_estimate_reversal',note:JSON.stringify({version:1,kind:'sale-estimate-reversal',snapshotId:snapshot.id,consumedAt:snapshot.createdAt})}})
 }
}
