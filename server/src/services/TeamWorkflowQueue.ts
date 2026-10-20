import { createHash } from 'crypto'
import type { RoutineConsent, RoutineReplyCode } from './TeamRoutinePolicy'
import type { TeamActor, TeamChannel } from './TeamCommunicationService'

export const workflowHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const workflowPad = (n: number) => String(n).padStart(12, '0')
export interface WorkflowPolicy {
  channelId: string; version: number; epoch: number; enabled: boolean; paused: boolean
  automaticSend: boolean; routine?: RoutineConsent; consent: true; employeeIds: string[]; operatorUserId: string; operatorStaffId: string
  audienceHash: string; aiConfigVersion: number; hash: string
}
export interface WorkflowBillingAttempt {
  attempt: number; requestId: string; status: string
  billingStatus: 'not_started' | 'possible' | 'usage_recorded'
  usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number }; error?: string
}
export interface WorkflowJob {
  id: string; channelId: string; sourceSeq: number; sourceAuthorId: string; sourceHash: string; policyHash: string
  operatorUserId: string; operatorStaffId: string; sourceFloor: number; version: number; attempt: number
  status: 'queued' | 'processing' | 'retry_wait' | 'awaiting_approval' | 'reviewed' | 'uncertain' | 'blocked' | 'dismissed'
  createdAt: string; updatedAt: string; leaseToken?: string; leaseUntil?: number; claimEpoch?: number
  nextAttemptAt?: number; error?: string; aiRequestId?: string; replyMessageId?: string; planId?: string
  sentAt?: string; sendLatencyMs?: number; automaticReply?: boolean
  billingStatus?: 'not_started' | 'possible' | 'usage_recorded'
  billingAttempts?: WorkflowBillingAttempt[]
  result?: { routineCode?: RoutineReplyCode; replyText: string; summaryZh: string; suggestedTask: null | {
    category: 'communication' | 'training' | 'inspection'; text: string; evidenceRequired: string; acceptanceCriteria: string
  }; exceptions: string[] }
}
type Ports = { read: (db: any, storeId: string, key: string) => Promise<any>; write: (db: any, storeId: string, key: string, value: unknown) => Promise<unknown> }
export const workflowJobKey = (c: string, seq: number) => `workflow.job.${c}.${workflowPad(seq)}`

/** Called under the message's channel transaction lock. No provider, timer or credentials. */
export async function enqueueTeamWorkflow(db: any, a: TeamActor, c: TeamChannel, message: any, ports: Ports) {
  const p: WorkflowPolicy = await ports.read(db, a.storeId, `workflow.policy.${c.id}`)
  if (!p?.enabled || !p.employeeIds.includes(a.staffId) || a.staffId === p.operatorStaffId || a.role === 'admin' && !p.automaticSend || message.ai) return
  const key = workflowJobKey(c.id, message.seq)
  if (await ports.read(db, a.storeId, key)) return
  const job: WorkflowJob = { id: message.id, channelId: c.id, sourceSeq: message.seq, sourceAuthorId: a.staffId,
    sourceHash: workflowHash({ text: message.text, files: message.files }), policyHash: p.hash,
    operatorUserId: p.operatorUserId, operatorStaffId: p.operatorStaffId,
    sourceFloor: Math.max(...c.members.map(m => m.fromSeq)), version: 1, attempt: 0,
    status: message.text ? 'queued' : 'blocked', billingStatus: 'not_started', ...(message.text ? {} : { error: 'TEAM_WORKFLOW_TEXT_REQUIRED' }),
    createdAt: message.createdAt, updatedAt: message.createdAt }
  await ports.write(db, a.storeId, key, job)
  await workflowEvent(db, a.storeId, c.id, { jobId: job.id, sourceSeq: job.sourceSeq, version: 1, status: job.status }, ports)
}
export async function workflowEvent(db: any, storeId: string, channelId: string, detail: unknown, ports: Ports) {
  const key = `workflow.cursor.${channelId}`, cursor = (await ports.read(db, storeId, key) || 0) + 1
  await ports.write(db, storeId, key, cursor)
  await ports.write(db, storeId, `workflow.event.${channelId}.${workflowPad(cursor)}`, { cursor, channelId, at: new Date().toISOString(), detail })
}
