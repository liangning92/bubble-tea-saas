// A Symbol cannot arrive in HTTP headers, JSON, URL parameters or model arguments.
// Only the in-process dispatcher may attest an already verified requesting user.
export const MANAGEMENT_BACKEND_IDENTITY = Symbol('verified backend account delegation')
export type NativeBackendAgent = {agentId:string;grantVersion:number;clientRevision:number;executionId:string;name:string}
const agents=new WeakMap<object,NativeBackendAgent>()
export const bindNativeBackendAgent=(actor:object,agent:NativeBackendAgent)=>agents.set(actor,Object.freeze({...agent}))
export const nativeBackendAgent=(actor:object)=>agents.get(actor)
