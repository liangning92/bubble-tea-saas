import {createHash} from 'crypto'
import { z } from 'zod'
import { stockIn, stockOut } from '../InventoryService'
import {employeeStockOutSummary} from './employeeStockOutSummary'
import { TeamError } from '../TeamCommunicationService'
import { audienceAllows, visibleBusinessData } from './employeeAccess'
import type { BridgeGrant, CommunicationScope } from './contract'

const deny=(code:string):never=>{throw new TeamError(403,code)}
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)
const id=z.string().trim().min(1).max(128)
const schema=z.object({action:z.string().min(1),query:z.string().trim().max(80).optional(),cursor:id.optional(),inventoryId:id.optional(),quantity:z.number().finite().positive().optional(),unit:z.string().max(30).optional(),unitCost:z.number().finite().nonnegative().optional(),reason:z.enum(['loss','expired','withdrawal','other']).optional(),note:z.string().trim().max(2000).optional(),photoMessageId:z.union([z.string().uuid(),z.literal('none')]).optional(),
  startDate:date.optional(),endDate:date.optional(),category:z.string().min(1).max(80).optional(),movementReason:z.string().min(1).max(80).optional(),staffId:id.optional(),date:date.optional(),shift:id.optional(),taskId:id.optional(),name:z.string().trim().min(1).max(200).optional(),areaCode:id.optional(),dueTime:z.string().datetime().optional(),priority:z.number().int().min(1).max(3).optional()}).strict()
export const businessToolNames=['employee_manage_inventory','employee_manage_hygiene','employee_manage_staff']
export function businessToolSchemas() {
  const tool=(name:string,description:string,actions:string[],properties:any)=>({type:'function' as const,function:{name,description,parameters:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:actions},...properties}}}})
  const staffId={type:'string',description:'Actual store staff ID; look it up first, never invent one.'},day={type:'string',description:'YYYY-MM-DD; ask if the requested date is unclear.'}
  return [
    tool('employee_manage_inventory','Read inventory or complete stock-out totals, and record native stock operations. Use list_stock_out for questions such as 今天出库了哪些原料 or stok keluar hari ini: it reads every matching record for the Jakarta calendar period, grouped by material and reason, separately labelling sales estimates. Omitted dates mean today. Use list for item lookup. Quantities for writes must be supplied or confirmed. A stock issue is not a physical-count certification.',['list','list_stock_out','stock_in','stock_out'],{startDate:day,endDate:day,category:{type:'string',description:'Optional exact inventory category; omit for all and read each returned category.'},movementReason:{type:'string',description:'Optional exact ledger reason for list_stock_out only; withdrawal is employee ordinary stock-out, sale_estimate is recipe estimate.'},query:{type:'string',description:'Optional literal item-name filter for list; omit for a store-wide list.'},cursor:{type:'string',description:'Cursor returned by the preceding list call.'},inventoryId:{type:'string'},quantity:{type:'number',exclusiveMinimum:0},unit:{type:'string'},photoMessageId:{type:'string',description:'Exact verified photo message ID from conversation facts. Required for a photo-based stock-out, including after quantity clarification. If older photos are unrelated to a new text-only operation, explicitly use none.'},unitCost:{type:'number',minimum:0},reason:{type:'string',enum:['loss','expired','withdrawal','other']},note:{type:'string'}}),
    tool('employee_manage_hygiene','Inspect hygiene tasks and areas; create and assign a cleaning task. Read existing task evidence to reason about hygiene. Never mark cleaning as physically completed without employee evidence.',['list_tasks','list_areas','create_task','assign_task'],{taskId:{type:'string'},staffId,date:day,name:{type:'string'},areaCode:{type:'string'},dueTime:{type:'string'},priority:{type:'integer',minimum:1,maximum:3},note:{type:'string'}}),
    tool('employee_manage_staff','Read the store staff directory or assign a staff member to an existing store shift on a specific date. Other HR actions use the existing operations and training tools.',['list_staff','set_schedule'],{staffId,date:day,shift:{type:'string',description:'Existing shift key, not a made-up label.'},note:{type:'string'}})
  ]
}

/** Called inside the runtime transaction: business mutation and tool receipt commit together. */
export async function executeBusinessTool(db:any,g:BridgeGrant,scope:CommunicationScope,name:string,raw:unknown,operationId:string,photoEvidence?:import('../InventoryService').StockOperation['sourceEvidence']) {
  const parsed=schema.safeParse(raw)
  if(!parsed.success)return {ok:false,code:'EMPLOYEE_BUSINESS_INPUT_INVALID',message:'Check the tool fields and ask for missing or invalid details.'}
  const v=parsed.data,storeId=g.storeId,actor='agent:'+g.agentId
  const required=name==='employee_manage_inventory'?(['list','list_stock_out'].includes(v.action)?'inventory.read':'inventory.write'):name==='employee_manage_staff'?(v.action==='list_staff'?'staff.read':'staff.write'):(['list_tasks','list_areas'].includes(v.action)?'hygiene.read':'hygiene.write')
  if(!(g.actions as string[]).includes(required))deny('EMPLOYEE_BUSINESS_ACTION_NOT_GRANTED')
  const staff=v.staffId?await db.staff.findFirst({where:{id:v.staffId,storeId,status:'active'},select:{id:true}}):null
  if(v.staffId&&!staff)deny('EMPLOYEE_BUSINESS_STAFF_NOT_FOUND')
  let result:any
  if(name==='employee_manage_inventory'&&v.action==='list_stock_out'){
    if(!await audienceAllows(db,g,scope,'inventory.read'))return {ok:false,code:'EMPLOYEE_INVENTORY_NOT_VISIBLE'}
    if(v.startDate&&v.endDate&&v.startDate>v.endDate)return {ok:false,code:'EMPLOYEE_STOCK_DATE_RANGE_INVALID',message:'The start date must not be after the end date.'}
    return employeeStockOutSummary(db,storeId,{startDate:v.startDate,endDate:v.endDate,inventoryId:v.inventoryId,category:v.category,reason:v.movementReason})
  }
  if(name==='employee_manage_inventory'&&v.action==='list'){
    if(!await audienceAllows(db,g,scope,'inventory.read'))return {ok:false,code:'EMPLOYEE_INVENTORY_NOT_VISIBLE',message:'Inventory data is not visible to every recipient here.'}
    const rows=await db.inventory.findMany({where:{storeId,...(v.query?{name:{contains:v.query,mode:'insensitive'}}:{})},select:{id:true,name:true,unit:true,currentStock:true,safetyStock:true},orderBy:{id:'asc'},take:51,...(v.cursor?{cursor:{id:v.cursor},skip:1}:{})})
    const items=rows.slice(0,50),packages=await db.config.findMany({where:{storeId,key:{in:items.map(item=>'inventoryPackage:'+item.id)}}});const packById=new Map(packages.map((row:any)=>[row.key.slice('inventoryPackage:'.length),JSON.parse(row.value)]));return {items:items.map(item=>({...item,package:packById.get(item.id)||null})),hasMore:rows.length>50,cursor:rows.length>50?items.at(-1).id:null}
  }
  if(name==='employee_manage_inventory') {
    if(!v.inventoryId||!v.quantity)return {ok:false,code:'EMPLOYEE_STOCK_DETAILS_REQUIRED',message:'Ask for an inventory item and positive quantity.'}
    const item=await db.inventory.findFirst({where:{id:v.inventoryId,storeId},select:{id:true}})
    if(!item)deny('EMPLOYEE_STOCK_ITEM_NOT_FOUND')
    if(v.action==='stock_out'&&photoEvidence){
      operationId='hermes-photo:'+createHash('sha256').update(JSON.stringify([storeId,photoEvidence.channelId,photoEvidence.messageId,v.inventoryId])).digest('hex')
      const prior=await db.stockOutLog.findUnique({where:{operationId},include:{inventory:{select:{storeId:true,unit:true}}}})
      if(prior){
        if(prior.inventory.storeId!==storeId||prior.inventoryId!==v.inventoryId)deny('EMPLOYEE_PHOTO_OPERATION_CONFLICT')
        const receipt={ok:true,alreadyRecorded:true,operationRecorded:true,operationId,stockOutLogId:prior.id,quantity:prior.quantity,unit:prior.inventory.unit,message:'This exact photograph and material already have a committed stock-out receipt. Do not create another issue. Review the recorded quantity; any correction must update that original work.'}
        if(!await audienceAllows(db,g,scope,'inventory.read'))return {ok:true,alreadyRecorded:true,operationRecorded:true,message:'This photo-backed stock operation was already recorded; it was not repeated.'}
        return visibleBusinessData(db,g,scope,receipt)
      }
    }
    const data={inventoryId:v.inventoryId,storeId,quantity:v.quantity,inputUnit:v.unit,note:v.note,staffId:actor,operationId,...(photoEvidence?{sourceEvidence:photoEvidence}:{})}
    try{
    if(v.action==='stock_in'){
      if(v.unitCost===undefined)return {ok:false,code:'EMPLOYEE_STOCK_COST_REQUIRED',message:'Ask for the required missing details before performing this operation.'}
      result=await stockIn({...data,reason:'purchase',unitCost:v.unitCost},db)
    }else if(v.action==='stock_out'){
      result=await stockOut({...data,reason:v.reason||'withdrawal'},db)
    }else deny('EMPLOYEE_BUSINESS_ACTION_INVALID')
    }catch(error:any){if(['Insufficient stock','INCOMPATIBLE_INVENTORY_UNITS','UNIT_REQUIRED','INVALID_QUANTITY','OUT_REASON_REQUIRED','PROCESS_OUTPUT_IS_CONVERSION_ONLY'].includes(error.message))return {ok:false,code:'EMPLOYEE_STOCK_DETAILS_NEED_CHECK',message:'The stock operation was not recorded. Recheck the item, quantity and unit, and ask the employee for the missing or ambiguous details.'};throw error}
    const log=v.action==='stock_out'?await db.stockOutLog.findUnique({where:{operationId},select:{id:true}}):null
    result={ok:true,inventoryId:result.id,currentStock:result.currentStock,unit:result.unit,operationId,...(log?{stockOutLogId:log.id}:{}),...(photoEvidence?{recordedPhotos:photoEvidence.photos.length}:{})}
  }else if(name==='employee_manage_hygiene'){
    if(v.action==='list_areas'&&!await audienceAllows(db,g,scope,'hygiene.read'))return {ok:false,code:'EMPLOYEE_HYGIENE_NOT_VISIBLE'}
    if(v.action==='list_areas')result=await db.hygieneArea.findMany({where:{storeId},select:{code:true,name:true},orderBy:{code:'asc'},take:100})
    else if(v.action==='list_tasks'){
      const all=await audienceAllows(db,g,scope,'hygiene.read')
      if(!all&&!await audienceAllows(db,g,scope,'personal.tasks'))return {ok:false,code:'EMPLOYEE_HYGIENE_NOT_VISIBLE'}
      result=await db.hygieneTask.findMany({where:{storeId,...(v.date?{date:v.date}:{}),...(all?(v.staffId?{staffId:v.staffId}:{}):{staffId:scope.requesterStaffId||'__none__'})},select:{id:true,name:true,staffId:true,areaCode:true,date:true,time:true,status:true,priority:true,dueTime:true,completedAt:true,photoUrl:true},orderBy:{createdAt:'desc'},take:50})
    }else if(v.action==='create_task'){
      if(!v.name||!v.areaCode||!v.date||!v.staffId)return {ok:false,code:'EMPLOYEE_HYGIENE_DETAILS_REQUIRED',message:'Ask for the required missing details before performing this operation.'}
      if(!await db.hygieneArea.findFirst({where:{storeId,code:v.areaCode}}))deny('EMPLOYEE_HYGIENE_AREA_NOT_FOUND')
      result=await db.hygieneTask.create({data:{storeId,name:v.name,areaCode:v.areaCode,staffId:v.staffId,date:v.date,time:'00:00',priority:v.priority||2,status:'pending',isTemporary:true,note:v.note,dueTime:v.dueTime?new Date(v.dueTime):null}})
      await db.hygieneTaskLog.create({data:{taskId:result.id,action:'created',performedBy:actor,note:v.note||'Created by Hermes under configured store authority'}})
    }else if(v.action==='assign_task'){
      if(!v.taskId||!v.staffId)return {ok:false,code:'EMPLOYEE_HYGIENE_DETAILS_REQUIRED',message:'Ask for the required missing details before performing this operation.'}
      const changed=await db.hygieneTask.updateMany({where:{id:v.taskId,storeId,status:{in:['pending','overdue']}},data:{staffId:v.staffId}})
      if(changed.count!==1)deny('EMPLOYEE_HYGIENE_TASK_NOT_ASSIGNABLE')
      await db.hygieneTaskLog.create({data:{taskId:v.taskId,action:'assigned',performedBy:actor,note:v.note||'Assigned by Hermes'}})
      result={ok:true,taskId:v.taskId,staffId:v.staffId}
    }else deny('EMPLOYEE_BUSINESS_ACTION_INVALID')
  }else if(name==='employee_manage_staff'){
    if(v.action==='list_staff'&&!await audienceAllows(db,g,scope,'staff.read'))return {ok:false,code:'EMPLOYEE_STAFF_NOT_VISIBLE'}
    if(v.action==='list_staff')result=await db.staff.findMany({where:{storeId,status:'active'},select:{id:true,name:true,employeeNumber:true,position:true},orderBy:{name:'asc'},take:100})
    else if(v.action==='set_schedule'){
      if(!v.staffId||!v.date||!v.shift)return {ok:false,code:'EMPLOYEE_SCHEDULE_DETAILS_REQUIRED',message:'Ask for the required missing details before performing this operation.'}
      if(!await db.shift.findFirst({where:{storeId,key:v.shift}}))deny('EMPLOYEE_SCHEDULE_SHIFT_NOT_FOUND')
      // Serialize with the employee record so two Hermes executions cannot both create a daily schedule.
      await db.staff.update({where:{id:v.staffId},data:{updatedAt:new Date()}})
      const rows=await db.schedule.findMany({where:{staffId:v.staffId,date:new Date(v.date)},orderBy:{id:'asc'}})
      if(rows.length>1)throw new TeamError(409,'EMPLOYEE_SCHEDULE_CONFLICT')
      if(rows[0]&&rows[0].status!=='scheduled')throw new TeamError(409,'EMPLOYEE_SCHEDULE_ALREADY_EXECUTED')
      result=rows[0]?await db.schedule.update({where:{id:rows[0].id},data:{shift:v.shift}}):await db.schedule.create({data:{staffId:v.staffId,date:new Date(v.date),shift:v.shift}})
    }else deny('EMPLOYEE_BUSINESS_ACTION_INVALID')
  }else deny('EMPLOYEE_BUSINESS_TOOL_INVALID')
  await db.financeAuditLog.create({data:{storeId,userId:actor,action:'update',entityType:'hermes_business_operation',entityId:operationId,description:name+':'+v.action,newValue:JSON.stringify({agentId:g.agentId,requesterStaffId:scope.requesterStaffId,action:v.action,operationId})}})
  const visiblePermission=name==='employee_manage_inventory'?'inventory.read':name==='employee_manage_staff'?'staff.read':'hygiene.read'
  if(!(name==='employee_manage_hygiene'&&v.action==='list_tasks')&&!await audienceAllows(db,g,scope,visiblePermission))return {ok:true,operationRecorded:true,message:'The authorized operation was recorded. Business details are not visible to this audience.'}
  return visibleBusinessData(db,g,scope,result)
}
