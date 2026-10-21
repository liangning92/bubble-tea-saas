import { z } from 'zod'
import type { TeamActor } from '../TeamCommunicationService'

const uuid = z.string().uuid(), version = z.number().int().positive()
const seq = z.number().int().positive().max(999999999999)
export const workItemActions = ['delivery.read', 'tasks.read', 'tasks.assign', 'tasks.review', 'approvals.read'] as const
export type WorkItemAction = typeof workItemActions[number]
// This is the host's agent execution authorization, not the native employee task being operated on.
export const workItemContext = { task: z.object({ taskId: uuid, version }).strict(), channelId: uuid }
export type WorkItemContext = { task: { taskId: string; version: number }; channelId: string }
export const approvalDomains = ['leave', 'overtimeRequest', 'attendanceCorrection', 'reimbursement', 'shiftSwap', 'hygiene', 'inventoryCount', 'profile', 'appeal', 'staffActionApproval', 'refundRequest'] as const
export const workItemSchemas = {
  delivery: z.object({ ...workItemContext, messageId: uuid, messageSeq: seq, recipientStaffId: z.string().min(1).max(128) }).strict(),
  get: z.object({ ...workItemContext, employeeTaskId: uuid }).strict(),
  assign: z.object({ ...workItemContext, requestId: uuid, roundId: uuid, minuteVersion: version, actionIndex: z.number().int().min(0).max(39) }).strict(),
  review: z.object({ ...workItemContext, employeeTaskId: uuid, requestId: uuid, expectedVersion: version,
    action: z.enum(['return', 'complete']), note: z.string().trim().min(1).max(1000), criteriaConfirmed: z.boolean().default(false) }).strict(),
  approval: z.object({ ...workItemContext, domain: z.enum(approvalDomains), objectId: z.string().min(1).max(128) }).strict()
}
export interface WorkItemDependencies {
  enabled?: boolean
  // Must resolve a fresh server grant and bind a trusted agent capability. Never accept an actor from tool JSON.
  withActor<T>(db: any, action: WorkItemAction, context: WorkItemContext, operation: (actor: TeamActor) => Promise<T>): Promise<T>
  // Separate object authorization is mandatory: a channel grant does not grant access to every sponsor approval.
  assertApprovalTarget(db: any, actor: TeamActor, context: WorkItemContext, target: { domain: string; objectId: string }): Promise<void>
  now?: () => Date
}
