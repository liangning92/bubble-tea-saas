import { z } from 'zod'

export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export const deny = (message: string, status = 403): never => { throw new AccessError(status, message) }
const id = z.string().uuid()
export const tools = ['tasks.read', 'messages.read', 'task.suggest'] as const
export const settingsInput = z.object({
  expectedVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(80),
  clientType: z.enum(['mcp_compatible', 'adapter_required']),
  enabled: z.boolean().default(false),
  // One owner store only in v1. No wildcard, tenant-wide or cross-store grants.
  storeIds: z.array(z.string().min(1).max(128)).length(1),
  channelIds: z.array(id).max(20).default([]),
  tools: z.array(z.enum(tools)).max(3).default([]),
  approvalRequired: z.literal(true).default(true)
}).strict()
export type SettingsInput = z.infer<typeof settingsInput>
export interface Registration extends Omit<SettingsInput, 'expectedVersion'> {
  id: string; version: number; authVersion: number; clientRevision: number
  authState: 'unconfigured' | 'revoked'; executionState: 'frozen'
  connectionState: 'not_tested' | 'configuration_validated'; updatedBy: string
}
export interface Audit { at: string; actorId: string; registrationId: string; version: number; action: 'save' | 'revoke' | 'validate' | 'remove' }
export interface State { registrations: Registration[]; audits: Audit[] }
export interface AdminActor { id: string; storeId: string; employeeApp?: boolean }
export interface Transaction {
  // Must re-read active user + staff identity, never trust request role.
  requireAdmin(actor: AdminActor): Promise<void>
  load(): Promise<State>
  save(state: State): Promise<void>
}
export interface Repository { transaction<T>(storeId: string, work: (tx: Transaction) => Promise<T>): Promise<T> }
export const emptyState = (): State => ({ registrations: [], audits: [] })
export const callInput = z.object({ requestId: id, registrationId: id, version: z.number().int().positive(),
  tool: z.enum(tools), channelId: id, taskId: id.optional(), after: z.number().int().nonnegative().max(999999999999).default(0),
  suggestion: z.string().trim().min(1).max(1500).optional() }).strict().superRefine((v, ctx) => {
  if (v.tool === 'task.suggest' ? !v.taskId || !v.suggestion : !!v.suggestion)
    ctx.addIssue({ code: 'custom', message: 'Invalid tool arguments' })
})

const registrationSchema = settingsInput.omit({ expectedVersion: true }).extend({
  id, enabled: z.literal(false), version: z.number().int().positive(), authVersion: z.number().int().positive(),
  clientRevision: z.number().int().positive(), authState: z.enum(['unconfigured', 'revoked']),
  executionState: z.literal('frozen'), connectionState: z.enum(['not_tested', 'configuration_validated']),
  updatedBy: z.string().min(1)
}).strict()
export const stateSchema = z.object({ registrations: z.array(registrationSchema).max(50), audits: z.array(z.object({
  at: z.string().datetime(), actorId: z.string().min(1), registrationId: id, version: z.number().int().positive(),
  action: z.enum(['save', 'revoke', 'validate', 'remove'])
}).strict()) }).strict()
