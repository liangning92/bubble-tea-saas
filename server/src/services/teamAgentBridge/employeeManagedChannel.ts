import { createHash, randomUUID } from 'crypto'
import { grantSchema } from './contract'
import { employeeGrantKey, employeeRouteKey } from './employeeIntake'
import { assertManagementAudience } from '../TeamManagementContext'
import { lockTeam } from '../TeamCommunicationService'
import type { TeamChannel, TeamTask } from '../TeamCommunicationService'
import type { WorkflowPolicy } from '../TeamWorkflowQueue'

type Ports = { read(db: any, storeId: string, key: string): Promise<any>; write(db: any, storeId: string, key: string, value: unknown): Promise<unknown> }
/** Inside the native message transaction. The saved all-channel choice plus
 * the already enabled management consent owns this route, not a text keyword.
 * No historical jobs or business writes are replayed. */
export async function ensureManagedEmployeeChannel(db: any, storeId: string, channel: TeamChannel, message: any, policy: WorkflowPolicy, ports: Ports) {
  if (!policy?.management || !policy.enabled || policy.paused || !policy.automaticSend || channel.archived ||
      channel.members.some(member => member.staffId.startsWith('agent:'))) return false
  const settings = await ports.read(db, storeId, 'ai.agent.settings')
  if (!settings?.allChannelsAllowed || process.env.EMPLOYEE_HERMES_ENABLED !== '1' || process.env.EMPLOYEE_HERMES_STORE_ID !== storeId) return false
  if (await db.config.findUnique({ where: { storeId_key: { storeId, key: employeeRouteKey(channel.id) } } })) return true
  const blocked = async (reason: string) => {
    const eventId = createHash('sha256').update(JSON.stringify(['employee_work', channel.id, message.id])).digest('hex')
    const key = 'externalAgent.teamBridge.v1.employeePending.' + eventId
    await db.config.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, category: 'staff', value: JSON.stringify({ eventId, channelId: channel.id, messageId: message.id, sourceSeq: message.seq, sourceStaffId: message.authorId, state: 'blocked', reason, createdAt: message.createdAt, updatedAt: message.createdAt }) }, update: {} })
    return true
  }
  if (!settings.enabled || !settings.employeeBridgeEnabled || settings.expiresAt && Date.parse(settings.expiresAt) <= Date.now()) return blocked('EMPLOYEE_ROUTE_DISABLED_BY_SETTINGS')
  if (!settings.permissions?.channels?.read || !settings.permissions?.channels?.write) return blocked('EMPLOYEE_ROUTE_CHANNEL_PERMISSION_REQUIRED')
  await lockTeam(db, storeId, 'ai.agent.settings')
  // Serialize scope growth with operator saves and other new conversations.
  const freshSettings = await ports.read(db, storeId, 'ai.agent.settings')
  if (JSON.stringify(freshSettings) !== JSON.stringify(settings)) return blocked('EMPLOYEE_ROUTE_SETTINGS_CHANGED')
  const agentId = process.env.EMPLOYEE_HERMES_AGENT_ID
  if (!agentId) return blocked('EMPLOYEE_ROUTE_AGENT_UNAVAILABLE')
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: employeeGrantKey(agentId) } } })
  const parsed = grantSchema.safeParse(row && JSON.parse(row.value))
  if (!parsed.success || parsed.data.storeId !== storeId || parsed.data.agentId !== agentId || parsed.data.sponsorUserId !== policy.operatorUserId || parsed.data.revoked || Date.parse(parsed.data.expiresAt) <= Date.now()) return blocked('EMPLOYEE_ROUTE_GRANT_UNAVAILABLE')
  const grant = parsed.data
  if (!['messages.read', 'messages.send', 'tasks.read'].every(action => (grant.actions as string[]).includes(action))) return blocked('EMPLOYEE_ROUTE_CHANNEL_PERMISSION_REQUIRED')
  const sponsor = await db.user.findFirst({ where: { id: grant.sponsorUserId, storeId, role: 'admin' }, include: { staff: true } })
  if (!sponsor?.staff || sponsor.staff.id !== policy.operatorStaffId) return blocked('EMPLOYEE_ROUTE_OWNER_UNAVAILABLE')
  try { await assertManagementAudience(db, { id: sponsor.id, storeId, staffId: sponsor.staff.id, role: sponsor.role, employeeApp: false }, channel, policy) }
  catch { return blocked('EMPLOYEE_ROUTE_AUDIENCE_UNAVAILABLE') }
  const staffIds = [...new Set([...grant.staffIds, ...channel.members.map(member => member.staffId)])]
  const channelIds = [...new Set([...grant.channelIds, channel.id])]
  if (staffIds.length > 100 || channelIds.length > 100) return blocked('EMPLOYEE_ROUTE_GRANT_CAPACITY')
  const agent = 'agent:' + agentId, taskId = randomUUID(), time = new Date().toISOString(), task = { taskId, version: 1 }
  // The agent starts at this actual new message. Previous blocked requests are
  // not silently re-executed or used as authority for a new operation.
  const fromSeq = message.seq
  const humans = channel.members.map(member => member.staffId)
  channel.members.push({ staffId: agent, fromSeq }); channel.version++
  const native: TeamTask = { id: taskId, channelId: channel.id, roundId: taskId, minuteVersion: 1, actionIndex: 0,
    text: 'Hermes: answer new questions naturally and perform backend-authorized store operations. Explain unavailable data or authority and never invent completion.',
    ownerId: agent, reviewerId: sponsor.staff.id, dueDate: grant.expiresAt.slice(0, 10), deadlineAt: grant.expiresAt, sourceSeq: [], fromSeq,
    status: 'assigned', version: 1, createdAt: time, updatedAt: time, audienceIds: humans,
    evidenceRequired: 'Actual source messages and stored tool receipts.', acceptanceCriteria: 'Review actual evidence; a report is not task acceptance.',
    events: [{ action: 'service_agent_delegate', by: 'service:employee-managed-channel', at: time, sourceSeq: [], note: 'Operator-enabled all-channel Hermes routing.' }] }
  await db.config.update({ where: { storeId_key: { storeId, key: employeeGrantKey(agentId) } }, data: { value: JSON.stringify({ ...grant, staffIds, channelIds }) } })
  await ports.write(db, storeId, 'channel.' + channel.id, channel)
  await ports.write(db, storeId, 'task.' + channel.id + '.' + taskId, native)
  for (const [key, value] of [
    ['externalAgent.teamBridge.v1.channel.' + channel.id, { agentId, task }],
    [employeeRouteKey(channel.id), { version: 1, agentId, task, sourceStaffId: message.authorId, fromSeq, enabled: true, paused: false, expiresAt: grant.expiresAt }]
  ] as const) await db.config.create({ data: { storeId, key, category: 'staff', value: JSON.stringify(value) } })
  await db.financeAuditLog.create({ data: { storeId, userId: 'service:employee-managed-channel', action: 'create', entityType: 'employee_agent_delegation', entityId: channel.id,
    description: 'Route operator-enabled managed conversation to Hermes', newValue: JSON.stringify({ agentId, taskId, fromSeq, settingsVersion: settings.version, sponsorUserId: sponsor.id }) } })
  return true
}
