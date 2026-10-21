import { TeamError } from '../TeamCommunicationService'
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createTeamAgentBridge } from '../teamAgentBridge/service'
import { BridgeAction, schemas } from '../teamAgentBridge/contract'

// Explicit composition only. No host mounts this factory or grants new scopes by default.
export function createTeamCommunicationTools(server: McpServer, bridge: ReturnType<typeof createTeamAgentBridge>,
  options: { enabled?: boolean; scopes: readonly string[] }) {
  if (options.enabled !== true) return
  const definitions: [keyof typeof schemas, BridgeAction][] = [
    ['directory', 'directory.read'], ['channels', 'conversations.read'], ['create', 'conversation.create'], ['messages', 'messages.read'],
    ['attachment', 'attachments.read'], ['send', 'messages.send'], ['receipts', 'receipts.read'], ['markRead', 'agent.read'], ['changes', 'changes.read']
  ]
  for (const [method, scope] of definitions) {
    if (!options.scopes.includes(scope)) continue
    server.registerTool('store_team_' + method, {
      description: 'Authorized team communication: ' + method + '. Agent read acknowledgement never marks employees as read. Changes persist pending follow-ups without executing them.',
      inputSchema: fromJsonSchema(zodToJsonSchema(schemas[method], { $refStrategy: 'none' }) as any),
      annotations: { readOnlyHint: ['directory', 'channels', 'messages', 'attachment', 'receipts'].includes(method), destructiveHint: false,
        idempotentHint: true, openWorldHint: false }
    }, async input => {
      try {
        const result = await (bridge[method] as (input: unknown) => Promise<unknown>)(input)
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: { result } }
      } catch (error) { if(error instanceof TeamError && error.message==='TEAM_AGENT_OUTPUT_NEEDS_REVIEW') return { isError:true,content:[{type:'text',text:'TEAM_AGENT_OUTPUT_NEEDS_REVIEW; ask the owner for clarification without forwarding sensitive content.'}] }; return { isError: true, content: [{ type: 'text', text: 'TEAM_AGENT_OPERATION_REJECTED; reread authoritative state before retrying uncertain writes.' }] } }
    })
  }
}
