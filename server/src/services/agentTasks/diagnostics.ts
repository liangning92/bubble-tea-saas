import { z } from 'zod'
import { AGENT_PILOT_KEY, agentPilotSchema, agentPilotStampSchema } from './pilot'

export interface PdcaPilotDiagnostic {
  state: 'valid' | 'expired' | 'disabled' | 'invalid' | 'unavailable'
  code: string
  renewalRequired: boolean
  startedAt?: string
  expiresAt?: string
}
const healthSchema = z.object({
  state: z.enum(['disabled', 'ready', 'failed', 'stopped', 'expired']),
  code: z.enum(['AGENT_PILOT_CONFIGURED', 'AGENT_PILOT_RECOVERY_CHECKED', 'AGENT_PILOT_RECOVERY_BLOCKED', 'AGENT_PILOT_UNAVAILABLE_OR_EXPIRED', 'AGENT_PILOT_HOST_CLOSED']),
  checkedAt: z.string().datetime({ offset: true })
}).strict()
const parse = (value: unknown) => { try { return JSON.parse(typeof value === 'string' ? value : '') } catch { return null } }

/** Called only after the existing administrator and active-staff checks. Reads
 * this store's bounded diagnostics; never changes grants, anchors or sessions. */
export async function pdcaPilotDiagnostic(db: any, storeId: string,
  env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<PdcaPilotDiagnostic> {
  const result = (state: PdcaPilotDiagnostic['state'], code: string, dates = {}): PdcaPilotDiagnostic => ({ state, code, renewalRequired: state === 'expired', ...dates })
  if (env.AGENT_TASK_PILOT_ENABLED !== '1') return result('disabled', 'AGENT_PILOT_DISABLED')
  if (!env.AGENT_TASK_PILOT_STORE_ID || env.AGENT_TASK_PILOT_STORE_ID !== storeId)
    return result('disabled', 'AGENT_PILOT_NOT_CONFIGURED_FOR_STORE')
  try {
    const read = (key: string) => db.config.findUnique({ where: { storeId_key: { storeId, key } } })
    const row = await read(AGENT_PILOT_KEY)
    if (!row) return result('unavailable', 'AGENT_PILOT_NOT_PROVISIONED')
    const pilot = agentPilotSchema.safeParse(parse(row.value))
    if (!pilot.success || pilot.data.storeId !== storeId) return result('invalid', 'AGENT_PILOT_RECORD_INVALID')
    const anchor = agentPilotStampSchema.safeParse(parse((await read(`${AGENT_PILOT_KEY}.anchor.${pilot.data.stamp.id}`))?.value))
    if (!anchor.success || anchor.data.id !== pilot.data.stamp.id || anchor.data.startedAt !== pilot.data.stamp.startedAt || anchor.data.expiresAt !== pilot.data.stamp.expiresAt)
      return result('invalid', 'AGENT_PILOT_ANCHOR_INVALID')
    const dates = { startedAt: anchor.data.startedAt, expiresAt: anchor.data.expiresAt }
    if (now >= Date.parse(anchor.data.expiresAt)) return result('expired', 'AGENT_PILOT_AUTHORIZATION_EXPIRED', dates)
    if (!pilot.data.enabled) return result('disabled', 'AGENT_PILOT_AUTHORIZATION_DISABLED', dates)
    if (now < Date.parse(anchor.data.startedAt)) return result('unavailable', 'AGENT_PILOT_NOT_STARTED', dates)
    const health = healthSchema.safeParse(parse((await read(`externalAgent.host.health.v1.${anchor.data.id}`))?.value))
    const interval = Number(env.AGENT_TASK_PILOT_RECOVERY_INTERVAL_MS || 1000)
    const staleAfter = Math.max(15000, (Number.isFinite(interval) && interval >= 250 && interval <= 60000 ? interval : 1000) * 3)
    if (!health.success || health.data.state !== 'ready' || health.data.code !== 'AGENT_PILOT_RECOVERY_CHECKED' || Date.parse(health.data.checkedAt) > now + 30000 || now - Date.parse(health.data.checkedAt) > staleAfter)
      return result('unavailable', 'AGENT_PILOT_RUNTIME_UNAVAILABLE', dates)
    return result('valid', 'AGENT_PILOT_AUTHORIZATION_VALID_RUNTIME_READY', dates)
  } catch {
    // Do not return DB errors, raw records, identity hashes, credentials or task evidence.
    return result('unavailable', 'AGENT_PILOT_DIAGNOSTIC_UNAVAILABLE')
  }
}
