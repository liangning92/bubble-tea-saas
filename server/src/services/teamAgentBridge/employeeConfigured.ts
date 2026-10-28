import { readFileSync, statSync, realpathSync } from 'fs'
import { isAbsolute } from 'path'
import { z } from 'zod'
import { createEmployeeDeployment } from './employeeDeployment'

const cache=new WeakMap<object,ReturnType<typeof createEmployeeDeployment>>()
/** Existing API / sole worker only. Off by default, no new timer or listener.
 * Supplying config does not enroll a grant or channel: those remain explicit,
 * independently rechecked server-side authorization records. */
export function configuredEmployeeDeployment(db:any) {
  if(process.env.EMPLOYEE_HERMES_ENABLED!=='1')return undefined
  const existing=cache.get(db);if(existing)return existing
  const storeId=z.string().min(1).max(128).parse(process.env.EMPLOYEE_HERMES_STORE_ID)
  const agentId=z.string().uuid().parse(process.env.EMPLOYEE_HERMES_AGENT_ID)
  const root=z.string().min(1).parse(process.env.EMPLOYEE_HERMES_ISOLATED_ROOT)
  const hash=z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.EMPLOYEE_HERMES_SYSTEM_HASH)
  const file=z.string().min(1).parse(process.env.EMPLOYEE_HERMES_GATEWAY_BEARER_FILE)
  if(!isAbsolute(file)||realpathSync(file)!==file||!statSync(file).isFile()||(statSync(file).mode&0o077)!==0||!isAbsolute(root))throw Error('EMPLOYEE_PRIVATE_CONFIG_REQUIRED')
  const bearer=readFileSync(file,'utf8').trim()
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(bearer))throw Error('EMPLOYEE_PRIVATE_CONFIG_REQUIRED')
  const manifestPath=process.env.EMPLOYEE_HERMES_NATIVE_MANIFEST
  let nativeRuntime:any
  if(manifestPath){
    if(!isAbsolute(manifestPath)||realpathSync(manifestPath)!==manifestPath||!statSync(manifestPath).isFile())throw Error('EMPLOYEE_NATIVE_MANIFEST_INVALID')
    const manifest=z.object({version:z.literal(1),profile:z.literal('hermes-native-v2'),hermesSha:z.string().regex(/^[a-f0-9]{40}$/),reviewedProfileHash:z.string().regex(/^[a-f0-9]{64}$/),tools:z.array(z.object({type:z.literal('function'),function:z.object({name:z.string().min(1),description:z.string(),parameters:z.unknown()}).strict()}).strict()).min(1).max(500)}).strict().parse(JSON.parse(readFileSync(manifestPath,'utf8')))
    nativeRuntime={tools:manifest.tools,reviewedProfileHash:manifest.reviewedProfileHash}
  }
  const deployment=createEmployeeDeployment(db,{enabled:true,storeId,agentId,gateway:{origin:z.string().url().parse(process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN),bearer},reviewedSystemTemplate:{hash,isolatedRoot:root},nativeRuntime})
  cache.set(db,deployment);return deployment
}
