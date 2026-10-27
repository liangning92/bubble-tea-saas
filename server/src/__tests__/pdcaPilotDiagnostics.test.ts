import { describe, expect, it, jest } from '@jest/globals'
jest.mock('../config/database', () => ({ __esModule: true, default: {} }))
import { pdcaPilotDiagnostic } from '../services/agentTasks/diagnostics'
import { agentSettingsService, defaultAgentSettings } from '../services/AgentSettingsService'
import type { TeamActor } from '../services/TeamCommunicationService'

const now = Date.parse('2026-10-27T05:00:00.000Z')
const stamp = { id: '10000000-0000-4000-8000-000000000001', startedAt: '2026-10-27T00:00:00.000Z', expiresAt: '2026-10-28T00:00:00.000Z' }
const env = { AGENT_TASK_PILOT_ENABLED: '1', AGENT_TASK_PILOT_STORE_ID: 'store-a' }
const pilot = { stamp, storeId: 'store-a', channelId: '20000000-0000-4000-8000-000000000001', taskCode: 'STOCK-RO-001', enabled: true, version: 1 }
const admin: TeamActor = { id: 'user-a', staffId: 'staff-a', storeId: 'store-a', role: 'admin', employeeApp: false }
function fixture() {
  const rows = new Map<string, unknown>([
    ['externalAgent.pilot.v1', pilot],
    [`externalAgent.pilot.v1.anchor.${stamp.id}`, stamp],
    [`externalAgent.host.health.v1.${stamp.id}`, { state: 'ready', code: 'AGENT_PILOT_RECOVERY_CHECKED', checkedAt: new Date(now).toISOString() }],
    ['team.communication.ai.agent.settings', { ...defaultAgentSettings(), enabled: true }]
  ])
  const reads: any[] = []
  const db: any = {
    staff: { findFirstOrThrow: jest.fn(async () => ({ id: 'staff-a' })) },
    config: { findUnique: jest.fn(async ({ where }: any) => {
      const key = where.storeId_key; reads.push(key)
      const value = key.storeId === 'store-a' ? rows.get(key.key) : undefined
      return value === undefined ? null : { value: JSON.stringify(value) }
    }) }
  }
  return { rows, reads, db }
}
describe('bounded administrator PDCA diagnostics', () => {
  it('reports a valid anchored pilot only with recent successful host readiness', async () => {
    const { db, reads } = fixture()
    expect(await pdcaPilotDiagnostic(db, 'store-a', env, now)).toEqual({ state: 'valid', code: 'AGENT_PILOT_AUTHORIZATION_VALID_RUNTIME_READY', renewalRequired: false, startedAt: stamp.startedAt, expiresAt: stamp.expiresAt })
    expect(reads.every(r => r.storeId === 'store-a')).toBe(true)
    expect(db.config.findUnique).toHaveBeenCalledTimes(3)
  })
  it('keeps exact expiry as expired without rewriting T0 or reading task evidence', async () => {
    const { db, rows, reads } = fixture(), before = JSON.stringify([...rows])
    const status = await pdcaPilotDiagnostic(db, 'store-a', env, Date.parse(stamp.expiresAt))
    expect(status.state).toBe('expired'); expect(status.renewalRequired).toBe(true)
    expect(JSON.stringify([...rows])).toBe(before)
    expect(reads.map(r => r.key)).toEqual(['externalAgent.pilot.v1', `externalAgent.pilot.v1.anchor.${stamp.id}`])
  })
  it('does not publish dates from malformed, cross-store or mismatched anchored records', async () => {
    for (const altered of [{ ...pilot, storeId: 'store-b' }, { ...pilot, stamp: { ...stamp, expiresAt: 'not-a-date' } }]) {
      const { db, rows } = fixture(); rows.set('externalAgent.pilot.v1', altered)
      expect(await pdcaPilotDiagnostic(db, 'store-a', env, now)).toMatchObject({ state: 'invalid', renewalRequired: false })
      expect(await pdcaPilotDiagnostic(db, 'store-a', env, now)).not.toHaveProperty('startedAt')
    }
    const { db, rows } = fixture(); rows.set(`externalAgent.pilot.v1.anchor.${stamp.id}`, { ...stamp, id: '30000000-0000-4000-8000-000000000001' })
    expect(await pdcaPilotDiagnostic(db, 'store-a', env, now)).toEqual({ state: 'invalid', code: 'AGENT_PILOT_ANCHOR_INVALID', renewalRequired: false })
  })
  it('does not probe another store or a disabled host', async () => {
    const { db, reads } = fixture()
    expect((await pdcaPilotDiagnostic(db, 'store-b', env, now)).state).toBe('disabled')
    expect((await pdcaPilotDiagnostic(db, 'store-a', {}, now)).state).toBe('disabled')
    expect(reads).toHaveLength(0)
  })
  it('does not equate authorization, a missing host receipt, stale readiness and an enabled env flag', async () => {
    const { db, rows } = fixture()
    rows.delete(`externalAgent.host.health.v1.${stamp.id}`)
    expect((await pdcaPilotDiagnostic(db, 'store-a', env, now)).state).toBe('unavailable')
    rows.set(`externalAgent.host.health.v1.${stamp.id}`, { state: 'ready', code: 'AGENT_PILOT_RECOVERY_CHECKED', checkedAt: new Date(now - 15001).toISOString() })
    expect((await pdcaPilotDiagnostic(db, 'store-a', env, now)).state).toBe('unavailable')
  })
  it('sanitizes storage failures rather than leaking diagnostic payloads', async () => {
    const db: any = { config: { findUnique: async () => { throw Error('secret-sensitive-provider-payload') } } }
    const result = await pdcaPilotDiagnostic(db, 'store-a', env, now)
    expect(result).toEqual({ state: 'unavailable', code: 'AGENT_PILOT_DIAGNOSTIC_UNAVAILABLE', renewalRequired: false })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('uses existing admin and active same-store staff checks before diagnostic reads', async () => {
    const { db, reads } = fixture()
    const service = agentSettingsService(db)
    for (const actor of [{ ...admin, role: 'cashier' }, { ...admin, employeeApp: true }])
      await expect(service.getSettings(actor)).rejects.toThrow('TEAM_AI_ADMIN_REQUIRED')
    expect(reads).toHaveLength(0)
    db.staff.findFirstOrThrow = jest.fn(async () => { throw Error('NO_ACTIVE_STAFF') })
    await expect(service.getSettings(admin)).rejects.toThrow('NO_ACTIVE_STAFF')
    expect(reads).toHaveLength(0)
    expect(db.staff.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: admin.staffId, userId: admin.id, storeId: admin.storeId, status: 'active' }, select: { id: true } })
  })
  it('does not mark the PDCA capability active when business authorization has expired', async () => {
    const { db, rows } = fixture()
    const old = { ...stamp, startedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-02T00:00:00.000Z' }
    rows.set('externalAgent.pilot.v1', { ...pilot, stamp: old }); rows.set(`externalAgent.pilot.v1.anchor.${stamp.id}`, old)
    const prior = { enabled: process.env.AGENT_TASK_PILOT_ENABLED, store: process.env.AGENT_TASK_PILOT_STORE_ID, employee: process.env.EMPLOYEE_HERMES_ENABLED }
    process.env.AGENT_TASK_PILOT_ENABLED = '1'; process.env.AGENT_TASK_PILOT_STORE_ID = 'store-a'; process.env.EMPLOYEE_HERMES_ENABLED = '0'
    try {
      const result = await agentSettingsService(db).getSettings(admin)
      expect(result.systemState.pilotState).toBe('expired')
      expect(result.systemState.pdcaPilot.renewalRequired).toBe(true)
      expect(result.systemState.capabilities.find(c => c.id === 'stock_audit_pdca')?.active).toBe(false)
      expect(JSON.stringify(result.systemState.pdcaPilot)).not.toContain(stamp.id)
    } finally {
      for (const [key, value] of Object.entries({ AGENT_TASK_PILOT_ENABLED: prior.enabled, AGENT_TASK_PILOT_STORE_ID: prior.store, EMPLOYEE_HERMES_ENABLED: prior.employee })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    }
  })
})
