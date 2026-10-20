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
export const publicHttpsPost: WebhookPost = async (value, body, headers, options = {}) => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const deadline = Math.min(Date.now() + 10000, options.deadlineAt ?? Infinity)
    if (!Number.isFinite(deadline) || deadline <= Date.now()) { reject(Error('MCP_CALLBACK_TIMEOUT')); return }
    async function preflight() {
      if (controller.signal.aborted || Date.now() >= deadline) throw Error('MCP_CALLBACK_TIMEOUT')
      await options.preflight?.()
      if (controller.signal.aborted || Date.now() >= deadline) throw Error('MCP_CALLBACK_TIMEOUT')
    }
    // Absolute deadline covers DNS, TCP/TLS and even a peer continuously trickling bytes.
    const timer = setTimeout(() => { controller.abort(); reject(Error('MCP_CALLBACK_TIMEOUT')) }, Math.max(1, deadline - Date.now()))
    const finish = (error?: Error, result?: { status: number; body: string }) => {
      clearTimeout(timer); if (error) reject(error); else resolve(result!)
    }
    void (async () => {
      await preflight()
      const url = publicCallbackUrl(value), addresses = await lookup(url.hostname, { all: true, verbatim: true })
      if (controller.signal.aborted) return
      if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw Error('MCP_CALLBACK_ADDRESS_BLOCKED')
      const selected = addresses[0]
      await preflight()
      const req = request(url, { method: 'POST', signal: controller.signal, headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      agent: false, servername: url.hostname, lookup: ((_host: string, _opts: any, callback: any) => callback(null, selected.address, selected.family)) as any }, res => {
      let text = '', size = 0
      res.on('data', chunk => { size += chunk.length; if (size > 4096) res.destroy(Error('MCP_CALLBACK_RESPONSE_LIMIT')); else text += chunk.toString('utf8') })
      res.on('end', () => finish(undefined, { status: res.statusCode || 500, body: text })); res.on('error', finish)
    })
      req.on('error', finish); req.end(body)
    })().catch(finish)
  })
}
