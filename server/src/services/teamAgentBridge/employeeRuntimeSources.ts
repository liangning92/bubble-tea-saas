import { createHash } from 'crypto'
import { TeamError, readTeam, TeamChannel, TeamTask } from '../TeamCommunicationService'
import { managementPrivateText } from '../TeamManagementContext'
import { assertDataAudience } from './confidentiality'
import type { BridgeGrant, CommunicationScope, CommunicationSource } from './contract'
import type { EmployeeRuntimeSource } from './employeeRuntimeContract'

export const employeeRuntimeDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const deny = (): never => { throw new TeamError(403, 'EMPLOYEE_RUNTIME_SOURCE_DENIED') }
// Secondary tripwire; structural source isolation is the primary boundary. This
// does not claim to recognize every sensitive meaning in arbitrary free text.
export function employeeRuntimePrivate(text: string): boolean {
  return managementPrivateText(text) || /(?:营业额|营收|利润|毛利|净利|成本|财务|银行卡|账户余额)|\b(?:revenue|profit|margin|turnover|financial|finance|omzet|laba|keuntungan|biaya|hpp|bank\s+account)\b/iu.test(text)
}
export async function readEmployeeRuntimeSource(db: any, grant: BridgeGrant, scope: CommunicationScope, source: CommunicationSource): Promise<EmployeeRuntimeSource> {
  if (!scope.channelId || !scope.audienceStaffIds.length) deny()
  const c = await readTeam<TeamChannel>(db, grant.storeId, 'channel.' + scope.channelId)
  if (!c || c.archived || c.members.some(m => m.staffId !== 'agent:' + grant.agentId && !scope.audienceStaffIds.includes(m.staffId))) deny()
  await assertDataAudience(db, grant, scope, 'operational')
  let value: unknown
  if (source.kind === 'conversation') {
    if (!grant.actions.includes('messages.read') || source.channelId !== scope.channelId) deny()
    const message = await readTeam<any>(db, grant.storeId, `message.${c.id}.${String(source.seq).padStart(12, '0')}`)
    if (!message || message.id !== source.messageId || message.seq !== source.seq || message.agent || message.ai || message.files?.length ||
      c.members.some(m => m.fromSeq > message.seq) || !scope.audienceStaffIds.includes(message.authorId)) deny()
    const author = await db.staff.findFirst({ where: { id: message.authorId, storeId: grant.storeId, status: 'active' }, select: { id: true, userId: true, user: { select: { id: true, storeId: true } } } })
    if (!author?.userId || author.user?.id !== author.userId || author.user?.storeId !== grant.storeId || typeof message.text !== 'string' || employeeRuntimePrivate(message.text)) deny()
    value = { messageId: message.id, seq: message.seq, authorStaffId: author.id, text: message.text, createdAt: message.createdAt }
  } else if (source.kind === 'employee_task') {
    if (!grant.actions.includes('tasks.read') || source.taskId !== scope.task.taskId || source.version !== scope.task.version) deny()
    const task = await readTeam<TeamTask>(db, grant.storeId, `task.${c.id}.${source.taskId}`)
    // Agent manager plans/reports and private evidence never enter an employee execution.
    if (!task || task.agentTask || task.version !== source.version || task.channelId !== c.id || !task.audienceIds?.length ||
      scope.audienceStaffIds.some(id => !task.audienceIds!.includes(id)) || c.members.some(m => m.fromSeq > task.fromSeq)) deny()
    value = { taskId: task.id, version: task.version, text: task.text, ownerId: task.ownerId, status: task.status,
      deadlineAt: task.deadlineAt || task.dueDate, evidenceRequired: task.evidenceRequired, acceptanceCriteria: task.acceptanceCriteria }
    if (employeeRuntimePrivate(JSON.stringify(value))) deny()
  } else {
    // No blanket public-SOP label or shared/old memory. Add only when backed by
    // its actual publication/audience/version resolver; attachments likewise denied.
    deny()
  }
  return { source: structuredClone(source), fingerprint: employeeRuntimeDigest(value), value }
}
