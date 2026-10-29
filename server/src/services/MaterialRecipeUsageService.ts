import prisma from '../config/database'
import {inventoryBusinessCalendar} from '../utils/inventoryBusinessCalendar'
import {convertQuantity} from '../utils/inventoryUnits'
import {expandProcessInputs} from './ProcessRecipeService'
import {correctedConsumptionSnapshots} from './ConsumptionEvidenceService'

export type MaterialUsageFilter={storeId:string;inventoryId:string;startDate:string;endDate:string}
const normalStatuses=['paid','completed']
const round=(n:number)=>Math.round(n*1e9)/1e9
/** Read-only sales projection. Current BOM estimates never replace historical evidence. */
export async function materialRecipeUsage(filter:MaterialUsageFilter,db:any=prisma,now=new Date()){
 if(!filter.inventoryId||!/^\d{4}-\d{2}-\d{2}$/.test(filter.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate))throw Error('INVALID_USAGE_PERIOD')
 return db.$transaction(async(tx:any)=>{
  const cal=await inventoryBusinessCalendar(filter.storeId,tx),start=cal.boundary(filter.startDate),requestedEnd=cal.boundary(filter.endDate,true)
  if(!Number.isFinite(start.getTime())||!Number.isFinite(requestedEnd.getTime())||cal.formatDate(start)!==filter.startDate||cal.formatDate(requestedEnd)!==filter.endDate||requestedEnd<start||start>now||cal.dayCount(start,requestedEnd)>365)throw Error('INVALID_USAGE_PERIOD')
  const end=new Date(Math.min(requestedEnd.getTime(),now.getTime()))
  const material=await tx.inventory.findFirst({where:{id:filter.inventoryId,storeId:filter.storeId},select:{id:true,name:true,unit:true,type:true,processRecipeId:true}})
  if(!material)throw Error('USAGE_MATERIAL_NOT_FOUND')
  if(material.type==='semi_finished'&&material.processRecipeId)throw Error('USAGE_SELECT_RAW_MATERIAL')
  const orders=await tx.order.findMany({where:{storeId:filter.storeId,status:{in:normalStatuses},createdAt:{gte:start,lte:end}},select:{id:true,items:{select:{id:true,productId:true,productName:true,quantity:true}},refundRequests:{where:{status:{in:['approved','paid']}},select:{selectedItemIds:true}}}})
  const [materials,recipes,snapshots,statuses]=await Promise.all([
   tx.inventory.findMany({where:{storeId:filter.storeId}}),
   tx.processRecipe.findMany({where:{storeId:filter.storeId,status:'active'},include:{items:true}}),
   correctedConsumptionSnapshots(tx,{storeId:filter.storeId,createdAt:{gte:start,lte:end}}),
   tx.order.groupBy({by:['status'],where:{storeId:filter.storeId,createdAt:{gte:start,lte:end}},_count:{_all:true}})
  ])
  const materialMap=new Map<string,any>(materials.map((m:any)=>[m.id,m])),recipeMap=new Map<string,any>(recipes.map((r:any)=>[r.id,r]))
  const lookup={inventory:{findFirst:async(args:any)=>materialMap.get(args.where.id)||null},processRecipe:{findFirst:async(args:any)=>recipeMap.get(args.where.id)||null}}
  const totals=new Map<string,{productId:string;productName:string;soldQuantity:number}>(),eligible=new Set<string>(),partialRefunds=new Set<string>(),invalidRefunds:string[]=[]
  let soldQuantity=0,refundedQuantity=0,invalidOrderCount=0
  for(const order of orders){
   if(!order.items.length||order.items.some((i:any)=>!Number.isSafeInteger(i.quantity)||i.quantity<=0)){invalidOrderCount++;continue}
   const returned=new Map<string,number>();let valid=true
   for(const refund of order.refundRequests){
    try{const record=JSON.parse(refund.selectedItemIds);if(record?.version!==2||!Array.isArray(record.items)||!record.items.length)throw Error('invalid')
     for(const line of record.items){const item=order.items.find((i:any)=>i.id===line.itemId);if(!item||!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw Error('invalid');returned.set(item.id,(returned.get(item.id)||0)+line.quantity)}
    }catch{valid=false}
   }
   if(order.items.some((i:any)=>(returned.get(i.id)||0)>i.quantity))valid=false
   if(!valid){invalidRefunds.push(order.id);continue}
   eligible.add(order.id);if(returned.size)partialRefunds.add(order.id)
   for(const item of order.items){
    const refunded=returned.get(item.id)||0,quantity=item.quantity-refunded;refundedQuantity+=refunded
    if(quantity<=0)continue
    soldQuantity+=quantity
    const old=totals.get(item.productId);totals.set(item.productId,{productId:item.productId,productName:item.productName,soldQuantity:(old?.soldQuantity||0)+quantity})
   }
  }
  const products=await tx.product.findMany({where:{storeId:filter.storeId,id:{in:[...totals.keys()]}},select:{id:true,bomItems:{include:{inventory:{select:{id:true,unit:true,storeId:true}}}}}})
  const productMap=new Map<string,any>(products.map((p:any)=>[p.id,p])),breakdown:any[]=[],unresolved:any[]=[]
  for(const sale of totals.values()){
   const product=productMap.get(sale.productId);let perUnit=0,complete=true
   if(!product?.bomItems.length){unresolved.push({...sale,reason:'BOM_MISSING'});continue}
   for(const bom of product.bomItems){
    try{
     if(bom.inventory.storeId!==filter.storeId||!Number.isFinite(bom.quantity)||bom.quantity<0)throw Error('INVALID_RECIPE')
     if(!bom.quantity)continue
     const base=convertQuantity(bom.quantity,bom.unit,bom.inventory.unit)
     const leaves=await expandProcessInputs(lookup,filter.storeId,bom.inventoryId,base)
     for(const leaf of leaves)if(leaf.inventoryId===material.id){if(leaf.unit!==material.unit)throw Error('UNIT_MISMATCH');perUnit+=leaf.quantity}
    }catch{complete=false}
   }
   if(!complete)unresolved.push({...sale,reason:'RECIPE_INCOMPLETE'})
   if(perUnit>0)breakdown.push({...sale,perUnit:round(perUnit),quantity:round(perUnit*sale.soldQuantity),complete})
  }
  let snapshotQuantity=0,snapshotOrders=0,issueOrders=0,unexpandedOrders=0,unitMismatchOrders=0,reversedOrders=0
  const covered=new Set<string>()
  for(const snapshot of snapshots){
   if(!eligible.has(snapshot.orderId)||partialRefunds.has(snapshot.orderId))continue
   covered.add(snapshot.orderId)
   if(snapshot.reversedAt){reversedOrders++;continue}
   snapshotOrders++
   if(JSON.parse(snapshot.issues).length)issueOrders++
   let unexpanded=false,mismatch=false
   for(const entry of JSON.parse(snapshot.materials)){
    if(materialMap.get(entry.inventoryId)?.type==='semi_finished'&&materialMap.get(entry.inventoryId)?.processRecipeId)unexpanded=true
    if(entry.inventoryId!==material.id)continue
    if(entry.unit!==material.unit||!Number.isFinite(entry.quantity)||entry.quantity<0){mismatch=true;continue}
    snapshotQuantity+=entry.quantity
   }
   if(unexpanded)unexpandedOrders++;if(mismatch)unitMismatchOrders++
  }
  const missingSnapshotOrders=[...eligible].filter(id=>!covered.has(id)&&!partialRefunds.has(id)).length
  const total=round(breakdown.reduce((sum,row)=>sum+row.quantity,0))
  breakdown.sort((a,b)=>b.quantity-a.quantity||a.productId.localeCompare(b.productId))
  return {material:{id:material.id,name:material.name,unit:material.unit},startDate:filter.startDate,endDate:filter.endDate,startAt:start.toISOString(),endAt:end.toISOString(),asOf:now.toISOString(),timezone:cal.timezone,
   orderCount:eligible.size,soldQuantity,refundedQuantity,excludedOrderCount:statuses.filter((r:any)=>!normalStatuses.includes(r.status)).reduce((s:number,r:any)=>s+r._count._all,0),invalidRefundOrderCount:invalidRefunds.length,invalidOrderCount,
   estimate:{quantity:total,complete:!unresolved.length&&!invalidRefunds.length&&!invalidOrderCount,contributingProducts:breakdown.length,breakdown,unresolved},
   historical:{quantity:round(snapshotQuantity),activeOrderCount:snapshotOrders,missingOrderCount:missingSnapshotOrders,partialRefundOrderCount:partialRefunds.size,issueOrderCount:issueOrders,unexpandedOrderCount:unexpandedOrders,unitMismatchOrderCount:unitMismatchOrders,reversedOrderCount:reversedOrders,complete:!missingSnapshotOrders&&!partialRefunds.size&&!issueOrders&&!unexpandedOrders&&!unitMismatchOrders&&!invalidRefunds.length&&!reversedOrders&&!invalidOrderCount},
   basis:'normal_order_remaining_quantity_times_current_recipe',readOnly:true}
 },{isolationLevel:'Serializable',timeout:30000})
}
