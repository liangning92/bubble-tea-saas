import { createHash } from 'crypto'
import { readTeam } from './TeamCommunicationService'

// Read-only boundary; the management action state machine remains its sole writer.
export async function managementFollowupRelevant(db: any, storeId: string, reminder: any,
  readAction: (db: any, storeId: string, id: string) => Promise<any> = (tx, store, id) => readTeam(tx, store, 'management.action.' + id)) {
  const ref = reminder.managementAction
  if (!ref || !/^[a-f0-9-]{36}$/.test(ref.actionId) || !ref.channelId || !Number.isInteger(ref.version) ||
      reminder.event !== `management-followup:${ref.actionId}:${ref.version}`) return false
  const action = await readAction(db, storeId, ref.actionId)
  if (!action || action.storeId !== storeId || action.id !== ref.actionId || action.channelId !== ref.channelId ||
      action.version !== ref.version || !['waiting_details', 'open', 'waiting_owner', 'awaiting_evidence'].includes(action.status) ||
      action.assignedStaffId !== reminder.staffId || !action.assignedUserId || reminder.userId !== action.assignedUserId) return false
  const [channel, staff, user] = await Promise.all([
    readTeam(db, storeId, 'channel.' + ref.channelId),
    db.staff.findFirst({ where: { id: reminder.staffId, storeId, status: 'active' } }),
    db.user.findUnique({ where: { id: action.assignedUserId } })
  ])
  if (!channel || channel.archived || !Array.isArray(channel.members) || !staff || !user ||
      staff.userId !== action.assignedUserId || user.storeId && user.storeId !== storeId) return false
  const member = channel.members.find((m: any) => m.staffId === reminder.staffId)
  return !!member && Number.isInteger(action.fromSeq) && member.fromSeq <= action.fromSeq &&
    action.audienceHash === createHash('sha256').update(JSON.stringify(channel.members)).digest('hex')
}
