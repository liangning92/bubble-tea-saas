import {correctedConsumptionSnapshots} from './ConsumptionEvidenceService'
import {actualInventorySince} from './ActualInventoryPolicy'
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar'
import {unifiedInventorySince} from './UnifiedInventoryService'
import {COUNT_OBSERVATION_PREFIX} from '../utils/countObservation'
import {assertLedgerInstalled} from '../utils/inventoryLedger'
import prisma from '../config/database'
import {getInventoryAlertConfig} from './InventoryAlertConfigService'
import {varianceClassification} from '../utils/inventoryVariance'
export async function physicalInventoryVariance(filter:{storeId:string;startDate:string;endDate:string;category?:string;latest?:boolean}){
 const {boundary:dateBoundary}=await inventoryBusinessCalendar(filter.storeId)
 const start=dateBoundary(filter.startDate),end=dateBoundary(filter.endDate,true)
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)throw new Error('INVALID_ANALYSIS_PERIOD')
 const settings=await getInventoryAlertConfig(filter.storeId)
 // Read a consistent epoch + ledger snapshot, including concurrent UPDATE/DELETE invalidations.
 return prisma.$transaction(async tx=>{
  await assertLedgerInstalled(tx,(process.env.DATABASE_URL||'').startsWith('file:'))
  const unifiedSince=await unifiedInventorySince(tx,filter.storeId),actualSince=await actualInventorySince(tx,filter.storeId)
  const inventory=await tx.inventory.findMany({where:{storeId:filter.storeId,...((unifiedSince||actualSince)?{OR:[{type:{not:'semi_finished'}},{processRecipeId:null}]}:{}),...(filter.category?{category:filter.category}:{})}})
  const results=[]
  for(const material of inventory){
   const where={inventoryId:material.id,countedAt:{gte:start,lte:end},countedQty:{not:null},inventoryCount:{storeId:filter.storeId,status:'completed'},...(unifiedSince?{countedAt:{gte:new Date(Math.max(start.getTime(),unifiedSince.getTime())),lte:end}}:{})}
   const observations=await tx.inventoryCountItem.findMany({where:{...where,...(actualSince?{countedAt:{gte:new Date(Math.max(start.getTime(),actualSince.getTime())),lte:end}}:{})},orderBy:{countedAt:'desc'},...(filter.latest?{take:2}:{})})
   const closing=observations[0],opening=observations[observations.length-1]
   const supported=!!opening&&!!closing&&opening.countedAt!.getTime()<closing.countedAt!.getTime()
   async function boundary(item:any){
    if(!item)return null
    const record=await tx.config.findUnique({where:{storeId_key:{storeId:filter.storeId,key:COUNT_OBSERVATION_PREFIX+item.id}}})
    try{const v=JSON.parse(record?.value||'null'),b=v?.boundary;return [3,4,5].includes(v?.version)&&(actualSince?v.version===5:!unifiedSince||v.version===4)&&v.countId===item.inventoryCountId&&v.countedQty===item.countedQty&&v.observedAt===item.countedAt.toISOString()&&v.ledgerUnit===material.unit&&b?.inventoryId===material.id&&/^\d+$/.test(b.sequence)&&/^\d+$/.test(b.epoch)?b:null}catch{return null}
   }
   const first=await boundary(opening),last=await boundary(closing)
   const certified=supported&&first&&last&&first.epoch===last.epoch&&last.epoch===material.ledgerEpoch.toString()&&BigInt(first.sequence)<=BigInt(last.sequence)&&BigInt(last.sequence)<=material.ledgerSequence
   let theoretical=0,receipts=0,known=0,ambiguous=false,recipeIncomplete=false,seen=0n,lastOrderDate:string|null=null
   const orderIds=new Set<string>()
   if(certified){
    // Composite (inventoryId,ledgerSequence) index, bounded pages; no lifetime enumeration.
    for(const table of ['stockInLog','stockOutLog'] as const){
     let cursor=BigInt(first.sequence)
     for(;;){
      const logs:any[]=await (tx[table] as any).findMany({where:{inventoryId:material.id,ledgerSequence:{gt:cursor,lte:BigInt(last.sequence)}},orderBy:{ledgerSequence:'asc'},take:1000})
      if(!logs.length)break
      for(const log of logs){
       seen++
       if(table==='stockInLog'){
        let genuine=false;try{genuine=JSON.parse(log.note||'null')?.kind==='receipt'}catch{genuine=!!log.note?.startsWith('加工产出: ')}
        if(genuine)receipts+=log.quantity
        else if(!log.note?.startsWith('Inventory count:'))ambiguous=true
       }else{
        if(unifiedSince||actualSince){
         let detail:any;try{detail=JSON.parse(log.note||'null')}catch{}
         if(['loss','expired','transfer','other'].includes(log.reason))known+=log.quantity
         else if(actualSince&&log.reason==='withdrawal'&&detail?.stockEffect==='physical_out'){}
         else if(log.reason==='withdrawal'&&detail?.stockEffect==='internal_transfer'||log.reason==='process'&&detail?.stockEffect==='internal_conversion'||['sale_estimate','sale_estimate_reversal','count_adjustment'].includes(log.reason)){}
         else ambiguous=true
        }else if(['sold','refund_unprepared'].includes(log.reason))theoretical+=log.quantity
        else if(['loss','expired','transfer','process'].includes(log.reason))known+=log.quantity
        else if(log.reason!=='count_adjustment')ambiguous=true
        if(log.reason==='sold'){if(log.orderId)orderIds.add(log.orderId);const date=log.createdAt.toISOString();if(!lastOrderDate||date>lastOrderDate)lastOrderDate=date}
       }
      }
      cursor=logs[logs.length-1].ledgerSequence
     }
    }
   }
   if((unifiedSince||actualSince)&&supported){
    const snapshots=await correctedConsumptionSnapshots(tx,{storeId:filter.storeId,createdAt:{gt:opening!.countedAt!,lte:closing!.countedAt!}})
    for(const snapshot of snapshots){
     if(snapshot.reversedAt)continue
     if(JSON.parse(snapshot.issues).length)recipeIncomplete=true
     for(const entry of JSON.parse(snapshot.materials))if(entry.inventoryId===material.id){if(entry.unit!==material.unit)recipeIncomplete=true;else theoretical+=entry.quantity}
     orderIds.add(snapshot.orderId);lastOrderDate=snapshot.createdAt.toISOString()
    }
    const uncovered=await tx.order.count({where:{storeId:filter.storeId,status:{in:['paid','completed']},createdAt:{gt:opening!.countedAt!,lte:closing!.countedAt!},id:{notIn:snapshots.map(s=>s.orderId)}}})
    recipeIncomplete=recipeIncomplete||uncovered>0
   }
   const complete=certified&&seen===BigInt(last.sequence)-BigInt(first.sequence)
   const actual=complete&&!ambiguous?opening!.countedQty!+receipts-closing!.countedQty!-known:null
   const classification=varianceClassification(theoretical,actual!==null&&actual<0?null:actual,settings.varianceWarningPercent,settings.varianceCriticalPercent,settings.enableConsumptionAlert)
   const comparison=recipeIncomplete?{variance:null,variancePercent:null,varianceStatus:'unavailable' as const}:actualSince&&classification.variance!==null?{...classification,varianceStatus:'not_compared' as const}:classification
   results.push({inventoryId:material.id,inventoryName:material.name,unit:material.unit,theoreticalConsumption:!supported||recipeIncomplete?null:theoretical,actualConsumption:actual,...comparison,variancePercent:theoretical===0?null:comparison.variancePercent,
    varianceAmountEstimate:comparison.variance===null?null:Math.round(comparison.variance*Number(material.avgCost)),valuationBasis:'current_carrying_average_estimate',orderCount:orderIds.size,lastOrderDate,
    completedObservationCount:await tx.inventoryCountItem.count({where:{...where,...(actualSince?{countedAt:{gte:new Date(Math.max(start.getTime(),actualSince.getTime())),lte:end}}:{})}}),latestObservationAt:closing?.countedAt?.toISOString()||null,usableObservationCount:certified?2:first&&first.epoch===material.ledgerEpoch.toString()?1:0,
    observationCount:supported?2:opening?1:0,openingPhysical:supported?opening!.countedQty:null,closingPhysical:supported?closing!.countedQty:null,receipts:certified?receipts:null,knownNonSaleOut:certified?known:null,
    windowStart:(supported?opening!.countedAt!:start).toISOString(),windowEnd:(supported?closing!.countedAt!:end).toISOString(),basis:actualSince?'warehouse_out_vs_sale_recipe':'physical_observation_balance_minus_known_movements',
    unavailableReason:!supported?'TWO_PHYSICAL_OBSERVATIONS_REQUIRED':!complete?'UNCERTIFIED_OBSERVATION_BOUNDARY':ambiguous?'UNCLASSIFIED_MOVEMENTS':recipeIncomplete?'INCOMPLETE_RECIPE':actual!==null&&actual<0?'NEGATIVE_INFERRED_DEPLETION':classification.varianceStatus==='unavailable'?'ZERO_THEORETICAL_BASELINE':null,
    alertsEnabled:settings.enableConsumptionAlert,warningPercent:settings.varianceWarningPercent,criticalPercent:settings.varianceCriticalPercent,refreshHours:settings.autoCheckIntervalHours})
  }
  return results
 },{isolationLevel:'Serializable',timeout:30000})
}
