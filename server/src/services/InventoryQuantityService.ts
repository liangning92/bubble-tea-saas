import {convertQuantity} from '../utils/inventoryUnits'
/** Cost matches the same quantities consumed by checkout; no implicit density/dilution. */
export async function inventoryQuantityCost(db:any,inventoryId:string,quantity:number,unit?:string,depth=0,storeId?:string):Promise<number>{
 if(depth>10)throw new Error('RECIPE_DEPTH_EXCEEDED')
 const inv=await db.inventory.findUnique({where:{id:inventoryId}})
 if(!inv)throw new Error('Inventory not found')
 if(storeId&&inv.storeId!==storeId)throw new Error('INVENTORY_STORE_MISMATCH')
 const qty=convertQuantity(quantity,unit||inv.unit,inv.unit)
 if(inv.type==='raw_material'||inv.type==='finished_goods'||(inv.type==='semi_finished'&&!inv.processRecipeId))return qty*Number(inv.avgCost)
 if(inv.type==='semi_finished'&&inv.processRecipeId){
  const recipe=await db.processRecipe.findUnique({where:{id:inv.processRecipeId},include:{items:true}})
  const output=recipe?.items.find((i:any)=>i.type==='output')
  if(!output||output.quantity<=0||recipe.storeId!==inv.storeId)throw new Error('INVALID_PROCESS_RECIPE')
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
