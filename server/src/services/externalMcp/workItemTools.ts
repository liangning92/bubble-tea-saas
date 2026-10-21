import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { workItemSchemas } from './workItemContract'
import type { createWorkItemService } from './workItemService'

export function createWorkItemTools(server: McpServer, service: ReturnType<typeof createWorkItemService>, scopes: readonly string[]) {
  if (!service.isEnabled()) return
  const definitions = [
    { name: 'team_delivery_get', action: 'delivery.read', method: 'delivery', schema: workItemSchemas.delivery, read: true },
    { name: 'team_task_get', action: 'tasks.read', method: 'get', schema: workItemSchemas.get, read: true },
    { name: 'team_task_assign', action: 'tasks.assign', method: 'assign', schema: workItemSchemas.assign, read: false },
    { name: 'team_task_review', action: 'tasks.review', method: 'review', schema: workItemSchemas.review, read: false },
    { name: 'approval_awareness_get', action: 'approvals.read', method: 'approval', schema: workItemSchemas.approval, read: true }
  ] as const
  for (const d of definitions.filter(d => scopes.includes(d.action))) server.registerTool(d.name, {
    description: d.name === 'team_delivery_get' ? 'Read a scoped message delivery projection. Provider acceptance is not device display; later messages do not prove a reply.'
      : d.name === 'team_task_assign' ? 'Assign a native employee task from one already confirmed minute action; preserve its assignee and due date.'
      : d.name === 'team_task_review' ? 'Review a submitted native employee task using its current version. Never accept or submit on behalf of an employee.'
      : d.name === 'approval_awareness_get' ? 'Read generic awareness for one explicitly authorized approval object. No approval execution is provided.'
      : 'Read one authorized native employee task, responsibility, deadlines, evidence history and current state.',
    inputSchema: fromJsonSchema(zodToJsonSchema(d.schema, { $refStrategy: 'none' }) as any),
    annotations: { readOnlyHint: d.read, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async input => {
    try {
      const result = await (service[d.method] as (input: unknown) => Promise<unknown>)(d.schema.parse(input))
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { result } }
    } catch { return { isError: true, content: [{ type: 'text', text: 'TEAM_WORK_ITEM_REJECTED; read current authoritative state before retrying uncertain writes.' }] } }
  })
}
