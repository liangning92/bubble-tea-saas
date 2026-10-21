import { z } from 'zod'
const uuid = z.string().uuid(), seq = z.number().int().min(0).max(999999999999)
export const actions = ['directory.read', 'conversations.read', 'conversation.create', 'messages.read', 'attachments.read', 'messages.send', 'receipts.read', 'agent.read', 'changes.read', 'delivery.read', 'tasks.read', 'tasks.assign', 'tasks.review', 'approvals.read'] as const
export type BridgeAction = typeof actions[number]
export const grantSchema = z.object({ agentId: uuid, displayName: z.string().min(1).max(120), storeId: z.string().min(1), sponsorUserId: z.string().min(1),
  version: z.number().int().positive(), clientRevision: z.number().int().positive(), expiresAt: z.string().datetime(), revoked: z.boolean(), actions: z.array(z.enum(actions)),
  staffIds: z.array(z.string().min(1)).min(1).max(100), channelIds: z.array(uuid).max(100) }).strict()
export type BridgeGrant = z.infer<typeof grantSchema>
export const taskRefSchema = z.object({ taskId: uuid, version: z.number().int().positive() }).strict()
export type TaskRef = z.infer<typeof taskRefSchema>
const context = { channelId: uuid, task: taskRefSchema }
export const schemas = {
  directory: z.object({}).strict(),
  channels: z.object({ task: taskRefSchema }).strict(),
  create: z.object({ requestId: uuid, title: z.string().trim().min(1).max(120), members: z.array(z.string().min(1)).min(1).max(99), task: taskRefSchema }).strict(),
  messages: z.object({ ...context, afterSeq: seq.default(0) }).strict(),
  attachment: z.object({ ...context, fileId: uuid }).strict(),
  send: z.object({ ...context, requestId: uuid, expectedLastSeq: seq, text: z.string().trim().min(1).max(4000), replyToSeq: seq.positive().optional() }).strict(),
  receipts: z.object(context).strict(),
  markRead: z.object({ ...context, throughSeq: seq }).strict(),
  changes: z.object({ ...context, afterSeq: seq.default(0) }).strict()
}
export interface BridgeTaskPort {
  // Mandatory backend authorization; includes live task/store/channel/agent access.
  assert(db: any, grant: BridgeGrant, task: TaskRef, channelId?: string): Promise<void>
}
export interface BridgeDependencies {
  enabled?: boolean
  resolveGrant(db: any): Promise<BridgeGrant>
  tasks: BridgeTaskPort
  // Post-commit wake only; durable reminders remain owned by the native delivery worker.
  messageCommitted?: (storeId: string) => void
  readAttachment(storeId: string, fileId: string): Promise<Uint8Array>
  now?: () => number
}
