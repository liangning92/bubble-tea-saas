import {convertQuantity} from './inventoryUnits'
export async function validateInventoryProcessLink(db:any, material:{id?:string;storeId:string;name:string;unit:string;type:string;processRecipeId?:string|null}) {
 if(material.type!=='semi_finished') {if(material.processRecipeId)throw Error('INVALID_INVENTORY_PROCESS_LINK');return;}
 if(!material.processRecipeId)throw Error('INVENTORY_PROCESS_RECIPE_REQUIRED');
 const recipe=await db.processRecipe.findFirst({where:{id:material.processRecipeId,storeId:material.storeId,status:'active'},include:{items:true}});
 const outputs=recipe?.items.filter((i:any)=>i.type==='output')||[],inputs=recipe?.items.filter((i:any)=>i.type==='input')||[];
 if(outputs.length!==1||outputs[0].quantity<=0||!inputs.length||inputs.some((i:any)=>!i.inventoryId||i.inventoryId===material.id||i.quantity<=0))throw Error('INVALID_INVENTORY_PROCESS_LINK');
 convertQuantity(outputs[0].quantity,recipe.outputUnit,material.unit);
 if(!(material.id&&outputs[0].inventoryId===material.id)&&outputs[0].name!==material.name)throw Error('INVENTORY_PROCESS_OUTPUT_MISMATCH');
}
