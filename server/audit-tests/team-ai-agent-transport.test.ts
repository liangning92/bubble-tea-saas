import { createCipheriv } from 'crypto'
import { describe, expect, jest, test } from '@jest/globals'
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }))
jest.mock('fs/promises', () => ({ __esModule: true, default: { readFile: jest.fn(async () => Buffer.alloc(32, 7)) } }))
jest.mock('../src/services/TeamManagementContext', () => ({}))
jest.mock('../src/services/TeamCommunicationService', () => ({
  TeamError: class extends Error { constructor(public status: number, code: string) { super(code) } },
  readTeam: async (db: any, _store: string, key: string) => db.records[key] || null
}))
import fs from 'fs/promises'
import { createTeamAgentMiniMaxTransport, TeamAgentModelProviderRequest } from '../src/services/TeamAiService'
function fixture() {
  const store = 'synthetic-store', syntheticKey = 'synthetic-provider-token-not-a-real-credential', iv = Buffer.alloc(12, 8)
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv); cipher.setAAD(Buffer.from(store + ':cn'))
  const encrypted = Buffer.concat([cipher.update(syntheticKey), cipher.final()])
  const secret = ['v2', 'cn', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
  const db = { records: { 'ai.settings': { version: 5, enabled: true, provider: 'minimax', region: 'cn', model: 'MiniMax-M3.1-Flash', secret },
    'ai.connection': { configVersion: 5, status: 'ready', checkRevision: 2, region: 'cn', model: 'MiniMax-M3.1-Flash', checkedAt: new Date().toISOString() } } }
  const body: TeamAgentModelProviderRequest = { model: 'MiniMax-M3.1-Flash', stream: false, reasoning_effort: 'low', reasoning_split: true,
    messages: [{ role: 'system', content: 'Synthetic restricted instruction.' }, { role: 'user', content: 'Synthetic sealed facts only.' }],
    tools: [{ type: 'function', function: { name: 'store_task_get', parameters: { type: 'object', properties: {}, additionalProperties: false } } }], tool_choice: 'auto' }
  return { store, db, body, syntheticKey }
}
describe('server-only CN Flash tool transport (all fetch/key reads synthetic mocks)', () => {
  test('default closed does not decrypt or invoke fetch', async () => {
    const f = fixture(), fetcher = jest.fn(), reads = (fs.readFile as any).mock.calls.length
    await expect(createTeamAgentMiniMaxTransport(f.db, { fetch: fetcher as any })(f.store, 5, f.body, async () => {})).rejects.toThrow('AGENT_MODEL_RELAY_DISABLED')
    expect(fetcher).not.toHaveBeenCalled(); expect((fs.readFile as any).mock.calls.length).toBe(reads)
  })
  test('existing CN credential remains internal; explicit low, no output cap, tool_calls retained', async () => {
    const f = fixture(), response = { id: 'synthetic-response', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
      tool_calls: [{ id: 'synthetic-call', type: 'function', function: { name: 'store_task_get', arguments: '{}' } }] } }] }
    let guarded = false
    const fetcher = jest.fn(async (url: any, init: any) => {
      expect(guarded).toBe(true); expect(url).toBe('https://api.minimax.cn/v1/chat/completions'); expect(init.redirect).toBe('error')
      expect(init.headers.Authorization).toBe('Bearer ' + f.syntheticKey)
      const sent = JSON.parse(init.body); expect(sent.reasoning_effort).toBe('low'); expect(sent.stream).toBe(false)
      expect(sent).not.toHaveProperty('max_tokens'); expect(sent).not.toHaveProperty('max_completion_tokens'); expect(sent).not.toHaveProperty('thinking')
      expect(init.body).not.toContain(f.syntheticKey)
      return { ok: true, text: async () => JSON.stringify(response) }
    })
    const actual = await createTeamAgentMiniMaxTransport(f.db, { enabled: true, fetch: fetcher as any })(f.store, 5, f.body, async () => { guarded = true })
    expect(actual).toEqual(response); expect(JSON.stringify(actual)).not.toContain(f.syntheticKey)
    expect(fetcher).toHaveBeenCalledTimes(1)
    // mock fs exposes readFile only; mkdir/writeFile/master-key creation would fail this test.
    expect((fs.readFile as any).mock.calls.at(-1)[0]).toContain('.team-ai-master.key')
  })
  test.each(['config_version', 'region', 'model', 'unverified', 'output_cap', 'arbitrary_tool'])('%s is rejected before fetch', async change => {
    const f = fixture(), fetcher = jest.fn()
    if (change === 'region') f.db.records['ai.settings'].region = 'global'
    if (change === 'model') f.db.records['ai.settings'].model = 'MiniMax-M3'
    if (change === 'unverified') f.db.records['ai.connection'].status = 'uncertain'
    if (change === 'output_cap') (f.body as any).max_tokens = 100
    if (change === 'arbitrary_tool') f.body.tools[0].function.name = 'shell'
    await expect(createTeamAgentMiniMaxTransport(f.db, { enabled: true, fetch: fetcher as any })(f.store, change === 'config_version' ? 6 : 5, f.body, async () => {})).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  test('absolute deadline bounds the abort signal and expiry after the final guard is known not sent', async () => {
    const f = fixture(), clock = { value: 10000 }, now = jest.spyOn(Date, 'now').mockImplementation(() => clock.value)
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    const fetcher = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ choices: [] }) }))
    try {
      const transport = createTeamAgentMiniMaxTransport(f.db, { enabled: true, fetch: fetcher as any })
      await transport(f.store, 5, f.body, async () => {}, 10300)
      expect(timeout).toHaveBeenLastCalledWith(300); expect(fetcher).toHaveBeenCalledTimes(1)
      await expect(transport(f.store, 5, f.body, async () => { clock.value = 11000 }, 10300)).rejects.toThrow('AGENT_MODEL_DEADLINE_BEFORE_SEND')
      expect(fetcher).toHaveBeenCalledTimes(1)
    } finally { timeout.mockRestore(); now.mockRestore() }
  })
  test('failed last-moment authorization never reaches fetch', async () => {
    const f = fixture(), fetcher = jest.fn()
    await expect(createTeamAgentMiniMaxTransport(f.db, { enabled: true, fetch: fetcher as any })(f.store, 5, f.body, async () => { throw Error('SYNTHETIC_REVOKED') })).rejects.toThrow('SYNTHETIC_REVOKED')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
