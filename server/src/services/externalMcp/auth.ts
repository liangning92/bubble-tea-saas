import jwt, { JwtPayload, PublicKey } from 'jsonwebtoken'
import { AuthInfo, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'

export interface VerifiedIdentity { issuer: string; clientId: string; subject: string; tokenId: string }
const invalid = (): never => { throw new OAuthError(OAuthErrorCode.InvalidToken, 'Access token rejected') }
// Resource-server adapter only. No issuance, refresh, client secret or OAuth authorization endpoint.
// Key and issuer come from trusted operator configuration, never token-supplied jku/x5u URLs.
export function jwtAccessVerifier(options: { issuer: string; resource: URL; publicKey: PublicKey }) {
  const issuer = new URL(options.issuer)
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) throw Error('MCP_HTTPS_ISSUER_REQUIRED')
  return {
    issuer: options.issuer, resource: options.resource.href,
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const verified = jwt.verify(token, options.publicKey, { algorithms: ['RS256'], issuer: options.issuer,
          audience: options.resource.href, complete: true })
        const p = verified.payload as JwtPayload
        if (verified.header.typ !== 'at+jwt' || typeof p !== 'object' || !p ||
          typeof p.sub !== 'string' || !p.sub || p.sub.length > 200 ||
          typeof p.client_id !== 'string' || !p.client_id || p.client_id.length > 200 ||
          typeof p.jti !== 'string' || !p.jti || p.jti.length > 200 ||
          !Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) || p.exp! <= p.iat! || p.iat! > Math.floor(Date.now() / 1000) + 30 ||
          typeof p.scope !== 'string' || p.scope.length > 1000 || !/^[\x21\x23-\x5B\x5D-\x7E ]*$/.test(p.scope)) invalid()
        return { token, clientId: p.client_id, scopes: p.scope.split(' ').filter(Boolean), expiresAt: p.exp,
          resource: new URL(options.resource.href), extra: { issuer: p.iss, subject: p.sub, tokenId: p.jti } }
      } catch { return invalid() }
    }
  }
}
export function identity(auth: AuthInfo): VerifiedIdentity {
  const x = auth.extra
  if (!x || typeof x.issuer !== 'string' || typeof x.subject !== 'string' || typeof x.tokenId !== 'string') invalid()
  return { issuer: x!.issuer as string, clientId: auth.clientId, subject: x!.subject as string, tokenId: x!.tokenId as string }
}
