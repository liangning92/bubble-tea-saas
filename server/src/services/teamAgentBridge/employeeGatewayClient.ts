import type { EmployeeRuntimeTicket } from './employeeRuntimeContract'

/** Private deployment transport. Credentials are issued by the backend for one
 * execution; neither this envelope nor its endpoint comes from a model tool. */
export interface EmployeeGatewayEnvelope {
  ticket: EmployeeRuntimeTicket; deadlineAt: string;
  callbackCredential: string; providerCredential: string
}
export interface EmployeeGatewayRpcFrame {
  executionId: string;
  method: 'recordInput'|'recordResponse'|'executeTool'|'recordOutput'|'markUnknown';
  params: Record<string, unknown>
}
export interface EmployeeGatewayReceipt {
  executionId: string; state: 'running'|'complete'|'unknown'; code?: string
}
export interface EmployeeGatewayConfig { origin: string; bearer: string; timeoutMs?: number }
export function createEmployeeGatewayClient(config: EmployeeGatewayConfig) {
  const origin = new URL(config.origin)
  if(origin.protocol!=='http:' || !['127.0.0.1','[::1]','host.docker.internal'].includes(origin.hostname)
    || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || !config.bearer)
    throw Error('EMPLOYEE_GATEWAY_PRIVATE_ORIGIN_REQUIRED')
  const call = async (path:string, body?:EmployeeGatewayEnvelope):Promise<EmployeeGatewayReceipt> => {
    const abort = new AbortController(), timer=setTimeout(()=>abort.abort(), Math.min(config.timeoutMs??5000,10000))
    try {
      const response=await fetch(new URL(path,origin), {method:body?'POST':'GET',redirect:'error',signal:abort.signal,
        headers:{authorization:`Bearer ${config.bearer}`,...(body?{'content-type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})})
      if(!response.ok)throw Error('EMPLOYEE_GATEWAY_REJECTED')
      const value:any=await response.json()
      if(!value || typeof value.executionId!=='string' || !['running','complete','unknown'].includes(value.state)
        || Object.keys(value).some(k=>!['executionId','state','code'].includes(k)))throw Error('EMPLOYEE_GATEWAY_INVALID_RECEIPT')
      return value
    } finally { clearTimeout(timer) }
  }
  return {
    /** Never retry automatically: a missing HTTP response is not non-admission. */
    async start(envelope:EmployeeGatewayEnvelope):Promise<EmployeeGatewayReceipt|{executionId:string;state:'admission_unknown'}> {
      try { const value=await call('/employee-runs',envelope); if(value.executionId!==envelope.ticket.executionId)throw Error('EMPLOYEE_GATEWAY_ID_MISMATCH'); return value }
      catch { return {executionId:envelope.ticket.executionId,state:'admission_unknown'} }
    },
    async get(executionId:string):Promise<EmployeeGatewayReceipt> {
      if(!/^[a-f0-9-]{36}$/.test(executionId))throw Error('EMPLOYEE_GATEWAY_EXECUTION_INVALID')
      const value=await call(`/employee-runs/${executionId}`)
      if(value.executionId!==executionId)throw Error('EMPLOYEE_GATEWAY_ID_MISMATCH')
      return value
    },
  }
}
