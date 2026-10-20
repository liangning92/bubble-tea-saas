import { z } from 'zod'
import { TeamActor, TeamChannel, TeamError, readTeam, TEAM_PREFIX } from './TeamCommunicationService'
import type { WorkflowPolicy } from './TeamWorkflowQueue'

/** This reviewed list is consent scope, never a role or a privilege grant. IDs are bound by the saved policy. */
export const ROUTINE_EMPLOYEE_NAMES = ['Najwa', 'Chyntia', 'Naila', 'Sekar', 'Rizky', 'Rangga'] as const
export const routineConsentSchema = z.object({ version: z.literal(1), employeeName: z.enum(ROUTINE_EMPLOYEE_NAMES),
  region: z.literal('cn'), scope: z.literal('routine_codes_v1'), dataConsent: z.literal(true) }).strict()
export type RoutineConsent = z.infer<typeof routineConsentSchema> & { sourceFloor: number; aiCheckRevision: number }
export const ROUTINE_REPLIES = Object.freeze({
  acknowledge: 'Terima kasih atas pembaruan pekerjaan. Catatan ini masih menunggu verifikasi penanggung jawab.',
  progress: 'Baik, silakan lanjutkan tugas yang sudah ditugaskan dan kabari progresnya di percakapan ini.',
  evidence: 'Terima kasih. Jika tugas memerlukan bukti, tambahkan bukti di percakapan ini untuk ditinjau penanggung jawab.',
  supervisor: 'Mohon tunggu arahan penanggung jawab di percakapan ini. Saya tidak menyetujui perubahan tugas atau data.'
})
export const routineReplySchema = z.object({ replyCode: z.enum(['acknowledge', 'progress', 'evidence', 'supervisor']) }).strict()
export type RoutineReplyCode = keyof typeof ROUTINE_REPLIES
// A positive, finite language accepts complete phrases only. No arbitrary strings, names, numbers or attachments reach the provider.
// Unknown phrases (including mixed sensitive/routine text) go to a human. This is deliberately not a universal sensitive-text detector.
const phrases: Readonly<Record<string, string>> = Object.freeze({
  'siap': 'acknowledged', 'baik': 'acknowledged', 'oke': 'acknowledged', 'terima kasih': 'thanks',
  'sudah selesai': 'work_reported_done', 'belum selesai': 'work_reported_not_done',
  'sedang dikerjakan': 'work_reported_in_progress', 'sedang bekerja': 'work_reported_in_progress',
  'mohon arahan': 'work_guidance_requested', 'apa langkah selanjutnya': 'work_guidance_requested',
  'pembersihan sudah selesai': 'cleaning_reported_done', 'pembersihan belum selesai': 'cleaning_reported_not_done',
  'sedang membersihkan': 'cleaning_reported_in_progress',
  'pemeriksaan kemasan sudah selesai': 'packaging_check_reported_done',
  'pemeriksaan kemasan belum selesai': 'packaging_check_reported_not_done',
  'sedang memeriksa kemasan': 'packaging_check_reported_in_progress',
  '已收到': 'acknowledged', '谢谢': 'thanks', '已经完成': 'work_reported_done', '尚未完成': 'work_reported_not_done',
  '正在处理': 'work_reported_in_progress', '请指示下一步': 'work_guidance_requested'
})
export function routineCode(message: { text: string; files?: unknown[] }) {
  if (message.files?.length || typeof message.text !== 'string' || message.text.length > 100) return null
  const text = message.text.trim().toLowerCase().replace(/[.!。！]$/, '').trim()
  return Object.hasOwn(phrases, text) ? phrases[text] : null
}
const fail = (code: string): never => { throw new TeamError(409, code) }
export async function assertRoutineAudience(db: any, a: TeamActor, c: TeamChannel, p: WorkflowPolicy) {
  const r = p.routine
  if (!r || !routineConsentSchema.safeParse({ version: r.version, employeeName: r.employeeName, region: r.region, scope: r.scope, dataConsent: r.dataConsent }).success ||
      c.kind !== 'direct' || c.members.length !== 2 || p.employeeIds.length !== 1 ||
      !c.members.some(m => m.staffId === a.staffId) || !c.members.some(m => m.staffId === p.employeeIds[0]) || p.employeeIds[0] === a.staffId) fail('TEAM_ROUTINE_PRIVATE_SCOPE_REQUIRED')
  const employee = await db.staff.findFirst({ where: { id: p.employeeIds[0], storeId: a.storeId, status: 'active' },
    select: { name: true, user: { select: { role: true, storeId: true } } } })
  if (!employee?.user || employee.user.storeId !== a.storeId || employee.name.trim() !== r.employeeName) fail('TEAM_ROUTINE_EMPLOYEE_SCOPE_CHANGED')
}
export async function routineContext(db: any, a: TeamActor, c: TeamChannel, p: WorkflowPolicy, sourceSeq: number) {
  await assertRoutineAudience(db, a, c, p)
  const floor = Math.max(p.routine.sourceFloor, ...c.members.map(m => m.fromSeq))
  if (sourceSeq < floor) fail('TEAM_ROUTINE_SOURCE_RANGE')
  const prefix = TEAM_PREFIX + `message.${c.id}.`, pad = (n: number) => String(n).padStart(12, '0')
  const rows = await db.config.findMany({ where: { storeId: a.storeId, key: { startsWith: prefix, gte: prefix + pad(floor), lte: prefix + pad(sourceSeq) } }, orderBy: { key: 'desc' }, take: 6 })
  const context: { seq: number; actor: string; code: string }[] = []
  for (const row of rows) {
    const m = JSON.parse(row.value)
    const code = m.authorId === p.employeeIds[0] && !m.ai ? routineCode(m) :
      m.authorId === a.staffId && m.ai?.routineAuthorization && Object.hasOwn(ROUTINE_REPLIES, m.ai.routineAuthorization.replyCode) &&
      m.ai.routineAuthorization.policyHash === p.hash && m.text === ROUTINE_REPLIES[m.ai.routineAuthorization.replyCode] ? m.ai.routineAuthorization.replyCode : null
    if (!code) {
      if (m.seq === sourceSeq) fail('TEAM_ROUTINE_MANUAL_REQUIRED')
      break // Never bridge across unreviewed/private conversation.
    }
    context.push({ seq: m.seq, actor: m.authorId === p.employeeIds[0] ? 'employee' : 'assistant', code })
  }
  if (!context.length || context[0].seq !== sourceSeq || context[0].actor !== 'employee') fail('TEAM_ROUTINE_MANUAL_REQUIRED')
  return JSON.stringify({ schema: 'team.routine.codes.v1', context: context.reverse() })
}
export interface RoutineAuthorization { jobId: string; sourceSeq: number; policyHash: string; policyVersion: number; epoch: number; replyCode: RoutineReplyCode }
/** An internal transaction-only send capability. HTTP publication never supplies this parameter. */
export async function assertRoutineSend(db: any, a: TeamActor, c: TeamChannel, draft: any, proof: RoutineAuthorization, text: string) {
  const p: WorkflowPolicy = await readTeam(db, a.storeId, `workflow.policy.${c.id}`)
  const j = await readTeam(db, a.storeId, `workflow.job.${c.id}.${String(proof.sourceSeq).padStart(12, '0')}`)
  if (!p?.automaticSend || !p.enabled || p.paused || p.hash !== proof.policyHash || p.version !== proof.policyVersion || p.epoch !== proof.epoch ||
      p.operatorUserId !== a.id || p.operatorStaffId !== a.staffId || !j || j.id !== proof.jobId || j.status !== 'processing' ||
      j.policyHash !== p.hash || j.claimEpoch !== p.epoch || j.leaseUntil <= Date.now() || j.replyMessageId || draft.workflowJobId !== j.id ||
      !Object.hasOwn(ROUTINE_REPLIES, proof.replyCode) || text !== ROUTINE_REPLIES[proof.replyCode] ||
      JSON.stringify(draft.routineAuthorization) !== JSON.stringify(proof)) fail('TEAM_ROUTINE_SEND_SCOPE_CHANGED')
  if (!await db.user.findFirst({ where: { id: a.id, storeId: a.storeId, role: 'admin', staff: { id: a.staffId, storeId: a.storeId, status: 'active' } }, select: { id: true } })) fail('TEAM_ROUTINE_OPERATOR_UNAVAILABLE')
  await routineContext(db, a, c, p, proof.sourceSeq)
}
