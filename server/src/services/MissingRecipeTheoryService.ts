import {createHash} from 'crypto'
import {convertQuantity} from '../utils/inventoryUnits'
export interface TheoryBackfillProduct {productId:string;productName:string;orderCount:number;servings:number;recipeHash?:string;reason?:string;firstAt?:string;lastAt?:string}
const round=(n:number)=>Math.round(n*1e9)/1e9
/** Query-time estimates only. No snapshots, ledgers, costs, stock or recipes are written. */
export async function backfillMissingRecipeTheory(db:any,storeId:string,source:any[],inventory:any[],now=new Date()){
 const candidates=source.filter(s=>!s.reversedAt&&JSON.parse(s.issues).length)
 const totals=new Map<string,number>(),resolved:TheoryBackfillProduct[]=[],unresolved:TheoryBackfillProduct[]=[]
 if(!candidates.length)return {snapshots:source,totals,resolved,unresolved,calculatedAt:now.toISOString()}
 const ids=[...new Set<string>(candidates.flatMap(s=>JSON.parse(s.issues).map((i:any)=>i.productId)))]
 const [products,orders,recipes]=await Promise.all([
  db.product.findMany({where:{storeId,id:{in:ids}},select:{id:true,name:true,bomItems:{include:{inventory:{select:{id:true,unit:true,storeId:true}}}}}}),
  db.order.findMany({where:{storeId,id:{in:candidates.map(s=>s.orderId)},status:{in:['paid','completed']}},select:{id:true,items:{select:{id:true,productId:true,quantity:true}},refundRequests:{where:{status:{in:['approved','paid']}},select:{selectedItemIds:true}}}}),
  db.processRecipe.findMany({where:{storeId,status:'active'},include:{items:true}})
 ])
 const inv=new Map<string,any>(inventory.map(i=>[i.id,i])),rec=new Map<string,any>(recipes.map((r:any)=>[r.id,r])),productMap=new Map<string,any>(products.map((p:any)=>[p.id,p])),orderMap=new Map<string,any>(orders.map((o:any)=>[o.id,o]))
 const basisCache=new Map<string,{leaves:any[];hash:string}|{error:string}>(),groups=new Map<string,TheoryBackfillProduct>()
 function recipeBasis(productId:string){
  const saved=basisCache.get(productId);if(saved)return saved
  const p=productMap.get(productId),evidence:any[]=[],leaves=new Map<string,any>()
  function expand(id:string,quantity:number,path:string[]=[]){
   const material=inv.get(id)
   if(!material||material.storeId!==storeId)throw Error('INVENTORY_STORE_MISMATCH')
   if(!Number.isFinite(quantity)||quantity<0)throw Error('INVALID_QUANTITY')
   if(!quantity)return
   if(path.length>=10||path.includes(id))throw Error('RECIPE_CYCLE')
   evidence.push(['material',id,material.unit,material.type,material.processRecipeId||null])
   if(material.type==='semi_finished'&&material.processRecipeId){
    const recipe=rec.get(material.processRecipeId),outputs=recipe?.items.filter((i:any)=>i.type==='output')||[],inputs=recipe?.items.filter((i:any)=>i.type==='input')||[]
    if(outputs.length!==1||!Number.isFinite(outputs[0].quantity)||outputs[0].quantity<=0||!inputs.length)throw Error('RECIPE_INCOMPLETE')
    evidence.push(['process',recipe.id,recipe.outputUnit,outputs[0].quantity,inputs.map((i:any)=>[i.inventoryId,i.quantity]).sort()])
    const factor=convertQuantity(quantity,material.unit,recipe.outputUnit)/outputs[0].quantity
    for(const input of inputs)expand(input.inventoryId,input.quantity*factor,[...path,id])
   }else{
    if(!['raw_material','finished_goods','semi_finished'].includes(material.type))throw Error('INVENTORY_TYPE_UNSUPPORTED')
    const old=leaves.get(id);leaves.set(id,{inventoryId:id,name:material.name,unit:material.unit,quantity:(old?.quantity||0)+quantity})
   }
  }
  try{
   if(!p?.bomItems?.length)throw Error('BOM_MISSING')
   for(const b of [...p.bomItems].sort((a,b)=>a.id.localeCompare(b.id))){
    if(b.inventory?.storeId!==storeId)throw Error('INVENTORY_STORE_MISMATCH')
    evidence.push(['bom',b.inventoryId,b.unit,b.quantity])
    expand(b.inventoryId,convertQuantity(b.quantity,b.unit,b.inventory.unit))
   }
   const result={leaves:[...leaves.values()],hash:createHash('sha256').update(JSON.stringify(['missing-bom-backfill-v1',evidence])).digest('hex')};basisCache.set(productId,result);return result
  }catch(error:any){const result={error:error.message};basisCache.set(productId,result);return result}
 }
 const snapshots=source.map(snapshot=>{
  if(snapshot.reversedAt)return snapshot
  const issues:any[]=JSON.parse(snapshot.issues),materials:any[]=JSON.parse(snapshot.materials),remaining:any[]=[]
  for(const productId of [...new Set<string>(issues.map(i=>i.productId))]){
   const pi=issues.filter(i=>i.productId===productId),order=orderMap.get(snapshot.orderId),p=productMap.get(productId)
   let reason='',quantity=0,basis:ReturnType<typeof recipeBasis>|undefined
   if(pi.some(i=>i.code!=='BOM_MISSING'))reason='PARTIAL_HISTORICAL_RECIPE'
   else if(snapshot.theoryCorrectionApplied)reason='AUDITED_CORRECTION_REQUIRES_REVIEW'
   else if(!order)reason='SOURCE_ORDER_UNAVAILABLE'
   else{
    const returned=new Map<string,number>()
    try{
     for(const refund of order.refundRequests||[]){const data=JSON.parse(refund.selectedItemIds);if(data?.version!==2||!Array.isArray(data.items)||!data.items.length)throw Error('UNVERIFIED_REFUND');for(const line of data.items){if(!order.items.some((i:any)=>i.id===line.itemId)||!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw Error('UNVERIFIED_REFUND');returned.set(line.itemId,(returned.get(line.itemId)||0)+line.quantity)}}
     for(const item of order.items){if(!Number.isSafeInteger(item.quantity)||item.quantity<=0||(returned.get(item.id)||0)>item.quantity)throw Error('UNVERIFIED_ORDER_QUANTITY');if(item.productId===productId)quantity+=item.quantity-(returned.get(item.id)||0)}
     if(!order.items.some((i:any)=>i.productId===productId))throw Error('SOURCE_ORDER_UNAVAILABLE')
    }catch(error:any){reason=error.message}
    if(!reason){basis=quantity===0?{leaves:[],hash:createHash('sha256').update('zero-net-order-quantity-v1').digest('hex')}:recipeBasis(productId);if('error' in basis)reason=basis.error;else if(basis.leaves.some(leaf=>!Number.isFinite(leaf.quantity*quantity)||leaf.quantity*quantity>1e12))reason='INVALID_QUANTITY';else if(basis.leaves.some(leaf=>materials.some(m=>m.inventoryId===leaf.inventoryId&&m.unit!==leaf.unit)))reason='BACKFILL_UNIT_MISMATCH'}
   }
   const key=productId+':'+(reason||'resolved'),group=groups.get(key)||{productId,productName:p?.name||productId,orderCount:0,servings:0,reason:reason||undefined,recipeHash:basis&&'hash' in basis?basis.hash:undefined,firstAt:snapshot.createdAt?.toISOString(),lastAt:snapshot.createdAt?.toISOString()}
   group.orderCount++;group.servings+=quantity;const at=snapshot.createdAt?.toISOString();if(at&&(!group.firstAt||at<group.firstAt))group.firstAt=at;if(at&&(!group.lastAt||at>group.lastAt))group.lastAt=at;groups.set(key,group)
   if(reason){remaining.push(...pi);continue}
   if(basis&&'leaves' in basis)for(const leaf of basis.leaves){const amount=round(leaf.quantity*quantity),old=materials.find(m=>m.inventoryId===leaf.inventoryId);if(old&&old.unit!==leaf.unit)throw Error('BACKFILL_UNIT_MISMATCH');if(old)old.quantity=round(old.quantity+amount);else materials.push({...leaf,quantity:amount});totals.set(leaf.inventoryId,round((totals.get(leaf.inventoryId)||0)+amount))}
  }
  return {...snapshot,materials:JSON.stringify(materials),issues:JSON.stringify(remaining)}
 })
 for(const group of groups.values())(group.reason?unresolved:resolved).push(group)
 return {snapshots,totals,resolved,unresolved,calculatedAt:now.toISOString()}
}
