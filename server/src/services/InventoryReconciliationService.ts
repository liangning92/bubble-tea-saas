import prisma from '../config/database'
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar'
import {assertLedgerInstalled} from '../utils/inventoryLedger'
import {COUNT_OBSERVATION_PREFIX} from '../utils/countObservation'
import {reconciliationBalance,reconciliationMovement} from '../utils/inventoryReconciliation'
import {actualInventorySince} from './ActualInventoryPolicy'
import {unifiedInventorySince} from './UnifiedInventoryService'
import {getInventoryAlertConfig} from './InventoryAlertConfigService'

/** Read-only stock reconciliation. Recipe/sales evidence never gates a physical inventory check. */
export async function inventoryReconciliation(filter:{storeId:string;startDate:string;endDate:string;latest?:boolean},db:any=prisma){
 const calendar=await inventoryBusinessCalendar(filter.storeId,db),start=calendar.boundary(filter.startDate),end=calendar.boundary(filter.endDate,true)
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)throw Error('INVALID_ANALYSIS_PERIOD')
 const settings=await getInventoryAlertConfig(filter.storeId)
 return db.$transaction(async(tx:any)=>{
  await assertLedgerInstalled(tx,(process.env.DATABASE_URL||'').startsWith('file:'))
  const cutover=await actualInventorySince(tx,filter.storeId)||await unifiedInventorySince(tx,filter.storeId)||new Date(0)
  const materials=await tx.inventory.findMany({where:{storeId:filter.storeId,OR:[{type:{not:'semi_finished'}},{processRecipeId:null}]},orderBy:{name:'asc'}})
  const rows=[]
  for(const material of materials){
   const base={inventoryId:material.id,countedQty:{not:null},inventoryCount:{storeId:filter.storeId,status:'completed'},countedAt:{gte:cutover,lte:end}}
   const newest=await tx.inventoryCountItem.findFirst({where:{...base,inventoryCount:{storeId:filter.storeId,status:{in:['completed','pending_review']}},countedAt:{gte:new Date(Math.max(start.getTime(),cutover.getTime())),lte:end}},include:{inventoryCount:{select:{id:true,status:true}}},orderBy:[{countedAt:'desc'},{id:'desc'}]})
   let closing=newest,opening=newest?await tx.inventoryCountItem.findFirst({where:{...base,countedAt:{gte:cutover,lt:newest.countedAt}},orderBy:[{countedAt:'desc'},{id:'desc'}]}):null
   if(!opening){opening=await tx.inventoryCountItem.findFirst({where:base,orderBy:[{countedAt:'desc'},{id:'desc'}]});if(opening&&newest?.id===opening.id)closing=null}
   async function boundary(item:any){
    if(!item)return null
    const record=await tx.config.findUnique({where:{storeId_key:{storeId:filter.storeId,key:COUNT_OBSERVATION_PREFIX+item.id}}})
    try{const value=JSON.parse(record?.value||'null'),b=value?.boundary;return [3,4,5].includes(value?.version)&&value.countId===item.inventoryCountId&&value.countedQty===item.countedQty&&value.observedAt===item.countedAt.toISOString()&&value.ledgerUnit===material.unit&&b?.inventoryId===material.id&&/^\d+$/.test(b.sequence)&&/^\d+$/.test(b.epoch)?b:null}catch{return null}
   }
   const first=await boundary(opening),last=closing?await boundary(closing):{sequence:material.ledgerSequence.toString(),epoch:material.ledgerEpoch.toString()}
   const certified=first&&last&&first.epoch===last.epoch&&first.epoch===material.ledgerEpoch.toString()&&BigInt(first.sequence)<=BigInt(last.sequence)&&BigInt(last.sequence)<=material.ledgerSequence
   let receipts=0,actualOut=0,unknown=false,seen=0n
   if(certified)for(const [table,direction] of [['stockInLog','in'],['stockOutLog','out']] as const){
    let cursor=BigInt(first.sequence)
    for(;;){
     const logs=await tx[table].findMany({where:{inventoryId:material.id,ledgerSequence:{gt:cursor,lte:BigInt(last.sequence)}},orderBy:{ledgerSequence:'asc'},take:1000})
     if(!logs.length)break
     for(const log of logs){const movement=log.createdAt>end?{incoming:0,outgoing:0,unknown:false}:reconciliationMovement(direction,log);receipts+=movement.incoming;actualOut+=movement.outgoing;unknown=unknown||movement.unknown;seen++}
     cursor=logs[logs.length-1].ledgerSequence
    }
   }
   const complete=certified&&seen===BigInt(last.sequence)-BigInt(first.sequence)
   const ready=!!opening&&complete&&!unknown
   const balance=ready?reconciliationBalance(opening.countedQty,receipts,actualOut,closing?.countedQty??null,settings.countVarianceCriticalPercent):{expectedClosing:null,variance:null,variancePercent:null,varianceStatus:'unavailable'}
   rows.push({inventoryId:material.id,inventoryName:material.name,unit:material.unit,theoreticalConsumption:null,actualConsumption:ready?actualOut:null,...balance,
    actualOut:ready?actualOut:null,receipts:ready?receipts:null,openingPhysical:opening?.countedQty??null,closingPhysical:closing?.countedQty??null,
    varianceAmountEstimate:balance.variance===null?null:Math.round(balance.variance*Number(material.avgCost)),
    observationCount:opening?(closing?2:1):0,completedObservationCount:await tx.inventoryCountItem.count({where:base}),usableObservationCount:ready?(closing?2:1):0,latestObservationAt:(newest||opening)?.countedAt?.toISOString()||null,
    openingCountId:opening?.inventoryCountId??null,closingCountId:closing?.inventoryCountId??null,closingCountItemId:closing?.id??null,closingStatus:closing?.inventoryCount?.status??null,
    windowStart:(opening?.countedAt||start).toISOString(),windowEnd:(closing?.countedAt||new Date(Math.min(end.getTime(),Date.now()))).toISOString(),basis:'count_stock_reconciliation',
    unavailableReason:!opening?'COMPLETED_BASELINE_REQUIRED':!complete?'UNCERTIFIED_OBSERVATION_BOUNDARY':unknown?'UNCLASSIFIED_MOVEMENTS':!closing?'NEXT_PHYSICAL_OBSERVATION_REQUIRED':null})
  }
  return rows
 },{isolationLevel:'Serializable',timeout:30000})
}
