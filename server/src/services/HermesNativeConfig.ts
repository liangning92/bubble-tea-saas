import {readFileSync,statSync,realpathSync} from 'node:fs'
import {isAbsolute} from 'node:path'
import {z} from 'zod'
export function nativeHermesConfig(){
 if(process.env.EMPLOYEE_HERMES_ENABLED!=='1')return undefined
  const storeId=z.string().min(1).max(128).parse(process.env.EMPLOYEE_HERMES_STORE_ID)
  const agentId=z.string().uuid().parse(process.env.EMPLOYEE_HERMES_AGENT_ID)
  const file=z.string().min(1).parse(process.env.EMPLOYEE_HERMES_GATEWAY_BEARER_FILE)
  if(!isAbsolute(file)||realpathSync(file)!==file||!statSync(file).isFile()||(statSync(file).mode&0o077)!==0)throw Error('EMPLOYEE_PRIVATE_CONFIG_REQUIRED')
  const bearer=readFileSync(file,'utf8').trim()
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(bearer))throw Error('EMPLOYEE_PRIVATE_CONFIG_REQUIRED')
 return {storeId,agentId,gatewayOrigin:z.string().url().parse(process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN),gatewayKey:bearer,backendOrigin:z.string().url().parse(process.env.EMPLOYEE_HERMES_BACKEND_ORIGIN)}
}
