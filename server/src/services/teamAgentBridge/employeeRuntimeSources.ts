import { createHash } from 'crypto'
import { TeamError, readTeam, TeamChannel, TeamTask } from '../TeamCommunicationService'
import { managementPrivateText } from '../TeamManagementContext'
import { assertDataAudience } from './confidentiality'
import { readAuthorizedBridgeChannel } from './directDelegation'
import { readEmployeeInventoryEvidence } from './employeeInventoryEvidence'
import type { BridgeGrant, CommunicationScope, CommunicationSource } from './contract'
import type { EmployeeRuntimeSource } from './employeeRuntimeContract'

export const employeeRuntimeDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const deny = (): never => { throw new TeamError(403, 'EMPLOYEE_RUNTIME_SOURCE_DENIED') }
// Secondary tripwire; structural source isolation is the primary boundary. This
// does not claim to recognize every sensitive meaning in arbitrary free text.
export function employeeRuntimePrivate(text: string): boolean {
  return managementPrivateText(text) || /(?:营业额|营收|利润|毛利|净利|成本|财务|银行卡|账户余额)|\b(?:revenue|profit|margin|turnover|financial|finance|omzet|laba|keuntungan|biaya|hpp|bank\s+account)\b/iu.test(text)
}
/** An employee asking about restricted data is not a grant to fetch it. Keep a
 * non-sensitive request category so the conversation can explain its boundary;
 * never forward the private text, numbers, identifiers or manager context. */
export function employeeVisibleQuestion(text:string): {text:string; redacted?:true; originalHash?:string} {
  if (!employeeRuntimePrivate(text)) return {text}
  return {text:'[Restricted-data request withheld by backend. No permission to retrieve or disclose it. Explain the access boundary; do not ask for private details or claim an action was performed.]',redacted:true,originalHash:employeeRuntimeDigest(text)}
}
export async function readEmployeeRuntimeSource(db: any, grant: BridgeGrant, scope: CommunicationScope, source: CommunicationSource): Promise<EmployeeRuntimeSource> {
  if (!scope.channelId || !scope.audienceStaffIds.length) deny()
  const {channel:c,fromSeq} = await readAuthorizedBridgeChannel(db,grant,scope.task,scope.channelId)
  if (!c || c.archived || c.members.some(m => m.staffId !== 'agent:' + grant.agentId && !scope.audienceStaffIds.includes(m.staffId))) deny()
  await assertDataAudience(db, grant, scope, 'operational')
  let value: unknown
  if (source.kind === 'conversation') {
    if (!grant.actions.includes('messages.read') || source.channelId !== scope.channelId) deny()
    const message = await readTeam<any>(db, grant.storeId, `message.${c.id}.${String(source.seq).padStart(12, '0')}`)
    if (!message || message.id !== source.messageId || message.seq !== source.seq || message.agent || message.ai || message.files?.length ||
      message.seq < fromSeq || c.members.some(m => m.fromSeq > message.seq) || !scope.audienceStaffIds.includes(message.authorId)) deny()
    const author = await db.staff.findFirst({ where: { id: message.authorId, storeId: grant.storeId, status: 'active' }, select: { id: true, userId: true, user: { select: { id: true, storeId: true } } } })
    if (!author?.userId || author.user?.id !== author.userId || author.user?.storeId !== grant.storeId || typeof message.text !== 'string') deny()
    value = { messageId: message.id, seq: message.seq, authorStaffId: author.id, ...employeeVisibleQuestion(message.text), createdAt: message.createdAt }
  } else if (source.kind === 'employee_task') {
    if (!grant.actions.includes('tasks.read') || source.taskId !== scope.task.taskId || source.version !== scope.task.version) deny()
    const task = await readTeam<TeamTask>(db, grant.storeId, `task.${c.id}.${source.taskId}`)
    // Agent manager plans/reports and private evidence never enter an employee execution.
    if (!task || task.agentTask || task.version !== source.version || task.channelId !== c.id || !task.audienceIds?.length ||
      scope.audienceStaffIds.some(id => !task.audienceIds!.includes(id)) || c.members.some(m => m.fromSeq > task.fromSeq)) deny()
    value = { taskId: task.id, version: task.version, text: task.text, ownerId: task.ownerId, status: task.status,
      deadlineAt: task.deadlineAt || task.dueDate, evidenceRequired: task.evidenceRequired, acceptanceCriteria: task.acceptanceCriteria }
    if (employeeRuntimePrivate(JSON.stringify(value))) deny()
  } else if(source.kind==='employee_exchange') {
    const prior=await readTeam<any>(db,grant.storeId,'employeeRuntime.execution.'+source.executionId)
    if(!prior||prior.phase!=='complete'||employeeRuntimeDigest(prior.grant)!==employeeRuntimeDigest(grant)||employeeRuntimeDigest({...prior.scope,executionId:undefined})!==employeeRuntimeDigest({...scope,executionId:undefined}))deny()
    const send=prior.tools?.find((t:any)=>t.name==='employee_send_message'&&t.value?.messageId===source.questionMessageId&&t.value.expectsReply===true)
    const message=send&&await readTeam<any>(db,grant.storeId,`message.${c.id}.${String(send.value.seq).padStart(12,'0')}`)
    const call=prior.responses?.flatMap((r:any)=>r.providerMessage?.tool_calls||[]).find((x:any)=>x.id===send?.toolCallId)
    let args:any;try{args=call&&JSON.parse(call.function.arguments)}catch{deny()}
    if(!message||message.id!==source.questionMessageId||message.seq<fromSeq||message.authorId!=='agent:'+grant.agentId||message.agent?.agentId!==grant.agentId||args?.expectsReply!==true||message.text!==args.text)deny()
    const refs:CommunicationSource[]=prior.sources.flatMap((s:any)=>s.source.kind==='conversation'?[s.source]:s.source.kind==='employee_exchange'?(s.value?.employeeSources||[]):[])
    const unique=[...new Map(refs.map(s=>[employeeRuntimeDigest(s),s])).values()]
    if(!unique.length||unique.length>50||unique.some(s=>s.kind!=='conversation'))deny()
    const facts=[];for(const ref of unique)facts.push((await readEmployeeRuntimeSource(db,grant,scope,ref)).value)
    value={employeeSources:unique,employeeFacts:facts,previousQuestion:{messageId:message.id,seq:message.seq,text:message.text},note:'Prior question and employee facts only; earlier inventory readings are not current observations.'}
  } else if(source.kind==='inventory_evidence') {
    const facade=typeof db.$transaction==='function'?db:{...db,$transaction:(fn:any)=>fn(db)}
    const evidence=await readEmployeeInventoryEvidence(facade,grant,scope,{query:source.query})
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else {
    // No blanket public-SOP label or shared/old memory. Add only when backed by
    // its actual publication/audience/version resolver; attachments likewise denied.
    deny()
  }
  return { source: structuredClone(source), fingerprint: employeeRuntimeDigest(value), value }
}
