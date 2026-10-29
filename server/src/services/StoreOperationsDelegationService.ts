import {nativeJobId,nativeJobKey} from './NativeStoreQueue'
import {configuredEmployeeDeployment} from './teamAgentBridge/employeeConfigured'
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'crypto'
import {z} from 'zod'
import prisma from '../config/database'
import {readTeam,teamCommunication,lockTeam} from './TeamCommunicationService'
const PREFIX='store.operations.delegation.'
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
const fail=(code:string):never=>{throw Error(code)}
export const delegationInput=z.object({activityIds:z.array(z.string()).max(0).default([]),expiresAt:z.string().datetime().nullable().default(null),confirm:z.literal('full_store_operations_role')}).strict()
async function casRecord(db:any,row:any,next:any){if(!(await db.config.updateMany({where:{id:row.id,value:row.value},data:{value:JSON.stringify(next)}})).count)fail('OPERATIONS_AUTHORIZATION_CHANGED')}
async function ownerAllowed(
  db: any,
  ownerId: string,
  storeId: string,
  securityFingerprint?: string,
) {
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { staff: true } })
  if (
    !owner ||
    owner.role !== 'admin' ||
    (owner.staff?.storeId || owner.storeId) !== storeId ||
    (owner.staff && owner.staff.status !== 'active') ||
    (securityFingerprint && hash(owner.password || '') !== securityFingerprint)
  )
    fail('OPERATIONS_OWNER_REVOKED')
  const settings = await readTeam(db, storeId, 'ai.agent.settings')
  if (
    !settings?.enabled
  )
    fail('OPERATIONS_MODULE_AUTHORIZATION_REQUIRED')
  return { owner, settings }
}
export async function operationsOwnerState(storeId:string,ownerId:string,db:any=prisma){
 const owner=await db.user.findUnique({where:{id:ownerId},include:{staff:true}})
 if(!owner||owner.role!=='admin'||(owner.staff?.storeId||owner.storeId)!==storeId||owner.staff&&owner.staff.status!=='active')fail('OPERATIONS_OWNER_REQUIRED')
 const settings=await readTeam<any>(db,storeId,'ai.agent.settings'),rows=await db.config.findMany({where:{storeId,key:{startsWith:PREFIX}}})
 return {canDelegate:!!settings?.enabled,scope:'owner_account_tasks',runtime:'hermes_native_api',delegations:rows.map((row:any)=>{const {secretHash,ownerSecurityFingerprint,...safe}=JSON.parse(row.value);return safe})}
}
export async function createOperationsDelegation(storeId:string,ownerId:string,raw:unknown,db:any=prisma){
 const value=delegationInput.parse(raw),{owner}=await ownerAllowed(db,ownerId,storeId)
 if(!owner.staff?.id)fail('OPERATIONS_OWNER_REQUIRED')
 const agentId=process.env.EMPLOYEE_HERMES_AGENT_ID
 if(process.env.EMPLOYEE_HERMES_ENABLED!=='1'||process.env.EMPLOYEE_HERMES_STORE_ID!==storeId||!agentId)fail('OPERATIONS_HERMES_RUNTIME_NOT_CONFIGURED')
 if(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now())fail('OPERATIONS_EXPIRY_OUT_OF_SCOPE')
 const id=randomUUID(),secret=randomBytes(32).toString('base64url'),credential=id+'.'+secret
 const grant={id,storeId,ownerId,ownerSecurityFingerprint:hash(owner.password||''),scope:'store_operations.v1',authority:'requesting_account',capabilities:['hermes.owner_tasks.submit','hermes.owner_tasks.status'],expiresAt:value.expiresAt,createdAt:new Date().toISOString(),revoked:false,secretHash:hash(secret)}
 return db.$transaction(async(tx:any)=>{
  await ownerAllowed(tx,ownerId,storeId,grant.ownerSecurityFingerprint)
  await tx.config.create({data:{storeId,key:PREFIX+id,value:JSON.stringify(grant),category:'agent_operations'}})
  let channels:any[]=await connectionChannels(tx,credential,storeId)
  if(!channels.length){
   const facade={...tx,$transaction:async(fn:any)=>fn(tx)}
   const channel=await teamCommunication(facade).create({id:ownerId,storeId,staffId:owner.staff.id,role:'admin',employeeApp:false},{requestId:id,title:'Operasional pribadi pemilik · Hermes',kind:'direct',members:['agent:'+agentId]})
   const context=await ownerTaskContext(tx,credential,channel.id)
   channels=[{id:channel.id,title:channel.title,taskId:null,agentId:context.grant.agentId}]
  }
  const {secretHash,ownerSecurityFingerprint,...safe}=grant
  return {delegation:safe,credential,credentialShownOnce:true,ownerTaskChannels:channels}
 },{isolationLevel:'Serializable'})
}
async function connectionChannels(db:any,credential:string,storeId:string){
 const rows=await db.config.findMany({where:{storeId,key:{startsWith:'team.communication.channel.'}}}),channels:any[]=[]
 for(const row of rows){const channel=JSON.parse(row.value);if(!channel.id||!Array.isArray(channel.members)||channel.members.length!==2)continue;try{const context=await ownerTaskContext(db,credential,channel.id);channels.push({id:channel.id,title:channel.title,taskId:null,agentId:context.grant.agentId})}catch{}}
 return channels
}
export async function revokeOperationsDelegation(
  storeId: string,
  ownerId: string,
  id: string,
  db: any = prisma,
) {
  // Revocation remains available even after module permissions have been withdrawn.
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { staff: true } })
  if (!owner || owner.role !== 'admin' || (owner.staff?.storeId || owner.storeId) !== storeId)
    fail('OPERATIONS_OWNER_REQUIRED')
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: PREFIX + id } } })
  if (!row) fail('OPERATIONS_DELEGATION_NOT_FOUND')
  await casRecord(db, row, {
    ...JSON.parse(row.value),
    revoked: true,
    revokedAt: new Date().toISOString(),
  })
  return { id, revoked: true }
}
async function resolve(db: any, credential: string, lock = false) {
  const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(credential)
  if (!match) fail('OPERATIONS_CREDENTIAL_REQUIRED')
  const row = await db.config.findFirst({ where: { key: PREFIX + match[1] } })
  if (!row) fail('OPERATIONS_CREDENTIAL_INVALID')
  if (
    lock &&
    !(
      await db.config.updateMany({
        where: { id: row.id, value: row.value },
        data: { value: row.value },
      })
    ).count
  )
    fail('OPERATIONS_AUTHORIZATION_CHANGED')
  const grant = JSON.parse(row.value),
    actual = Buffer.from(hash(match[2])),
    expected = Buffer.from(grant.secretHash || '')
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected) ||
    grant.revoked ||
    (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())
  )
    fail('OPERATIONS_CREDENTIAL_INVALID')
  await ownerAllowed(db, grant.ownerId, grant.storeId, grant.ownerSecurityFingerprint)
  return grant
}
export interface OperationsTaskPorts {
  gatewayHealth(db: any): Promise<unknown>
}
const taskPorts: OperationsTaskPorts = {
  gatewayHealth: async (db) => {
    const deployment = configuredEmployeeDeployment(db)
    if (!deployment) throw Error('EMPLOYEE_GATEWAY_NOT_CONFIGURED')
    return deployment.gatewayHealth()
  },
}
async function operationsGatewayState(db: any, ports: OperationsTaskPorts = taskPorts) {
  const checkedAt = new Date().toISOString()
  try {
    const raw: any = await ports.gatewayHealth(db)
    if (
      raw?.status !== 'ok' ||
      raw.protocol !== 'hermes_native_api_v1' ||
      !Number.isSafeInteger(raw.maxConcurrency) || raw.maxConcurrency < 1 ||
      !Number.isInteger(raw.queued) ||
      raw.queued < 0 ||
      !Number.isSafeInteger(raw.running) || raw.running < 0 || raw.running > raw.maxConcurrency
    )
      throw Error('EMPLOYEE_GATEWAY_CAPACITY_INVALID')
    return {
      verified: true,
      protocol: raw.protocol,
      maxConcurrency: raw.maxConcurrency,
      queued: raw.queued,
      running: raw.running,
      ...(raw.scheduling==='admin_priority_fair'&&raw.adminBurstLimit===3&&raw.preemptRunning===false?{scheduling:raw.scheduling,adminBurstLimit:3,preemptRunning:false}:{}),
      checkedAt,
    }
  } catch (error: any) {
    return {
      verified: false,
      checkedAt,
      reason: /^EMPLOYEE_GATEWAY_[A-Z_]+$/.test(error?.message || '')
        ? error.message
        : 'EMPLOYEE_GATEWAY_HEALTH_UNAVAILABLE',
    }
  }
}
export async function readOperationsState(credential:string,db:any=prisma){
 const grant=await resolve(db,credential)
 if(!grant.capabilities?.includes('hermes.owner_tasks.submit'))fail('OPERATIONS_LEGACY_CREDENTIAL_RETIRED')
 const {secretHash,ownerSecurityFingerprint,...delegation}=grant
 return {storeId:grant.storeId,expiresAt:grant.expiresAt,capabilities:grant.capabilities,delegation,scope:'owner_account_tasks',ownerTaskChannels:await connectionChannels(db,credential,grant.storeId),gateway:await operationsGatewayState(db)}
}
const operationsTaskInput = z
  .object({
    requestId: z.string().uuid(),
    channelId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict()
async function ownerTaskContext(db: any, credential: string, channelId: string, lock = false) {
  const delegation = await resolve(db, credential, lock)
  if (!delegation.capabilities?.includes('hermes.owner_tasks.submit'))
    fail('OPERATIONS_ROLE_DELEGATION_REQUIRED')
  const { owner, settings } = await ownerAllowed(
    db,
    delegation.ownerId,
    delegation.storeId,
    delegation.ownerSecurityFingerprint,
  )
  if(!owner.staff?.id)fail('OPERATIONS_OWNER_REQUIRED')
  const agentId=process.env.EMPLOYEE_HERMES_AGENT_ID
  const channel=await readTeam<any>(db,delegation.storeId,'channel.'+channelId)
  if(!channel||channel.archived||!agentId||!channel.members.some((m:any)=>m.staffId===owner.staff.id)||!channel.members.some((m:any)=>m.staffId==='agent:'+agentId))fail('OPERATIONS_OWNER_CHANNEL_REQUIRED')
  if(channel.members.filter((m:any)=>!m.staffId.startsWith('agent:')).length!==1)fail('OPERATIONS_OWNER_PRIVATE_AUDIENCE_REQUIRED')
  // Workbench credentials identify the real owner only. They no longer enroll
  // trial tasks, operation profiles, route expiry or a second tool permission set.
  const grant={agentId},route={task:{taskId:null}}
  return { delegation, owner, route, grant, channel }
}
/** Enqueue into the existing native Hermes worker. Never run a second model loop.
 * The owner identity is resolved from the explicit role delegation, not caller JSON.
 */
export async function submitOperationsTask(
  credential: string,
  raw: unknown,
  db: any = prisma,
  ports: OperationsTaskPorts = taskPorts,
) {
  const input = operationsTaskInput.parse(raw)
  const initialGrant = await resolve(db, credential)
  if (!initialGrant.capabilities?.includes('hermes.owner_tasks.submit'))
    fail('OPERATIONS_ROLE_DELEGATION_REQUIRED')
  const gateway = await operationsGatewayState(db, ports)
  if (!gateway.verified) fail('OPERATIONS_GATEWAY_UNAVAILABLE')
  return db.$transaction(async (tx: any) => {
    const context = await ownerTaskContext(tx, credential, input.channelId, true)
    if (
      process.env.EMPLOYEE_HERMES_ENABLED !== '1' ||
      process.env.EMPLOYEE_HERMES_STORE_ID !== context.delegation.storeId ||
      process.env.EMPLOYEE_HERMES_AGENT_ID !== context.grant.agentId
    )
      fail('OPERATIONS_HERMES_RUNTIME_NOT_CONFIGURED')
    const { delegation, owner, route } = context
    const key = 'store.operations.task.' + delegation.id + '.' + input.requestId
    await lockTeam(tx, delegation.storeId, key)
    const old = await readTeam<any>(tx, delegation.storeId, key),
      fingerprint = hash(JSON.stringify(input))
    if (old) {
      if (old.fingerprint !== fingerprint) fail('OPERATIONS_TASK_REQUEST_CONFLICT')
      return { ...old, alreadySubmitted: true }
    }
    const facade = { ...tx, $transaction: async (fn: any) => fn(tx) }
    const message = await teamCommunication(facade).send(
      {
        id: owner.id,
        storeId: delegation.storeId,
        staffId: owner.staff.id,
        role: 'admin',
        employeeApp: false,
      },
      input.channelId,
      {
        requestId: input.requestId,
        text: input.text,
        files: [],
        expectedLastSeq: context.channel.lastSeq,
      },
      undefined,
      undefined,
      undefined,
      { id: delegation.id, requestId: input.requestId },
    )
    const eventId = nativeJobId(delegation.storeId,input.channelId,message.id)
    const pending = await tx.config.findUnique({
      where: { storeId_key: { storeId: delegation.storeId, key: 'team.communication.'+nativeJobKey(eventId) } },
    })
    if (!pending || JSON.parse(pending.value).state !== 'queued')
      fail('OPERATIONS_HERMES_NOT_QUEUED')
    const receipt = {
      requestId: input.requestId,
      fingerprint,
      delegationId: delegation.id,
      agentId: context.grant.agentId,
      origin: 'owner_operations_delegation',
      channelId: input.channelId,
      taskId: route.task.taskId,
      messageId: message.id,
      sourceSeq: message.seq,
      eventId,
      submittedAt: new Date().toISOString(),
      state: 'queued',
      businessCompleted: false,
      gateway,
    }
    await tx.config.create({
      data: {
        storeId: delegation.storeId,
        key: 'team.communication.' + key,
        category: 'agent_operations',
        value: JSON.stringify(receipt),
      },
    })
    await tx.financeAuditLog.create({
      data: {
        storeId: delegation.storeId,
        userId: 'service:operations-delegation',
        action: 'create',
        entityType: 'hermes_owner_operations_task',
        entityId: input.requestId,
        description: 'Submit owner-delegated internal task to the existing Hermes runtime',
        newValue: JSON.stringify(receipt),
      },
    })
    return receipt
  })
}
export async function operationsTaskStatus(
  credential: string,
  requestId: string,
  db: any = prisma,
) {
  z.string().uuid().parse(requestId)
  const delegation = await resolve(db, credential)
  const receipt = await readTeam<any>(
    db,
    delegation.storeId,
    'store.operations.task.' + delegation.id + '.' + requestId,
  )
  if (!receipt) fail('OPERATIONS_TASK_NOT_FOUND')
  await ownerTaskContext(db, credential, receipt.channelId)
  const job=await readTeam<any>(db,delegation.storeId,nativeJobKey(receipt.eventId))
  if(!job||job.channelId!==receipt.channelId||job.messageId!==receipt.messageId)fail('OPERATIONS_TASK_EXECUTION_SCOPE_CHANGED')
  const rows=await db.config.findMany({where:{storeId:delegation.storeId,key:{startsWith:'team.communication.employeeRuntime.backendOperation.'},value:{contains:JSON.stringify(job.id)}}})
  const operationReceipts=rows.map((r:any)=>JSON.parse(r.value)).filter((r:any)=>r.executionId===job.id).map(({id,operationId,state,result,fault}:any)=>({id,operationId,state,result,fault}))
  const delivery=await readTeam<any>(db,delegation.storeId,'employeeRuntime.nativeReply.'+job.id)
  const message=delivery?.channelId===job.channelId&&delivery?.messageId===job.outputMessageId?await readTeam<any>(db,delegation.storeId,'message.'+job.channelId+'.'+String(delivery.seq).padStart(12,'0')):null
  const outbound=message?.id===job.outputMessageId&&message?.agent?.executionId===job.id?[{messageId:message.id,seq:message.seq,text:message.text,files:message.files||[]}]:[]
  return {...receipt,intake:{state:job.state,updatedAt:job.updatedAt},execution:{id:job.runId||job.id,phase:job.state,fault:job.fault||job.lastPollFault||null},operationReceipts,outbound,executionCompleted:job.state==='completed',businessCompleted:false,independentAcceptance:'not_reviewed'}
}
