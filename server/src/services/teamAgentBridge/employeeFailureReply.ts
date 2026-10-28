import { createHash } from 'crypto'
import { readTeam, writeTeam } from '../TeamCommunicationService'
import { createTeamAgentBridge } from './service'
import { grantSchema } from './contract'
import { employeeGrantKey, employeeRouteKey, employeeRouteSchema } from './employeeIntake'
import { readAuthorizedBridgeChannel } from './directDelegation'
import { textHash } from './confidentiality'
import { readEmployeeRuntimeSource } from './employeeRuntimeSources'
import { assertToolSettings } from './employeeAccess'
import type { EmployeeContinuationEvent } from './employeeContinuation'

const deny = (): never => { throw Error('EMPLOYEE_FAILURE_REPLY_NOT_AUTHORIZED') }
const requestId = (id: string) => {
  const bytes = createHash('sha256').update('employee-failure-reply:' + id).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const s = bytes.toString('hex'); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`
}
export function employeeFailureText(code: string, sourceText: string) {
  const permission = /NOT_VISIBLE|NOT_GRANTED|AUTHORIZ|PERMISSION|REVOK|GRANT|DATA_POLICY/.test(code)
  const timeout = /TIMEOUT|EXPIRED|DEADLINE/.test(code)
  if (/\p{Script=Han}/u.test(sourceText)) return (permission
    ? '当前授权或会话成员的数据可见权限不足，我不能向这个会话展示受限内容。可以由管理员在后台核对对应权限，我仍可回答权限范围内的问题。'
    : timeout ? '这次处理超时了，我尚未确认完整完成。问题和已有操作记录已保留。'
    : '这次处理遇到服务异常，我尚未确认完整完成。问题和已有操作记录已保留。') + ' 已保存的业务操作不会自动重做；涉及业务变更时，请先核对操作记录，避免重复提交。'
  if (/\b(?:saya|anda|tolong|hari|stok|bahan|bisa|berapa|izin|gaji|halo|mohon)\b/i.test(sourceText)) return (permission
    ? 'Izin saat ini atau akses data anggota percakapan belum mencukupi. Saya tidak dapat menampilkan data terbatas di sini. Administrator dapat memeriksa izin di pengaturan. Saya tetap dapat membantu pertanyaan yang diizinkan.'
    : timeout ? 'Pemrosesan kali ini melewati batas waktu. Penyelesaian belum terkonfirmasi. Pertanyaan dan catatan operasi tetap tersimpan.'
    : 'Ada gangguan layanan saat saya memproses permintaan ini. Penyelesaian belum terkonfirmasi. Pertanyaan dan catatan operasi tetap tersimpan.') + ' Operasi yang sudah tercatat tidak diulang otomatis. Periksa catatan operasi sebelum mengirim ulang perubahan agar tidak tercatat dua kali.'
  return (permission
    ? 'The current authorization or conversation members do not have the required data access. I cannot disclose restricted data here. An administrator can review the saved permissions. I can still help with questions within the available access.'
    : timeout ? 'This request timed out before I could confirm completion. Your question and existing operation records are retained.'
    : 'A service error prevented me from confirming completion. Your question and existing operation records are retained.') + ' Recorded business operations are not repeated automatically. Check the operation records before resubmitting a change to avoid duplicates.'
}

/** Transaction-bound, fixed informational output only. No model, business retry,
 * user impersonation, external contact, or arbitrary status text is accepted. */
export async function sendEmployeeFailureReply(tx: any, storeId: string, event: EmployeeContinuationEvent, state: any) {
  if (!state.ticket?.executionId || state.scope?.channelId !== event.channelId || state.scope?.requesterStaffId !== event.sourceStaffId || state.grant?.storeId !== storeId) deny()
  const stored = await readTeam<any>(tx, storeId, 'employeeRuntime.execution.' + state.ticket.executionId)
  if (!stored || JSON.stringify(stored) !== JSON.stringify(state) || !(state.phase === 'unknown' || state.phase !== 'complete' && Date.parse(state.expiresAt) <= Date.now())) deny()
  if (state.tools?.some((tool: any) => tool.name === 'employee_send_message' && tool.value?.messageId)) return null
  const id = requestId(state.ticket.executionId), markerKey = 'employeeRuntime.failureReply.' + state.ticket.executionId
  const routeRow = await tx.config.findUnique({ where: { storeId_key: { storeId, key: employeeRouteKey(event.channelId) } } })
  const route = employeeRouteSchema.parse(routeRow && JSON.parse(routeRow.value))
  if (state.grant.agentId !== route.agentId || state.scope.task.taskId !== route.task.taskId || state.scope.task.version !== route.task.version) deny()
  const resolveGrant = async (db: any) => {
    await assertToolSettings(db, storeId, 'employee_send_message', {})
    const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: employeeGrantKey(route.agentId) } } })
    return grantSchema.parse(row && JSON.parse(row.value))
  }
  const grant = await resolveGrant(tx), access = await readAuthorizedBridgeChannel(tx, grant, route.task, event.channelId)
  const source = await readTeam<any>(tx, storeId, `message.${event.channelId}.${String(event.sourceSeq).padStart(12,'0')}`)
  if (!source || source.id !== event.sourceMessageId || source.authorId !== event.sourceStaffId || source.seq < access.fromSeq || source.ai || source.agent) deny()
  const text = employeeFailureText(String(state.fault?.code || 'EMPLOYEE_RUNTIME_EXPIRED'), source.text || '')
  const reference = { kind: 'conversation' as const, channelId: event.channelId, messageId: source.id, seq: source.seq }
  const native: any = { config: tx.config, staff: tx.staff, user: tx.user, financeAuditLog: tx.financeAuditLog, store: tx.store }
  native.$transaction = async (operation: any) => operation(native)
  const bridge = createTeamAgentBridge(native, { enabled: true, resolveGrant, readAttachment: async () => { deny(); return new Uint8Array() },
    tasks: { assert: async (db, g, task, channelId) => {
      const row = await db.config.findUnique({ where: { storeId_key: { storeId, key: employeeRouteKey(channelId!) } } })
      const current = employeeRouteSchema.parse(row && JSON.parse(row.value)), policy = await readTeam<any>(db, storeId, 'workflow.policy.' + channelId)
      const assigned = await readTeam<any>(db, storeId, `task.${channelId}.${task.taskId}`)
      if (!current.enabled || current.paused || policy?.paused || policy?.enabled === false || Date.parse(current.expiresAt) <= Date.now() || current.agentId !== g.agentId || current.task.taskId !== task.taskId || current.task.version !== task.version || !assigned || assigned.version !== task.version || assigned.ownerId !== 'agent:' + g.agentId || !['assigned','accepted','submitted','changes_requested'].includes(assigned.status)) deny()
    } }, communication: {
      assertContext: async (_db, _g, scope) => {
        if (scope.channelId !== event.channelId || scope.task.taskId !== route.task.taskId) deny()
        return { purpose: 'employee_work', compartmentKey: scope.compartmentKey, memoryNamespace: scope.compartmentKey, executionId: id }
      },
      authorizeSource: async (db, g, scope, ref) => {
        if (JSON.stringify(ref) !== JSON.stringify(reference)) deny()
        await readEmployeeRuntimeSource(db, g, scope, ref)
        return { dataClasses: ['operational'] }
      },
      admitOutput: async (_db, _g, scope, input) => {
        if (scope.requesterStaffId !== event.sourceStaffId || input.requestId !== id || input.purpose !== 'message' || input.textHash !== textHash(text)) deny()
        return { decision: 'allow', executionId: id, compartmentKey: scope.compartmentKey, audienceHash: scope.audienceHash, requestId: id, textHash: input.textHash, dataClasses: ['operational'], sources: [reference] }
      }
    } })
  const existing = await readTeam<any>(tx, storeId, markerKey)
  if (existing) return existing
  const reply = await bridge.send({ channelId: event.channelId, task: route.task, requestId: id, expectedLastSeq: access.channel.lastSeq, replyToSeq: source.seq, text })
  const receipt = { messageId: reply.id, seq: reply.seq, replyToSeq: source.seq, informational: true }
  await writeTeam(tx, storeId, markerKey, receipt)
  return receipt
}
