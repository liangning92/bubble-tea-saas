import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'crypto'
import { readTeam, writeTeam, TeamTask } from '../TeamCommunicationService'
import { createTeamAgentMiniMaxTransport } from '../TeamAiService'
import { createEmployeeRuntime } from './employeeRuntime'
import { createEmployeeRuntimeHttp } from './employeeRuntimeHttp'
import { createEmployeeGatewayClient, EmployeeGatewayConfig } from './employeeGatewayClient'
import { createEmployeeOrchestration } from './employeeOrchestration'
import { grantSchema } from './contract'
import { employeeGrantKey, employeeRouteKey, employeeRouteSchema } from './employeeIntake'
import { readAuthorizedBridgeChannel } from './directDelegation'

const digest=(s:string)=>createHash('sha256').update(s).digest('hex')
/** Server configuration only. Constructing an enabled deployment is a deliberate
 * activation step; no profile, grant, credential file or listener is created here. */
export interface EmployeeDeploymentConfig {
  enabled?:boolean;storeId:string;agentId:string;gateway:EmployeeGatewayConfig;
  reviewedSystemTemplate:{hash:string;isolatedRoot:string}
}
export function createEmployeeDeployment(db:any,config:EmployeeDeploymentConfig) {
  if(config.enabled!==true)throw Error('EMPLOYEE_DEPLOYMENT_DISABLED')
  const resolveGrant=async(tx:any)=>{
    const row=await tx.config.findUnique({where:{storeId_key:{storeId:config.storeId,key:employeeGrantKey(config.agentId)}}})
    const grant=grantSchema.parse(row&&JSON.parse(row.value))
    if(grant.agentId!==config.agentId||grant.storeId!==config.storeId)throw Error('EMPLOYEE_DEPLOYMENT_GRANT_DENIED')
    return grant
  }
  // The gateway serves one execution for at most 120 seconds; give the execution the
  // same bounded window so a full multi-turn conversation is not cut off mid-flight.
  const runtime=createEmployeeRuntime(db,{enabled:true,storeId:config.storeId,resolveGrant,approvedSystemHashes:[],reviewedSystemTemplate:config.reviewedSystemTemplate,maxExecutionMs:240000,
    tasks:{assert:async(tx,g,task,channelId)=>{
      const row=await tx.config.findUnique({where:{storeId_key:{storeId:g.storeId,key:employeeRouteKey(channelId!)}}})
      const route=employeeRouteSchema.parse(row&&JSON.parse(row.value))
      if(!route.enabled||route.paused||Date.parse(route.expiresAt)<=Date.now()||Date.parse(route.expiresAt)>Date.parse(g.expiresAt)||route.agentId!==g.agentId||route.task.taskId!==task.taskId||route.task.version!==task.version)throw Error('EMPLOYEE_DEPLOYMENT_ROUTE_DENIED')
      const policy=await readTeam<any>(tx,g.storeId,'workflow.policy.'+channelId)
      if(policy?.paused||policy?.enabled===false)throw Error('EMPLOYEE_DEPLOYMENT_CHANNEL_PAUSED')
      await readAuthorizedBridgeChannel(tx,g,task,channelId!)
      const native=await readTeam<TeamTask>(tx,g.storeId,`task.${channelId}.${task.taskId}`)
      if(!native||native.version!==task.version||!['assigned','accepted','submitted','changes_requested'].includes(native.status))throw Error('EMPLOYEE_DEPLOYMENT_TASK_DENIED')
    }},readAttachment:async()=>{throw Error('EMPLOYEE_ATTACHMENTS_NOT_ENABLED')}})
  const credentialKey=(id:string)=>'employeeRuntime.credential.'+id
  const orchestration=createEmployeeOrchestration(db,{enabled:true,storeId:config.storeId,runtime,gateway:createEmployeeGatewayClient(config.gateway),
    issueCredentials:async(ticket,scope)=>{
      await runtime.inspect(ticket.executionId)
      const execution=await readTeam<any>(db,config.storeId,'employeeRuntime.execution.'+ticket.executionId)
      const expiresAt=new Date(Math.min(Date.parse(scope.expiresAt),Date.parse(execution.expiresAt),Date.parse(execution.grant.expiresAt))).toISOString()
      const issued:Record<string,string>={}
      // Private random secrets are returned only to the gateway transport. The
      // database stores digests, exact purpose, execution and absolute expiry.
      await db.$transaction(async(tx:any)=>{for(const purpose of ['callback','provider']){
        const id=randomUUID(),secret=randomBytes(32).toString('base64url');issued[purpose]=id+'.'+secret
        await writeTeam(tx,config.storeId,credentialKey(id),{executionId:ticket.executionId,purpose,digest:digest(secret),expiresAt,reservationId:scope.reservationId})
      }})
      return {callbackCredential:issued.callback,providerCredential:issued.provider}
    }})
  const router=createEmployeeRuntimeHttp({enabled:true,transport:createTeamAgentMiniMaxTransport(db,{enabled:true,toolProfile:'employee_work'}),
    resolve:async(token,purpose)=>{
      const match=/^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);if(!match)return null
      const c=await readTeam<any>(db,config.storeId,credentialKey(match[1]));if(!c||c.purpose!==purpose||c.revoked||Date.parse(c.expiresAt)<=Date.now()||typeof c.digest!=='string')return null
      const actual=Buffer.from(digest(match[2])),expected=Buffer.from(c.digest)
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null
      try{await runtime.inspect(c.executionId)}catch{return null}
      return {executionId:c.executionId,expiresAt:c.expiresAt,runtime}
    }})
  return {router,runtime,orchestration,runBatch:(limit=10)=>orchestration.drain(limit)}
}
