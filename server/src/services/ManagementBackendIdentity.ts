// A Symbol cannot arrive in HTTP headers, JSON, URL parameters or model arguments.
// Only the in-process dispatcher may attest an already verified requesting user.
export const MANAGEMENT_BACKEND_IDENTITY = Symbol('verified backend account delegation')
export type NativeBackendAgent = {agentId:string;grantVersion:number;clientRevision:number;executionId:string;name:string}
const agents=new WeakMap<object,NativeBackendAgent>()
export const bindNativeBackendAgent=(actor:object,agent:NativeBackendAgent)=>agents.set(actor,Object.freeze({...agent}))
export const nativeBackendAgent=(actor:object)=>agents.get(actor)

/** Provenance is not publication authority. This capability stays in process;
 * it never enters JSON, a JWT, a tool receipt or a cloned account object. */
export const MANAGEMENT_BACKEND_PUBLICATION = Symbol('native backend publication capability')
export interface NativeBackendPublication {
  check(db:any, target:{channelId?:string;members:Array<{staffId:string;fromSeq:number}>}, input:unknown):Promise<void>
}
const publications=new WeakMap<object,NativeBackendPublication>()
export const bindNativeBackendPublication=(actor:object,capability:NativeBackendPublication)=>publications.set(actor,capability)
export const nativeBackendPublication=(actor:object)=>publications.get(actor)
export async function assertNativeBackendPublication(db:any,actor:object,target:{channelId?:string;members:Array<{staffId:string;fromSeq:number}>},input:unknown){
  if(!nativeBackendAgent(actor))return
  const capability=publications.get(actor)
  if(!capability)throw Error('BACKEND_PUBLICATION_CAPABILITY_REQUIRED')
  await capability.check(db,target,input)
}
