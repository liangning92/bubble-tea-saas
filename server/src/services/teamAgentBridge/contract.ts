import { z } from 'zod'
const uuid = z.string().uuid(), seq = z.number().int().min(0).max(999999999999)
export const actions = ['directory.read', 'conversations.read', 'conversation.create', 'messages.read', 'attachments.read', 'messages.send', 'receipts.read', 'agent.read', 'changes.read', 'delivery.read', 'tasks.read', 'tasks.assign', 'tasks.review', 'approvals.read', 'inventory.read', 'schedule.read', 'marketing.write', 'procurement.write', 'finance.write', 'operations.write', 'employee.request.write', 'products.write', 'training.read', 'training.write', 'inventory.write', 'hygiene.read', 'hygiene.write', 'staff.read', 'staff.write', 'products.read', 'marketing.read', 'finance.read', 'members.read', 'members.write', 'memory.read', 'memory.write'] as const
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
  communication?: CommunicationPolicyPort
  resolveGrant(db: any): Promise<BridgeGrant>
  tasks: BridgeTaskPort
  // Post-commit wake only; durable reminders remain owned by the native delivery worker.
  messageCommitted?: (storeId: string) => void
  readAttachment(storeId: string, fileId: string): Promise<Uint8Array>
  now?: () => number
}

export interface CommunicationScope { compartmentKey:string; task:TaskRef; channelId?:string; audienceStaffIds:string[]; audienceHash:string; executionId?:string; requesterStaffId?:string }
export type CommunicationSource = {kind:'employee_execution_outcome';executionId:string;channelId:string} | {kind:'agent_memory';id:string;version:number;fingerprint:string} | {kind:'operation_experience_evidence';fingerprint:string} | {kind:'conversation';channelId:string;messageId:string;seq:number} | {kind:'employee_task';taskId:string;version:number} | {kind:'public_sop';id:string;version:number} | {kind:'memory';compartmentKey:string} | {kind:'inventory_evidence';query:string;fingerprint:string} | {kind:'schedule_evidence';query:string;fingerprint:string} | {kind:'marketing_evidence';action:string;fingerprint:string} | {kind:'procurement_evidence';action:string;fingerprint:string} | {kind:'finance_evidence';action:string;fingerprint:string} | {kind:'operations_evidence';action:string;fingerprint:string} | {kind:'employee_request_evidence';action:string;fingerprint:string} | {kind:'product_evidence';action:string;fingerprint:string} | {kind:'training_evidence';action:string;fingerprint:string} | {kind:'employee_exchange';executionId:string;questionMessageId:string}
export interface OutputRequest { purpose:'message'|'title';requestId:string;textHash:string }
export type CommunicationDataClass = 'operational'|'revenue'|'profit'|'cost'|'salary'|'private_staff'|'unknown'
export interface CommunicationPolicyPort {
  // Trusted runtime trace, never model/body-supplied labels. Host must verify actual profile/task/memory isolation.
  assertContext(db:any,grant:BridgeGrant,scope:CommunicationScope):Promise<{purpose:'employee_work';compartmentKey:string;memoryNamespace:string;executionId:string}>
  admitOutput(db:any,grant:BridgeGrant,scope:CommunicationScope,input:OutputRequest):Promise<{decision:'allow'|'deny'|'unknown';executionId:string;compartmentKey:string;audienceHash:string;textHash:string;requestId:string;dataClasses:CommunicationDataClass[];sources:CommunicationSource[]}>
  authorizeSource(db:any,grant:BridgeGrant,scope:CommunicationScope,source:CommunicationSource):Promise<{dataClasses:CommunicationDataClass[]}>
  classifyAttachment?(db:any,grant:BridgeGrant,scope:CommunicationScope,fileId:string,contentHash:string):Promise<{dataClass:'operational'|'revenue'|'profit'|'cost'|'salary'|'private_staff'|'unknown';contentHash:string;channelId:string;taskId:string}>
}
