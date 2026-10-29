import { employeeExecutionDiagnostic } from './teamAgentBridge/employeeRuntimeDiagnostics'
import { pdcaPilotDiagnostic } from './agentTasks/diagnostics'
import { z } from 'zod'
import prisma from '../config/database'
import { grantSchema, actions } from './teamAgentBridge/contract'
import { employeeGrantKey, employeeRouteKey } from './teamAgentBridge/employeeIntake'
import { TeamActor, TeamError, readTeam, writeTeam, lockTeam, auditTeam } from './TeamCommunicationService'

const denied = (code: string, status = 403): never => { throw new TeamError(status, code) }
const assertAdmin = (a: TeamActor) => {
  if (a.role !== 'admin' || a.employeeApp) denied('TEAM_AI_ADMIN_REQUIRED')
}

export const modulePermissionSchema = z.object({
  read: z.boolean(),
  write: z.boolean()
}).strict()

export type ModulePermission = z.infer<typeof modulePermissionSchema>

export const agentPermissionsSchema = z.object({
  marketing: modulePermissionSchema.default({read:false,write:false}),
  products: modulePermissionSchema,
  inventory: modulePermissionSchema,
  orders: modulePermissionSchema,
  members: modulePermissionSchema,
  finance: modulePermissionSchema,
  staff: modulePermissionSchema,
  hygiene: modulePermissionSchema,
  channels: modulePermissionSchema
}).strict()

export type AgentPermissions = z.infer<typeof agentPermissionsSchema>

export function defaultAgentPermissions(): AgentPermissions {
  return {
    marketing: { read: false, write: false },
    products: { read: true, write: false },
    inventory: { read: true, write: false },
    orders: { read: true, write: false },
    members: { read: true, write: false },
    finance: { read: true, write: false },
    staff: { read: true, write: false },
    hygiene: { read: true, write: true },
    channels: { read: true, write: true }
  }
}

export function fullStoreOperationsPermissions(): AgentPermissions {
  return Object.fromEntries(Object.keys(defaultAgentPermissions()).map(key => [key, { read: true, write: true }])) as AgentPermissions
}

export const agentSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  operationProfile: z.enum(['custom', 'store_operations']).default('custom'),
  enabled: z.boolean(),
  agentName: z.string().trim().min(1).max(64),
  agentOrigin: z.string().trim().url(),
  pdcaPilotEnabled: z.boolean(),
  employeeBridgeEnabled: z.boolean(),
  allChannelsAllowed: z.boolean().default(true),
  memoryEnabled: z.boolean().default(true),
  learningEnabled: z.boolean().default(true),
  photoRecognitionEnabled: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().default(null),
  taskTimeoutMinutes: z.number().int().min(1).max(1440),
  requireHumanReview: z.boolean().default(true),
  permissions: agentPermissionsSchema.default(defaultAgentPermissions())
}).passthrough()

export type AgentSettings = z.infer<typeof agentSettingsSchema>

export function defaultAgentSettings(): AgentSettings {
  return {
    version: 1,
    operationProfile: 'custom',
    enabled: false,
    agentName: 'Hermes AI',
    agentOrigin: process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN || 'http://127.0.0.1:8642',
    pdcaPilotEnabled: true,
    employeeBridgeEnabled: true,
    allChannelsAllowed: true,
    memoryEnabled: true,
    learningEnabled: true,
    photoRecognitionEnabled: true,
    expiresAt: null,
    taskTimeoutMinutes: 10,
    requireHumanReview: true,
    permissions: defaultAgentPermissions()
  }
}

async function effectiveAgentSettings(db:any,storeId:string,saved:any):Promise<AgentSettings> {
  const merged: AgentSettings = saved ? {
    ...defaultAgentSettings(),
    ...saved,
    permissions: { ...defaultAgentPermissions(), ...(saved.permissions || {}) }
  } : defaultAgentSettings()

  if(saved?.permissions&&!saved.permissions.marketing)merged.permissions.marketing={...saved.permissions.members}
  if (merged.operationProfile === 'store_operations') merged.permissions = fullStoreOperationsPermissions()
  if(saved&&!Object.prototype.hasOwnProperty.call(saved,'expiresAt')){
    const grants=await db.config.findMany({where:{storeId:storeId,key:{startsWith:'externalAgent.teamBridge.v1.grant.'}}})
    const expiries=grants.map((r:any)=>JSON.parse(r.value).expiresAt).filter(Boolean).sort()
    merged.expiresAt=expiries[0]||null
  }
  if(process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN&&merged.agentOrigin==='http://127.0.0.1:8642')merged.agentOrigin=process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN
  return merged
}

export function agentSettingsService(db: any = prisma) {
  return {
    async getSettings(a: TeamActor) {
      assertAdmin(a)
      await db.staff.findFirstOrThrow({
        where: { id: a.staffId, userId: a.id, storeId: a.storeId, status: 'active' },
        select: { id: true }
      })

      const saved = await readTeam(db, a.storeId, 'ai.agent.settings')
      const merged = await effectiveAgentSettings(db,a.storeId,saved)
      const pdcaPilot = await pdcaPilotDiagnostic(db, a.storeId)
      const employeeEnabledEnv = process.env.EMPLOYEE_HERMES_ENABLED === '1'&&(!process.env.EMPLOYEE_HERMES_STORE_ID||process.env.EMPLOYEE_HERMES_STORE_ID===a.storeId)

      const recentExecutions=await db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.employeeRuntime.execution.',not:{contains:'.provider.'}}},orderBy:{updatedAt:'desc'},take:5,select:{value:true,updatedAt:true}})
      const latestExecution=recentExecutions.map((row:any)=>employeeExecutionDiagnostic(row.value,row.updatedAt)).find(Boolean)||null

      const systemState = {
        latestExecution,
        pilotState: pdcaPilot.state === 'valid' ? 'running' : pdcaPilot.state,
        pdcaPilot,
        employeeBridgeConfigured: employeeEnabledEnv,
        runtimeAvailable: employeeEnabledEnv&&await employeeGatewayReachable(merged.agentOrigin),
        hostOrigin: merged.agentOrigin,
        capabilities: [
          {
            id: 'stock_audit_pdca',
            name: 'STOCK-RO-001 库存比对审计 (PDCA)',
            description: '比对账本库存与现场物理盘点证据，执行自主审查并生成不可篡改报告。',
            tools: ['store_task_get', 'store_task_claim', 'store_task_read_stock_evidence', 'store_task_report'],
            active: merged.enabled && merged.pdcaPilotEnabled && pdcaPilot.state === 'valid'
          },
          {
            id: 'employee_coordination',
            name: '员工工作协同 (Employee Hermes Bridge)',
            description: '在工作频道中响应员工运营问答、梳理交接与执行障碍，向主管提交结构化事实。',
            tools: ['store_team_directory', 'store_team_channels', 'store_team_messages', 'store_team_send'],
            active: merged.enabled && merged.employeeBridgeEnabled
          }
        ]
      }

      return {
        settings: merged,
        systemState
      }
    },

    async saveSettings(a: TeamActor, input: unknown) {
      assertAdmin(a)
      await db.staff.findFirstOrThrow({
        where: { id: a.staffId, userId: a.id, storeId: a.storeId, status: 'active' },
        select: { id: true }
      })

      const validated = agentSettingsSchema.parse(input)
      if(!privateGatewayOrigin(validated.agentOrigin))denied('TEAM_AGENT_ORIGIN_INVALID',400)
      if(validated.expiresAt && Date.parse(validated.expiresAt)<=Date.now())denied('TEAM_AGENT_EXPIRY_INVALID',400)

      return await db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'ai.agent.settings')
        const current = await readTeam(tx, a.storeId, 'ai.agent.settings')
        const currentVersion = current?.version ?? 1

        if (validated.version !== currentVersion) {
          denied('TEAM_VERSION_CONFLICT', 409)
        }

        // Re-materializing the exact same saved authority must wait for current
        // conversations; a real permission change/revocation still takes effect immediately.
        const previous = current && agentSettingsSchema.parse(await effectiveAgentSettings(tx,a.storeId,current))
        const resyncOnly = !!previous && JSON.stringify(previous) === JSON.stringify(validated)
        if (resyncOnly) {
          const executions = await tx.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.employeeRuntime.execution.',not:{contains:'.provider.'}}},select:{value:true}})
          const active = executions.some((row:any)=>{const state=JSON.parse(row.value);return ['input','response','tools','final'].includes(state.phase)&&Date.parse(state.expiresAt)>Date.now()&&(!process.env.EMPLOYEE_HERMES_AGENT_ID||state.grant?.agentId===process.env.EMPLOYEE_HERMES_AGENT_ID)})
          if(active)denied('TEAM_AGENT_RESYNC_BUSY',409)
        }

        const nextVersion = currentVersion + 1
        const toSave: AgentSettings = {
          ...validated,
          permissions: validated.operationProfile === 'store_operations' ? fullStoreOperationsPermissions() : validated.permissions,
          version: nextVersion
        }

        await writeTeam(tx, a.storeId, 'ai.agent.settings', toSave)
        await synchronizeEmployeeGrants(tx,a,toSave,{preserveExistingAuthority:resyncOnly})
        await auditTeam(tx, a, 'ai.agent.settings', 'update', {
          action: 'agent_settings_update',
          version: nextVersion,
          enabled: toSave.enabled,
          agentName: toSave.agentName,
          pdcaPilotEnabled: toSave.pdcaPilotEnabled,
          employeeBridgeEnabled: toSave.employeeBridgeEnabled,
          allChannelsAllowed: toSave.allChannelsAllowed,
          taskTimeoutMinutes: toSave.taskTimeoutMinutes,
          expiresAt:toSave.expiresAt,memoryEnabled:toSave.memoryEnabled,learningEnabled:toSave.learningEnabled,photoRecognitionEnabled:toSave.photoRecognitionEnabled,
          operationProfile: toSave.operationProfile,
          permissions: toSave.permissions
        })

        return toSave
      })
    },

    async checkConnection(a: TeamActor, body: unknown) {
      assertAdmin(a)
      await db.staff.findFirstOrThrow({
        where: { id: a.staffId, userId: a.id, storeId: a.storeId, status: 'active' },
        select: { id: true }
      })

      const start = Date.now()
      const saved = await readTeam(db, a.storeId, 'ai.agent.settings')
      const settings: AgentSettings = saved ? { ...defaultAgentSettings(), ...saved } : defaultAgentSettings()

      const targetUrl = settings.agentOrigin==='http://127.0.0.1:8642'&&process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN?process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN:settings.agentOrigin
      const parsed=new URL(targetUrl)
      if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||!['http:','https:'].includes(parsed.protocol))denied('TEAM_AGENT_ORIGIN_INVALID',400)
      // Only the installed private service can be probed; browser-supplied URLs are not an SSRF proxy.
      if(!privateGatewayOrigin(targetUrl))denied('TEAM_AGENT_ORIGIN_INVALID',400)
      let reachable = false
      let detailMsg = ''

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(new URL('/health',targetUrl), { method: 'GET', redirect:'error', signal: controller.signal }).catch(() => null)
        clearTimeout(timer)
        if (res) {
          reachable = res.status===200
          detailMsg = `Node responded with status ${res.status}`
        } else {
          reachable = false
          detailMsg = `Node at ${targetUrl} connection refused or waiting for request`
        }
      } catch (err: any) {
        detailMsg = err.message || 'Connection test timed out'
      }

      const latencyMs = Date.now() - start
      const status = reachable ? 'ready' : (settings.enabled ? 'standby' : 'disabled')

      await auditTeam(db, a, 'ai.agent.settings', 'create', {
        action: 'agent_connection_check',
        targetUrl,
        reachable,
        latencyMs,
        status
      })

      return {
        status,
        reachable,
        latencyMs,
        checkedAt: new Date().toISOString(),
        details: reachable
          ? `Hermes Agent 节点通信正常 (${latencyMs}ms)`
          : (settings.enabled
              ? `Hermes 节点不可达 (${targetUrl})，尚未就绪`
              : '智能体目前处于禁用状态')
      }
    }
  }
}

/** Save the operator's choices and the installed executor's grant in one transaction.
 * No dated pilot constant, direct database edit, or process restart is required. */
export async function synchronizeEmployeeGrants(tx:any,a:TeamActor,s:AgentSettings,options:{preserveExistingAuthority?:boolean}={}) {
  const rows=await tx.config.findMany({where:{storeId:a.storeId,key:{startsWith:'externalAgent.teamBridge.v1.grant.'}},orderBy:{key:'asc'}})
  const mapping:Record<string,{read:string[];write:string[]}>={
    products:{read:['products.read'],write:['products.write']},
    inventory:{read:['inventory.read'],write:['inventory.write','procurement.write']},
    marketing:{read:['marketing.read'],write:['marketing.write']},
    members:{read:['members.read'],write:['members.write']},
    finance:{read:['finance.read'],write:['finance.write']},
    staff:{read:['staff.read','schedule.read','training.read'],write:['staff.write','operations.write','employee.request.write','training.write']},
    hygiene:{read:['hygiene.read'],write:['hygiene.write']},
    channels:{read:['messages.read','tasks.read'],write:['messages.send']}
  }
  const managed=new Set([...Object.values(mapping).flatMap(m=>[...m.read,...m.write]),'memory.read','memory.write'])
  for(const row of rows){
    const previous=grantSchema.parse(JSON.parse(row.value))
    const expiry=options.preserveExistingAuthority?previous.expiresAt:s.expiresAt||'9999-12-31T23:59:59.999Z'
    if(process.env.EMPLOYEE_HERMES_AGENT_ID&&previous.agentId!==process.env.EMPLOYEE_HERMES_AGENT_ID)continue
    const selected=previous.actions.filter(x=>!managed.has(x)) as string[]
    for(const [module,modes] of Object.entries(mapping))for(const mode of ['read','write'] as const)if(s.permissions[module]?.[mode])selected.push(...modes[mode])
    if(s.memoryEnabled){selected.push('memory.read');if(s.learningEnabled)selected.push('memory.write')}
    const grant=grantSchema.parse({...previous,displayName:s.agentName,version:previous.version+1,clientRevision:previous.clientRevision+1,expiresAt:expiry,revoked:!!(options.preserveExistingAuthority&&previous.revoked)||!s.enabled||!s.employeeBridgeEnabled,actions:[...new Set(selected)].filter(x=>(actions as readonly string[]).includes(x))})
    await tx.config.update({where:{storeId_key:{storeId:a.storeId,key:employeeGrantKey(grant.agentId)}},data:{value:JSON.stringify(grant)}})
    const routes=await tx.config.findMany({where:{storeId:a.storeId,key:{startsWith:'externalAgent.teamBridge.v1.employeeRoute.'}}})
    for(const r of routes){
      const route=JSON.parse(r.value);if(route.agentId!==grant.agentId)continue
      const channelId=r.key.slice('externalAgent.teamBridge.v1.employeeRoute.'.length)
      const taskKey='task.'+channelId+'.'+route.task.taskId,task=await readTeam<any>(tx,a.storeId,taskKey)
      const taskRef=task?{taskId:route.task.taskId,version:(task.version||route.task.version)+1}:route.task
      if(task){const serviceOwned=task.ownerId==='agent:'+grant.agentId&&task.text?.startsWith('Hermes:');await writeTeam(tx,a.storeId,taskKey,{...task,version:taskRef.version,deadlineAt:expiry,dueDate:expiry.slice(0,10),...(serviceOwned?{text:'Hermes: answer free-form store questions and perform operations under the currently saved authorization. Use actual evidence and persistent scoped memory; never invent completion.'}:{}),updatedAt:new Date().toISOString()})}
      await tx.config.update({where:{storeId_key:{storeId:a.storeId,key:employeeRouteKey(channelId)}},data:{value:JSON.stringify({...route,task:taskRef,version:route.version+1,enabled:s.enabled&&s.employeeBridgeEnabled&&!grant.revoked&&Date.parse(expiry)>Date.now(),expiresAt:expiry})}})
      const key='externalAgent.teamBridge.v1.channel.'+channelId
      const binding=await tx.config.findUnique({where:{storeId_key:{storeId:a.storeId,key}}})
      if(binding){const value=JSON.parse(binding.value);value.task=taskRef;if(value.delegatedDirect)value.delegatedDirect={...value.delegatedDirect,grantVersion:grant.version,clientRevision:grant.clientRevision,expiresAt:expiry};await tx.config.update({where:{storeId_key:{storeId:a.storeId,key}},data:{value:JSON.stringify(value)}})}
    }
  }
}

async function employeeGatewayReachable(origin:string):Promise<boolean>{
  if(!privateGatewayOrigin(origin))return false
  try{const response=await fetch(new URL('/health',origin),{redirect:'error',signal:AbortSignal.timeout(2000)});if(!response.ok)return false;const body:any=await response.json();return body.status==='ok'&&body.protocol==='employee_work_trace_v1'}catch{return false}
}

function privateGatewayOrigin(value:string):boolean{
 try{const u=new URL(value);return u.protocol==='http:'&&['127.0.0.1','[::1]','host.docker.internal'].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash}catch{return false}
}
