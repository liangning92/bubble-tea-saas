import { lookup } from 'dns/promises'
import { request } from 'https'
import * as ipaddr from 'ipaddr.js'

// No arbitrary fetch: DNS is checked on every connection, pinned, and TLS still verifies the original hostname.
export function publicCallbackUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') ||
    !url.hostname.includes('.') || url.hostname.endsWith('.') || ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, ''))) throw Error('MCP_CALLBACK_NOT_PUBLIC_HTTPS')
  return url
}
export function publicAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address)
    if (ip.range() !== 'unicast') return false
    // IANA special-purpose ranges that some ipaddr versions classify as unicast.
    const blocks = ip.kind() === 'ipv4' ? ['192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24'] : ['2001::/23', '2001:db8::/32', '3fff::/20']
    return !blocks.some(cidr => { const [net, bits] = ipaddr.parseCIDR(cidr); return ip.match(net as any, bits) })
  } catch { return false }
}
export interface WebhookPostOptions { deadlineAt?: number; preflight?: () => void | Promise<void> }
export type WebhookPost = (url: string, body: string, headers: Record<string, string>, options?: WebhookPostOptions) => Promise<{ status: number; body: string }>
export type CallbackPhase = 'validation' | 'authorization' | 'dns' | 'connect' | 'response' | 'verification'
export type CallbackReason = 'timeout' | 'callback_blocked' | 'dns_failed' | 'tls_failed' | 'connection_failed' | 'network_failed' |
  'response_too_large' | 'response_incomplete' | 'http_status' | 'response_invalid_json' | 'challenge_missing' | 'challenge_mismatch' |
  'subscription_expired' | 'subscription_changed' | 'authorization_changed' | 'verification_failed'
export interface CallbackDiagnostic { reason: CallbackReason; phase: CallbackPhase; status?: number; networkCode?: string }
const safeStatus = (status?: number) => Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}
const safeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_INVALID_IP_ADDRESS',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'EPROTO'])
const safeCode = (code: unknown) => typeof code === 'string' && safeCodes.has(code) ? { networkCode: code } : {}
export class CallbackFailure extends Error {
  constructor(readonly reason: CallbackReason, readonly phase: CallbackPhase, readonly status?: number, readonly networkCode?: string) {
    super(reason === 'callback_blocked' ? 'MCP_CALLBACK_ADDRESS_BLOCKED' : reason === 'response_too_large' ? 'MCP_CALLBACK_RESPONSE_LIMIT' : 'MCP_CALLBACK_' + reason.toUpperCase())
  }
}
// Never serialize a raw Error, message, cause, address, response or arbitrary error code.
export function callbackDiagnostic(error: unknown, phase: CallbackPhase = 'verification', status?: number): CallbackDiagnostic {
  if (error instanceof CallbackFailure) return { reason: error.reason, phase: error.phase, ...safeStatus(error.status ?? status), ...safeCode(error.networkCode) }
  const code = (error as any)?.code, message = error instanceof Error ? error.message : ''
  const reason: CallbackReason = message === 'MCP_CALLBACK_TIMEOUT' || code === 'ETIMEDOUT' ? 'timeout' :
    message === 'MCP_CALLBACK_ADDRESS_BLOCKED' || message === 'MCP_CALLBACK_NOT_PUBLIC_HTTPS' ? 'callback_blocked' :
    message === 'MCP_CALLBACK_RESPONSE_LIMIT' ? 'response_too_large' :
    message === 'MCP_SUBSCRIPTION_EXPIRED' || message === 'subscription_expired' ? 'subscription_expired' :
    message === 'subscription_changed' ? 'subscription_changed' :
    phase === 'authorization' ? 'authorization_changed' : phase === 'dns' ? 'dns_failed' :
    ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'EPROTO'].includes(code) ? 'tls_failed' :
    ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_INVALID_IP_ADDRESS'].includes(code) ? 'connection_failed' :
    phase === 'connect' || phase === 'response' ? 'network_failed' : 'verification_failed'
  return { reason, phase, ...safeStatus(status), ...safeCode(code) }
}
// Node's autoSelectFamily requests all:true; pinning still returns exactly one validated address.
export function pinnedCallbackLookup(selected: { address: string; family: number }) {
  return (_host: string, opts: any, callback: any) => opts?.all
    ? callback(null, [{ address: selected.address, family: selected.family }])
    : callback(null, selected.address, selected.family)
}
export const publicHttpsPost: WebhookPost = async (value, body, headers, options = {}) => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    let phase: CallbackPhase = 'authorization', status: number | undefined
    const deadline = Math.min(Date.now() + 10000, options.deadlineAt ?? Infinity)
    if (!Number.isFinite(deadline) || deadline <= Date.now()) { reject(Error('MCP_CALLBACK_TIMEOUT')); return }
    async function preflight() {
      if (controller.signal.aborted || Date.now() >= deadline) throw Error('MCP_CALLBACK_TIMEOUT')
      await options.preflight?.()
      if (controller.signal.aborted || Date.now() >= deadline) throw Error('MCP_CALLBACK_TIMEOUT')
    }
    // Absolute deadline covers DNS, TCP/TLS and even a peer continuously trickling bytes.
    const timer = setTimeout(() => { controller.abort(); reject(new CallbackFailure('timeout', phase, status)) }, Math.max(1, deadline - Date.now()))
    const finish = (error?: Error, result?: { status: number; body: string }) => {
      clearTimeout(timer)
      if (error) { const d = callbackDiagnostic(error, phase, status); reject(new CallbackFailure(d.reason, d.phase, d.status, d.networkCode)) } else resolve(result!)
    }
    void (async () => {
      await preflight()
      phase = 'validation'; const url = publicCallbackUrl(value)
      phase = 'dns'; const addresses = await lookup(url.hostname, { all: true, verbatim: true })
      if (controller.signal.aborted) return
      if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw Error('MCP_CALLBACK_ADDRESS_BLOCKED')
      const selected = addresses[0]
      phase = 'authorization'; await preflight()
      phase = 'connect'
      const req = request(url, { method: 'POST', signal: controller.signal, headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      agent: false, servername: url.hostname, lookup: pinnedCallbackLookup(selected) as any }, res => {
      phase = 'response'; status = res.statusCode
      let text = '', size = 0
      res.on('data', chunk => { size += chunk.length; if (size > 4096) {
        finish(new CallbackFailure('response_too_large', 'response', status)); res.destroy(Error('MCP_CALLBACK_RESPONSE_LIMIT'))
      } else text += chunk.toString('utf8') })
      res.on('end', () => finish(undefined, { status: res.statusCode || 500, body: text })); res.on('error', finish)
      res.on('aborted', () => finish(new CallbackFailure('response_incomplete', 'response', status)))
    })
      req.on('error', finish); req.end(body)
    })().catch(finish)
  })
}
