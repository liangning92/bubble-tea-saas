import { describe, expect, test, jest } from '@jest/globals'
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createAgentPilotHost, parseAgentPilotHostConfig, readAgentPilotMaterial, AGENT_PILOT_RESOURCE, AGENT_PILOT_ISSUER } from '../src/services/agentTasks/host'

const configured = (): NodeJS.ProcessEnv => ({ AGENT_TASK_PILOT_ENABLED: '1', AGENT_TASK_PILOT_STORE_ID: 'synthetic-store',
  AGENT_TASK_PILOT_HERMES_ORIGIN: 'http://host.docker.internal:8642', AGENT_TASK_PILOT_HERMES_IDENTITY_ID: 'synthetic-hermes',
  AGENT_TASK_PILOT_HERMES_CREDENTIAL_GENERATION: '1', AGENT_TASK_PILOT_AS_PUBLIC_KEY_FILE: '/synthetic/public.pem',
  AGENT_TASK_PILOT_SUBSCRIPTION_ENCRYPTION_KEY_FILE: '/synthetic/events.bin', AGENT_TASK_PILOT_HERMES_BEARER_FILE: '/synthetic/bearer' })
describe('disabled-by-default real pilot host boundary', () => {
  test('off ignores malformed config and performs zero secret/DB/network/timer operations across all lifecycle calls', async () => {
    let touched = 0
    const db = new Proxy({}, { get() { touched++; throw Error('unexpected database use') } })
    const fail = () => { touched++; throw Error('unexpected material or transport use') }
    const interval = jest.spyOn(global, 'setInterval')
    try {
      const host = createAgentPilotHost(db, { ...configured(), AGENT_TASK_PILOT_ENABLED: 'true', AGENT_TASK_PILOT_HERMES_ORIGIN: 'secret-invalid' },
        { readFile: fail, hermesFetch: fail, webhookPost: fail, modelTransport: fail })
      for (const path of ['/mcp/agent-tasks', '/.well-known/oauth-protected-resource/mcp/agent-tasks', '/.well-known/oauth-authorization-server/identity/realms/store-agents', '/agent-model/v1/chat/completions']) expect((await host.fetch(new Request('https://api.aicube.online' + path))).status).toBe(503)
      await host.start(); host.stop(); await host.close()
      expect(touched).toBe(0); expect(interval).not.toHaveBeenCalled(); expect(host.status().state).toBe('disabled')
    } finally { interval.mockRestore() }
  })
  test('enabled invalid nonsecret target fails closed before materials with only sanitized startup status', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    let reads = 0
    try {
      const host = createAgentPilotHost({}, { ...configured(), AGENT_TASK_PILOT_HERMES_ORIGIN: 'https://public.invalid/secret-value' }, { readFile: () => { reads++; throw Error('must not read') } })
      expect(reads).toBe(0); expect(host.status()).toEqual({ state: 'failed', code: 'AGENT_PILOT_STARTUP_INVALID' })
      expect((await host.fetch(new Request(AGENT_PILOT_RESOURCE))).status).toBe(503)
      expect(log.mock.calls).toEqual([['[AgentPilot] AGENT_PILOT_STARTUP_INVALID']])
    } finally { log.mockRestore() }
  })
  test('only fixed loopback/Desktop HTTP target and explicit positive generations/intervals are allowed', () => {
    expect(parseAgentPilotHostConfig(configured())?.hermesOrigin).toBe('http://host.docker.internal:8642')
    expect(AGENT_PILOT_RESOURCE).toBe('https://api.aicube.online/mcp/agent-tasks')
    expect(AGENT_PILOT_ISSUER).toBe('https://api.aicube.online/identity/realms/store-agents')
    for (const origin of ['https://public.invalid', 'http://10.0.0.1', 'http://127.0.0.1/other', 'http://localhost?token=x', 'http://user:pw@localhost']) expect(() => parseAgentPilotHostConfig({ ...configured(), AGENT_TASK_PILOT_HERMES_ORIGIN: origin })).toThrow()
    for (const value of ['0', '-1', '1junk']) expect(() => parseAgentPilotHostConfig({ ...configured(), AGENT_TASK_PILOT_HERMES_CREDENTIAL_GENERATION: value })).toThrow()
    expect(() => parseAgentPilotHostConfig({ ...configured(), AGENT_TASK_PILOT_RECOVERY_INTERVAL_MS: '1' })).toThrow()
  })
  test('transient storage outage keeps the same scheduler alive and recovers after storage returns', async () => {
    // Only key parsing is stubbed: this scheduler unit never verifies a JWT, generates keys or calls a network.
    const crypto = require('crypto'), parser = jest.spyOn(crypto, 'createPublicKey').mockReturnValue({ asymmetricKeyType: 'rsa', asymmetricKeyDetails: { modulusLength: 2048 } })
    let callback: (() => void) | undefined, broken = true, io = 0, writes = 0
    const interval = jest.spyOn(global, 'setInterval').mockImplementation(((fn: () => void) => { callback = fn; return { unref() {} } }) as any)
    const clear = jest.spyOn(global, 'clearInterval').mockImplementation(() => {})
    const clock = Date.now(), pilotId = '00000000-0000-4000-8000-000000000001', managerId = '00000000-0000-4000-8000-000000000002', channelId = '00000000-0000-4000-8000-000000000003'
    const stamp = { id: pilotId, startedAt: new Date(clock - 1000).toISOString(), expiresAt: new Date(clock - 1000 + 86400000).toISOString() }
    const rows = new Map<string, unknown>([
      ['externalAgent.pilot.v1', { stamp, storeId: 'synthetic-store', channelId, taskCode: 'STOCK-RO-001', enabled: true, version: 1 }],
      ['externalAgent.pilot.v1.anchor.' + pilotId, stamp],
      ['externalAgent.taskPrincipal.production.v1', [{ identityHash: 'a'.repeat(64), agentId: managerId, role: 'manager', grantVersion: 1, clientRevision: 1, scopes: ['management.assign', 'management.read', 'management.review'], channelIds: [channelId], revoked: false, revokedTokenHashes: [], environment: 'production', pilotId, expiresAt: stamp.expiresAt }]]
    ])
    const db: any = { config: {
      findUnique: async (q: any) => { io++; if (broken) throw Error('PRIVATE_STORAGE_ERROR'); const value = rows.get(q.where.storeId_key.key); return value ? { value: JSON.stringify(value) } : null },
      findMany: async () => [], upsert: async (q: any) => { writes++; rows.set(q.where.storeId_key.key, JSON.parse(rows.has(q.where.storeId_key.key) ? q.update.value : q.create.value)); return {} }
    } }; db.$transaction = async (fn: any) => fn(db)
    let host: ReturnType<typeof createAgentPilotHost> | undefined
    try {
      host = createAgentPilotHost(db, configured(), { now: () => clock, readFile: (path) => path.endsWith('public.pem') ? Buffer.from('-----BEGIN PUBLIC KEY-----\nSYNTHETIC\n-----END PUBLIC KEY-----') : path.endsWith('events.bin') ? Buffer.alloc(32, 7) : Buffer.from('synthetic-token') })
      await host.start(); expect(host.status()).toEqual({ state: 'failed', code: 'AGENT_PILOT_RECOVERY_BLOCKED' }); expect(interval).toHaveBeenCalledTimes(1); expect(clear).not.toHaveBeenCalled()
      const failedReads = io; broken = false; callback!(); await new Promise<void>(resolve => setImmediate(resolve))
      expect(io).toBeGreaterThan(failedReads); expect(host.status().state).toBe('ready'); expect(writes).toBeGreaterThan(0); expect(interval).toHaveBeenCalledTimes(1)
    } finally { await host?.close(); parser.mockRestore(); interval.mockRestore(); clear.mockRestore() }
  })
  test('material reader never creates records/files, rejects symlinks and public-readable private material; public PEM may be 0644', () => {
    const dir = mkdtempSync(join(tmpdir(), 'synthetic-agent-host-'))
    try {
      const file = join(dir, 'synthetic-material'), alias = join(dir, 'alias')
      writeFileSync(file, Buffer.alloc(32, 7), { mode: 0o600 }); expect(readAgentPilotMaterial(file, true).length).toBe(32)
      chmodSync(file, 0o644); expect(() => readAgentPilotMaterial(file, true)).toThrow(); expect(readAgentPilotMaterial(file, false).length).toBe(32)
      symlinkSync(file, alias); expect(() => readAgentPilotMaterial(alias, false)).toThrow()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
