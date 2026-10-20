import { createHash } from 'crypto'
import { callInput, deny, Registration } from './contract'

export type MockGrant = Omit<Registration, 'authState' | 'executionState'> & {
  authState: 'active' | 'revoked' | 'unconfigured'; executionState: 'ready' | 'frozen'
}
export interface MockPrincipal {
  registrationId: string; storeId: string; subjectId: string
  authVersion: number; clientRevision: number; expiresAt: number
}
export interface MockBinding {
  taskId: string; channelId: string; registrationId: string; clientRevision: number
  state: 'ready' | 'frozen' | 'uncertain'
}
// An isolated client contract, NOT an HTTP/MCP transport or token validator.
// Instantiate only in tests. No production module imports this adapter.
export function isolatedMockGateway(deps: {
  load: (id: string) => Promise<MockGrant>
  authenticate: (credential: unknown) => Promise<MockPrincipal | null>
  // Must re-check actual delegated actor/channel membership/fromSeq before returning any data.
  read: (principal: MockPrincipal, tool: 'tasks.read' | 'messages.read', channelId: string, after: number) => Promise<unknown>
  authorize: (principal: MockPrincipal, channelId: string, tool: string) => Promise<void>
  binding: (principal: MockPrincipal, taskId: string) => Promise<MockBinding>
}) {
  if (process.env.NODE_ENV !== 'test') deny('EXTERNAL_MOCK_TEST_ONLY', 503)
  const suggestions = new Map<string, { hash: string; result: unknown }>()
  return {
    async call(credential: unknown, raw: unknown) {
      const principal = await deps.authenticate(credential)
      if (!principal || principal.expiresAt <= Date.now()) deny('EXTERNAL_UNAUTHENTICATED', 401)
      const input = callInput.parse(raw), r = await deps.load(input.registrationId)
      if (!r || r.id !== principal.registrationId || !r.storeIds.includes(principal.storeId)) deny('EXTERNAL_SCOPE')
      // Activation is synthetic in this mock; never persisted or accepted by the control-plane service.
      if (!r.enabled || r.authState !== 'active' || r.executionState !== 'ready') deny('EXTERNAL_DISABLED')
      if (r.clientType !== 'mcp_compatible') deny('EXTERNAL_ADAPTER_REQUIRED')
      if (r.version !== input.version || r.authVersion !== principal.authVersion || r.clientRevision !== principal.clientRevision)
        deny('EXTERNAL_STALE_AUTHORIZATION', 409)
      if (!r.channelIds.includes(input.channelId) || !r.tools.includes(input.tool)) deny('EXTERNAL_SCOPE')
      await deps.authorize(principal, input.channelId, input.tool)
      if (input.tool !== 'task.suggest') return deps.read(principal, input.tool, input.channelId, input.after)
      const binding = await deps.binding(principal, input.taskId!)
      if (!binding || binding.taskId !== input.taskId || binding.channelId !== input.channelId || binding.registrationId !== r.id ||
        binding.clientRevision !== r.clientRevision || binding.state !== 'ready') deny('EXTERNAL_EXECUTION_FROZEN', 409)
      // No task execution, approval or employee message. Facts remain server-owned.
      const key = principal.storeId + ':' + input.taskId + ':' + input.requestId
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex'), prior = suggestions.get(key)
      if (prior) { if (prior.hash !== hash) deny('EXTERNAL_REQUEST_CONFLICT', 409); return prior.result }
      const result = { requestId: input.requestId, taskId: input.taskId, suggestion: input.suggestion,
        registrationId: r.id, clientRevision: r.clientRevision, authVersion: r.authVersion,
        status: 'pending_human_review', executed: false }
      suggestions.set(key, { hash, result }); return result
    }
  }
}
