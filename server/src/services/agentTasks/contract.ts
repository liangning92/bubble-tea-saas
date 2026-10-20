import { z } from 'zod'

/** Trusted adapter output; never parsed from a tool's JSON arguments. */
export interface AgentPrincipal {
  agentId: string
  role: 'manager' | 'executor'
  storeId: string
  grantVersion: number
  clientRevision: number
  scopes: readonly string[]
}
export const AGENT_TASK_CAPABILITY = 'stock_readonly_v1' as const
const uuid = z.string().uuid()
const version = z.number().int().positive()
const text = z.string().trim().min(1)
export const agentPlanSchema = z.object({
  objective: text.max(2000), scope: z.literal(AGENT_TASK_CAPABILITY),
  constraints: z.array(text.max(500)).min(1).max(20),
  deadlineAt: z.string().datetime({ offset: true }), firstReportWithinMs: z.literal(600000),
  evidenceRequired: text.max(2000),
  criteria: z.array(z.object({ id: text.max(64), standard: text.max(1000) }).strict()).min(1).max(20)
}).strict().refine(p => new Set(p.criteria.map(c => c.id)).size === p.criteria.length, 'DUPLICATE_CRITERION')
export type AgentPlan = z.infer<typeof agentPlanSchema>
const mutation = { requestId: uuid, authVersion: version }
export const assignTaskSchema = z.object({ ...mutation, channelId: uuid,
  taskCode: z.literal('STOCK-RO-001'), expectedVersion: z.literal(0), plan: agentPlanSchema }).strict()
export const readTaskSchema = z.object({ taskId: uuid, authVersion: version }).strict()
export const claimTaskSchema = z.object({ ...mutation, taskId: uuid, runId: uuid,
  round: version, expectedVersion: version }).strict()
export const leaseSchema = z.object({ ...mutation, taskId: uuid, runId: uuid, round: version,
  expectedVersion: version, leaseVersion: version, leaseToken: uuid }).strict()
export const reportTaskSchema = leaseSchema.extend({ evidenceId: uuid.optional(), inputSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  outcome: z.enum(['completed', 'blocked', 'failed', 'unknown']),
  rawReport: text, sourceRefs: z.array(text.max(256)),
  runtimeReceipt: z.object({ hermesRunId: text.max(256), sessionId: text.max(256).optional() }).strict().optional()
}).strict().refine(v => v.outcome !== 'completed' || !!v.evidenceId && !!v.inputSnapshotHash, 'COMPLETED_EVIDENCE_REQUIRED')
export const reviewTaskSchema = z.object({ ...mutation, taskId: uuid, runId: uuid, round: version,
  expectedVersion: version, reportId: uuid, reportVersion: version,
  decision: z.enum(['accept', 'rework']),
  check: z.object({ summary: text.max(4000), checkedEvidenceIds: z.array(uuid),
    criteria: z.array(z.object({ id: text.max(64), result: z.enum(['met', 'not_met', 'unknown']), note: text.max(2000) }).strict()).min(1)
  }).strict(), nextPlan: agentPlanSchema.optional()
}).strict()
export const eventCursorSchema = z.object({ authVersion: version, after: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100).default(50) }).strict()

export interface DispatchEnvelope {
  taskId: string; runId: string; eventId: string; round: number; taskVersion: number
  executorId: string; leaseVersion: number
}
export interface AgentTaskEvent {
  id: string; sequence: number; occurredAt: string
  type: 'task.dispatch_ready' | 'task.report_ready' | 'task.blocked' | 'task.failed'
  payload: { taskId: string; runId: string; round: number; taskVersion: number; reportId?: string; reportVersion?: number }
}
export interface AgentTaskReport {
  id: string; version: number; runId: string; round: number; executorId: string
  evidenceId?: string; inputSnapshotHash?: string; rawReport: string; sourceRefs: string[]
  outcome: 'completed' | 'blocked' | 'failed' | 'unknown'; createdAt: string
  runtimeReceipt?: { hermesRunId: string; sessionId?: string }
}
export interface AgentTaskState {
  taskCode: 'STOCK-RO-001'; capability: typeof AGENT_TASK_CAPABILITY
  managerId: string; executorId: string; plan: AgentPlan
  round: number; runId: string; eventId: string; leaseVersion: number
  state: 'assigned' | 'running' | 'awaiting_review' | 'blocked' | 'unknown' | 'accepted'
  lease?: { token: string; until: number; grantVersion: number; clientRevision: number }
  reportDueAt?: string; evidenceId?: string; inputSnapshotHash?: string
  reportId?: string; reportVersion?: number; error?: string
  checks: { round: number; runId: string; reportId: string; by: string; at: string;
    decision: 'accept' | 'rework'; check: z.infer<typeof reviewTaskSchema>['check']; nextPlan?: AgentPlan }[]
}
export interface AgentTaskView {
  taskId: string; taskCode: string; taskVersion: number; channelId: string
  runId: string; round: number; executorId: string; managerId: string; leaseVersion: number
  state: AgentTaskState['state']; plan: AgentPlan; reportDueAt?: string
  error?: string
  report?: AgentTaskReport; dispatch: DispatchEnvelope
  evidence?: { evidenceId: string; inputSnapshotHash: string; evidence: unknown }
}
export type AgentTaskScope = 'management.assign' | 'management.read' | 'management.review' | 'executor.claim' | 'executor.evidence' | 'executor.report'
export interface AgentTaskDependencies {
  /** Must re-resolve current binding/revocation inside each transaction; no default allow. */
  authorize(db: any, principal: AgentPrincipal, scope: AgentTaskScope, channelId: string): Promise<AgentPrincipal>
  executorFor(db: any, manager: AgentPrincipal, channelId: string): Promise<AgentPrincipal>
  now?: () => number
}
export interface AgentTaskService {
  assign(principal: AgentPrincipal, input: z.infer<typeof assignTaskSchema>): Promise<AgentTaskView>
  get(principal: AgentPrincipal, input: z.infer<typeof readTaskSchema>): Promise<AgentTaskView>
  claim(principal: AgentPrincipal, input: z.infer<typeof claimTaskSchema>): Promise<AgentTaskView & { leaseToken: string; leaseUntil: number }>
  readStockEvidence(principal: AgentPrincipal, input: z.infer<typeof leaseSchema>): Promise<AgentTaskView & { evidenceId: string; inputSnapshotHash: string; evidence: unknown }>
  report(principal: AgentPrincipal, input: z.infer<typeof reportTaskSchema>): Promise<AgentTaskView>
  review(principal: AgentPrincipal, input: z.infer<typeof reviewTaskSchema>): Promise<AgentTaskView>
  events(principal: AgentPrincipal, input: z.infer<typeof eventCursorSchema>): Promise<{ events: AgentTaskEvent[]; nextCursor: number; hasMore: boolean }>
}
