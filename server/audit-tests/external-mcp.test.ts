import { describe, test, expect } from '@jest/globals'
import { generateKeyPairSync } from 'crypto'
import jwt from 'jsonwebtoken'
import { requireBearerAuth } from '@modelcontextprotocol/server'
import { jwtAccessVerifier } from '../src/services/externalMcp/auth'
import { externalMcpHandler } from '../src/services/externalMcp/handler'

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }), wrong = generateKeyPairSync('rsa', { modulusLength: 2048 })
const resource = new URL('http://127.0.0.1:9876/mcp'), issuer = 'https://synthetic-issuer.invalid'
const verifier = jwtAccessVerifier({ issuer, resource, publicKey: keys.publicKey })
function token(change: any = {}, typ = 'at+jwt', key = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(JSON.parse(JSON.stringify({ iss: issuer, aud: resource.href, sub: 'fixture-subject', client_id: 'fixture-client', jti: 'fixture-id',
    scope: 'tasks.read', iat: now, exp: now + 60, ...change })), key, { algorithm: 'RS256', header: { typ, alg: 'RS256' } })
}
const gate = requireBearerAuth({ verifier, expectedResource: resource, requiredScopes: ['tasks.read'] })
async function response(value?: string) { return gate(new Request(resource, { headers: value ? { Authorization: 'Bearer ' + value } : {} })) }

describe('MCP resource-server verifier and production gate', () => {
  test('valid signed access identity carries no client-supplied store authority', async () => {
    const result = await verifier.verifyAccessToken(token({ storeId: 'arbitrary-store', role: 'admin' }))
    expect(result).toMatchObject({ clientId: 'fixture-client', resource, scopes: ['tasks.read'], extra: { subject: 'fixture-subject' } })
    expect(result.extra).not.toHaveProperty('storeId'); expect(result.extra).not.toHaveProperty('role')
  })
  test.each([
    ['missing', undefined], ['expired', token({ exp: 1 })], ['issuer', token({ iss: 'https://wrong.invalid' })],
    ['audience', token({ aud: 'https://wrong.invalid/mcp' })], ['missing exp', token({ exp: undefined })],
    ['missing jti', token({ jti: undefined })], ['missing subject', token({ sub: undefined })], ['missing client', token({ client_id: undefined })],
    ['future iat', token({ iat: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 })],
    ['wrong signature', token({}, 'at+jwt', wrong.privateKey)], ['id-token type', token({}, 'JWT')],
    ['unsigned', jwt.sign({ iss: issuer, aud: resource.href }, '', { algorithm: 'none' })],
    ['HS256', jwt.sign({ iss: issuer, aud: resource.href }, 'synthetic-only', { algorithm: 'HS256' })]
  ])('%s is a standard 401 rejection', async (_name, value) => { const r = await response(value); expect(r).toBeInstanceOf(Response); expect((r as Response).status).toBe(401) })
  test('verified token lacking the one required scope receives standard 403', async () => {
    const r = await response(token({ scope: 'messages.read' })) as Response
    expect(r.status).toBe(403); expect(r.headers.get('www-authenticate')).toContain('insufficient_scope')
  })
  test('default handler is disabled and never asks for a database or credentials', async () => {
    const handler = externalMcpHandler({ resource, verifier, issuerMetadata: { issuer, authorization_endpoint: issuer+'/authorize', token_endpoint: issuer+'/token', response_types_supported: ['code'] }, securityAudit: async () => {} })
    expect((await handler.fetch(new Request(resource))).status).toBe(503)
    await handler.close()
  })
  test('isolated enablement refuses the audit harness database and missing batch proof', () => {
    expect(() => externalMcpHandler({ resource, verifier, issuerMetadata: { issuer, authorization_endpoint: issuer+'/authorize', token_endpoint: issuer+'/token', response_types_supported: ['code'] }, mode: 'isolated-test', securityAudit: async () => {} })).toThrow('MCP_ISOLATED_RUNTIME_REQUIRED')
  })
  test('mismatched trusted issuer or resource configuration is rejected before serving', () => {
    expect(() => externalMcpHandler({ resource, verifier, issuerMetadata: { issuer: 'https://other.invalid', authorization_endpoint: issuer+'/authorize', token_endpoint: issuer+'/token', response_types_supported: ['code'] }, securityAudit: async () => {} })).toThrow('MCP_TRUST_CONFIG_MISMATCH')
  })
})
