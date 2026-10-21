import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { createHash } from 'crypto'
import { resolve, isAbsolute, join } from 'path'
import { realpath, stat } from 'fs/promises'
import type { EmployeeRuntimeHostPort, EmployeeRuntimeTicket } from './employeeRuntimeContract'
import { EMPLOYEE_RUNTIME_PROTOCOL } from './employeeRuntimeContract'

/** Server-owned deployment configuration only. Never obtained from a tool body.
 * The model credential travels only over the child's private stdin pipe. */
export interface EmployeeRuntimeChildConfig {
  python: string; repository: string; hermesSource: string; hermesExpectedSha: string;
  isolatedRoot: string; providerBaseUrl: string; providerCredential: string;
  deadlineAt: string
  /** Private test/operations sink only; never forwarded in HTTP error responses. */
  diagnosticSink?: (chunk:Buffer)=>void
}
export async function runEmployeeRuntimeChild(ticket: EmployeeRuntimeTicket, port: EmployeeRuntimeHostPort, config: EmployeeRuntimeChildConfig): Promise<{state:'complete'|'unknown';executionId:string}> {
  if(!isAbsolute(config.python)||resolve(config.python)!==config.python||!(await stat(config.python)).isFile())throw Error('EMPLOYEE_RUNTIME_PYTHON_REQUIRED')
  for (const p of [config.repository,config.hermesSource,config.isolatedRoot]) {
    if (!isAbsolute(p) || resolve(p)!==p || await realpath(p)!==p) throw Error('EMPLOYEE_RUNTIME_CANONICAL_PATH_REQUIRED')
  }
  if (!/^[a-f0-9]{40}$/.test(config.hermesExpectedSha) || !config.providerCredential) throw Error('EMPLOYEE_RUNTIME_CONFIGURATION_INVALID')
  const info=await stat(config.isolatedRoot)
  if(!info.isDirectory() || (info.mode & 0o077)!==0)throw Error('EMPLOYEE_RUNTIME_PRIVATE_ROOT_REQUIRED')
  const remaining=Math.min(Date.parse(config.deadlineAt)-Date.now(),120000)
  if(!Number.isFinite(remaining)||remaining<=0)throw Error('EMPLOYEE_RUNTIME_EXPIRED')
  // Reuse the already reviewed exact raw-tree verifier (CRLF-aware, no git replace,
  // filters or untracked import shadows). Verify BEFORE importing Hermes code.
  const bootstrap='import sys,runpy;sys.path.insert(0,sys.argv[1]);from pdca_launcher import verify_source_tree;verify_source_tree(__import__("pathlib").Path(sys.argv[2]),expected_commit=sys.argv[3]);runpy.run_path(sys.argv[4],run_name="__main__")'
  const child=spawn(config.python,['-I','-B','-c',bootstrap,join(config.repository,'hermes'),config.hermesSource,config.hermesExpectedSha,join(config.repository,'scripts/hermes_employee/host_stdio.py')],{
    env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1',PYTHONUNBUFFERED:'1'},stdio:['pipe','pipe','pipe'],cwd:config.isolatedRoot,
  })
  const decoder=new StringDecoder('utf8')
  let version=ticket.traceVersion,buffer='',finished=false,failed=false,outputStored=false,bytes=0,failureCode='EMPLOYEE_RUNTIME_CHILD_UNCONFIRMED'
  let queue:Promise<void>=Promise.resolve()
  const stop=(error?:unknown)=>{const code=(error as any)?.code||(error as any)?.message;if(typeof code==='string'&&/^[A-Z0-9_]{1,100}$/.test(code))failureCode=code;failed=true;child.kill('SIGTERM')}
  const timer=setTimeout(stop,remaining)
  // Stderr can contain library/raw response prose. Drain without publishing or
  // including it in errors; structured persistent port records are the evidence.
  child.stderr.on('data',(chunk:Buffer)=>config.diagnosticSink?.(chunk))
  child.stdin.on('error',stop)
  child.stdout.on('data',(chunk:Buffer)=>{
    bytes+=chunk.length;if(bytes>8_000_000){stop();return}
    buffer+=decoder.write(chunk)
    let newline:number
    while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1)
      queue=queue.then(async()=>{
        if(failed) return
        const frame=JSON.parse(line)
        if(frame.protocol!==EMPLOYEE_RUNTIME_PROTOCOL||Object.keys(frame).some(k=>!['protocol','method','params'].includes(k)))throw Error('EMPLOYEE_RUNTIME_FRAME_INVALID')
        if(frame.method==='finished'){
          if(!outputStored||finished||frame.params?.unknown||frame.params?.stored?.requestId!==ticket.requestId||frame.params?.stored?.traceVersion!==version)throw Error('EMPLOYEE_RUNTIME_UNCONFIRMED')
          finished=true;return
        }
        if(finished||!frame.params||frame.params.executionId!==ticket.executionId||frame.params.expectedTraceVersion!==version)throw Error('EMPLOYEE_RUNTIME_FRAME_ORDER_INVALID')
        let result:any
        switch(frame.method){
          case 'recordInput':result=await port.recordInput(frame.params);break
          case 'recordResponse':result=await port.recordResponse(frame.params);break
          case 'executeTool':result=await port.executeTool(frame.params);break
          case 'recordOutput':result=await port.recordOutput(frame.params);if(result?.requestId!==ticket.requestId||result?.text!==frame.params.providerMessage?.content)throw Error('EMPLOYEE_RUNTIME_OUTPUT_RECEIPT_INVALID');outputStored=true;break
          case 'markUnknown':await port.markUnknown(ticket.executionId,version,frame.params.code);failed=true;result=null;break
          default:throw Error('EMPLOYEE_RUNTIME_METHOD_DENIED')
        }
        if(frame.method!=='markUnknown'){if(!Number.isSafeInteger(result?.traceVersion)||result.traceVersion!==version+1)throw Error('EMPLOYEE_RUNTIME_RECEIPT_VERSION_INVALID');version=result.traceVersion}
        child.stdin.write(JSON.stringify({result})+'\n')
      }).catch(stop)
    }
  })
  const exit=new Promise<number|null>(resolveExit=>{child.once('error',()=>{failed=true;resolveExit(null)});child.once('close',resolveExit)})
  child.stdin.write(JSON.stringify({ticket,config:{isolatedRoot:config.isolatedRoot,homePath:join(config.isolatedRoot,'homes',createHash('sha256').update(ticket.executionId).digest('hex')),hermesSource:config.hermesSource,hermesExpectedSha:config.hermesExpectedSha,providerBaseUrl:config.providerBaseUrl,providerCredential:config.providerCredential}})+'\n')
  const code=await exit;clearTimeout(timer);await queue
  if(code!==0||failed||!finished||buffer.trim()){
    await port.markUnknown(ticket.executionId,version,failureCode)
    return {state:'unknown',executionId:ticket.executionId}
  }
  // finished alone is insufficient: recordOutput already checked the exact final
  // persisted response, and the trusted port is the only path to native writes.
  return {state:'complete',executionId:ticket.executionId}
}
