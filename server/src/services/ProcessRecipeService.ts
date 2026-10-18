import {unifiedInventorySince} from './UnifiedInventoryService'
import {createHash, randomUUID} from 'crypto'
import {consumeInventoryBatches} from './InventoryBatchService'
import {convertQuantity} from '../utils/inventoryUnits'
import {inventoryQuantityCost,recalculateInventoryConsumers} from './InventoryQuantityService'
import {markConsumptionDayDirty} from './OrderConsumptionService'
import prisma from '../config/database'

const include={items:{include:{inventory:{select:{id:true,name:true,unit:true,currentStock:true}}}},outputInventory:{select:{id:true,name:true,unit:true}}} as const
export async function getRecipes(storeId:string){
 const rows=await prisma.processRecipe.findMany({where:{storeId},include,orderBy:{name:'asc'}})
 return Promise.all(rows.map(async row=>{
  const expanded=(await Promise.all(row.items.filter(i=>i.type==='input').map(i=>expandProcessInputs(prisma,storeId,i.inventoryId!,i.quantity,[row.id])))).flat(),leaves=new Map<string,any>()
  for(const input of expanded){const old=leaves.get(input.inventoryId);leaves.set(input.inventoryId,{...input,quantity:input.quantity+(old?.quantity||0)})}
  const rawInputs=[...leaves.values()].sort((a,b)=>b.unitCost-a.unitCost||a.name.localeCompare(b.name)).map(i=>({...i,id:i.inventoryId,inventory:{id:i.inventoryId,name:i.name,unit:i.unit}}))
  return {...row,rawInputs,totalInputCost:rawInputs.reduce((sum,i)=>sum+i.quantity*i.unitCost,0)}
 }))
}
export async function getRecipeById(recipeId:string,storeId?:string){return prisma.processRecipe.findFirst({where:{id:recipeId,...(storeId?{storeId}:{})},include})}
type Definition={name:string;outputUnit:string;inputs:{inventoryId:string;quantity:number}[];outputs:{name:string;quantity:number}[]}
async function validate(db:any,storeId:string,data:Definition,recipeId?:string){
 if(!data.name.trim()||!data.inputs.length||data.outputs.length!==1||!data.outputs[0].name.trim()||!Number.isFinite(data.outputs[0].quantity)||data.outputs[0].quantity<=0)throw Error('INVALID_PROCESS_RECIPE')
 if(new Set(data.inputs.map(i=>i.inventoryId)).size!==data.inputs.length)throw Error('DUPLICATE_PROCESS_INPUT')
 for(const input of data.inputs){
  if(!Number.isFinite(input.quantity)||input.quantity<=0)throw Error('INVALID_PROCESS_RECIPE')
  const inv=await db.inventory.findFirst({where:{id:input.inventoryId,storeId}})
  if(!inv)throw Error('INVENTORY_STORE_MISMATCH')
  // Expand before saving and reject cycles through existing nested recipes.
  await expandProcessInputs(db,storeId,input.inventoryId,input.quantity,recipeId?[recipeId]:[])
 }
 const output=await db.inventory.findFirst({where:{storeId,name:data.outputs[0].name}})
 if(output){
  if(data.inputs.some(i=>i.inventoryId===output.id)||output.processRecipeId&&output.processRecipeId!==recipeId)throw Error('PROCESS_OUTPUT_CONFLICT')
  convertQuantity(data.outputs[0].quantity,data.outputUnit,output.unit)
 }
}
async function linkOutput(db:any,recipe:any){
 const output=recipe.items.find((i:any)=>i.type==='output')
 let inv=await db.inventory.findFirst({where:{storeId:recipe.storeId,name:output.name}})
 if(inv)inv=await db.inventory.update({where:{id:inv.id},data:{type:'semi_finished',processRecipeId:recipe.id}})
 else inv=await db.inventory.create({data:{storeId:recipe.storeId,name:output.name,unit:recipe.outputUnit,category:'加工产出',type:'semi_finished',processRecipeId:recipe.id}})
 await db.processRecipeItem.update({where:{id:output.id},data:{inventoryId:inv.id}})
 await recalculateInventoryConsumers(db,[inv.id])
}
export async function createRecipe(data:Definition&{storeId:string}){
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:data.storeId},data:{updatedAt:new Date()}})
  await validate(tx,data.storeId,data)
  const recipe=await tx.processRecipe.create({data:{storeId:data.storeId,name:data.name,outputUnit:data.outputUnit,items:{create:[...data.inputs.map(i=>({...i,type:'input'})),...data.outputs.map(i=>({...i,type:'output'}))]}},include:{items:true}})
  await linkOutput(tx,recipe)
  return getRecipeIn(tx,recipe.id,data.storeId)
 })
}
async function getRecipeIn(db:any,id:string,storeId:string){return db.processRecipe.findFirst({where:{id,storeId},include})}
/** Semi-finished goods are conversion definitions; all physical movements use leaf raw materials. */
export async function expandProcessInputs(db:any,storeId:string,inventoryId:string,quantity:number,path:string[]=[]):Promise<any[]>{
 if(path.length>=10||path.includes(inventoryId)||!Number.isFinite(quantity)||quantity<=0)throw Error('RECIPE_CYCLE_OR_QUANTITY')
 const inv=await db.inventory.findFirst({where:{id:inventoryId,storeId}})
 if(!inv)throw Error('INVENTORY_STORE_MISMATCH')
 if(inv.type!=='semi_finished'||!inv.processRecipeId)return [{inventoryId:inv.id,name:inv.name,unit:inv.unit,quantity:Math.round(quantity*1e9)/1e9,unitCost:Number(inv.avgCost)}]
 if(!inv.processRecipeId||path.includes(inv.processRecipeId))throw Error('RECIPE_CYCLE_OR_INCOMPLETE')
 const recipe=await db.processRecipe.findFirst({where:{id:inv.processRecipeId,storeId,status:'active'},include:{items:true}})
 const outputs=recipe?.items.filter((i:any)=>i.type==='output')||[],inputs=recipe?.items.filter((i:any)=>i.type==='input')||[]
 if(outputs.length!==1||outputs[0].quantity<=0||!inputs.length)throw Error('INVALID_PROCESS_RECIPE')
 const factor=convertQuantity(quantity,inv.unit,recipe.outputUnit)/outputs[0].quantity
 return (await Promise.all(inputs.map((i:any)=>expandProcessInputs(db,storeId,i.inventoryId,i.quantity*factor,[...path,inventoryId,inv.processRecipeId])))).flat()
}
export async function executeRecipe(recipeId:string,multiplier=1,staffId?:string,storeId?:string,operationId?:string,note?:string){
 if(!storeId||!staffId||!Number.isFinite(multiplier)||multiplier<=0)throw Error('INVALID_PROCESS_REQUEST')
 const id=operationId||randomUUID(),fingerprint=createHash('sha256').update(JSON.stringify({recipeId,multiplier,staffId,storeId,note:note||''})).digest('hex')
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const prior=await tx.processingLog.findUnique({where:{id}})
  if(prior){let saved:any;try{saved=JSON.parse(prior.note||'null')}catch{};if(prior.storeId!==storeId||saved?.fingerprint!==fingerprint)throw Error('PROCESS_IDEMPOTENCY_CONFLICT');return prior}
  const recipe=await tx.processRecipe.findFirst({where:{id:recipeId,storeId,status:'active'},include:{items:true}})
  if(!recipe)throw Error('Recipe not found')
  const inputs=recipe.items.filter(i=>i.type==='input'),outputs=recipe.items.filter(i=>i.type==='output')
  if(!inputs.length||outputs.length!==1||outputs[0].quantity<=0)throw Error('INVALID_PROCESS_RECIPE')
  const expanded=(await Promise.all(inputs.map(i=>expandProcessInputs(tx,storeId,i.inventoryId!,i.quantity*multiplier,[recipe.id])))).flat()
  const materials=new Map<string,any>()
  for(const item of expanded){const old=materials.get(item.inventoryId);materials.set(item.inventoryId,{...item,quantity:item.quantity+(old?.quantity||0)})}
  const internalProcessing=!!(await unifiedInventorySince(tx,storeId))
  let totalInputCost=0
  for(const item of materials.values()){
   const inv=await tx.inventory.findFirstOrThrow({where:{id:item.inventoryId,storeId}})
   if(!internalProcessing&&inv.currentStock+1e-9<item.quantity)throw Error('Insufficient stock')
   const changed=await tx.inventory.updateMany({where:{id:inv.id,storeId,currentStock:inv.currentStock},data:{currentStock:{decrement:internalProcessing?0:item.quantity}}})
   if(changed.count!==1)throw Error('INVENTORY_CONCURRENT_CHANGE_RETRY')
   if(!internalProcessing)await consumeInventoryBatches(tx,inv,item.quantity)
   item.unitCost=internalProcessing?await inventoryQuantityCost(tx,inv.id,1,inv.unit,0,storeId):Number(inv.avgCost);item.totalAmount=Math.round(item.quantity*item.unitCost);totalInputCost+=item.quantity*item.unitCost
   await tx.stockOutLog.create({data:{inventoryId:inv.id,quantity:item.quantity,reason:'process',staffId,note:JSON.stringify({version:1,kind:'process',stockEffect:internalProcessing?'internal_conversion':'physical_out',processId:id,recipeName:recipe.name,unitCost:item.unitCost,totalAmount:item.totalAmount,note:note||''})}})
  }
  const outputItems=outputs.map(i=>({name:i.name,quantity:i.quantity*multiplier,unit:recipe.outputUnit,accounting:'conversion_only'}))
  const cost=Math.round(totalInputCost)
  if(!Number.isSafeInteger(cost)||cost>2147483647)throw Error('INVALID_PROCESS_COST')
  const log=await tx.processingLog.create({data:{id,storeId,recipeId,staffId,multiplier,inputItems:JSON.stringify([...materials.values()]),outputItems:JSON.stringify(outputItems),totalInputCost:cost,totalOutputCost:cost,note:JSON.stringify({version:1,fingerprint,note:note||'',accounting:'raw_material'})}})
  await markConsumptionDayDirty(tx,storeId,log.createdAt)
  return log
 })
}
export async function updateRecipe(recipeId:string,data:Partial<Definition>&{status?:string},storeId?:string){
 if(!storeId)throw Error('INVENTORY_STORE_MISMATCH')
 return prisma.$transaction(async tx=>{
  await tx.store.update({where:{id:storeId},data:{updatedAt:new Date()}})
  const old=await getRecipeIn(tx,recipeId,storeId);if(!old)throw Error('Recipe not found')
  const merged:Definition={name:data.name??old.name,outputUnit:data.outputUnit??old.outputUnit,inputs:data.inputs??old.items.filter((i:any)=>i.type==='input').map((i:any)=>({inventoryId:i.inventoryId,quantity:i.quantity})),outputs:data.outputs??old.items.filter((i:any)=>i.type==='output').map((i:any)=>({name:i.name,quantity:i.quantity}))}
  if(old.outputInventory&&merged.outputs[0]?.name!==old.outputInventory.name)throw Error('LINKED_OUTPUT_NAME_IMMUTABLE')
  await validate(tx,storeId,merged,recipeId)
  await tx.processRecipeItem.deleteMany({where:{processRecipeId:recipeId}})
  const recipe=await tx.processRecipe.update({where:{id:recipeId},data:{name:merged.name,outputUnit:merged.outputUnit,...(data.status?{status:data.status}:{}),items:{create:[...merged.inputs.map(i=>({...i,type:'input'})),...merged.outputs.map(i=>({...i,type:'output'}))]}},include:{items:true}})
  await linkOutput(tx,recipe);return getRecipeIn(tx,recipeId,storeId)
 })
}
export async function deleteRecipe(recipeId:string,storeId?:string){
 if(!storeId)throw Error('INVENTORY_STORE_MISMATCH')
 // Preserve historical processing and frozen sales evidence; retire the definition.
 return prisma.processRecipe.updateMany({where:{id:recipeId,storeId},data:{status:'inactive'}})
}
