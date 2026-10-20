import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { Webhook } from 'standardwebhooks'
import { ProtocolError } from '@modelcontextprotocol/server'
import { EventOwner, EventRepository, Subscription, eventCatalog, subscribeInput, unsubscribeInput, taskEvent } from './eventsContract'
import { assertAgentPilotStamp } from '../agentTasks/pilot'
import { WebhookPost, publicCallbackUrl } from './webhookDelivery'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const ownerKey = (owner: EventOwner) => [owner.storeId, owner.agentId, owner.subjectKey, ...(owner.pilot ? [owner.pilot.id, owner.pilot.startedAt, owner.pilot.expiresAt] : [])]
const subscriptionId = (owner: EventOwner, v: { name: string; arguments: { taskId: string }; delivery: { url: string } }) =>
  hash([ownerKey(owner), v.delivery.url, v.name, v.arguments.taskId])
const same = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const secretValid = (secret: string) => /^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) && (() => {
  const encoded = secret.slice(6), decoded = Buffer.from(encoded, 'base64')
  return decoded.length >= 24 && decoded.length <= 64 && decoded.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '')
})()
export function taskEvents(options: { repository: EventRepository; post: WebhookPost;
  authorize: (owner: EventOwner, taskId: string) => Promise<void>;
  audit: (event: { action: string; subscriptionId: string; storeId: string; status?: number }) => Promise<void>;
  now?: () => number }) {
  const now = options.now || Date.now
  const active = (owner: EventOwner) => assertAgentPilotStamp(owner, now())
  const pilotEnd = (owner: EventOwner) => owner.pilot ? Date.parse(owner.pilot.expiresAt) : Infinity
  const withinPilot = (owner: EventOwner) => { try { active(owner); return true } catch { return false } }
  const windowEnd = (sub: Subscription) => Math.min(sub.expiresAt, pilotEnd(sub.owner))
  async function authorized(owner: EventOwner, taskId: string) {
    active(owner); await options.authorize(owner, taskId); active(owner)
  }
  async function post(sub: Subscription, value: unknown, eventId: string) {
    active(sub.owner)
    if (now() >= windowEnd(sub)) throw Error('MCP_SUBSCRIPTION_EXPIRED')
    publicCallbackUrl(sub.url)
    const body = JSON.stringify(value), at = new Date(now())
    if (Buffer.byteLength(body) > 262144) throw Error('MCP_EVENT_SIZE_LIMIT')
    const signatures = [new Webhook(sub.secret).sign(eventId, at, body)]
    if (sub.previousSecret && sub.rotateUntil! > now()) signatures.push(new Webhook(sub.previousSecret).sign(eventId, at, body))
    return options.post(sub.url, body, { 'Content-Type': 'application/json', 'webhook-id': eventId,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)), 'webhook-signature': signatures.join(' '), 'X-MCP-Subscription-Id': sub.id }, { deadlineAt: windowEnd(sub), preflight: async () => {
        await authorized(sub.owner, sub.taskId)
        if (now() >= windowEnd(sub)) throw Error('MCP_SUBSCRIPTION_EXPIRED')
      } })
  }
  return {
    async list(owner: EventOwner, taskId: string) { await authorized(owner, taskId); return { events: eventCatalog() } },
    // Catalog discovery itself is authorized by the handler; subscriptions additionally check exact task access.
    catalog: eventCatalog,
    async subscribe(owner: EventOwner, input: unknown) {
      active(owner)
      const v = subscribeInput.parse(input); publicCallbackUrl(v.delivery.url)
      if (!secretValid(v.delivery.secret)) throw new ProtocolError(-32602, 'Invalid signing key')
      await authorized(owner, v.arguments.taskId)
      const id = subscriptionId(owner, v), at = now()
      const sub = await options.repository.transaction(owner.storeId, state => {
        active(owner)
        state.subscriptions = state.subscriptions.filter(s => s.expiresAt > at && s.secret !== '')
        const old = state.subscriptions.find(s => s.id === id)
        if (!old && state.subscriptions.length >= 100) throw Error('MCP_SUBSCRIPTION_LIMIT')
        const value: Subscription = { id, owner, name: v.name, taskId: v.arguments.taskId, url: v.delivery.url, secret: v.delivery.secret,
          expiresAt: Math.min(at + Math.min(v.ttlMs ?? 3600000, 86400000), pilotEnd(owner)), generation: randomUUID(), active: false,
          ...(old?.secret && old.secret !== v.delivery.secret ? { previousSecret: old.secret, rotateUntil: Math.min(at + 60000, pilotEnd(owner)) } : {}) }
        if (old) state.subscriptions[state.subscriptions.indexOf(old)] = value; else state.subscriptions.push(value)
        return { ...value }
      })
      try {
        const challenge = randomUUID(), response = await post(sub, { type: 'verification', challenge }, randomUUID())
        active(owner)
        if (now() >= sub.expiresAt) throw Error('subscription_expired')
        const echoed = JSON.parse(response.body)?.challenge
        if (response.status < 200 || response.status >= 300 || typeof echoed !== 'string' || !same(echoed, challenge)) throw Error('challenge_failed')
        await authorized(owner, v.arguments.taskId)
        await options.repository.transaction(owner.storeId, state => {
          active(owner)
          const current = state.subscriptions.find(s => s.id === id)
          if (current && current.expiresAt <= now()) throw Error('subscription_expired')
          if (!current || current.generation !== sub.generation) throw Error('subscription_changed')
          current.active = true
        })
      } catch {
        await options.repository.transaction(owner.storeId, state => { const current = state.subscriptions.find(s => s.id === id); if (current?.generation === sub.generation) { current.active = false; current.secret = ''; delete current.previousSecret } })
        await options.audit({ action: 'callback_verification_failed', subscriptionId: id, storeId: owner.storeId })
        throw new ProtocolError(-32015, 'Callback endpoint verification failed', { reason: 'challenge_failed' })
      }
      await options.audit({ action: 'subscribed', subscriptionId: id, storeId: owner.storeId })
      return { id, refreshBefore: new Date(sub.expiresAt).toISOString(), cursor: null, truncated: false }
    },
    async unsubscribe(owner: EventOwner, input: unknown) {
      const v = unsubscribeInput.parse(input), id = subscriptionId(owner, v)
      // Identity includes the authenticated owner; cannot cancel another owner's subscription.
      await options.repository.transaction(owner.storeId, state => {
        const sub = state.subscriptions.find(s => s.id === id)
        if (sub) { sub.active = false; sub.generation = randomUUID(); sub.secret = ''; delete sub.previousSecret }
      })
      await options.audit({ action: 'unsubscribed', subscriptionId: id, storeId: owner.storeId }); return {}
    },
    // Called with a durable backend outbox event. Retrying the same event is safe; no independent business queue.
    async deliver(storeId: string, input: unknown) {
      const event = taskEvent.parse(input), eventHash = hash(event)
      // Dedupe retention and allowed replay age share one horizon: eviction cannot make an old event executable again.
      const horizon = 7 * 86400000, eventAt = Date.parse(event.timestamp)
      if (eventAt < now() - horizon || eventAt > now() + 300000) throw Error('MCP_EVENT_OUTSIDE_DELIVERY_WINDOW')
      const subscriptions = await options.repository.transaction(storeId, state => state.subscriptions.filter(s =>
        s.active && s.name === event.name && s.taskId === event.data.taskId && s.expiresAt > now() && withinPilot(s.owner)).map(s => ({ ...s })))
      const outcomes: { subscriptionId: string; state: string; retryAt?: number }[] = []
      for (const sub of subscriptions) {
        try { await authorized(sub.owner, sub.taskId) } catch {
          await options.repository.transaction(storeId, state => { const current = state.subscriptions.find(s => s.id === sub.id); if (current?.generation === sub.generation) { current.active = false; current.generation = randomUUID(); current.secret = ''; delete current.previousSecret } })
          await options.audit({ action: 'subscription_access_revoked', subscriptionId: sub.id, storeId: sub.owner.storeId }); continue
        }
        const key = sub.id + ':' + event.eventId, claim = randomUUID()
        const acquired = await options.repository.transaction<{ claimed: boolean; state?: string; retryAt?: number }>(storeId, state => {
          for (const [id, row] of Object.entries(state.deliveries)) if (row.expiresAt <= now()) delete state.deliveries[id]
          const current = state.subscriptions.find(s => s.id === sub.id), old = state.deliveries[key]
          if (old && old.eventHash !== eventHash) throw Error('MCP_EVENT_ID_REUSED')
          // Retain accepted dedupe/audit history; its retention never grants a longer delivery window.
          if (old && sub.owner.pilot) {
            old.deliveryUntil = Math.min(old.deliveryUntil ?? Infinity, pilotEnd(sub.owner))
            old.nextAt = Math.min(old.nextAt, windowEnd(sub))
          }
          if (!current?.active || current.generation !== sub.generation || current.expiresAt <= now() || !withinPilot(current.owner)) return { claimed: false, state: 'inactive' }
          if (old && (old.state === 'accepted' || old.state === 'stopped' || old.nextAt > now())) return { claimed: false, state: old.state, ...(old.state === 'retry' || old.state === 'sending' ? { retryAt: old.nextAt } : {}) }
          if (!old && Object.keys(state.deliveries).length >= 5000) throw Error('MCP_DELIVERY_LEDGER_LIMIT')
          state.deliveries[key] = { eventHash, attempts: (old?.attempts || 0) + 1, state: 'sending', nextAt: Math.min(now() + 30000, windowEnd(sub)), expiresAt: eventAt + horizon, ...(sub.owner.pilot ? { deliveryUntil: pilotEnd(sub.owner) } : {}), generation: sub.generation, claim }
          return { claimed: true }
        })
        if (!acquired.claimed) { outcomes.push({ subscriptionId: sub.id, state: acquired.state!, ...(acquired.retryAt ? { retryAt: acquired.retryAt } : {}) }); continue }
        let status = 0
        try { status = (await post(sub, event, event.eventId)).status } catch { /* bounded retry, sanitized diagnostic below */ }
        const outcome = await options.repository.transaction(storeId, state => {
          const row = state.deliveries[key]
          if (!row || row.claim !== claim) return { state: 'superseded' }
          const accepted = status >= 200 && status < 300
          row.state = accepted ? 'accepted' : now() >= windowEnd(sub) || !withinPilot(sub.owner) ? 'stopped' : status === 410 || status === 413 || (status >= 400 && status < 500 && status !== 429) || row.attempts >= 5 ? 'stopped' : 'retry'
          if (status === 410) { const current = state.subscriptions.find(s => s.id === sub.id); if (current?.generation === sub.generation) { current.active = false; current.generation = randomUUID(); current.secret = ''; delete current.previousSecret } }
          row.nextAt = Math.min(now() + Math.min(1000 * 2 ** row.attempts, 60000), windowEnd(sub))
          return { state: row.state, ...(row.state === 'retry' ? { retryAt: row.nextAt } : {}) }
        })
        await options.audit({ action: 'delivery_' + outcome.state, subscriptionId: sub.id, storeId: sub.owner.storeId, status })
        outcomes.push({ subscriptionId: sub.id, ...outcome })
      }
      return outcomes
    }
  }
}
