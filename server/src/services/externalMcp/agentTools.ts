import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'
import { AgentPrincipal, AgentTaskService, assignTaskSchema, readTaskSchema, claimTaskSchema,
  leaseSchema, reportTaskSchema, reviewTaskSchema, AgentTaskScope } from '../agentTasks/contract'

// Schemas come from the backend-owned contract; refinements are checked again before any business call.
export function createAgentTaskTools(server: McpServer, service: AgentTaskService,
  resolvePrincipal: (scope: AgentTaskScope) => Promise<AgentPrincipal>, role: AgentPrincipal['role'], scopes: readonly string[]) {
  const definitions = [
    { name: 'assign', scope: 'management.assign', role: 'manager', schema: assignTaskSchema, method: 'assign' },
    { name: 'get', scope: role === 'manager' ? 'management.read' : 'executor.claim', role, schema: readTaskSchema, method: 'get' },
    { name: 'review', scope: 'management.review', role: 'manager', schema: reviewTaskSchema, method: 'review' },
    { name: 'claim', scope: 'executor.claim', role: 'executor', schema: claimTaskSchema, method: 'claim' },
    { name: 'read_stock_evidence', scope: 'executor.evidence', role: 'executor', schema: leaseSchema, method: 'readStockEvidence' },
    { name: 'report', scope: 'executor.report', role: 'executor', schema: reportTaskSchema, method: 'report' }
  ] as const
  for (const definition of definitions.filter(d => d.role === role && scopes.includes(d.scope))) {
    let base: any = definition.schema
    while (base instanceof z.ZodEffects) base = base.innerType()
    const publicSchema = (definition.name === 'get' && role === 'executor' ? base.extend({ taskId: z.string().uuid() }) : base).omit({ authVersion: true }).strict()
    server.registerTool('store_task_' + definition.name, {
      description: 'STOCK-RO-001 authorized task operation: ' + definition.name + '. Business authorization and versions are enforced by the store backend.' + (definition.name === 'get' && role === 'manager' ? ' taskId accepts its UUID or the fixed STOCK-RO-001 alias resolved within your existing authorized store.' : ''),
      inputSchema: fromJsonSchema(zodToJsonSchema(publicSchema, { $refStrategy: 'none' }) as any),
      annotations: { readOnlyHint: definition.name === 'get', destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async input => {
      try {
        const publicInput = publicSchema.parse(input), principal = await resolvePrincipal(definition.scope)
        const parsed = definition.schema.parse({ ...publicInput, authVersion: principal.grantVersion })
        const result = await (service[definition.method] as any)(principal, parsed)
        // Actions and executor.get return receipts, not an alternate evidence/report read path.
        const projected = { ...result }
        if (definition.name !== 'read_stock_evidence' && !(definition.name === 'get' && principal.role === 'manager')) {
          delete projected.evidence
          if (result.report) { const { id, version, runId, round, outcome, createdAt } = result.report; projected.report = { id, version, runId, round, outcome, createdAt } }
        }
        // Never return arbitrary Error objects or diagnostic provider payloads.
        return { content: [{ type: 'text', text: JSON.stringify(projected) }], structuredContent: { task: projected } }
      } catch { return { isError: true, content: [{ type: 'text', text: 'STORE_TASK_OPERATION_REJECTED; read current authoritative state before retrying uncertain writes.' }] } }
    })
  }
}
