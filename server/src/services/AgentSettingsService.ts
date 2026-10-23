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

export const agentSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  enabled: z.boolean(),
  agentName: z.string().trim().min(1).max(64),
  agentOrigin: z.string().trim().url(),
  pdcaPilotEnabled: z.boolean(),
  employeeBridgeEnabled: z.boolean(),
  allChannelsAllowed: z.boolean().default(true),
  taskTimeoutMinutes: z.number().int().min(1).max(1440),
  requireHumanReview: z.boolean().default(true),
  permissions: agentPermissionsSchema.default(defaultAgentPermissions())
}).passthrough()

export type AgentSettings = z.infer<typeof agentSettingsSchema>

export function defaultAgentSettings(): AgentSettings {
  return {
    version: 1,
    enabled: false,
    agentName: 'Hermes AI',
    agentOrigin: 'http://127.0.0.1:8642',
    pdcaPilotEnabled: true,
    employeeBridgeEnabled: true,
    allChannelsAllowed: true,
    taskTimeoutMinutes: 10,
    requireHumanReview: true,
    permissions: defaultAgentPermissions()
  }
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
      const merged: AgentSettings = saved ? {
        ...defaultAgentSettings(),
        ...saved,
        permissions: { ...defaultAgentPermissions(), ...(saved.permissions || {}) }
      } : defaultAgentSettings()

      const pilotEnabledEnv = process.env.AGENT_TASK_PILOT_ENABLED === '1'
      const employeeEnabledEnv = process.env.EMPLOYEE_HERMES_ENABLED === '1'

      const systemState = {
        pilotState: pilotEnabledEnv ? 'running' : 'disabled',
        employeeBridgeConfigured: employeeEnabledEnv,
        runtimeAvailable: true,
        hostOrigin: process.env.AGENT_TASK_PILOT_HERMES_ORIGIN || 'http://127.0.0.1:8642',
        capabilities: [
          {
            id: 'stock_audit_pdca',
            name: 'STOCK-RO-001 库存比对审计 (PDCA)',
            description: '比对账本库存与现场物理盘点证据，执行自主审查并生成不可篡改报告。',
            tools: ['store_task_get', 'store_task_claim', 'store_task_read_stock_evidence', 'store_task_report'],
            active: merged.enabled && merged.pdcaPilotEnabled
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

      return await db.$transaction(async (tx: any) => {
        await lockTeam(tx, a.storeId, 'ai.agent.settings')
        const current = await readTeam(tx, a.storeId, 'ai.agent.settings')
        const currentVersion = current?.version ?? 1

        if (current && validated.version !== current.version) {
          denied('TEAM_VERSION_CONFLICT', 409)
        }

        const nextVersion = currentVersion + 1
        const toSave: AgentSettings = {
          ...validated,
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

      const targetUrl = settings.agentOrigin || 'http://127.0.0.1:8642'
      let reachable = false
      let detailMsg = ''

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(targetUrl, { method: 'HEAD', signal: controller.signal }).catch(() => null)
        clearTimeout(timer)
        if (res) {
          reachable = true
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
              ? `Hermes 节点待机中 (${targetUrl})，适配器已就绪`
              : '智能体目前处于禁用状态')
      }
    }
  }
}
