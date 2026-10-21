import { createHash } from 'crypto'
import { readTeam, type TeamChannel, type TeamTask } from './TeamCommunicationService'
import { readWork, writeWork } from './EmployeeWorkspaceStore'
import { chatRecipientAccess } from './TeamChatReminderService'
import { teamWorkItemLink } from './TeamWorkItemLinks'

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
async function visible(db: any, storeId: string, channel: TeamChannel, task: TeamTask, staffId: string, userId?: string) {
  const member = channel?.members.find(m => m.staffId === staffId)
  if (!member || channel.archived || task.channelId !== channel.id || task.fromSeq < member.fromSeq || task.agentTask || task.ownerId !== staffId || !await chatRecipientAccess(db, storeId, staffId, userId)) return false
  if (task.planId) {
    const plan = await readTeam(db, storeId, `operationPlan.${channel.id}.${task.planId}`)
    if (!task.audienceIds?.includes(staffId) || !plan || plan.revision !== task.planRevision || plan.status !== 'published' || plan.audienceHash !== digest(channel.members)) return false
  }
  return true
}
/** Caller holds the native task transaction. No transport or separate work state. */
export async function enqueueTeamTaskReminder(db: any, storeId: string, c: TeamChannel, task: TeamTask, byStaffId: string) {
  if (task.ownerId === byStaffId || !['assigned', 'changes_requested', 'completed'].includes(task.status) || !await visible(db, storeId, c, task, task.ownerId)) return
  const staff = await db.staff.findFirst({ where: { id: task.ownerId, storeId, status: 'active' }, select: { userId: true } })
  if (!staff?.userId) return
  const event = `team-task:${task.id}:${task.version}`
  const id = createHash('sha256').update(`${staff.userId}:${task.ownerId}:${event}`).digest('hex')
  const key = `reminder.${task.ownerId}.${id}`
  if (await readWork(storeId, key, db)) return
  await writeWork(storeId, key, { id, staffId: task.ownerId, userId: staff.userId, event, title: 'Tugas kerja diperbarui / 工作任务已更新',
    url: teamWorkItemLink(c.id, { employeeTaskId: task.id }), createdAt: task.updatedAt, status: 'pending', read: false,
    teamTask: { channelId: c.id, taskId: task.id, version: task.version, status: task.status } }, db)
  await writeWork(storeId, 'notification.chat.pending', { eventId: id }, db)
}
export async function teamTaskReminderRelevant(db: any, storeId: string, reminder: any) {
  const ref = reminder?.teamTask
  if (!ref || reminder.event !== `team-task:${ref.taskId}:${ref.version}` || !reminder.staffId || !reminder.userId) return false
  const [c, task] = await Promise.all([
    readTeam(db, storeId, `channel.${ref.channelId}`), readTeam(db, storeId, `task.${ref.channelId}.${ref.taskId}`)
  ])
  return !!task && task.id === ref.taskId && task.version === ref.version && task.status === ref.status && ['assigned', 'changes_requested', 'completed'].includes(task.status) &&
    reminder.url === teamWorkItemLink(ref.channelId, { employeeTaskId: ref.taskId }) && await visible(db, storeId, c, task, reminder.staffId, reminder.userId)
}
