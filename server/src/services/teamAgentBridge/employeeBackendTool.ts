import { z } from 'zod'
import { createHash } from 'node:crypto'
import { backendCatalog, backendDescription, backendOperation, invokeManagementBackend } from '../ManagementBackendRegistry'
import { userAccessV2 } from '../StaffPermissionV2Service'
import { assignedStaffAccess } from '../StaffPermissionService'
import { hasManagementAccess } from '../../utils/managementAccess'
import { audienceAllows, visibleBusinessData, assertToolSettings } from './employeeAccess'
import type { BridgeGrant, CommunicationScope } from './contract'
import { redactBackendSecrets } from '../ManagementBackendPolicy'
import { readTeam,lockTeam } from '../TeamCommunicationService'

export const backendToolProperties = {
  action:{type:'string',enum:['catalog','describe','execute','status']},
  query:{type:'object',additionalProperties:{type:['string','number','boolean','null']}},
  search:{type:'string',maxLength:100},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40},
  operationId:{type:'string',description:'Exact operationId returned by the running backend catalog. Never invent endpoints.'},
  receiptId:{type:'string',description:'Receipt issued by execute. Query status after a lost response; never resubmit an uncertain mutation.'},
  contractVersion:{type:'string',description:'Current version from catalog/describe. Re-discover after a backend upgrade before executing.'},
  pathParams:{type:'object',additionalProperties:{type:'string'}},body:{type:'object',additionalProperties:true},
}
const schema=z.object({action:z.enum(['catalog','describe','execute','status']),search:z.string().max(100).optional(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(40).default(25),operationId:z.string().max(250).optional(),receiptId:z.string().regex(/^[a-f0-9]{64}$/).optional(),contractVersion:z.string().regex(/^[a-f0-9]{64}$/).optional(),pathParams:z.record(z.string()).optional(),query:z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])).optional(),body:z.record(z.unknown()).optional()}).strict()
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
const key=(id:string)=>'team.communication.employeeRuntime.backendOperation.'+id
export type BackendReservation={id:string;created:boolean;argsHash:string}

/** Must be called under the trace lock *before* dispatch. The unique config key
 * is the execution/tool-call identity, not a model-chosen idempotency claim. */
export async function reserveBackendOperation(db:any,storeId:string,scope:CommunicationScope,sourceId:string|undefined,executionId:string,toolCallId:string,args:unknown):Promise<BackendReservation>{
  const id=hash({storeId,executionId,toolCallId}),argsHash=hash(args)
  const prior=await db.config.findUnique({where:{storeId_key:{storeId,key:key(id)}}})
  if(prior){const saved=JSON.parse(prior.value);if(saved.argsHash!==argsHash||saved.compartmentKey!==scope.compartmentKey||saved.requesterStaffId!==scope.requesterStaffId||saved.sourceId!==sourceId)throw Error('BACKEND_RECEIPT_IDENTITY_CHANGED');return {id,created:false,argsHash}}
  const v=args as any,operation=backendOperation(v?.operationId)
  const intent=sourceId&&v?.action==='execute'&&operation&&!operation.httpReadMethod&&operation.effect!=='preview'?hash({storeId,sourceId,requesterStaffId:scope.requesterStaffId,operationId:v.operationId,pathParams:v.pathParams,query:v.query,body:v.body}):undefined
  const intentKey=intent?'team.communication.employeeRuntime.backendIntent.'+intent:undefined
  if(intentKey){
    await lockTeam(db,storeId,'backend-intent.'+intent)
    const existing=await db.config.findUnique({where:{storeId_key:{storeId,key:intentKey}}})
    if(existing){const alias=JSON.parse(existing.value);return {id:alias.id,created:false,argsHash:alias.argsHash}}
  }
  await db.config.create({data:{storeId,key:key(id),category:'hermes_backend_operation',value:JSON.stringify({id,state:'reserved',executionId,toolCallId,argsHash,compartmentKey:scope.compartmentKey,requesterStaffId:scope.requesterStaffId,sourceId,operationId:(args as any)?.operationId,createdAt:new Date().toISOString()})}})
  if(intentKey)await db.config.create({data:{storeId,key:intentKey,category:'hermes_backend_operation',value:JSON.stringify({id,argsHash})}})
  return {id,created:true,argsHash}
}

async function release(db:any,g:BridgeGrant,scope:CommunicationScope,row:any){
  if(row.compartmentKey!==scope.compartmentKey||row.requesterStaffId!==scope.requesterStaffId)return {ok:false,code:'BACKEND_RECEIPT_NOT_VISIBLE'}
  if(row.state==='blocked')return {ok:false,code:row.fault||'BACKEND_OPERATION_BLOCKED',receiptId:row.id,state:'blocked',mayHaveExecuted:false,retryAllowed:false}
  if(row.state!=='complete')return {ok:false,code:'BACKEND_OUTCOME_UNKNOWN',receiptId:row.id,state:row.state,mayHaveExecuted:true,retryAllowed:false,message:'Inspect this receipt and the native business records. Do not dispatch the operation again.'}
  const op=backendOperation(row.operationId),permission=op?.permission?.replace(/\.(write|create|cancel|status|manage|stockIn|stockOut|count)$/i,'.read')
  if(row.resultChannelId){
    const channel=await readTeam<any>(db,g.storeId,'channel.'+row.resultChannelId)
    const members=new Set((channel?.members||[]).map((m:any)=>m.staffId))
    if(!channel||scope.audienceStaffIds.some(id=>!members.has(id))&&!await audienceAllows(db,g,scope,'team.audit'))return {ok:row.result?.ok,receiptId:row.id,state:'complete',executed:row.result?.executed,detailsWithheld:true,code:'BACKEND_CHANNEL_RESULT_NOT_VISIBLE'}
  }else if(op?.permission?.startsWith('personal.')&&scope.audienceStaffIds.some(id=>id!==scope.requesterStaffId)){
    return {ok:row.result?.ok,receiptId:row.id,state:'complete',executed:row.result?.executed,detailsWithheld:true,code:'BACKEND_PERSONAL_RESULT_NOT_VISIBLE'}
  }
  if(permission&&!await audienceAllows(db,g,scope,permission))return {ok:row.result?.ok,receiptId:row.id,state:'complete',executed:row.result?.executed,detailsWithheld:true,requiredPermission:permission}
  return {...await visibleBusinessData(db,g,scope,row.result),receiptId:row.id,state:'complete',executedBy:'hermes_backend',actorScope:'verified_requesting_account'}
}

/** Actual HTTP handlers run outside the trace transaction. Their native business
 * transactions and effects remain unchanged. Completion is durable independently
 * of trace CAS/lease, so a late result cannot disappear or invite duplicate work. */
export async function executeBackendTool(db:any,g:BridgeGrant,scope:CommunicationScope,sourceId:string|undefined,raw:unknown,reservation?:BackendReservation,authorizeDispatch?:()=>Promise<void>){
  const parsed=schema.safeParse(raw)
  if(!parsed.success)return {ok:false,code:'BACKEND_INPUT_INVALID',issues:parsed.error.issues.map(i=>({path:i.path,message:i.message}))}
  const v=parsed.data
  if(v.action==='catalog')return {ok:true,...backendCatalog(v.search,v.offset,v.limit)}
  if(v.action==='status'){
    if(!v.receiptId)return {ok:false,code:'BACKEND_RECEIPT_ID_REQUIRED'}
    const row=await db.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:key(v.receiptId)}}})
    return row?release(db,g,scope,JSON.parse(row.value)):{ok:false,code:'BACKEND_RECEIPT_NOT_FOUND'}
  }
  if(!v.operationId)return {ok:false,code:'BACKEND_OPERATION_ID_REQUIRED'}
  if(v.action==='describe')return backendDescription(v.operationId)
  if(!v.contractVersion)return {ok:false,code:'BACKEND_CONTRACT_VERSION_REQUIRED'}
  if(!reservation)return {ok:false,code:'BACKEND_EXECUTION_RESERVATION_REQUIRED'}
  const record=await db.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:key(reservation.id)}}})
  if(!record)throw Error('BACKEND_EXECUTION_RESERVATION_MISSING')
  const journal=JSON.parse(record.value)
  if(!reservation.created)return release(db,g,scope,journal)
  if(journal.state!=='reserved'||journal.argsHash!==hash(raw))throw Error('BACKEND_EXECUTION_RESERVATION_CHANGED')
  const persist=async(value:any)=>{await db.config.update({where:{id:record.id},data:{value:JSON.stringify(value)}})}
  try{
    await assertToolSettings(db,g.storeId,'employee_backend',raw)
    if(!authorizeDispatch)throw Error('BACKEND_DISPATCH_AUTHORITY_REQUIRED')
    await authorizeDispatch()
    if(!scope.requesterStaffId||!sourceId)throw Error('BACKEND_REQUESTING_ACCOUNT_REQUIRED')
    const person=await db.staff.findFirst({where:{id:scope.requesterStaffId,storeId:g.storeId,status:'active'},include:{user:true}}),user=person?.user
    if(!user||(person.storeId||user.storeId)!==g.storeId||user.id!==person.userId||!['admin','manager','cashier','staff'].includes(user.role))throw Error('BACKEND_REQUESTING_ACCOUNT_UNAVAILABLE')
    const actor:any={id:user.id,phone:user.phone||'',role:user.role,storeId:g.storeId,staffId:person.id,issuedAtMs:Date.now()}
    actor.nativeAgent={agentId:g.agentId,grantVersion:g.version,clientRevision:g.clientRevision,executionId:journal.executionId,name:g.displayName||'Hermes'}
    actor.accessRole=await userAccessV2(actor,db)||await assignedStaffAccess(actor,db)
    actor.employeeApp=!hasManagementAccess(actor.role,actor.accessRole)
    const op=backendOperation(v.operationId)
    if(!op)throw Error('BACKEND_OPERATION_NOT_FOUND')
    const running={...journal,state:'running',actorUserId:user.id,actorRole:user.role,storeId:g.storeId,contractVersion:v.contractVersion,startedAt:new Date().toISOString()}
    const claimed=await db.config.updateMany({where:{id:record.id,value:record.value},data:{value:JSON.stringify(running)}})
    if(claimed.count!==1)throw Error('BACKEND_EXECUTION_ALREADY_CLAIMED')
    const result=await invokeManagementBackend(db,actor,{...v,operationId:v.operationId,contractVersion:v.contractVersion})
    // Never retain credentials even in the private operation ledger.
    const filtered=await visibleBusinessData(db,g,scope,redactBackendSecrets(result))
    const resultChannelId=op.path.startsWith('/api/team/channels/:id/')?v.pathParams?.id:undefined
    const completed={...running,state:'complete',completedAt:new Date().toISOString(),result:filtered,resultChannelId}
    await persist(completed)
    return release(db,g,scope,completed)
  }catch(error:any){
    const current=await db.config.findUnique({where:{id:record.id}}),saved=current&&JSON.parse(current.value)
    const code=/^[A-Z][A-Z0-9_:]{1,120}$/.test(error?.message||'')?error.message:'BACKEND_EXECUTION_UNCONFIRMED'
    await persist({...saved,state:saved?.state==='running'?'unknown':'blocked',fault:code,updatedAt:new Date().toISOString()})
    return {ok:false,code,receiptId:reservation.id,state:saved?.state==='running'?'unknown':'blocked',mayHaveExecuted:saved?.state==='running',retryAllowed:false}
  }
}
