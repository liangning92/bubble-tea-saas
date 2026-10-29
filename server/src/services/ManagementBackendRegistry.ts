import express from 'express'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import type { AuthUser } from '../middlewares/auth'
import { MANAGEMENT_BACKEND_IDENTITY, MANAGEMENT_BACKEND_PUBLICATION, nativeBackendPublication } from './ManagementBackendIdentity'
import { backendEffect, backendInputBoundary, redactBackendSecrets, BackendEffect } from './ManagementBackendPolicy'

export const BACKEND_OPERATION = Symbol('server-issued backend operation')
type Declaration = { permission: string | null; ownerOnly: boolean; export: boolean; personal: boolean; routeKey: string; resource?: {model:string;param:string}|null }
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
  if (op.declaration.permission === '__unclassified__') return 'BACKEND_ROUTE_UNCLASSIFIED'
  if(op.effect==='security')return 'ACCOUNT_OR_SYSTEM_CONFIGURATION'
  if(op.effect==='payment')return 'OWNER_APPROVAL_REQUIRED'
  if(op.effect==='attachment')return 'AUTHORIZED_ATTACHMENT_REQUIRED'
  return null
}
const view = (op: Operation, detailed=false) => ({ operationId:op.id,method:op.method,path:op.path,permission:op.declaration.permission,ownerOnly:op.declaration.ownerOnly,effect:op.effect,
  pathParameters:[...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(m=>m[1]),httpReadMethod:['GET','HEAD'].includes(op.method),sideEffects:'native_handler_semantics',boundary:boundary(op),
  ...(detailed?{requestContract:op.requestContract,contractCoverage:Object.keys(op.requestContract).length?'declared_native_validator_only':'native_controller_validation_not_described',
    validation:'Same native middleware, controller and service. A GET may perform native initialization. An absent schema is not an empty input contract; do not guess mutation fields.'}: {}) })
export function backendCatalog(query = '', offset = 0, limit = 25) {
  const list = [...operations.values()].filter(op=>!query || op.id.toLowerCase().includes(query.toLowerCase()) || (op.declaration.permission||'').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.id.localeCompare(b.id))
  return {contractVersion:backendVersion(),total:list.length,offset,operations:list.slice(offset,offset+limit).map(op=>view(op)),nextOffset:offset+limit<list.length?offset+limit:null}
}
export function backendDescription(id: string) {
  const op = operations.get(id)
  return op ? {ok:true,contractVersion:backendVersion(),...view(op,true),bodyContract:'Use the native backend request body. Do not invent missing mutation contracts or IDs. HTTP acceptance is not independent business acceptance.'} : {ok:false,code:'BACKEND_OPERATION_NOT_FOUND',contractVersion:backendVersion()}
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
export async function invokeManagementBackend(db:any, actor:AuthUser, input:{operationId:string;contractVersion:string;pathParams?:Record<string,string>;query?:Record<string,unknown>;body?:any}) {
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
  for(const [key,value] of Object.entries(input.query||{})){if(value!==undefined&&value!==null){if(typeof value==='object')throw Error('BACKEND_QUERY_SCALAR_REQUIRED');query.set(key,String(value))}}
  // Never allow a missing store selector to mean a global administrator query.
  query.set('storeId',actor.storeId)
  const socket=new Duplex({read(){},write(_c,_e,done){done()}})
  const req=new IncomingMessage(socket as any) as any
  req.method=op.method;req.url=target+(query.size?'?'+query.toString():'');req.headers={'content-type':'application/json','x-client-app':actor.employeeApp?'employee':'admin'}
  req.body=input.body||{};req[MANAGEMENT_BACKEND_IDENTITY]=structuredClone(actor);req[BACKEND_OPERATION]=op.id
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
    const capture=(chunk:any)=>{if(chunk===undefined||chunk===null)return;const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));size+=b.length;if(size<=1_000_000)chunks.push(b)}
    const write=res.write.bind(res),end=res.end.bind(res)
    res.write=((chunk:any,...args:any[])=>{capture(chunk);return (write as any)(chunk,...args)}) as any
    res.end=((chunk?:any,...args:any[])=>{if(typeof chunk!=='function')capture(chunk);return (end as any)(chunk,...args)}) as any
    res.once('error',reject)
    res.once('finish',()=>{let body:any,nonJson=false;try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{nonJson=true}
      const result=size>1_000_000?{ok:false,code:'BACKEND_RESULT_TOO_LARGE',statusCode:res.statusCode,executed:true,outcome:'native_response_exceeded_capture_limit',retryAllowed:false}:nonJson?{ok:false,code:'BACKEND_NON_JSON_RESPONSE',statusCode:res.statusCode,bytes:size,executed:true,retryAllowed:false}:{ok:res.statusCode<400&&body?.success!==false&&body?.ok!==false&&(!body?.code||typeof body.code==='number'&&body.code>=200&&body.code<300),statusCode:res.statusCode,data:redactBackendSecrets(body),operationId:op.id,contractVersion:input.contractVersion,executed:true,acceptance:'native_response_only'}
      finish(result)
      // Real ServerResponse end/finish semantics also run native delivery hooks.
      process.nextTick(()=>socket.destroy())
    })
    const app=express();app.disable('x-powered-by');app.use(require('../middlewares/auth').authenticateBeforeRouting)
    for(const mount of mounts)app.use(mount.base,mount.router)
    app.use((error:any,_req:any,response:any,_next:any)=>response.status(400).json({code:400,message:error?.message||'BACKEND_OPERATION_FAILED'}))
    try{(app as any).handle(req,res,()=>finish({ok:false,code:'BACKEND_HANDLER_NOT_FOUND',executed:false}))}catch(error){reject(error)}
  })
}
