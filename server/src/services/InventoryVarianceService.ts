import {COUNT_OBSERVATION_PREFIX} from '../utils/countObservation'
import {assertLedgerInstalled} from '../utils/inventoryLedger'
import prisma from '../config/database'
import {getInventoryAlertConfig} from './InventoryAlertConfigService'
import {varianceClassification} from '../utils/inventoryVariance'
export async function physicalInventoryVariance(filter:{storeId:string;startDate:string;endDate:string;category?:string}){
 const start=new Date(filter.startDate),end=new Date(filter.endDate)
 if(/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate))end.setUTCHours(23,59,59,999)
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)throw new Error('INVALID_ANALYSIS_PERIOD')
 const settings=await getInventoryAlertConfig(filter.storeId)
 // Read a consistent epoch + ledger snapshot, including concurrent UPDATE/DELETE invalidations.
 return prisma.$transaction(async tx=>{
  await assertLedgerInstalled(tx,(process.env.DATABASE_URL||'').startsWith('file:'))
  const inventory=await tx.inventory.findMany({where:{storeId:filter.storeId,...(filter.category?{category:filter.category}:{})}})
  const results=[]
  for(const material of inventory){
   const where={inventoryId:material.id,countedAt:{gte:start,lte:end},countedQty:{not:null},inventoryCount:{storeId:filter.storeId,status:'completed'}}
   const opening=await tx.inventoryCountItem.findFirst({where,orderBy:{countedAt:'asc'}})
   const closing=await tx.inventoryCountItem.findFirst({where,orderBy:{countedAt:'desc'}})
   const supported=!!opening&&!!closing&&opening.countedAt!.getTime()<closing.countedAt!.getTime()
   async function boundary(item:any){
    if(!item)return null
    const record=await tx.config.findUnique({where:{storeId_key:{storeId:filter.storeId,key:COUNT_OBSERVATION_PREFIX+item.id}}})
    try{const v=JSON.parse(record?.value||'null'),b=v?.boundary;return v?.version===3&&v.countId===item.inventoryCountId&&v.countedQty===item.countedQty&&v.observedAt===item.countedAt.toISOString()&&v.ledgerUnit===material.unit&&b?.inventoryId===material.id&&/^\d+$/.test(b.sequence)&&/^\d+$/.test(b.epoch)?b:null}catch{return null}
   }
   const first=await boundary(opening),last=await boundary(closing)
   const certified=supported&&first&&last&&first.epoch===last.epoch&&last.epoch===material.ledgerEpoch.toString()&&BigInt(first.sequence)<=BigInt(last.sequence)&&BigInt(last.sequence)<=material.ledgerSequence
   let theoretical=0,receipts=0,known=0,ambiguous=false,seen=0n,lastOrderDate:string|null=null
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
        if(['sold','refund_unprepared'].includes(log.reason))theoretical+=log.quantity
        else if(['loss','expired','transfer','process'].includes(log.reason))known+=log.quantity
        else if(log.reason!=='count_adjustment')ambiguous=true
        if(log.reason==='sold'){if(log.orderId)orderIds.add(log.orderId);const date=log.createdAt.toISOString();if(!lastOrderDate||date>lastOrderDate)lastOrderDate=date}
       }
      }
      cursor=logs[logs.length-1].ledgerSequence
     }
    }
   }
   const complete=certified&&seen===BigInt(last.sequence)-BigInt(first.sequence)
   const actual=complete&&!ambiguous?opening!.countedQty!+receipts-closing!.countedQty!-known:null
   const classification=varianceClassification(theoretical,actual!==null&&actual<0?null:actual,settings.varianceWarningPercent,settings.varianceCriticalPercent,settings.enableConsumptionAlert)
   results.push({inventoryId:material.id,inventoryName:material.name,unit:material.unit,theoreticalConsumption:theoretical,actualConsumption:actual,...classification,
    varianceAmountEstimate:classification.variance===null?null:Math.round(classification.variance*Number(material.avgCost)),valuationBasis:'current_carrying_average_estimate',orderCount:orderIds.size,lastOrderDate,
    observationCount:supported?2:opening?1:0,openingPhysical:supported?opening!.countedQty:null,closingPhysical:supported?closing!.countedQty:null,receipts,knownNonSaleOut:known,
    windowStart:(supported?opening!.countedAt!:start).toISOString(),windowEnd:(supported?closing!.countedAt!:end).toISOString(),basis:'physical_observation_balance_minus_known_movements',
    unavailableReason:!supported?'TWO_PHYSICAL_OBSERVATIONS_REQUIRED':!complete?'UNCERTIFIED_OBSERVATION_BOUNDARY':ambiguous?'UNCLASSIFIED_MOVEMENTS':actual!==null&&actual<0?'NEGATIVE_INFERRED_DEPLETION':classification.varianceStatus==='unavailable'?'ZERO_THEORETICAL_BASELINE':null,
    alertsEnabled:settings.enableConsumptionAlert,warningPercent:settings.varianceWarningPercent,criticalPercent:settings.varianceCriticalPercent,refreshHours:settings.autoCheckIntervalHours})
  }
  return results
 },{isolationLevel:'Serializable',timeout:30000})
}
