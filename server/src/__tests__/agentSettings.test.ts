import { describe, expect, it } from '@jest/globals'
import {
  agentSettingsSchema,
  defaultAgentSettings,
  agentSettingsService,
  AgentSettings
} from '../services/AgentSettingsService'
import { TeamActor } from '../services/TeamCommunicationService'

describe('AgentSettingsService and Schema verification', () => {
  it('defaultAgentSettings provides correct defaults and custom permissions', () => {
    const defaults = defaultAgentSettings()
    expect(defaults.enabled).toBe(false)
    expect(defaults.allChannelsAllowed).toBe(true)
    expect(defaults.taskTimeoutMinutes).toBe(10)
    expect(defaults.agentName).toBe('Hermes AI')
    expect(defaults.agentOrigin).toBe('http://127.0.0.1:8642')
    expect(defaults.pdcaPilotEnabled).toBe(true)
    expect(defaults.employeeBridgeEnabled).toBe(true)
    expect(defaults.permissions.inventory.read).toBe(true)
    expect(defaults.permissions.inventory.write).toBe(false)
    expect(defaults.permissions.finance.write).toBe(false)
    expect(defaults.permissions.hygiene.write).toBe(true)
  })

  it('agentSettingsSchema validates correct and boundary values', () => {
    const valid = defaultAgentSettings()
    expect(() => agentSettingsSchema.parse(valid)).not.toThrow()

    // 租约超时必须为 1 - 1440
    expect(() => agentSettingsSchema.parse({ ...valid, taskTimeoutMinutes: 0 })).toThrow()
    expect(() => agentSettingsSchema.parse({ ...valid, taskTimeoutMinutes: 1441 })).toThrow()
  })

  it('rejects non-admin actors', async () => {
    const mockDb: any = {}
    const service = agentSettingsService(mockDb)

    const cashierActor: TeamActor = {
      id: 'user-1',
      staffId: 'staff-1',
      storeId: 'store-1',
      role: 'cashier',
      employeeApp: false
    }

    await expect(service.getSettings(cashierActor)).rejects.toThrow('TEAM_AI_ADMIN_REQUIRED')
  })

  it('reads and saves custom permissions with transaction lock and version increment', async () => {
    const store = new Map<string, string>()
    const auditLogs: any[] = []

    const mockDb: any = {
      staff: {
        findFirstOrThrow: async () => ({ id: 'staff-admin' })
      },
      config: {
        findUnique: async ({ where }: any) => {
          const val = store.get(where.storeId_key?.key || '')
          return val ? { value: val } : null
        }
      },
      $transaction: async (fn: any) => {
        return fn({
          config: {
            findUnique: async ({ where }: any) => {
              const val = store.get(where.storeId_key?.key || '')
              return val ? { value: val } : null
            },
            upsert: async ({ where, create, update }: any) => {
              const key = where.storeId_key?.key || ''
              const text = update?.value || create?.value
              store.set(key, text)
              return { id: 'cfg-1', value: text }
            }
          },
          financeAuditLog: {
            create: async ({ data }: any) => {
              auditLogs.push(data)
              return { id: 'audit-1' }
            }
          }
        })
      }
    }

    const adminActor: TeamActor = {
      id: 'admin-1',
      staffId: 'staff-admin',
      storeId: 'store-test',
      role: 'admin',
      employeeApp: false
    }

    const service = agentSettingsService(mockDb)

    // 1. 首次读取返回默认配置
    const initial = await service.getSettings(adminActor)
    expect(initial.settings.enabled).toBe(false)
    expect(initial.settings.version).toBe(1)
    expect(initial.settings.allChannelsAllowed).toBe(true)

    // 2. 自定义板块权限并保存
    const input: AgentSettings = {
      ...initial.settings,
      enabled: true,
      agentName: 'Store Agent 007',
      allChannelsAllowed: true,
      permissions: {
        ...initial.settings.permissions,
        inventory: { read: true, write: true }, // 用户自定义开放库存写权限
        finance: { read: true, write: false }
      }
    }

    const saved = await service.saveSettings(adminActor, input)
    expect(saved.version).toBe(2)
    expect(saved.enabled).toBe(true)
    expect(saved.permissions.inventory.write).toBe(true)

    // 3. 版本冲突检测 (预期版本不匹配时拒绝)
    const staleInput: AgentSettings = {
      ...input,
      version: 1 // 过期版本
    }
    await expect(service.saveSettings(adminActor, staleInput)).rejects.toThrow('TEAM_VERSION_CONFLICT')
  })

  it('performs diagnostic connection check', async () => {
    const mockDb: any = {
      staff: {
        findFirstOrThrow: async () => ({ id: 'staff-admin' })
      },
      config: {
        findUnique: async () => null
      },
      financeAuditLog: {
        create: async () => ({ id: 'audit-1' })
      }
    }

    const adminActor: TeamActor = {
      id: 'admin-1',
      staffId: 'staff-admin',
      storeId: 'store-test',
      role: 'admin',
      employeeApp: false
    }

    const service = agentSettingsService(mockDb)
    const result = await service.checkConnection(adminActor, {})

    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('latencyMs')
    expect(result).toHaveProperty('details')
    expect(result).toHaveProperty('checkedAt')
  })
})
