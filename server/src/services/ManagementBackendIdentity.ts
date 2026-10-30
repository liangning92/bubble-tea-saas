// A Symbol cannot arrive in HTTP headers, JSON, URL parameters or model arguments.
// Only the in-process dispatcher may attest an already verified requesting user.
export const MANAGEMENT_BACKEND_IDENTITY = Symbol('verified backend account delegation')
export type NativeBackendAgent = {agentId:string;grantVersion:number;clientRevision:number;executionId:string;name:string;replyToSeq?:number}
const agents=new WeakMap<object,NativeBackendAgent>()
export const bindNativeBackendAgent=(actor:object,agent:NativeBackendAgent)=>agents.set(actor,Object.freeze({...agent}))
export const nativeBackendAgent=(actor:object)=>agents.get(actor)

/** Provenance is not publication authority. This capability stays in process;
 * it never enters JSON, a JWT, a tool receipt or a cloned account object. */
export const MANAGEMENT_BACKEND_PUBLICATION = Symbol('native backend publication capability')
export interface NativeBackendPublication {
  check(db:any, target:{channelId?:string;publicOutput?:boolean;members:Array<{staffId:string;fromSeq:number}>}, input:unknown):Promise<void>
}
const publications=new WeakMap<object,NativeBackendPublication>()
export const bindNativeBackendPublication=(actor:object,capability:NativeBackendPublication)=>publications.set(actor,capability)
export const nativeBackendPublication=(actor:object)=>publications.get(actor)
export async function assertNativeBackendPublication(db:any,actor:object,target:{channelId?:string;publicOutput?:boolean;members:Array<{staffId:string;fromSeq:number}>},input:unknown){
  if(!nativeBackendAgent(actor))return
  const capability=publications.get(actor)
  if(!capability)throw Error('BACKEND_PUBLICATION_CAPABILITY_REQUIRED')
  await capability.check(db,target,input)
}

/** Native route output audiences are declared alongside their account ACLs.
 * Human operators retain the ordinary handler; Agent publishing must originate
 * in a context that is visible to the same recipients, not a private parent. */
export async function assertDeclaredPublication(db:any,actor:any,spec:any,input:any,params:any){
 if(!nativeBackendAgent(actor)||!spec?.publicationAudience)return
 const declaration=spec.publicationAudience,ids=new Set<string>()
 if(declaration.staffField&&typeof input?.[declaration.staffField]==='string')ids.add(input[declaration.staffField])
 if(declaration.resourceModel&&params?.[declaration.resourceParam]){
  const row=await db[declaration.resourceModel].findFirst({where:{id:params[declaration.resourceParam],storeId:actor.storeId},select:{staffId:true}})
  if(!row)throw Error('BACKEND_TARGET_NOT_IN_STORE')
  if(row.staffId)ids.add(row.staffId)
 }
 if(declaration.allStaff&&!ids.size){for(const row of await db.staff.findMany({where:{storeId:actor.storeId,status:'active'},select:{id:true}}))ids.add(row.id)}
 if(!ids.size)throw Error('BACKEND_PUBLICATION_TARGET_REQUIRED')
 await assertNativeBackendPublication(db,actor,{publicOutput:!!declaration.publicOutput,members:[...ids].map(staffId=>({staffId,fromSeq:0}))},input)
}
