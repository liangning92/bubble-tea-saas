import { z } from 'zod'
import { TeamError } from '../TeamCommunicationService'

export const AGENT_PILOT_DURATION_MS = 24 * 60 * 60 * 1000
export const AGENT_PILOT_KEY = 'externalAgent.pilot.v1'
export const agentPilotStampSchema = z.object({ id: z.string().uuid(), startedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }) }).strict().refine(v =>
  Date.parse(v.expiresAt) - Date.parse(v.startedAt) === AGENT_PILOT_DURATION_MS, 'PILOT_ABSOLUTE_24H_REQUIRED')
export type AgentPilotStamp = z.infer<typeof agentPilotStampSchema>
export const agentPilotSchema = z.object({ stamp: agentPilotStampSchema, storeId: z.string().min(1), channelId: z.string().uuid(),
  taskCode: z.literal('STOCK-RO-001'), enabled: z.boolean(), version: z.number().int().positive() }).strict()
export type AgentPilot = z.infer<typeof agentPilotSchema>
const denied = (): never => { throw new TeamError(403, 'AGENT_PILOT_UNAVAILABLE_OR_EXPIRED') }

/** Stamps are server-resolved metadata, never tool/body authorization. Legacy isolated
 * fixtures may omit one; production bindings require the authoritative anchored record. */
export function assertAgentPilotStamp(p: { pilot?: AgentPilotStamp }, now = Date.now(), required = false) {
  if (!p.pilot) { if (required) denied(); return }
  const parsed = agentPilotStampSchema.safeParse(p.pilot)
  if (!parsed.success || now < Date.parse(parsed.data.startedAt) || now >= Date.parse(parsed.data.expiresAt)) denied()
}

/** No enrollment or activation side effect. Provisioning the pointer and immutable
 * anchor is a separately authorized operator action; refresh never rewrites T0. */
export async function readAgentPilot(db: any, storeId: string, now = Date.now()): Promise<AgentPilot> {
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: AGENT_PILOT_KEY } } })
  let pilot: AgentPilot
  try { pilot = agentPilotSchema.parse(JSON.parse(row?.value || 'null')) } catch { return denied() }
  if (!pilot.enabled || pilot.storeId !== storeId) denied()
  const anchor = await db.config.findUnique({ where: { storeId_key: { storeId, key: `${AGENT_PILOT_KEY}.anchor.${pilot.stamp.id}` } } })
  let stamp: AgentPilotStamp
  try { stamp = agentPilotStampSchema.parse(JSON.parse(anchor?.value || 'null')) } catch { return denied() }
  if (JSON.stringify(stamp) !== JSON.stringify(pilot.stamp)) denied()
  assertAgentPilotStamp({ pilot: stamp }, now, true)
  return pilot
}
