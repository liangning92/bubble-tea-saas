import { Router, json } from 'express'
import { z } from 'zod'
import { createEmployeeRuntime } from './employeeRuntime'
import { employeeRuntimeDigest } from './employeeRuntimeSources'
import { TeamAgentModelTransport } from '../TeamAiService'

type Runtime = ReturnType<typeof createEmployeeRuntime>
/** Private gateway ingress. No production mount or credential enrollment. The
 * deployment must resolve a server-issued execution-scoped credential afresh;
 * neither request bodies nor the model may select their own runtime or grant. */
export function createEmployeeRuntimeHttp(deps:{enabled?:boolean;
  resolve(credential:string,kind:'callback'|'provider'):Promise<{executionId:string;expiresAt:string;runtime:Runtime}|null>;
  transport:TeamAgentModelTransport}) {
  const router=Router()
  router.use(json({limit:'4mb'}))
  async function access(req:any,kind:'callback'|'provider') {
    if(deps.enabled!==true)throw Error('EMPLOYEE_INGRESS_DISABLED')
    const match=/^Bearer ([^\s]{16,4096})$/.exec(req.headers.authorization||'')
    const result=match&&await deps.resolve(match[1],kind)
    if(!result||Date.parse(result.expiresAt)<=Date.now())throw Error('EMPLOYEE_INGRESS_UNAUTHORIZED')
    return result
  }
  const uuid=z.string().uuid()
  router.post('/rpc',async(req,res)=>{
    let v:any
    try{
      const a=await access(req,'callback'); v=z.object({executionId:uuid,method:z.enum(['recordInput','recordResponse','executeTool','recordOutput','markUnknown']),params:z.record(z.unknown())}).strict().parse(req.body)
      if(v.executionId!==a.executionId||v.params.executionId!==a.executionId)throw Error('EMPLOYEE_INGRESS_UNAUTHORIZED')
      const host=a.runtime.host
      const result=v.method==='markUnknown' ? await host.markUnknown(a.executionId,z.number().int().positive().parse(v.params.expectedTraceVersion),z.string().regex(/^[A-Z0-9_]{1,100}$/).parse(v.params.code)) : await host[v.method](v.params as any)
      res.json({result:result??null})
    }catch(error:any){
      console.error('[EmployeeRuntimeHttp] RPC error in', v?.method, error?.message || error, error?.stack)
      res.status(403).json({error:'EMPLOYEE_RUNTIME_RPC_DENIED'})
    }
  })
  router.post('/v1/chat/completions',async(req,res)=>{
    let admission:Awaited<ReturnType<Runtime['provider']['claim']>>|undefined,runtime:Runtime|undefined
    try{
      const a=await access(req,'provider');runtime=a.runtime
      admission=await runtime.provider.claim(a.executionId,employeeRuntimeDigest(req.body))
      // This is the complete approved SDK input. The explicit server transform
      // uses a non-streaming provider request, low effort, and no output cap.
      const p=admission.request,request={model:p.model,messages:p.messages,tools:p.tools,tool_choice:'auto' as const,
        stream:false as const,reasoning_effort:'low' as const,reasoning_split:true as const}
      const raw=await deps.transport(admission.storeId,admission.configVersion,request,async()=>{
        if(Date.now()>=Math.min(admission!.deadlineAt,Date.parse(a.expiresAt)))throw Error('EMPLOYEE_INGRESS_EXPIRED')
        // Credential revocation is checked again immediately before transport.
        const live=await access(req,'provider');if(live.executionId!==a.executionId)throw Error('EMPLOYEE_INGRESS_UNAUTHORIZED')
        await runtime!.provider.assertFresh(admission!.executionId,admission!.turn,admission!.inputHash,request)
      },Math.min(admission.deadlineAt,Date.parse(a.expiresAt)))
      if (!raw?.choices?.[0]?.message) {
        console.error('[EmployeeRuntimeHttp] Invalid MiniMax response:', JSON.stringify(raw))
      }
      await runtime.provider.settle(a.executionId,admission.turn,admission.inputHash,{state:'response',value:raw})
      if(p.stream===true){
        const choice=raw?.choices?.[0],message=choice?.message
        if(!raw?.id||!message)throw Error('EMPLOYEE_PROVIDER_RESPONSE_INVALID')
        const calls=message.tool_calls?.map((c:any,index:number)=>({...c,index}))
        const base={id:raw.id,object:'chat.completion.chunk',created:raw.created||0,model:p.model}
        res.setHeader('Content-Type','text/event-stream')
        res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:message.content??null,...(calls?{tool_calls:calls}:{})},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:choice.finish_reason}]})+'\n\ndata: [DONE]\n\n')
      }else res.json(raw)
    }catch(err:any){
      console.error('[EmployeeRuntimeHttp] completions error:', err?.message || err, err?.stack)
      if(admission&&runtime)try{await runtime.provider.settle(admission.executionId,admission.turn,admission.inputHash,{state:'unknown'})}catch{/* A known saved receipt is never overwritten by a late failure. */}
      if(!res.headersSent)res.status(409).json({error:'EMPLOYEE_PROVIDER_UNCONFIRMED_NO_RETRY'})
    }
  })
  return router
}
