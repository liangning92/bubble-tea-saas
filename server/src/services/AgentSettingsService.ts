import {nativeHermesConfig} from './HermesNativeConfig'
import {HermesNativeClient} from './HermesNativeClient'
import { pdcaPilotDiagnostic } from './agentTasks/diagnostics'
import { z } from 'zod'
import prisma from '../config/database'
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

  if(process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN&&merged.agentOrigin==='http://127.0.0.1:8642')merged.agentOrigin=process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN
  return {...merged,operationProfile:'store_operations',permissions:fullStoreOperationsPermissions(),expiresAt:null,employeeBridgeEnabled:true,allChannelsAllowed:true,memoryEnabled:true,learningEnabled:true,photoRecognitionEnabled:true}
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

      const recentExecutions=await db.config.findMany({where:{storeId:a.storeId,key:{startsWith:'team.communication.nativeAgent.job.'}},orderBy:{updatedAt:'desc'},take:5,select:{value:true,updatedAt:true}})
      const latestExecution=recentExecutions.map((row:any)=>{const j=JSON.parse(row.value);return {phase:j.state,turn:0,inputs:0,responses:0,tools:0,faultCode:j.fault||j.lastPollFault||null,updatedAt:j.updatedAt}}).find(Boolean)||null

      const systemState = {
        latestExecution,runtimeKind:'hermes_native_api',
        pilotState: pdcaPilot.state === 'valid' ? 'running' : pdcaPilot.state,
        pdcaPilot,
        employeeBridgeConfigured: employeeEnabledEnv,
        runtimeAvailable: employeeEnabledEnv&&await employeeGatewayReachable(db,merged.agentOrigin),
        hostOrigin: merged.agentOrigin,
        capabilities: [{id:'hermes_native_api',name:'Hermes',description:'Native runtime with one live backend entry; current account and audience permissions apply.',tools:['store_backend'],active:merged.enabled&&employeeEnabledEnv}]

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

      return await db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'ai.agent.settings')
        const current = await readTeam(tx, a.storeId, 'ai.agent.settings')
        const currentVersion = current?.version ?? 1

        if (validated.version !== currentVersion) {
          denied('TEAM_VERSION_CONFLICT', 409)
        }

        const nextVersion = currentVersion + 1
        const toSave: AgentSettings = {
          ...validated,
          permissions:fullStoreOperationsPermissions(),operationProfile:'store_operations',expiresAt:null,employeeBridgeEnabled:true,allChannelsAllowed:true,memoryEnabled:true,learningEnabled:true,photoRecognitionEnabled:true,
          version: nextVersion
        }

        await writeTeam(tx, a.storeId, 'ai.agent.settings', toSave)
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

      reachable=await employeeGatewayReachable(db,targetUrl)
      detailMsg=reachable?'Hermes native API ready':'Hermes native API unavailable'

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
async function employeeGatewayReachable(db:any,origin:string):Promise<boolean>{
 if(!privateGatewayOrigin(origin)||origin!==process.env.EMPLOYEE_HERMES_GATEWAY_ORIGIN)return false
 try{const cfg=nativeHermesConfig();if(!cfg)return false;const health=await new HermesNativeClient(cfg.gatewayOrigin,cfg.gatewayKey).gatewayHealth();return health?.status==='ok'&&health?.protocol==='hermes_native_api_v1'}catch{return false}
}

function privateGatewayOrigin(value:string):boolean{
 try{const u=new URL(value);return u.protocol==='http:'&&['127.0.0.1','[::1]','host.docker.internal'].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash}catch{return false}
}
