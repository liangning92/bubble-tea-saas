import {readAgentMemories,readAgentExperiences,agentMemoryFingerprint} from '../AgentMemoryService'
import { visibleBusinessData, visibleScheduleStaff } from './employeeAccess'
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

export function employeeRuntimeOutboundRestricted(text: string): boolean {
  if (!text) return false
  const isBoundaryRefusal = /(?:不便|无法|不能|未获|无权|没有权限|不提供|不公开|不予|不允许|权限不足|受限|管理权限|隐私|保密|边界|职责|介绍|范围|cannot|can't|unable|not\s+authorized|restricted|no\s+permission|boundary|tidak\s+(?:bisa|dapat|berwenang|tersedia|diizinkan)|bukan\s+wewenang|privasi|rahasia|batasan)/i.test(text)
  if (isBoundaryRefusal) {
    const hasMonetaryData = /(?:[¥\$€£]|Rp\.?|\b(?:IDR|RMB|USD|元|块)\b|\d+(?:\.\d+)?\s*(?:元|块|万|k\b|rb\b|jt\b))\b/i.test(text)
    if (!hasMonetaryData) {
      return false
    }
  }
  return employeeRuntimePrivate(text)
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
  if(source.kind==='employee_execution_outcome'){
    const prior=await readTeam<any>(db,grant.storeId,'employeeRuntime.execution.'+source.executionId)
    if(!prior||!['complete','unknown'].includes(prior.phase)||source.channelId!==scope.channelId||prior.scope?.channelId!==scope.channelId||prior.scope?.task?.taskId!==scope.task.taskId||prior.scope?.compartmentKey!==scope.compartmentKey||prior.grant?.agentId!==grant.agentId)deny()
    value={executionId:source.executionId,phase:prior.phase,fault:prior.fault?.code,operations:(prior.tools||[]).filter((t:any)=>!t.name.includes('memory')).map((t:any)=>({tool:t.name,receipt:t.value,mutating:t.mutating})),note:'Stored prior-operation receipts. Do not repeat an already recorded mutation. Re-query live records before continuing unfinished work.'}
  }else if(source.kind==='agent_memory'){
    const memory=(await readAgentMemories(db,grant,scope,'',500)).find(m=>m.id===source.id)
    if(!memory||memory.version!==source.version||agentMemoryFingerprint(memory)!==source.fingerprint)deny()
    value={id:memory.id,kind:memory.kind,text:memory.text,confirmed:memory.confirmed,createdAt:memory.createdAt,source:memory.source,note:'Persistent memory, not a live business observation. Recheck current records before acting.'}
  }else if(source.kind==='operation_experience_evidence'){
    const experience=await readAgentExperiences(db,grant,scope)
    if(employeeRuntimeDigest(experience)!==source.fingerprint)deny()
    value={experience,note:'Historical tool outcomes. Learn from failure patterns; verify current data and authority.'}
  }else if (source.kind === 'conversation') {
    if (!grant.actions.includes('messages.read') || source.channelId !== scope.channelId) deny()
    const message = await readTeam<any>(db, grant.storeId, `message.${c.id}.${String(source.seq).padStart(12, '0')}`)
    if (!message || message.id !== source.messageId || message.seq !== source.seq ||
      message.seq < fromSeq || c.members.some(m => m.fromSeq > message.seq)) deny()
    if (message.agent || message.authorId === 'agent:' + grant.agentId) {
      value = { messageId: message.id, seq: message.seq, authorStaffId: message.authorId, role: 'assistant', text: typeof message.text === 'string' ? message.text : '', createdAt: message.createdAt }
    } else {
      if (!scope.audienceStaffIds.includes(message.authorId)) deny()
      const author = await db.staff.findFirst({ where: { id: message.authorId, storeId: grant.storeId, status: 'active' }, select: { id: true, userId: true, user: { select: { id: true, storeId: true, role: true } } } })
      if (!author?.userId || author.user?.id !== author.userId || author.user?.storeId !== grant.storeId || typeof message.text !== 'string') deny()
      const isAdmin = author.user?.role === 'admin' || author.user?.role === 'manager'
      value = { messageId: message.id, seq: message.seq, authorStaffId: author.id, role: 'user', text: message.text.trim()||'An attachment was shared without text. Ask what should be checked; attachment contents have not been loaded.', ...(message.files?.length?{attachmentCount:message.files.length,attachmentAccess:'not_loaded'}:{}), createdAt: message.createdAt }
    }
  } else if (source.kind === 'employee_task') {
    if (!grant.actions.includes('tasks.read') || source.taskId !== scope.task.taskId || source.version !== scope.task.version) deny()
    const task = await readTeam<TeamTask>(db, grant.storeId, `task.${c.id}.${source.taskId}`)
    // Agent manager plans/reports and private evidence never enter an employee execution.
    if (!task || task.agentTask || task.version !== source.version || task.channelId !== c.id || !task.audienceIds?.length ||
      scope.audienceStaffIds.some(id => !task.audienceIds!.includes(id)) || c.members.some(m => m.fromSeq > task.fromSeq)) deny()
    value = { taskId: task.id, version: task.version, text: task.text, ownerId: task.ownerId, status: task.status,
      deadlineAt: task.deadlineAt || task.dueDate, evidenceRequired: task.evidenceRequired, acceptanceCriteria: task.acceptanceCriteria }
    const requester = scope.requesterStaffId ? await db.staff.findFirst({
      where: { id: scope.requesterStaffId, storeId: grant.storeId, status: 'active' },
      select: { user: { select: { role: true } } }
    }) : null
    const isRequesterAdmin = requester?.user?.role === 'admin' || requester?.user?.role === 'manager'
    // Native task audience and source checks above determine visibility, not keywords.
  } else if(source.kind==='employee_exchange') {
    const prior=await readTeam<any>(db,grant.storeId,'employeeRuntime.execution.'+source.executionId)
    if(!prior||!['complete','unknown'].includes(prior.phase)||prior.scope?.compartmentKey!==scope.compartmentKey||prior.scope?.channelId!==scope.channelId||prior.scope?.task?.taskId!==scope.task.taskId)deny()
    const send=prior.tools?.find((t:any)=>t.name==='employee_send_message'&&t.value?.messageId===source.questionMessageId)
    const message=send&&await readTeam<any>(db,grant.storeId,`message.${c.id}.${String(send.value.seq).padStart(12,'0')}`)
    const call=prior.responses?.flatMap((r:any)=>r.providerMessage?.tool_calls||[]).find((x:any)=>x.id===send?.toolCallId)
    let args:any;try{args=call&&JSON.parse(call.function.arguments)}catch{deny()}
    const final=prior.responses?.at(-1);const actualText=call?args?.text:final?.finishReason==='stop'?final.providerMessage?.content:undefined
    if(!message||message.id!==source.questionMessageId||message.seq<fromSeq||message.authorId!=='agent:'+grant.agentId||message.agent?.agentId!==grant.agentId||message.text!==actualText)deny()
    const refs:CommunicationSource[]=prior.sources.flatMap((s:any)=>s.source.kind==='conversation'?[s.source]:s.source.kind==='employee_exchange'?(s.value?.employeeSources||[]):[])
    const unique=[...new Map(refs.map(s=>[employeeRuntimeDigest(s),s])).values()].slice(0,50)
    if(!unique.length||unique.some(s=>s.kind!=='conversation'))deny()
    const facts=[];for(const ref of unique)facts.push((await readEmployeeRuntimeSource(db,grant,scope,ref)).value)
    value={employeeSources:unique,employeeFacts:facts,previousQuestion:{messageId:message.id,seq:message.seq,text:message.text},note:'Prior question and employee facts only; earlier inventory readings are not current observations.'}
  } else if(source.kind==='inventory_evidence') {
    const facade=typeof db.$transaction==='function'?db:{...db,$transaction:(fn:any)=>fn(db)}
    const evidence=await readEmployeeInventoryEvidence(facade,grant,scope,{query:source.query})
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='schedule_evidence') {
    if(!grant.actions.includes('schedule.read'))deny()
    const evidence=await readEmployeeScheduleEvidence(db,grant.storeId,source.query,await visibleScheduleStaff(db,grant,scope))
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='marketing_evidence') {
    if(!grant.actions.includes('marketing.write')&&!(grant.actions.includes('marketing.read')&&['list_active','query_products'].includes(source.action)))deny()
    const evidence=await readEmployeeMarketingEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='procurement_evidence') {
    if(!grant.actions.includes('procurement.write'))deny()
    const evidence=await readEmployeeProcurementEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='finance_evidence') {
    if(!grant.actions.includes('finance.write')&&!(grant.actions.includes('finance.read')&&['query_revenue_summary','list_recent_expenses'].includes(source.action)))deny()
    const evidence=await readEmployeeFinanceEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='operations_evidence') {
    if(!grant.actions.includes('operations.write'))deny()
    const evidence=await readEmployeeOperationsEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='employee_request_evidence') {
    if(!grant.actions.includes('employee.request.write'))deny()
    const evidence=await readEmployeeRequestEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='product_evidence') {
    if(!grant.actions.includes('products.write'))deny()
    const evidence=await readEmployeeProductEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else if(source.kind==='training_evidence') {
    if(!grant.actions.includes('training.write'))deny()
    const evidence=await readEmployeeTrainingEvidence(db,grant.storeId,source.action,source.fingerprint)
    if(evidence.fingerprint!==source.fingerprint)deny()
    value=evidence
  } else {
    // No blanket public-SOP label or shared/old memory. Add only when backed by
    // its actual publication/audience/version resolver; attachments likewise denied.
    deny()
  }
  value=await visibleBusinessData(db,grant,scope,value)
  return { source: structuredClone(source), fingerprint: employeeRuntimeDigest(value), value }
}

function isFuzzyMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normA.includes(normB) || normB.includes(normA)) return true
  const compactA = normA.replace(/(.)\1+/g, '$1')
  const compactB = normB.replace(/(.)\1+/g, '$1')
  return compactA.includes(compactB) || compactB.includes(compactA)
}

export async function readEmployeeScheduleEvidence(db: any, storeId: string, query: string, allowedStaffIds?:string[]) {
  const q = (query || '').trim()
  const allStaff = await db.staff.findMany({
    where: { storeId, ...(allowedStaffIds?{id:{in:allowedStaffIds}}:{}) },
    select: { id: true, name: true, employeeNumber: true, position: true }
  })
  const matched = allStaff.filter((st: any) =>
    isFuzzyMatch(q, st.name) ||
    (st.employeeNumber && isFuzzyMatch(q, st.employeeNumber))
  )
  const staffIds = matched.length > 0 ? matched.map((st: any) => st.id) : allStaff.map((st: any) => st.id)
  const shifts = await db.shift.findMany({ where: { storeId } })
  const shiftMap = new Map<string, any>(shifts.map((s: any) => [s.key, s]))
  const schedules = await db.schedule.findMany({
    where: { staffId: { in: staffIds } },
    orderBy: { date: 'desc' },
    take: 30
  })
  const items = schedules.map((sc: any) => {
    const staffMember = allStaff.find((st: any) => st.id === sc.staffId)
    const sh = shiftMap.get(sc.shift)
    const dateStr = sc.date instanceof Date ? sc.date.toISOString().slice(0, 10) : String(sc.date).slice(0, 10)
    return {
      staffName: staffMember?.name || sc.staffId,
      position: staffMember?.position || 'staff',
      employeeNumber: staffMember?.employeeNumber,
      date: dateStr,
      shift: sc.shift,
      shiftName: sh?.nameZh ? `${sh.nameZh} (${sh.name})` : (sh?.name || sc.shift),
      timeRange: sh ? `${sh.startTime} - ${sh.endTime}` : '09:00 - 18:00',
      status: sc.status
    }
  })
  const fingerprint = createHash('sha256').update(JSON.stringify({ query: q, items })).digest('hex')
  return { query: q, matchedStaff: matched.map((m: any) => m.name), total: items.length, schedules: items, fingerprint }
}

export async function readEmployeeMarketingEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.marketingEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const activeDiscounts = await db.discountRule.findMany({ where: { storeId, status: 'active' }, orderBy: { createdAt: 'desc' }, take: 10 })
  const activeCampaigns = await db.campaign.findMany({ where: { storeId, status: 'active' }, orderBy: { createdAt: 'desc' }, take: 10 })
  const evidence = {
    action,
    discounts: activeDiscounts.map((d: any) => ({ id: d.id, name: d.name, type: d.discountType, value: d.discountValue, minOrder: d.minOrderAmount, validUntil: d.validUntil })),
    campaigns: activeCampaigns.map((c: any) => ({ id: c.id, name: c.name, type: c.type, status: c.status, startDate: c.startDate, endDate: c.endDate }))
  }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeProcurementEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.procurementEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const lowStock = await db.inventory.findMany({
    where: { storeId, currentStock: { lte: 20 } },
    take: 10
  })
  const recentOrders = await db.purchaseOrder.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  const evidence = {
    action,
    lowStock: lowStock.map((i: any) => ({ id: i.id, name: i.name, currentStock: i.currentStock, minStock: i.minStock })),
    recentOrders: recentOrders.map((p: any) => ({ id: p.id, orderNumber: p.orderNumber, status: p.status, totalAmount: p.totalAmount }))
  }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeFinanceEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.financeEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const recentExpenses = await db.expense.findMany({
    where: { storeId },
    orderBy: { date: 'desc' },
    take: 10
  })
  const evidence = {
    action,
    recentExpenses: recentExpenses.map((e: any) => ({ id: e.id, category: e.category, amount: e.amount, description: e.description }))
  }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeOperationsEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.operationsEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const announcements = await db.announcement.findMany({
    where: { storeId, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  const pendingLeaves = await db.leave.findMany({
    where: { storeId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  const evidence = {
    action,
    announcements: announcements.map((a: any) => ({ id: a.id, title: a.title, type: a.type })),
    pendingLeaves: pendingLeaves.map((l: any) => ({ id: l.id, staffId: l.staffId, leaveType: l.leaveType, totalDays: l.totalDays }))
  }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeRequestEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.employeeRequestEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const evidence = { action, timestamp: new Date().toISOString() }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeProductEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.productEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const evidence = { action, timestamp: new Date().toISOString() }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}

export async function readEmployeeTrainingEvidence(db: any, storeId: string, action: string, fingerprint?: string) {
  if (fingerprint) {
    const saved = await readTeam<any>(db, storeId, 'employeeRuntime.trainingEvidence.' + fingerprint)
    if (saved && saved.action === action) {
      return { ...saved, fingerprint }
    }
  }
  const evidence = { action, timestamp: new Date().toISOString() }
  const fp = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  return { ...evidence, fingerprint: fp }
}
