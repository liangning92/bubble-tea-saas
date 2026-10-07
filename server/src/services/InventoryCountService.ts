import {COUNT_OBSERVATION_PREFIX,captureCountBoundary} from '../utils/countObservation'
import prisma from '../config/database'
export interface CreateInventoryCountData {storeId:string;period:'monthly'|'quarterly'|'annual';startDate:Date;endDate:Date;notes?:string}
const include={items:{include:{inventory:{select:{id:true,name:true,unit:true,currentStock:true,updatedAt:true,avgCost:true}}}}} as const
function view(count:any){
 if(!count)return null
 return {...count,items:count.items.map((item:any)=>({...item,inventory:{...item.inventory,avgCost:Number(item.inventory.avgCost)},movementSinceObservation:item.countedAt?item.inventory.currentStock-item.systemQty-(count.status==='completed'?(item.variance||0):0):null,varianceAmountEstimate:item.variance===null?null:Math.round(item.variance*Number(item.inventory.avgCost)),valuationBasis:'current_carrying_average_estimate'}))}
}
export async function getInventoryCounts(storeId:string){return (await prisma.inventoryCount.findMany({where:{storeId},include,orderBy:{createdAt:'desc'}})).map(view)}
export async function getInventoryCountById(countId:string,storeId?:string){return view(await prisma.inventoryCount.findFirst({where:{id:countId,...(storeId?{storeId}:{})},include}))}
async function lockCount(tx:any,countId:string,storeId:string){
 const changed=await tx.inventoryCount.updateMany({where:{id:countId,storeId,status:'in_progress'},data:{updatedAt:new Date()}})
 if(changed.count!==1)throw new Error('COUNT_NOT_ACTIVE_OR_STORE_MISMATCH')
}
export async function createInventoryCount(data:CreateInventoryCountData){
 if(!Number.isFinite(data.startDate.getTime())||!Number.isFinite(data.endDate.getTime())||data.startDate>data.endDate)throw new Error('INVALID_COUNT_PERIOD')
 return prisma.$transaction(async tx=>{
  // Lock store row to prevent two simultaneous active sessions without a schema migration.
  await tx.store.update({where:{id:data.storeId},data:{updatedAt:new Date()}})
  if(await tx.inventoryCount.findFirst({where:{storeId:data.storeId,status:'in_progress'}}))throw new Error('COUNT_ALREADY_ACTIVE')
  const inventory=await tx.inventory.findMany({where:{storeId:data.storeId},select:{id:true,currentStock:true}})
  return view(await tx.inventoryCount.create({data:{...data,status:'in_progress',items:{create:inventory.map(i=>({inventoryId:i.id,systemQty:i.currentStock}))}},include}))
 })
}
export async function updateCountItem(countItemId:string,countedQty:number,countedBy:string,note:string|undefined,context:{countId:string;storeId:string;expectedStock:number;observedVersion:string}){
 if(!context||!Number.isFinite(countedQty)||countedQty<0||!Number.isFinite(context.expectedStock))throw new Error('INVALID_COUNT_OBSERVATION')
 return prisma.$transaction(async tx=>{
  await lockCount(tx,context.countId,context.storeId)
  const item=await tx.inventoryCountItem.findFirst({where:{id:countItemId,inventoryCountId:context.countId},include:{inventory:true}})
  if(!item||item.inventory.storeId!==context.storeId)throw new Error('COUNT_ITEM_STORE_MISMATCH')
  const version=new Date(context.observedVersion)
  if(!Number.isFinite(version.getTime()))throw new Error('COUNT_REFRESH_REQUIRED')
  const locked=await tx.inventory.updateMany({where:{id:item.inventoryId,storeId:context.storeId,currentStock:context.expectedStock,updatedAt:version},data:{currentStock:{increment:0}}})
  if(locked.count!==1)throw new Error('COUNT_REFRESH_REQUIRED')
  const variance=Math.round((countedQty-context.expectedStock)*1e9)/1e9
  if(variance!==0&&!note?.trim())throw new Error('COUNT_VARIANCE_REASON_REQUIRED')
  const observedAt=new Date(),key=COUNT_OBSERVATION_PREFIX+countItemId
  const boundary=await captureCountBoundary(tx,item.inventoryId)
  const value=JSON.stringify({version:3,boundary,countId:context.countId,systemQty:context.expectedStock,countedQty,actor:countedBy,observedAt:observedAt.toISOString(),ledgerUnit:item.inventory.unit})
  await tx.config.upsert({where:{storeId_key:{storeId:context.storeId,key}},create:{storeId:context.storeId,key,value,category:'inventory'},update:{value}})
  return tx.inventoryCountItem.update({where:{id:countItemId},data:{systemQty:context.expectedStock,countedQty,variance,countedAt:observedAt,countedBy,note:note?.trim()||null}})
 })
}
export async function completeInventoryCount(countId:string,staffId:string,storeId:string){
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  await lockCount(tx,countId,storeId)
  const count=await tx.inventoryCount.findUniqueOrThrow({where:{id:countId},include:{items:{include:{inventory:true}}}})
  if(!count.items.length||count.items.some(i=>i.countedQty===null||!i.countedAt))throw new Error('COUNT_INCOMPLETE')
  for(const item of [...count.items].sort((a,b)=>a.inventoryId.localeCompare(b.inventoryId))){
   if(item.inventory.storeId!==storeId)throw new Error('COUNT_ITEM_STORE_MISMATCH')
   const recorded=await tx.config.findUnique({where:{storeId_key:{storeId,key:COUNT_OBSERVATION_PREFIX+item.id}}})
   const observation=recorded?JSON.parse(recorded.value):null
   if(!observation||![1,2,3].includes(observation.version)||observation.countId!==countId||observation.systemQty!==item.systemQty||observation.countedQty!==item.countedQty||observation.actor!==item.countedBy||observation.observedAt!==item.countedAt!.toISOString()||observation.ledgerUnit!==item.inventory.unit)throw new Error('COUNT_REOBSERVATION_REQUIRED')
   if(await tx.inventoryCountItem.findFirst({where:{inventoryId:item.inventoryId,inventoryCount:{storeId,status:'completed',updatedAt:{gte:item.countedAt!}}}}))throw new Error('COUNT_REOBSERVATION_REQUIRED')
   const variance=item.countedQty!-item.systemQty
   if(item.variance===null||!Number.isFinite(item.variance)||Math.abs(variance-item.variance)>1e-7||!Number.isFinite(variance))throw new Error('INVALID_COUNT_OBSERVATION')
   if(!variance)continue
   if(!item.note?.trim())throw new Error('COUNT_VARIANCE_REASON_REQUIRED')
   await tx.inventory.update({where:{id:item.inventoryId},data:{currentStock:{increment:variance}}})
   // Signed count adjustment is never classified as a sale, staff withdrawal or disciplinary action.
   await tx.stockOutLog.create({data:{inventoryId:item.inventoryId,quantity:-variance,reason:'count_adjustment',note:JSON.stringify({version:1,countId,countItemId:item.id,actor:staffId,ledgerUnit:item.inventory.unit,systemQty:item.systemQty,countedQty:item.countedQty,observedAt:item.countedAt,reason:item.note,valuation:'carrying_average_at_approval_estimate',varianceAmountEstimate:Math.round(variance*Number(item.inventory.avgCost))})}})
  }
  return view(await tx.inventoryCount.update({where:{id:countId},data:{status:'completed'},include}))
 })
}
export async function cancelInventoryCount(countId:string,storeId:string){return prisma.$transaction(async tx=>{await lockCount(tx,countId,storeId);return tx.inventoryCount.update({where:{id:countId},data:{status:'cancelled'},include})})}
