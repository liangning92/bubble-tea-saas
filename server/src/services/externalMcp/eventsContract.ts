import * as z from 'zod-mcp'
import type { AgentPilotStamp } from '../agentTasks/pilot'

export const eventNames = ['task.report_ready', 'task.blocked', 'task.failed'] as const
export const eventName = z.enum(eventNames)
export const eventArguments = z.object({ taskId: z.uuid() }).strict()
export const eventData = z.object({ taskId: z.uuid(), runId: z.uuid(), round: z.number().int().positive(),
  taskVersion: z.number().int().positive(), reportId: z.uuid().optional(), reportVersion: z.number().int().positive().optional() }).strict()
export const taskEvent = z.object({ eventId: z.uuid(), name: eventName, timestamp: z.iso.datetime({ offset: true }), data: eventData, cursor: z.null().default(null) }).strict()
export type TaskEvent = z.infer<typeof taskEvent>
export interface EventOwner { storeId: string; agentId: string; grantVersion: number; clientRevision: number; subjectKey: string; tokenHash: string; pilot?: AgentPilotStamp }
export const delivery = z.object({ mode: z.literal('webhook'), url: z.url().max(2048), secret: z.string().max(100) }).strict()
export const subscribeInput = z.object({ name: eventName, arguments: eventArguments, delivery,
  cursor: z.null().optional(), ttlMs: z.number().int().min(60000).max(86400000).nullable().optional() }).strict()
export const unsubscribeInput = subscribeInput.pick({ name: true, arguments: true }).extend({
  delivery: delivery.omit({ secret: true }) }).strict()
export type Subscription = { id: string; owner: EventOwner; name: typeof eventNames[number]; taskId: string; url: string;
  secret: string; previousSecret?: string; rotateUntil?: number; expiresAt: number; generation: string; active: boolean }
export type DeliveryRecord = { eventHash: string; attempts: number; state: 'sending' | 'accepted' | 'retry' | 'stopped';
  nextAt: number; expiresAt: number; deliveryUntil?: number; generation: string; claim: string }
export interface EventState { subscriptions: Subscription[]; deliveries: Record<string, DeliveryRecord> }
export interface EventRepository {
  transaction<T>(storeId: string, work: (state: EventState) => Promise<T> | T): Promise<T>
}
export function eventCatalog() {
  return eventNames.map(name => ({ name, description: name === 'task.report_ready' ? 'A task report is ready for authorized review.' :
    name === 'task.blocked' ? 'A task is blocked; read its authoritative status.' : 'A task execution failed; read its authoritative status.',
    delivery: ['webhook'], inputSchema: z.toJSONSchema(eventArguments), payloadSchema: z.toJSONSchema(eventData) }))
}
