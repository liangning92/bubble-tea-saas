import {inventoryUsageMode} from '../utils/inventoryUsagePolicy'
import {convertQuantity} from '../utils/inventoryUnits'
/** Cost matches the same quantities consumed by checkout; no implicit density/dilution. */
export async function inventoryQuantityCost(db:any,inventoryId:string,quantity:number,unit?:string,depth=0,storeId?:string):Promise<number>{
 if(depth>10)throw new Error('RECIPE_DEPTH_EXCEEDED')
 const inv=await db.inventory.findUnique({where:{id:inventoryId}})
 if(!inv)throw new Error('Inventory not found')
 if(storeId&&inv.storeId!==storeId)throw new Error('INVENTORY_STORE_MISMATCH')
 if(inventoryUsageMode(inv)==='self_produced')return 0
 const qty=convertQuantity(quantity,unit||inv.unit,inv.unit)
 if(inv.type==='raw_material'||inv.type==='finished_goods'||(inv.type==='semi_finished'&&!inv.processRecipeId))return qty*Number(inv.avgCost)
 if(inv.type==='semi_finished'&&inv.processRecipeId){
  const recipe=await db.processRecipe.findUnique({where:{id:inv.processRecipeId},include:{items:true}})
  const output=recipe?.items.find((i:any)=>i.type==='output')
  if(!output||recipe.items.filter((i:any)=>i.type==='output').length!==1||!recipe.items.some((i:any)=>i.type==='input')||output.quantity<=0||recipe.storeId!==inv.storeId||recipe.status!=='active')throw new Error('INVALID_PROCESS_RECIPE')
  const multiplier=convertQuantity(qty,inv.unit,recipe.outputUnit)/output.quantity
  let cost=0
  for(const input of recipe.items.filter((i:any)=>i.type==='input')){
   if(!input.inventoryId)throw new Error('INVALID_PROCESS_RECIPE')
   cost+=await inventoryQuantityCost(db,input.inventoryId,input.quantity*multiplier,undefined,depth+1,inv.storeId)
  }
  return cost
 }
 throw new Error('INVENTORY_TYPE_UNSUPPORTED')
}

/** Receipt price changes also refresh products that consume this material through a process recipe. */
export async function recalculateInventoryConsumers(db:any,inventoryIds:string[]){
 const impacted=new Set(inventoryIds),queue=[...inventoryIds];
 for(let i=0;i<queue.length;i++){
  const outputs=await db.inventory.findMany({where:{type:'semi_finished',processRecipe:{items:{some:{inventoryId:queue[i],type:'input'}}}},select:{id:true}});
  for(const row of outputs)if(!impacted.has(row.id)){impacted.add(row.id);queue.push(row.id)}
 }
 const rows=await db.bOMItem.findMany({where:{inventoryId:{in:[...impacted]}},select:{productId:true}});
 for(const productId of [...new Set<string>(rows.map((r:any)=>r.productId))]){
  const bom=await db.bOMItem.findMany({where:{productId},include:{inventory:true}});let total=0;
  for(const row of bom)total+=await inventoryQuantityCost(db,row.inventoryId,row.quantity,row.unit);
  await db.product.update({where:{id:productId},data:{costPrice:Math.round(total)}})
 }
}
