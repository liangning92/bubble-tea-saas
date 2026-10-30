import { nativeMultipart, nativeFileInput, storeNativeDownload } from './NativeBackendFiles'
import type { z } from 'zod'
import express from 'express'
import {canUseManagementRoute} from './ManagementRouteAccess'
import {employeeAppAccess,isEmployeeAppRoute} from './EmployeeAppAccess'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import type { AuthUser } from '../middlewares/auth'
import { MANAGEMENT_BACKEND_IDENTITY, MANAGEMENT_BACKEND_PUBLICATION, nativeBackendPublication } from './ManagementBackendIdentity'
import { backendEffect, backendInputBoundary, redactBackendSecrets, BackendEffect } from './ManagementBackendPolicy'

export const BACKEND_OPERATION = Symbol('server-issued backend operation')
type Declaration = { permission: string | null; ownerOnly: boolean; export: boolean; personal: boolean; routeKey: string; resource?: {model:string;param:string}|null;publicationAudience?:any }
type Operation = { id: string; method: string; path: string; base: string; declaration: Declaration; router: any; requestContract:any;effect:BackendEffect }
const operations = new Map<string, Operation>()
const mounts:Array<{base:string;router:any}>=[]
const digest = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const backendVersion = () => digest({ source: process.env.APP_SOURCE_SHA || 'development', routes: [...operations.values()].map(({id,declaration,requestContract,effect})=>({id,declaration,requestContract,effect})).sort((a,b)=>a.id.localeCompare(b.id)) })

/** Called by the normal HTTP route declaration, after its actual access guards.
 * There is no second list of Agent-only business handlers to keep in sync. */
export function registerManagementRouter(base: string, router: any) {
  if(!mounts.some(m=>m.base===base&&m.router===router))mounts.push({base,router})
  for (const layer of router.stack || []) {
    const route = layer.route
    if (!route || typeof route.path !== 'string') continue
    for (const method of Object.keys(route.methods)) {
      const path = base + (route.path === '/' ? '' : route.path)
      const id = method.toUpperCase() + ' ' + path
      if (operations.has(id)) continue // preserve the same first-router precedence as HTTP
      const contracts=route.stack.map((layer:any)=>layer.handle?.backendRequestContract).filter(Boolean)
      const declaration=route.accessSpecs?.[method] || {permission:'__unclassified__',ownerOnly:false,export:false,personal:false,routeKey:id}
      operations.set(id, {id,method:method.toUpperCase(),path,base,router,requestContract:Object.assign({},...contracts),declaration,effect:backendEffect(id,path,method.toUpperCase(),declaration.permission)})
    }
  }
}

function boundary(op: Operation): string | null {
  if(op.effect==='payment')return 'OWNER_APPROVAL_REQUIRED'
  return null
}
const view = (op: Operation, detailed=false) => ({ operationId:op.id,method:op.method,path:op.path,permission:op.declaration.permission,ownerOnly:op.declaration.ownerOnly,effect:op.effect,
  pathParameters:[...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(m=>m[1]),httpReadMethod:['GET','HEAD'].includes(op.method),sideEffects:'native_handler_semantics',boundary:boundary(op),publicationAudience:op.declaration.publicationAudience||null,
  ...(detailed?{requestContract:op.requestContract,contractCoverage:Object.keys(op.requestContract).length?'declared_native_validator_only':'native_controller_validation_not_described',
    validation:'Same native middleware, controller and service. A GET may perform native initialization. An absent schema is not an empty input contract; do not guess mutation fields.'}: {}) })
/** Account-level preflight uses the same native route declarations and access
 * helpers as HTTP. Resource/body/publication checks still run in native handlers. */
export function backendAccountAccess(actor:any,id:string){
 const op=operations.get(id);if(!op)return {allowed:false,code:'BACKEND_OPERATION_NOT_FOUND'}
 const spec=op.declaration as any
 const access=actor.employeeApp?employeeAppAccess(actor.role):actor.accessRole
 const user={...actor,role:actor.employeeApp?'staff':actor.role,accessRole:access}
 if(!canUseManagementRoute(user,{...spec,routeKey:op.id}))return {allowed:false,code:'MANAGEMENT_ACCESS_REQUIRED',requiredPermission:spec.permission}
 if(user.role==='admin'&&!user.employeeApp)return {allowed:true,mode:'allow'}
 if(spec.ownerOnly)return {allowed:false,code:'STAFF_ACCESS_OWNER_REQUIRED',requiredPermission:spec.permission}
 if(access?.version===2){
  const permission=!user.employeeApp&&spec.permission==='personal.tasks'&&access.id==='manager'?(['GET','HEAD'].includes(op.method)?'hygiene.read':'hygiene.write'):spec.permission
  const mode=user.employeeApp&&isEmployeeAppRoute(op.id,spec)?'allow':permission?access.modes?.[permission]:'allow'
  if(mode!=='allow')return {allowed:false,code:mode==='approval'?'STAFF_ACCESS_APPROVAL_REQUIRED':'STAFF_ACCESS_PERMISSION_DENIED',requiredPermission:permission,mode:mode||'deny'}
  if(spec.export&&access.modes?.['data.export']!=='allow')return {allowed:false,code:'STAFF_ACCESS_PERMISSION_DENIED',requiredPermission:'data.export'}
 }else{
  if(spec.legacyRoles&&!spec.legacyRoles.includes(user.role))return {allowed:false,code:'STAFF_ACCESS_PERMISSION_DENIED',requiredPermission:spec.permission}
  if(access&&spec.legacyPermission&&!access.permissions.includes(spec.legacyPermission))return {allowed:false,code:'STAFF_ACCESS_PERMISSION_DENIED',requiredPermission:spec.permission}
 }
 return {allowed:true,mode:'allow'}
}
export function backendAccountSummary(actor:any){
 const access=actor.employeeApp?employeeAppAccess(actor.role):actor.accessRole
 return {role:actor.role,employeeApp:!!actor.employeeApp,accessRole:access?{id:access.id,version:access.version,permissions:access.permissions,modes:access.modes}:null,
  authority:'current_requesting_account',resourceChecks:'native_handlers',instructions:'Check accountAccess before requesting business details or changes. If denied, explain the missing permission and stop that operation; do not try alternative endpoints. Approval is not allow. Catalog discovery does not grant access.'}
}
export function backendCatalog(query = '', offset = 0, limit = 25, actor?:any) {
  const list = [...operations.values()].filter(op=>!query || op.id.toLowerCase().includes(query.toLowerCase()) || (op.declaration.permission||'').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.id.localeCompare(b.id))
  return {contractVersion:backendVersion(),total:list.length,offset,operations:list.slice(offset,offset+limit).map(op=>({...view(op),...(actor?{accountAccess:backendAccountAccess(actor,op.id)}:{})})),nextOffset:offset+limit<list.length?offset+limit:null}
}
export function backendDescription(id: string, actor?:any) {
  const op = operations.get(id)
  return op ? {ok:true,contractVersion:backendVersion(),...view(op,true),...(actor?{accountAccess:backendAccountAccess(actor,id)}:{}),bodyContract:'Use the native backend request body. Do not invent missing mutation contracts or IDs. HTTP acceptance is not independent business acceptance.'} : {ok:false,code:'BACKEND_OPERATION_NOT_FOUND',contractVersion:backendVersion()}
}
export const backendOperation = (id:string) => { const op=operations.get(id);return op?view(op):null }

function assertStore(value:any, storeId:string, depth=0) {
  if (depth>20) throw Error('BACKEND_REQUEST_TOO_DEEP')
  if (!value || typeof value !== 'object') return
  for (const [key,v] of Object.entries(value)) {
    if (['__proto__','prototype','constructor'].includes(key)) throw Error('BACKEND_REQUEST_KEY_FORBIDDEN')
    if (key === 'storeId' && v !== storeId) throw Error('BACKEND_STORE_MISMATCH')
    assertStore(v,storeId,depth+1)
  }
}

async function assertRelatedStores(db:any,value:any,storeId:string,operationPath:string):Promise<void>{
  if(!value||typeof value!=='object')return
  const models:Record<string,string>={staffId:'staff',productId:'product',inventoryId:'inventory',memberId:'member',supplierId:'supplier',orderId:'order',addonId:'addon',mediaId:'mediaAsset',channelId:'channel',couponId:'coupon'}
  for(const [key,v] of Object.entries(value)){
    const model=key==='categoryId'?(operationPath.startsWith('/api/products')?'category':operationPath.startsWith('/api/marketing/activities')?'campaignCategory':undefined):models[key]
    if(model&&typeof v==='string'&&v){const row=await db[model].findUnique({where:{id:v},select:{storeId:true}});if(!row||row.storeId!==storeId)throw Error('BACKEND_TARGET_NOT_IN_STORE')}
    if(key==='specId'&&typeof v==='string'&&v){const row=await db.spec.findUnique({where:{id:v},select:{product:{select:{storeId:true}}}});if(!row||row.product.storeId!==storeId)throw Error('BACKEND_TARGET_NOT_IN_STORE')}
    if(Array.isArray(v)&&['productIds','staffIds','memberIds','mediaIds','channelIds','specIds'].includes(key))for(const id of v)await assertRelatedStores(db,{[key.slice(0,-1)]:id},storeId,operationPath)
    await assertRelatedStores(db,v,storeId,operationPath)
  }
}

/** No external URL, bearer, cookie, filesystem path, SQL or source code enters
 * this API. Identity is resolved by the trusted runtime, never by tool arguments. */
export async function invokeManagementBackend(db:any, actor:AuthUser, input:{operationId:string;contractVersion:string;pathParams?:Record<string,string>;query?:Record<string,unknown>;body?:any;files?:z.infer<typeof nativeFileInput>[]}) {
  const op = operations.get(input.operationId)
  if (!op) return {ok:false,code:'BACKEND_OPERATION_NOT_FOUND',contractVersion:backendVersion()}
  if (input.contractVersion !== backendVersion()) return {ok:false,code:'BACKEND_CONTRACT_CHANGED',contractVersion:backendVersion(),executed:false}
  const blocked=boundary(op)
  if (blocked) return {ok:false,code:blocked,executed:false}
  const inputBlocked=backendInputBoundary({...op,permission:op.declaration.permission},input)
  if(inputBlocked)return {ok:false,code:inputBlocked,executed:false}
  if(op.id==='POST /api/expenses'&&actor.role==='cashier')return {ok:false,code:'OWNER_APPROVAL_REQUIRED',executed:false}
  assertStore(input.body,actor.storeId);assertStore(input.query,actor.storeId);assertStore(input.pathParams,actor.storeId)
  await assertRelatedStores(db,input.body,actor.storeId,op.path);await assertRelatedStores(db,input.query,actor.storeId,op.path);await assertRelatedStores(db,input.pathParams,actor.storeId,op.path)
  const parameters=[...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(m=>m[1])
  if (Object.keys(input.pathParams||{}).some(k=>!parameters.includes(k))) throw Error('BACKEND_PATH_PARAMETER_UNKNOWN')
  let target=op.path
  for(const key of parameters){const value=input.pathParams?.[key];if(!value||/[\/?#\\\u0000-\u001f]/.test(value)||value==='.'||value==='..')throw Error('BACKEND_PATH_PARAMETER_REQUIRED:'+key);target=target.replace(':'+key,encodeURIComponent(value))}
  if (op.path.startsWith('/api/stores/') && input.pathParams?.id && input.pathParams.id !== actor.storeId) throw Error('BACKEND_STORE_MISMATCH')
  // Enforce store ownership for declared URL resources even for the owner role.
  const resource=op.declaration.resource
  if(resource&&input.pathParams?.[resource.param]){
    const model=db[resource.model];if(!model)throw Error('BACKEND_RESOURCE_MODEL_UNAVAILABLE')
    const record=await model.findUnique({where:{id:input.pathParams[resource.param]},select:resource.model==='salary'?{staff:{select:{storeId:true}}}:{storeId:true}})
    if(!record||(record.storeId||record.staff?.storeId)!==actor.storeId)throw Error('BACKEND_TARGET_NOT_IN_STORE')
  }
  const query=new URLSearchParams()
  const appendQuery=(key:string,value:any)=>{
    if(value===undefined||value===null)return
    if(Array.isArray(value)){value.forEach((item,index)=>appendQuery(key+'['+index+']',item));return}
    if(typeof value==='object'){for(const [part,item]of Object.entries(value))appendQuery(key+'['+part+']',item);return}
    query.append(key,String(value))
  }
  for(const [key,value]of Object.entries(input.query||{}))appendQuery(key,value)
  // Never allow a missing store selector to mean a global administrator query.
  query.set('storeId',actor.storeId)
  const multipart=input.files?.length?await nativeMultipart(db,actor,input.body,input.files,!!op.declaration.publicationAudience?.publicOutput):undefined
  const socket=new Duplex({read(){},write(_c,_e,done){done()}})
  const req=new IncomingMessage(socket as any) as any
  req.method=op.method;req.url=target+(query.size?'?'+query.toString():'');req.headers={'content-type':multipart?.contentType||'application/json','x-client-app':actor.employeeApp?'employee':'admin',...(multipart?{'content-length':String(multipart.bytes.length)}:{})}
  if(multipart){req.complete=true;req.push(multipart.bytes);req.push(null)}
  req.body=multipart?undefined:(input.body||{});req[MANAGEMENT_BACKEND_IDENTITY]=structuredClone(actor);req[BACKEND_OPERATION]=op.id
  req[MANAGEMENT_BACKEND_PUBLICATION]=nativeBackendPublication(actor)
  const res=new ServerResponse(req)
  res.assignSocket(socket as any)
  const chunks:Buffer[]=[];let size=0
  // Run outside the Agent trace transaction. Native handlers retain their own
  // transaction, notification and file semantics; the operation ledger tracks
  // uncertain/late results without pretending these effects are reversible.
  return new Promise<any>((resolve,reject)=>{
    let finished=false
    const finish=(value:any)=>{if(finished)return;finished=true;resolve(value)}
    const capture=(chunk:any)=>{if(chunk===undefined||chunk===null)return;const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));size+=b.length;chunks.push(b)}
    const write=res.write.bind(res),end=res.end.bind(res)
    res.write=((chunk:any,...args:any[])=>{capture(chunk);return (write as any)(chunk,...args)}) as any
    res.end=((chunk?:any,...args:any[])=>{if(typeof chunk!=='function')capture(chunk);return (end as any)(chunk,...args)}) as any
    res.once('error',reject)
    res.once('finish',()=>{void (async()=>{
      const bytes=Buffer.concat(chunks),contentType=String(res.getHeader('content-type')||'application/octet-stream');
      let body:any,nonJson=false;try{body=JSON.parse(bytes.toString())}catch{nonJson=true}
      if(nonJson||size>1_000_000){
        const download=nonJson?bytes:Buffer.from(JSON.stringify(redactBackendSecrets(body)));
        const artifact=await storeNativeDownload(db,actor,download,contentType.split(';')[0],op.id);
        finish({ok:res.statusCode<400,statusCode:res.statusCode,artifact,operationId:op.id,contractVersion:input.contractVersion,executed:true,acceptance:'native_response_only'});
      }else finish({ok:res.statusCode<400&&body?.success!==false&&body?.ok!==false&&(!body?.code||typeof body.code==='number'&&body.code>=200&&body.code<300),statusCode:res.statusCode,data:redactBackendSecrets(body),operationId:op.id,contractVersion:input.contractVersion,executed:true,acceptance:'native_response_only'});
      process.nextTick(()=>socket.destroy());
    })().catch(reject)});
    const app=express();app.disable('x-powered-by');app.use(require('../middlewares/auth').authenticateBeforeRouting)
    for(const mount of mounts)app.use(mount.base,mount.router)
    app.use((error:any,_req:any,response:any,_next:any)=>response.status(400).json({code:400,message:error?.message||'BACKEND_OPERATION_FAILED'}))
    try{(app as any).handle(req,res,()=>finish({ok:false,code:'BACKEND_HANDLER_NOT_FOUND',executed:false}))}catch(error){reject(error)}
  })
}
