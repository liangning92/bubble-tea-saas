import { PrismaClient } from '@prisma/client'
import { createMcpHandler, McpServer, requireBearerAuth, getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse, hostHeaderValidationResponse, originValidationResponse, OAuthMetadata } from '@modelcontextprotocol/server'
import * as z from 'zod-mcp'
import { jwtAccessVerifier, identity } from './auth'
import { taskResourceStore } from './store'

// Deliberately not imported/mounted by index.ts. Production has no activation path in this stage.
export function externalMcpHandler(options: {
  resource: URL; issuerMetadata: OAuthMetadata; verifier: ReturnType<typeof jwtAccessVerifier>
  mode?: 'disabled' | 'isolated-test'
  securityAudit: (event: { action: 'auth_rejected' | 'scope_rejected' | 'request_rejected'; status: number }) => Promise<void>
}) {
  if (options.issuerMetadata.issuer !== options.verifier.issuer || options.resource.href !== options.verifier.resource || options.resource.search || options.resource.hash || options.resource.username || options.resource.password) throw Error('MCP_TRUST_CONFIG_MISMATCH')
  const isolated = options.mode === 'isolated-test'
  if (isolated) {
    const url = new URL(process.env.DATABASE_URL || 'http://invalid')
    if (process.env.NODE_ENV !== 'test' || !process.env.BT_TEST_RUN?.startsWith('bt-test-') ||
      url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.pathname !== '/team_test' ||
      options.resource.protocol !== 'http:' || options.resource.hostname !== '127.0.0.1') throw Error('MCP_ISOLATED_RUNTIME_REQUIRED')
  }
  // Construct the connection from the guarded URL; never accept an unrelated injected production db.
  const db = isolated ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } }) : undefined
  const store = db ? taskResourceStore(db) : undefined
  const gate = requireBearerAuth({ verifier: options.verifier, requiredScopes: ['tasks.read'], expectedResource: options.resource,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(options.resource) })
  const sdk = createMcpHandler(({ authInfo }) => {
    const server = new McpServer({ name: 'store-task-access', version: '0.1.0' })
    server.registerTool('read_task', { description: 'Read one explicitly authorized store task; no writes.',
      inputSchema: z.object({ channelId: z.uuid(), taskId: z.uuid() }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    async ({ channelId, taskId }) => {
      try {
        const data = await store!.readTask(identity(authInfo!), channelId, taskId)
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: { task: data } }
      } catch { return { isError: true, content: [{ type: 'text', text: 'MCP_TASK_UNAVAILABLE' }] } }
    })
    return server
  }, { legacy: 'stateless', responseMode: 'json', maxRequestBodySize: 16384 })
  return {
    async fetch(request: Request): Promise<Response> {
      if (!isolated) return Response.json({ error: 'MCP_PRODUCTION_DISABLED' }, { status: 503 })
      const origin = request.headers.get('origin')
      if (new URL(request.url).origin !== options.resource.origin || (origin && origin !== options.resource.origin)) { await options.securityAudit({ action: 'request_rejected', status: 403 }); return new Response(null, { status: 403 }) }
      const invalid = hostHeaderValidationResponse(request, ['127.0.0.1']) || originValidationResponse(request, ['127.0.0.1'])
      if (invalid) { await options.securityAudit({ action: 'request_rejected', status: invalid.status }); return invalid }
      const metadata = oauthMetadataResponse(request, { oauthMetadata: options.issuerMetadata, resourceServerUrl: options.resource, scopesSupported: ['tasks.read'] })
      if (metadata) return metadata
      if (new URL(request.url).pathname !== options.resource.pathname) return new Response(null, { status: 404 })
      const auth = await gate(request)
      if (auth instanceof Response) {
        await options.securityAudit({ action: auth.status === 403 ? 'scope_rejected' : 'auth_rejected', status: auth.status })
        return auth
      }
      try { await store!.authorize(identity(auth)) } catch {
        await options.securityAudit({ action: 'request_rejected', status: 403 })
        return Response.json({ error: 'MCP_ACCESS_DENIED' }, { status: 403 })
      }
      const response = await sdk.fetch(request, { authInfo: auth })
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    },
    close: async () => { await sdk.close(); await db?.$disconnect() }
  }
}
