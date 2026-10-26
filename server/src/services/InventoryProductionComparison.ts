import {expandProcessInputs} from './ProcessRecipeService'
import {convertQuantity} from '../utils/inventoryUnits'
/** Registered output is independent of sales. Do not invent output when no batch was recorded. */
export async function inventoryProductionComparison(db:any,storeId:string,start:Date,end:Date,withdrawals:Map<string,number>,withdrawalTimes:Map<string,Date>=new Map()) {
 const [recipes,logs,bom]=await Promise.all([
  db.processRecipe.findMany({where:{storeId,status:'active'},include:{items:true,outputInventory:true}}),
  db.processingLog.findMany({where:{storeId,createdAt:{gte:start,lte:end}}}),
  db.bOMItem.findMany({where:{product:{storeId,status:'active'}},include:{product:{select:{id:true,name:true}},inventory:true}})
 ])
 const result=new Map<string,any[]>()
 for(const recipe of recipes){
  const output=recipe.items.filter((i:any)=>i.type==='output')
  if(output.length!==1||!recipe.outputInventory||output[0].quantity<=0)continue
  const raw=new Map<string,any>()
  try{for(const input of recipe.items.filter((i:any)=>i.type==='input'))for(const leaf of await expandProcessInputs(db,storeId,input.inventoryId,input.quantity,[recipe.id])){const old=raw.get(leaf.inventoryId);raw.set(leaf.inventoryId,{...leaf,quantity:leaf.quantity+(old?.quantity||0)})}}catch{continue}
  // Historical theoretical yield must not be reconstructed using a later edited recipe.
  const currentBasis=recipe.updatedAt<=end
  const registered=logs.filter((l:any)=>l.recipeId===recipe.id)
  const outputs=registered.flatMap((l:any)=>JSON.parse(l.outputItems))
  for(const input of raw.values()){
   let recorded:number|null=null
   try{if(registered.length)recorded=outputs.reduce((sum:number,o:any)=>sum+convertQuantity(o.quantity,o.unit,recipe.outputUnit),0)}catch{recorded=null}
   const firstIssue=withdrawalTimes.get(input.inventoryId),unchanged=currentBasis&&(!firstIssue||recipe.updatedAt<=firstIssue)
   const theoretical=unchanged?(withdrawals.get(input.inventoryId)||0)/input.quantity*output[0].quantity:null
   const products=bom.filter((b:any)=>recipe.outputInventory.id===b.inventoryId).flatMap((b:any)=>{
    try{const per=convertQuantity(b.quantity,b.unit,recipe.outputUnit);return per>0?[{productId:b.product.id,name:b.product.name,theoreticalQuantity:theoretical===null||firstIssue&&b.updatedAt>firstIssue?null:theoretical/per}]:[]}catch{return []}
   })
   const entries=result.get(input.inventoryId)||[]
   entries.push({recipeId:recipe.id,name:output[0].name||recipe.name,unit:recipe.outputUnit,theoreticalOutput:theoretical,registeredOutput:recorded,difference:theoretical===null||recorded===null?null:recorded-theoretical,products,basis:'standard_recipe_capacity',recipeUpdatedAt:recipe.updatedAt})
   result.set(input.inventoryId,entries)
  }
 }
 return result
}
