import { createHash } from 'crypto'
export const TEAM_AGENT_PREFIX = 'externalAgent.teamBridge.v1.'
export const teamReplyEventId = (agentId: string, taskId: string, channelId: string, messageId: string) =>
  createHash('sha256').update(JSON.stringify([agentId, taskId, channelId, messageId])).digest('hex')

/** Native send transaction owns source + pending fact. No model, callback, timer or secret. */
export async function recordTeamAgentReply(db: any, storeId: string, channel: any, message: any) {
  if (message.agent || message.ai) return
  // employee_work's native-send hook already owns the durable event. Do not
  // enqueue the former physical-member bridge consumer as a second execution.
  const cutover=await db.config.findUnique({where:{storeId_key:{storeId,key:TEAM_AGENT_PREFIX+'employeeRoute.'+channel.id}}})
  if(cutover)return
  const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: TEAM_AGENT_PREFIX + 'channel.' + channel.id } } })
  if (!row) return
  const binding = JSON.parse(row.value), member = channel.members.find((m: any) => m.staffId === 'agent:' + binding.agentId)
  if (!binding.task || !member || message.seq < member.fromSeq || message.authorId === member.staffId) return
  const eventId = teamReplyEventId(binding.agentId, binding.task.taskId, channel.id, message.id)
  const key = TEAM_AGENT_PREFIX + 'pending.' + eventId
  await db.config.upsert({ where: { storeId_key: { storeId, key } },
    create: { storeId, key, category: 'staff', value: JSON.stringify({ eventId, agentId: binding.agentId,
      taskId: binding.task.taskId, taskVersion: binding.task.version, channelId: channel.id, messageId: message.id, seq: message.seq,
      state: 'pending', createdAt: message.createdAt }) }, update: {} })
}
