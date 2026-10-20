import { createHash } from 'crypto'
import { readTeam, TeamChannel } from './TeamCommunicationService'
import { employeeAppAccess } from './EmployeeAppAccess'
import { readWork, writeWork } from './EmployeeWorkspaceStore'

const eventPrefix = 'team-chat:'
export async function chatRecipientAccess(db: any, storeId: string, staffId: string) {
  const staff = await db.staff.findFirst({ where: { id: staffId, storeId, status: 'active' },
    select: { user: { select: { id: true, role: true, storeId: true } } } })
  if (!staff?.user || staff.user.storeId !== storeId) return false
  // Match the actual employee-app personal-route semantics; backend business grants do not revoke personal chat.
  return employeeAppAccess(staff.user.role).modes['personal.messages'] === 'allow'
}
export async function chatReminderRelevant(db: any, storeId: string, r: any) {
  if (!r.event?.startsWith(eventPrefix)) return true
  if (!r.chat || !await chatRecipientAccess(db, storeId, r.staffId)) return false
  const c: TeamChannel = await readTeam(db, storeId, `channel.${r.chat.channelId}`)
  const member = c?.members.find(m => m.staffId === r.staffId)
  if (!member || c.archived || r.chat.seq < member.fromSeq) return false
  const m = await readTeam(db, storeId, `message.${c.id}.${String(r.chat.seq).padStart(12, '0')}`)
  if (!m || m.id !== r.chat.messageId || m.authorId === r.staffId) return false
  const read = await readTeam(db, storeId, `read.${c.id}.${r.staffId}`)
  return !read || read.seq < r.chat.seq
}
/** Caller holds the message/channel transaction. Never start a nested transaction or create push credentials. */
export async function enqueueChatReminders(db: any, storeId: string, c: TeamChannel, message: any) {
  for (const member of c.members) {
    if (member.staffId === message.authorId || member.fromSeq > message.seq || !await chatRecipientAccess(db, storeId, member.staffId)) continue
    const event = eventPrefix + message.id, id = createHash('sha256').update(`${member.staffId}:${event}`).digest('hex')
    const key = `reminder.${member.staffId}.${id}`
    if (await readWork(storeId, key, db)) continue
    await writeWork(storeId, key, { id, staffId: member.staffId, event, title: 'Pesan kerja baru / 新工作消息',
      url: '/team?channel=' + encodeURIComponent(c.id), createdAt: message.createdAt, read: false, status: 'pending',
      chat: { channelId: c.id, messageId: message.id, seq: message.seq } }, db)
  }
}
