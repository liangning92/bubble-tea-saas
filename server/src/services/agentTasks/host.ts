import { constants, openSync, fstatSync, readFileSync, closeSync } from 'fs'
import { isAbsolute } from 'path'
import { createPublicKey } from 'crypto'
import { AsyncLocalStorage } from 'async_hooks'
import { requireBearerAuth, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'
import { jwtAccessVerifier, identity } from '../externalMcp/auth'
import { productionAgentBindings } from '../externalMcp/productionAgentBindings'
import { agentMcpHandler } from '../externalMcp/agentHandler'
import { publicHttpsPost, WebhookPost } from '../externalMcp/webhookDelivery'
import { HermesRunsClient } from '../hermesTransport/client'
import type { HttpFetch, PreparedDispatch, RunMapping } from '../hermesTransport/types'
import { createTeamAgentMiniMaxTransport, type TeamAgentModelTransport } from '../TeamAiService'
import { readAgentPilot } from './pilot'
import { TeamError } from '../TeamCommunicationService'
import { createAgentTaskService } from './service'
import { createAgentTaskDispatcher } from './dispatch'
import { persistentAdmissionBindings } from './admissionBindings'
import { createAgentTaskRuntime } from './runtime'
import { createAgentModelRelay, agentModelRelayRequestSchema } from './modelRelay'

export const AGENT_PILOT_RESOURCE = 'https://api.aicube.online/mcp/agent-tasks'
export const AGENT_PILOT_ISSUER = 'https://api.aicube.online/identity/realms/store-agents'
export const AGENT_PILOT_MODEL_PATH = '/agent-model/v1/chat/completions'
export const AGENT_PILOT_METADATA_PATH = '/.well-known/oauth-protected-resource/mcp/agent-tasks'
export const AGENT_PILOT_AS_METADATA_PATH = '/.well-known/oauth-authorization-server/identity/realms/store-agents'
const issuerMetadata = { issuer: AGENT_PILOT_ISSUER, authorization_endpoint: AGENT_PILOT_ISSUER + '/protocol/openid-connect/auth',
  token_endpoint: AGENT_PILOT_ISSUER + '/protocol/openid-connect/token', jwks_uri: AGENT_PILOT_ISSUER + '/protocol/openid-connect/certs',
  response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
  code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  scopes_supported: ['management.assign', 'management.read', 'management.review', 'executor.claim', 'executor.evidence', 'executor.report'] }
const PROFILE = 'stock-ro-001', MAX_BODY = 131072
export interface AgentPilotHostDependencies {
  now?: () => number
  /** Server constructor seam only. Never chosen by env, JWT claims, or HTTP body. */
  readFile?: (path: string, privateMaterial: boolean) => Buffer
  hermesFetch?: HttpFetch
  webhookPost?: WebhookPost
  modelTransport?: TeamAgentModelTransport
}
export interface AgentPilotHostConfig {
  storeId: string; hermesOrigin: string; hermesIdentityId: string; credentialGeneration: number; intervalMs: number
  publicKeyFile: string; subscriptionKeyFile: string; bearerFile: string
}
export type AgentPilotHostState = { state: 'disabled' | 'ready' | 'failed' | 'stopped' | 'expired'; code: string }
export interface AgentPilotHost {
  fetch(request: Request): Promise<Response>
  start(): Promise<void>; stop(): void; close(): Promise<void>; status(): AgentPilotHostState
}
export function parseAgentPilotHostConfig(env: NodeJS.ProcessEnv): AgentPilotHostConfig | null {
  if (env.AGENT_TASK_PILOT_ENABLED !== '1') return null
  const text = (suffix: string) => { const value = env['AGENT_TASK_PILOT_' + suffix]; if (!value || value !== value.trim() || value.length > 4096) throw Error('AGENT_PILOT_CONFIG_INVALID'); return value }
  const integer = (value: string, max: number) => { if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw Error('AGENT_PILOT_CONFIG_INVALID'); return Number(value) }
  const file = (suffix: string) => { const value = text(suffix); if (!isAbsolute(value)) throw Error('AGENT_PILOT_CONFIG_INVALID'); return value }
  const storeId = text('STORE_ID'), origin = new URL(text('HERMES_ORIGIN'))
  if (storeId.length > 200 || origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'].includes(origin.hostname) ||
    origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('AGENT_PILOT_CONFIG_INVALID')
  const hermesIdentityId = text('HERMES_IDENTITY_ID')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(hermesIdentityId)) throw Error('AGENT_PILOT_CONFIG_INVALID')
  const intervalMs = integer(env.AGENT_TASK_PILOT_RECOVERY_INTERVAL_MS || '1000', 60000)
  if (intervalMs < 250) throw Error('AGENT_PILOT_CONFIG_INVALID')
  return { storeId, hermesOrigin: origin.origin, hermesIdentityId, credentialGeneration: integer(text('HERMES_CREDENTIAL_GENERATION'), 2147483647), intervalMs,
    publicKeyFile: file('AS_PUBLIC_KEY_FILE'), subscriptionKeyFile: file('SUBSCRIPTION_ENCRYPTION_KEY_FILE'), bearerFile: file('HERMES_BEARER_FILE') }
}
/** One fd, no symlink following or key generation; private materials must not be group/world-readable. */
export function readAgentPilotMaterial(path: string, privateMaterial: boolean): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size < 1 || stat.size > 32768 || !(stat.mode & 0o400) ||
      (privateMaterial ? !!(stat.mode & 0o077) : !!(stat.mode & 0o022))) throw Error('AGENT_PILOT_MATERIAL_INVALID')
    return readFileSync(fd)
  } finally { closeSync(fd) }
}
const unavailable = () => Response.json({ error: 'AGENT_TASK_PILOT_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
export function createAgentPilotHost(db: any, env: NodeJS.ProcessEnv = process.env, deps: AgentPilotHostDependencies = {}): AgentPilotHost {
  let state: AgentPilotHostState = { state: 'disabled', code: 'AGENT_PILOT_DISABLED' }
  const inert = (): AgentPilotHost => ({ fetch: async () => unavailable(), start: async () => {}, stop: () => {}, close: async () => {}, status: () => ({ ...state }) })
  if (env.AGENT_TASK_PILOT_ENABLED !== '1') return inert()
  try {
    const config = parseAgentPilotHostConfig(env)!, now = deps.now || Date.now, material = deps.readFile || readAgentPilotMaterial
    const pem = material(config.publicKeyFile, false).toString('utf8')
    if (!/^-----BEGIN (?:RSA )?PUBLIC KEY-----\r?\n/.test(pem)) throw Error('AGENT_PILOT_MATERIAL_INVALID')
    const publicKey = createPublicKey(pem)
    if (publicKey.asymmetricKeyType !== 'rsa' || (publicKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw Error('AGENT_PILOT_MATERIAL_INVALID')
    const encryptionKey = material(config.subscriptionKeyFile, true)
    if (encryptionKey.length !== 32) throw Error('AGENT_PILOT_MATERIAL_INVALID')
    const readBearer = () => { const value = material(config.bearerFile, true).toString('utf8').trim(); if (!value || value.length > 8192 || /\s/.test(value)) throw Error('AGENT_PILOT_MATERIAL_INVALID'); return value }
    readBearer() // Validate the pre-provisioned file, without persisting or logging its contents.
    const bindings = productionAgentBindings(db, { storeId: config.storeId, now })
    let closed = false, started = false, running: Promise<void> | null = null, timer: ReturnType<typeof setInterval> | null = null
    async function fresh(expectedExecutorId?: string) {
      if (closed) throw Error('AGENT_PILOT_HOST_CLOSED')
      const pilot = await readAgentPilot(db, config.storeId, now()), manager = await bindings.recoveryManager()
      if (pilot.stamp.id !== manager.pilot?.id || now() >= Date.parse(pilot.stamp.expiresAt)) throw Error('AGENT_PILOT_EXPIRED')
      if (expectedExecutorId) {
        const executor = await bindings.executorFor(db, manager, pilot.channelId)
        if (executor.agentId !== expectedExecutorId) throw Error('AGENT_PILOT_EXECUTOR_CHANGED')
      }
      return { pilot, manager }
    }
    const dispatchIdentity = new AsyncLocalStorage<string>()
    const hermesIdentity = () => { const id = dispatchIdentity.getStore(); if (!id) throw Error('AGENT_PILOT_EXECUTOR_REQUIRED'); return id }
    const hermes = new HermesRunsClient({ origin: config.hermesOrigin, profile: PROFILE, dockerDesktopHost: true,
      admissionBindings: persistentAdmissionBindings(db, config.storeId), bearerToken: async () => { await fresh(hermesIdentity()); return readBearer() },
      fetch: async (url, input) => {
        const { pilot } = await fresh(hermesIdentity()), remaining = Date.parse(pilot.stamp.expiresAt) - now()
        if (remaining <= 0) throw Error('AGENT_PILOT_EXPIRED')
        const controller = new AbortController(), abort = () => controller.abort()
        input.signal.addEventListener('abort', abort, { once: true }); if (input.signal.aborted) abort()
        const cutoff = setTimeout(abort, remaining); cutoff.unref?.()
        const finish = () => { clearTimeout(cutoff); input.signal.removeEventListener('abort', abort) }
        try {
          const response = await (deps.hermesFetch || fetch)(url, { ...input, signal: controller.signal })
          // Keep the absolute cutoff through response-body reading, not only headers.
          if (response.status < 200 || response.status >= 300) { abort(); finish(); return { status: response.status, text: async () => '' } }
          return { status: response.status, text: async () => { try { return await response.text() } finally { finish() } } }
        } catch (error) { finish(); throw error }
      } })
    const service = createAgentTaskService(db, { authorize: bindings.authorize, executorFor: bindings.executorFor, now })
    const dispatchTransport = { dispatch: (prepared: PreparedDispatch) => dispatchIdentity.run(prepared.references.executorId, () => hermes.dispatch(prepared)),
      status: (mapping: RunMapping) => dispatchIdentity.run(mapping.dispatch.references.executorId, () => hermes.status(mapping)) }
    const dispatcher = createAgentTaskDispatcher(db, { authorize: bindings.authorize, executorFor: bindings.executorFor, now }, PROFILE, dispatchTransport,
      { origin: config.hermesOrigin, identityId: config.hermesIdentityId, credentialGeneration: config.credentialGeneration, dockerDesktopHost: true })
    let handler: ReturnType<typeof agentMcpHandler>
    const runtime = createAgentTaskRuntime(db, service, dispatcher, (storeId, event) => handler.deliver(storeId, { eventId: event.id, name: event.type, timestamp: event.occurredAt, data: event.payload, cursor: null }))
    const resource = new URL(AGENT_PILOT_RESOURCE), verifier = jwtAccessVerifier({ issuer: AGENT_PILOT_ISSUER, resource, publicKey })
    const post: WebhookPost = async (url, body, headers, options = {}) => {
      const { pilot } = await fresh()
      return (deps.webhookPost || publicHttpsPost)(url, body, headers, { ...options, deadlineAt: Math.min(options.deadlineAt ?? Infinity, Date.parse(pilot.stamp.expiresAt)), preflight: async () => { await fresh(); await options.preflight?.(); await fresh() } })
    }
    handler = agentMcpHandler({ resource, issuerMetadata,
      verifier, now, mode: 'production', encryptionKey, createService: () => runtime.service, production: { db, bindings, post } })
    const model = deps.modelTransport || createTeamAgentMiniMaxTransport(db, { enabled: true })
    const relay = createAgentModelRelay(db, { authorize: bindings.authorize, now }, { enabled: true, transport: async (storeId, version, request, beforeSend, deadlineAt) => {
      await fresh()
      return model(storeId, version, request, async () => { await fresh(); await beforeSend(); await fresh() }, deadlineAt)
    } })
    const auth = requireBearerAuth({ verifier, expectedResource: resource, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource) })
    async function health(pilotId: string, value: AgentPilotHostState) {
      await db.config.upsert({ where: { storeId_key: { storeId: config.storeId, key: 'externalAgent.host.health.v1.' + pilotId } },
        create: { storeId: config.storeId, key: 'externalAgent.host.health.v1.' + pilotId, category: 'externalAgent', value: JSON.stringify({ ...value, checkedAt: new Date(now()).toISOString() }) },
        update: { value: JSON.stringify({ ...value, checkedAt: new Date(now()).toISOString() }) } })
    }
    async function recover() {
      let pilotId: string | undefined
      try {
        const { pilot, manager } = await fresh(); pilotId = pilot.stamp.id
        const key = 'externalAgent.host.cursor.v1.' + pilotId, row = await db.config.findUnique({ where: { storeId_key: { storeId: config.storeId, key } } })
        const saved = row ? JSON.parse(row.value) : { pilotId, after: 0 }
        if (saved.pilotId !== pilotId || !Number.isSafeInteger(saved.after) || saved.after < 0) throw Error('AGENT_PILOT_CURSOR_INVALID')
        const result = await runtime.recoverOutbox(manager, { after: saved.after, limit: 50, authVersion: manager.grantVersion })
        if (!Number.isSafeInteger(result.nextCursor) || result.nextCursor < saved.after) throw Error('AGENT_PILOT_CURSOR_INVALID')
        if (result.nextCursor > saved.after) {
          const value = JSON.stringify({ pilotId, after: result.nextCursor })
          if (row) await db.config.updateMany({ where: { storeId: config.storeId, key, value: row.value }, data: { value } })
          else try { await db.config.create({ data: { storeId: config.storeId, key, category: 'externalAgent', value } }) } catch (e: any) { if (e?.code !== 'P2002') throw e }
        }
        state = { state: 'ready', code: 'AGENT_PILOT_RECOVERY_CHECKED' }; await health(pilotId, state)
      } catch (error) {
        // Storage faults keep the existing scheduler alive; only authoritative cutoff/revocation stops it.
        const unavailable = (e: unknown) => e instanceof TeamError && e.status === 403 && e.message === 'AGENT_PILOT_UNAVAILABLE_OR_EXPIRED'
        state = { state: 'failed', code: 'AGENT_PILOT_RECOVERY_BLOCKED' }
        let stopped = closed || unavailable(error)
        if (!stopped) try { const pilot = await readAgentPilot(db, config.storeId, now()); pilotId ||= pilot.stamp.id } catch (recheck) { stopped = unavailable(recheck) }
        if (stopped) { state = { state: closed ? 'stopped' : 'expired', code: closed ? 'AGENT_PILOT_HOST_CLOSED' : 'AGENT_PILOT_UNAVAILABLE_OR_EXPIRED' }; stop() }
        if (pilotId) try { await health(pilotId, state) } catch { /* keep the sanitized in-process status */ }
      }
    }
    function tick() { if (running || closed || !started) return running || Promise.resolve(); running = recover().finally(() => { running = null }); return running }
    function stop() { started = false; if (timer) clearInterval(timer); timer = null }
    state = { state: 'ready', code: 'AGENT_PILOT_CONFIGURED' }
    return {
      async fetch(request) {
        if (closed) return unavailable()
        const url = new URL(request.url), host = request.headers.get('host')?.toLowerCase()
        if (url.origin !== resource.origin || !['api.aicube.online', 'api.aicube.online:443'].includes(host || '') || request.headers.get('origin') && request.headers.get('origin') !== resource.origin) return new Response(null, { status: 403 })
        if (![resource.pathname, AGENT_PILOT_METADATA_PATH, AGENT_PILOT_AS_METADATA_PATH, AGENT_PILOT_MODEL_PATH].includes(url.pathname)) return new Response(null, { status: 404 })
        if ([AGENT_PILOT_METADATA_PATH, AGENT_PILOT_AS_METADATA_PATH].includes(url.pathname)) {
          const headers = { 'Cache-Control': 'no-store', Allow: 'GET, HEAD, OPTIONS', 'Content-Type': 'application/json' }
          if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return new Response(null, { status: 405, headers })
          if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
          if (url.pathname === AGENT_PILOT_AS_METADATA_PATH) return request.method === 'HEAD' ? new Response(null, { headers }) : Response.json(issuerMetadata, { headers })
          const metadata = await handler.fetch(request.method === 'HEAD' ? new Request(request.url, { method: 'GET', headers: request.headers }) : request)
          return request.method === 'HEAD' ? new Response(null, { status: metadata.status, headers: metadata.headers }) : metadata
        }
        try { await fresh() } catch { return unavailable() }
        if (url.pathname !== AGENT_PILOT_MODEL_PATH) return handler.fetch(request)
        if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
        const verified = await auth(request); if (verified instanceof Response) return verified
        try {
          const p = await bindings.resolve(identity(verified), verified.scopes, 'executor.evidence')
          const text = await request.text(); if (Buffer.byteLength(text) > MAX_BODY) return new Response(null, { status: 413 })
          const body = JSON.parse(text)
          if (!body || typeof body !== 'object' || Array.isArray(body) || ['authVersion', 'principal', 'identity', 'storeId', 'agentId', 'role', 'grantVersion', 'clientRevision', 'scopes', 'pilot'].some(key => Object.hasOwn(body, key))) return new Response(null, { status: 400 })
          const input = agentModelRelayRequestSchema.parse({ ...body, authVersion: p.grantVersion })
          return Response.json(await relay.complete(p, input), { headers: { 'Cache-Control': 'private, no-store' } })
        } catch { return Response.json({ error: 'AGENT_MODEL_REQUEST_REJECTED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) }
      },
      async start() { if (closed || started) return; started = true; await tick(); if (started && !closed) { timer = setInterval(() => { void tick() }, config.intervalMs); timer.unref?.() } },
      stop,
      async close() { stop(); closed = true; await running; await handler.close(); state = { state: 'stopped', code: 'AGENT_PILOT_HOST_CLOSED' } },
      status: () => ({ ...state })
    }
  } catch {
    state = { state: 'failed', code: 'AGENT_PILOT_STARTUP_INVALID' }
    console.error('[AgentPilot] AGENT_PILOT_STARTUP_INVALID')
    return inert()
  }
}
