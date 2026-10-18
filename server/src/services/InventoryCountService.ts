import {inventoryUsageMode} from '../utils/inventoryUsagePolicy'
import {expandProcessInputs} from './ProcessRecipeService'
import {unifiedInventorySince,CALIBRATED_PREFIX} from './UnifiedInventoryService'
import {loadInventoryActors} from '../utils/inventoryActors'
import {COUNT_OBSERVATION_PREFIX,captureCountBoundary} from '../utils/countObservation'
import prisma from '../config/database'
import {validatePackage} from '../utils/inventoryUnits'
export interface CreateInventoryCountData {storeId:string;period:'monthly'|'quarterly'|'annual'|'ad_hoc';startDate:Date;endDate:Date;notes?:string;inventoryIds?:string[]}
const include={items:{orderBy:{inventoryId:'asc' as const},include:{inventory:{select:{id:true,name:true,unit:true,currentStock:true,updatedAt:true,avgCost:true}}}}} as const
function view(count:any){
 if(!count)return null
 return {...count,items:count.items.map((item:any)=>({...item,inventory:{...item.inventory,avgCost:Number(item.inventory.avgCost)},movementSinceObservation:item.countedAt?item.inventory.currentStock-item.systemQty-(count.status==='completed'?(item.variance||0):0):null,varianceAmountEstimate:item.variance===null?null:Math.round(item.variance*Number(item.inventory.avgCost)),valuationBasis:'current_carrying_average_estimate'}))}
}
async function people(counts:any[],storeId:string){
 const [actors,packages]=await Promise.all([
  loadInventoryActors(prisma,storeId,counts.flatMap(c=>c.items.map((i:any)=>i.countedBy))),
  prisma.config.findMany({where:{storeId,key:{startsWith:'inventoryPackage:'}}})
 ])
 const equivalents=new Map<string,any[]>()
 if(await unifiedInventorySince(prisma,storeId)){
  const outputs=await prisma.inventory.findMany({where:{storeId,type:'semi_finished',processRecipeId:{not:null}}})
  for(const output of outputs){
   try{
    const leaves=await expandProcessInputs(prisma,storeId,output.id,1)
    const totals=new Map<string,number>()
    for(const raw of leaves)totals.set(raw.inventoryId,(totals.get(raw.inventoryId)||0)+raw.quantity)
    for(const [id,rawQuantity] of totals){const rows=equivalents.get(id)||[];rows.push({id:output.id,name:output.name,unit:output.unit,rawQuantity});equivalents.set(id,rows)}
   }catch{/* Invalid conversions are omitted; quantities must be verified directly. */}
  }
 }
 const packageMap=new Map(packages.map(p=>[p.key,p.value]))
 return counts.map(c=>({...c,items:c.items.map((i:any)=>{let packaging=null;try{const raw=packageMap.get('inventoryPackage:'+i.inventoryId);if(raw)packaging=validatePackage(JSON.parse(raw),i.inventory.unit)}catch{};return {...i,inventory:{...i.inventory,packaging,countEquivalents:equivalents.get(i.inventoryId)||[]},countedByActor:actors.get(i.countedBy)||null}})}))
}
export async function getInventoryCounts(storeId:string){return people((await prisma.inventoryCount.findMany({where:{storeId},include,orderBy:{createdAt:'desc'}})).map(view),storeId)}
export async function getInventoryCountById(countId:string,storeId?:string){const count=view(await prisma.inventoryCount.findFirst({where:{id:countId,...(storeId?{storeId}:{})},include}));return count?(await people([count],count.storeId))[0]:null}
async function lockCount(tx:any,countId:string,storeId:string,statuses=['in_progress']){
 const changed=await tx.inventoryCount.updateMany({where:{id:countId,storeId,status:{in:statuses}},data:{updatedAt:new Date()}})
 if(changed.count!==1)throw new Error('COUNT_NOT_ACTIVE_OR_STORE_MISMATCH')
}
export async function createInventoryCount(data:CreateInventoryCountData){
 if(!Number.isFinite(data.startDate.getTime())||!Number.isFinite(data.endDate.getTime())||data.startDate>data.endDate)throw new Error('INVALID_COUNT_PERIOD')
 return prisma.$transaction(async tx=>{
  // Lock store row to prevent two simultaneous active sessions without a schema migration.
  await tx.store.update({where:{id:data.storeId},data:{updatedAt:new Date()}})
  if(await tx.inventoryCount.findFirst({where:{storeId:data.storeId,status:{in:['in_progress','pending_review']}}}))throw new Error('COUNT_ALREADY_ACTIVE')
  const stockRows=await tx.inventory.findMany({where:{storeId:data.storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}],...(data.inventoryIds?{id:{in:data.inventoryIds}}:{})},select:{id:true,currentStock:true,name:true,category:true}})
  const inventory=await unifiedInventorySince(tx,data.storeId)?stockRows.filter(i=>inventoryUsageMode(i)!=='self_produced'):stockRows
  if(!inventory.length||data.inventoryIds&&(new Set(data.inventoryIds).size!==data.inventoryIds.length||inventory.length!==data.inventoryIds.length))throw Error('INVALID_COUNT_SELECTION')
  const {inventoryIds,...fields}=data
  return view(await tx.inventoryCount.create({data:{...fields,status:'in_progress',items:{create:inventory.map(i=>({inventoryId:i.id,systemQty:i.currentStock}))}},include}))
 })
}
export interface CountObservation {itemId:string;countedQty:number;note?:string;expectedStock:number;observedVersion:string}
async function recordObservation(tx:any,countItemId:string,countedQty:number,countedBy:string,note:string|undefined,context:{countId:string;storeId:string;expectedStock:number;observedVersion:string}){
 if(!Number.isFinite(countedQty)||countedQty<0||!Number.isFinite(context.expectedStock))throw new Error('INVALID_COUNT_OBSERVATION')
  const item=await tx.inventoryCountItem.findFirst({where:{id:countItemId,inventoryCountId:context.countId},include:{inventory:true}})
  if(!item||item.inventory.storeId!==context.storeId)throw new Error('COUNT_ITEM_STORE_MISMATCH')
  const version=new Date(context.observedVersion)
  if(!Number.isFinite(version.getTime()))throw new Error('COUNT_REFRESH_REQUIRED')
  const locked=await tx.inventory.updateMany({where:{id:item.inventoryId,storeId:context.storeId,currentStock:{gte:context.expectedStock-1e-9,lte:context.expectedStock+1e-9},updatedAt:version},data:{currentStock:{increment:0}}})
  if(locked.count!==1)throw new Error('COUNT_REFRESH_REQUIRED')
  const variance=Math.round((countedQty-context.expectedStock)*1e9)/1e9
  const observedAt=new Date(),key=COUNT_OBSERVATION_PREFIX+countItemId
  const boundary=await captureCountBoundary(tx,item.inventoryId)
  const unifiedSince=await unifiedInventorySince(tx,context.storeId)
  const value=JSON.stringify({version:unifiedSince?4:3,scope:unifiedSince?'whole_store_raw_equivalent':'legacy',boundary,countId:context.countId,systemQty:context.expectedStock,countedQty,actor:countedBy,observedAt:observedAt.toISOString(),ledgerUnit:item.inventory.unit})
  await tx.config.upsert({where:{storeId_key:{storeId:context.storeId,key}},create:{storeId:context.storeId,key,value,category:'inventory'},update:{value}})
  return tx.inventoryCountItem.update({where:{id:countItemId},data:{systemQty:context.expectedStock,countedQty,variance,countedAt:observedAt,countedBy,note:note?.trim()||null}})
}
export async function updateCountItems(countId:string,storeId:string,countedBy:string,items:CountObservation[]){
 if(!items.length||items.length>1000||new Set(items.map(i=>i.itemId)).size!==items.length)throw Error('INVALID_COUNT_SELECTION')
 // One transaction: a stale or foreign row rolls back every observation in the batch.
 return prisma.$transaction(async tx=>{
  await lockCount(tx,countId,storeId)
  const saved=[]
  for(const item of [...items].sort((a,b)=>a.itemId.localeCompare(b.itemId)))saved.push(await recordObservation(tx,item.itemId,item.countedQty,countedBy,item.note,{countId,storeId,expectedStock:item.expectedStock,observedVersion:item.observedVersion}))
  return saved
 },{timeout:15000})
}
export async function updateCountItem(countItemId:string,countedQty:number,countedBy:string,note:string|undefined,context:{countId:string;storeId:string;expectedStock:number;observedVersion:string}){
 if(!context)throw Error('INVALID_COUNT_OBSERVATION')
 return (await updateCountItems(context.countId,context.storeId,countedBy,[{itemId:countItemId,countedQty,note,expectedStock:context.expectedStock,observedVersion:context.observedVersion}]))[0]
}
export async function completeInventoryCount(countId:string,staffId:string,storeId:string){
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  await lockCount(tx,countId,storeId,['in_progress','pending_review'])
  const count=await tx.inventoryCount.findUniqueOrThrow({where:{id:countId},include:{items:{include:{inventory:true}}}})
  if(count.period==='ad_hoc'&&count.status!=='pending_review')throw Error('COUNT_SUBMIT_REQUIRED')
  const observed=count.items.filter(i=>i.countedQty!==null&&i.countedAt)
  if(!observed.length)throw new Error('COUNT_INCOMPLETE')
  for(const item of [...observed].sort((a,b)=>a.inventoryId.localeCompare(b.inventoryId))){
   if(item.inventory.storeId!==storeId)throw new Error('COUNT_ITEM_STORE_MISMATCH')
   const recorded=await tx.config.findUnique({where:{storeId_key:{storeId,key:COUNT_OBSERVATION_PREFIX+item.id}}})
   const observation=recorded?JSON.parse(recorded.value):null
   if(!observation||![1,2,3,4].includes(observation.version)||observation.countId!==countId||observation.systemQty!==item.systemQty||observation.countedQty!==item.countedQty||observation.actor!==item.countedBy||observation.observedAt!==item.countedAt!.toISOString()||observation.ledgerUnit!==item.inventory.unit)throw new Error('COUNT_REOBSERVATION_REQUIRED')
   if(await tx.inventoryCountItem.findFirst({where:{inventoryId:item.inventoryId,countedAt:{not:null},inventoryCount:{storeId,status:'completed',updatedAt:{gte:item.countedAt!}}}}))throw new Error('COUNT_REOBSERVATION_REQUIRED')
   const variance=item.countedQty!-item.systemQty
   if(item.variance===null||!Number.isFinite(item.variance)||Math.abs(variance-item.variance)>1e-7||!Number.isFinite(variance))throw new Error('INVALID_COUNT_OBSERVATION')
   if(observation.version===4){
    // Serialize against sales, including delayed offline orders while review was pending.
    await tx.inventory.update({where:{id:item.inventoryId},data:{currentStock:{increment:0}}})
    const late=await tx.stockOutLog.findMany({where:{inventoryId:item.inventoryId,ledgerSequence:{gt:BigInt(observation.boundary.sequence)},reason:{in:['sale_estimate','sale_estimate_reversal']}}})
    let correction=0
    for(const log of late){const detail=JSON.parse(log.note||'{}');if(detail.consumedAt&&new Date(detail.consumedAt)<=item.countedAt!)correction+=log.quantity}
    if(correction){
     await tx.inventory.update({where:{id:item.inventoryId},data:{currentStock:{increment:correction}}})
     await tx.stockOutLog.create({data:{inventoryId:item.inventoryId,quantity:-correction,reason:'count_adjustment',note:JSON.stringify({version:1,countId,countItemId:item.id,kind:'late-estimate-in-count',actor:staffId})}})
    }
    const key=CALIBRATED_PREFIX+item.inventoryId,value=item.countedAt!.toISOString()
    await tx.config.upsert({where:{storeId_key:{storeId,key}},create:{storeId,key,value,category:'inventory'},update:{value}})
   }
   if(!variance)continue
   await tx.inventory.update({where:{id:item.inventoryId},data:{currentStock:{increment:variance}}})
   // Signed count adjustment is never classified as a sale, staff withdrawal or disciplinary action.
   await tx.stockOutLog.create({data:{inventoryId:item.inventoryId,quantity:-variance,reason:'count_adjustment',note:JSON.stringify({version:1,countId,countItemId:item.id,actor:staffId,ledgerUnit:item.inventory.unit,systemQty:item.systemQty,countedQty:item.countedQty,observedAt:item.countedAt,reason:item.note,valuation:'carrying_average_at_approval_estimate',varianceAmountEstimate:Math.round(variance*Number(item.inventory.avgCost))})}})
  }
  return view(await tx.inventoryCount.update({where:{id:countId},data:{status:'completed'},include}))
 })
}
export async function cancelInventoryCount(countId:string,storeId:string){return prisma.$transaction(async tx=>{await lockCount(tx,countId,storeId,['in_progress','pending_review']);return tx.inventoryCount.update({where:{id:countId},data:{status:'cancelled'},include})})}

export async function submitInventoryCount(countId:string,storeId:string,countedBy?:string,items:CountObservation[]=[]){
 if(items.length>1000||new Set(items.map(i=>i.itemId)).size!==items.length||items.length&&!countedBy)throw Error('INVALID_COUNT_SELECTION')
 return prisma.$transaction(async tx=>{
  const existing=await tx.inventoryCount.findFirst({where:{id:countId,storeId},include})
  if(existing?.status==='pending_review')return view(existing)
  await lockCount(tx,countId,storeId)
  for(const item of [...items].sort((a,b)=>a.itemId.localeCompare(b.itemId)))await recordObservation(tx,item.itemId,item.countedQty,countedBy!,item.note,{countId,storeId,expectedStock:item.expectedStock,observedVersion:item.observedVersion})
  const count=await tx.inventoryCount.findUniqueOrThrow({where:{id:countId},include})
  if(!count.items.some(i=>i.countedQty!==null&&i.countedAt))throw Error('COUNT_INCOMPLETE')
  return view(await tx.inventoryCount.update({where:{id:countId},data:{status:'pending_review'},include}))
 },{timeout:15000})
}
