/** Transport to the installed Hermes native API. Does not implement an Agent loop,
 * enumerate business tools, rewrite SDK tool schemas or own conversation memory. */
export interface NativeHermesRun {
 id:string;status:string;output?:unknown;error?:unknown;usage?:unknown
}
export interface NativeHermesRequest {
 input:unknown;session_id:string;instructions?:string
}
export class HermesNativeClient {
 private readonly origin:URL
 constructor(origin:string,private readonly key:string,private readonly profileKey?:string){
  if(profileKey&&!/^[a-f0-9]{64}$/.test(profileKey))throw Error('HERMES_NATIVE_PROFILE_INVALID')
  this.origin=new URL(origin)
  if(this.origin.protocol!=='http:'||!['127.0.0.1','[::1]','host.docker.internal'].includes(this.origin.hostname)||this.origin.username||this.origin.password||this.origin.pathname!=='/'||this.origin.search||this.origin.hash||!key)throw Error('HERMES_NATIVE_PRIVATE_ORIGIN_REQUIRED')
 }
 private async request(path:string,body?:unknown,headers:Record<string,string>={},deadline?:number){
  if(deadline!==undefined&&deadline<=Date.now())throw Error('HERMES_NATIVE_DEADLINE')
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(30000,deadline===undefined?30000:deadline-Date.now()))
  try{
   const response=await fetch(new URL((this.profileKey?'/profiles/'+this.profileKey:'')+path,this.origin),{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:'Bearer '+this.key,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal})
   if(!response.ok){const detail=await response.json().catch(()=>null),code=typeof detail?.error==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(detail.error)?detail.error:'HERMES_NATIVE_HTTP_'+response.status;const error:any=Error(code);error.status=response.status;throw error}
   return await response.json()
  }catch(error:any){if(controller.signal.aborted)throw Error('HERMES_NATIVE_TIMEOUT');throw error}finally{clearTimeout(timer)}
 }
 async configure(context:Record<string,unknown>,deadline?:number){return this.request('/native/context',context,{},deadline)}
 async admission(request:NativeHermesRequest,key:string){return this.request('/native/admission',{request,key},{},Date.now()+3000)}
 /** Preparation has no model context or business authority. Cold startup may exceed a status probe. */
 async prepare(){return this.request('/native/readiness',undefined,{},Date.now()+25000)}
 async readiness(){return this.request('/native/readiness',undefined,{},Date.now()+3000)}
 async gatewayHealth(){return this.request('/health')}
 async capabilities(){
  const value=await this.request('/v1/capabilities')
  if(!value||typeof value!=='object')throw Error('HERMES_NATIVE_CAPABILITIES_INVALID')
  return value
 }
 async submit(request:NativeHermesRequest,idempotencyKey:string,deadline?:number){
  if(!idempotencyKey||!/^[!-~]{1,255}$/.test(idempotencyKey)||!request.session_id)throw Error('HERMES_NATIVE_ADMISSION_INVALID')
  return this.request('/v1/runs',request,{'Idempotency-Key':idempotencyKey,'X-Hermes-Session-Key':request.session_id},deadline)
 }
 async status(runId:string){return this.request('/v1/runs/'+encodeURIComponent(runId),undefined,{},Date.now()+3000)}
 async cancel(runId:string){return this.request('/v1/runs/'+encodeURIComponent(runId)+'/stop',{})}
 async steer(runId:string,message:string){return this.request('/v1/runs/'+encodeURIComponent(runId)+'/steer',{message})}
 async *events(runId:string,signal?:AbortSignal):AsyncGenerator<unknown>{
  const response=await fetch(new URL((this.profileKey?'/profiles/'+this.profileKey:'')+'/v1/runs/'+encodeURIComponent(runId)+'/events',this.origin),{headers:{authorization:'Bearer '+this.key,accept:'text/event-stream'},redirect:'error',signal})
  if(!response.ok||!response.body)throw Error('HERMES_NATIVE_EVENTS_UNAVAILABLE')
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending=''
  try{for(;;){const part=await reader.read();pending+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done}).replace(/\r\n/g,'\n');let end:number
   while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]')yield JSON.parse(data)}
   if(part.done){if(pending.trim())throw Error('HERMES_NATIVE_EVENT_TRUNCATED');break}
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 }
}
