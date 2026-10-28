import { createHash, randomUUID } from 'crypto'

/** Trusted-host policy. These values come from current backend identities and
 * account policies, never from model/tool arguments. No bearer secrets are kept
 * here. providerBinding identifies the existing subscription's saved route. */
export interface NativeMemoryIdentity {
  storeId: string
  agentId: string
  channelId: string
  audience: { staffId: string; userId: string; role: string; permissions: readonly string[] }[]
  permissionPolicy: unknown
}
export interface NativeExecutionContext {
  executionId: string
  rootExecutionId: string
  storeId: string
  agentId: string
  channelId: string
  audienceHash: string
  authorityFingerprint: string
  memoryNamespace: string
  providerBinding: { subscriptionId: string; model: string; endpoint: string; credentialRef: string }
  delivery: 'channel' | 'parent_only'
  parentExecutionId?: string
  parentToolCallId?: string
}
const deny = (code: string): never => { throw new Error(code) }
function canonical(value: any): any {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
  return deny('NATIVE_POLICY_JSON_REQUIRED')
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const fingerprint = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)

/** Task IDs, task versions and execution IDs intentionally do not participate.
 * Membership/role/permission changes do: a new audience cannot inherit old private
 * memory. Caller must resolve the actual current backend account policies first. */
export function stableNativeMemoryNamespace(identity: NativeMemoryIdentity): string {
  if (!nonempty(identity.storeId) || !nonempty(identity.agentId) || !nonempty(identity.channelId) || !Array.isArray(identity.audience) || !identity.audience.length)
    return deny('NATIVE_MEMORY_IDENTITY_REQUIRED')
  const audience = identity.audience.map(a => {
    if (!nonempty(a.staffId) || !nonempty(a.userId) || !nonempty(a.role) || !Array.isArray(a.permissions) || a.permissions.some(p => !nonempty(p)))
      return deny('NATIVE_MEMORY_ACCOUNT_POLICY_REQUIRED')
    return { staffId: a.staffId, userId: a.userId, role: a.role, permissions: [...new Set(a.permissions)].sort() }
  }).sort((a, b) => a.staffId.localeCompare(b.staffId))
  if (new Set(audience.map(a => a.staffId)).size !== audience.length) return deny('NATIVE_MEMORY_DUPLICATE_AUDIENCE')
  return hash({ version: 1, storeId: identity.storeId, agentId: identity.agentId, channelId: identity.channelId, audience, permissionPolicy: identity.permissionPolicy })
}

function validateContext(context: NativeExecutionContext): void {
  if (!context || !uuid(context.executionId) || !uuid(context.rootExecutionId) || !nonempty(context.storeId) || !nonempty(context.agentId) || !nonempty(context.channelId)
      || !fingerprint(context.audienceHash) || !fingerprint(context.authorityFingerprint) || !fingerprint(context.memoryNamespace)) deny('NATIVE_CONTEXT_INVALID')
  const p = context.providerBinding
  if (!p || !nonempty(p.subscriptionId) || !nonempty(p.model) || !nonempty(p.credentialRef)) deny('NATIVE_PROVIDER_BINDING_REQUIRED')
  let endpoint: URL
  try { endpoint = new URL(p.endpoint) } catch { return deny('NATIVE_PROVIDER_ENDPOINT_INVALID') }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) deny('NATIVE_PROVIDER_ENDPOINT_INVALID')
  if (context.delivery === 'channel') {
    if (context.parentExecutionId || context.parentToolCallId || context.rootExecutionId !== context.executionId) deny('NATIVE_ROOT_LINEAGE_INVALID')
  } else if (context.delivery === 'parent_only') {
    if (!uuid(context.parentExecutionId) || !nonempty(context.parentToolCallId) || context.parentExecutionId === context.executionId || context.rootExecutionId === context.executionId) deny('NATIVE_CHILD_LINEAGE_INVALID')
  } else deny('NATIVE_DELIVERY_INVALID')
}

/** Only IDs assigned by the host to a recorded delegate call may be supplied.
 * Native model/provider/toolset overrides never become new business authority.
 * This function derives policy; the host must separately mint a child-scoped
 * callback/provider bearer bound to this exact execution and parent lineage. */
export function deriveNativeChildContext(parent: NativeExecutionContext, input: { executionId: string; parentToolCallId: string }): NativeExecutionContext {
  validateContext(parent)
  if (!input || Object.keys(input).some(k => !['executionId', 'parentToolCallId'].includes(k)) || !uuid(input.executionId) || !nonempty(input.parentToolCallId)
      || input.executionId === parent.executionId || input.executionId === parent.rootExecutionId) deny('NATIVE_CHILD_DERIVATION_DENIED')
  return { ...structuredClone(parent), executionId: input.executionId, parentExecutionId: parent.executionId, parentToolCallId: input.parentToolCallId, delivery: 'parent_only' }
}

const scopeFields = ['storeId', 'agentId', 'channelId', 'audienceHash', 'authorityFingerprint', 'memoryNamespace', 'providerBinding', 'rootExecutionId'] as const
/** Checks identity/data/route isolation, allowing independent execution IDs. */
export function assertNativeContextIsolation(expected: NativeExecutionContext, actual: NativeExecutionContext): void {
  validateContext(expected); validateContext(actual)
  if (scopeFields.some(k => hash(expected[k]) !== hash(actual[k]))) deny('NATIVE_CONTEXT_SCOPE_CHANGED')
}
export function assertNativeChildContext(parent: NativeExecutionContext, child: NativeExecutionContext): void {
  assertNativeContextIsolation(parent, child)
  if (child.delivery !== 'parent_only' || child.parentExecutionId !== parent.executionId || child.executionId === parent.executionId) deny('NATIVE_CHILD_LINEAGE_INVALID')
}
export function assertNativeDelivery(context: NativeExecutionContext, target: { destination: 'channel' | 'parent'; id: string; audienceHash?: string }): void {
  validateContext(context)
  if (context.delivery === 'parent_only') {
    if (target.destination !== 'parent' || target.id !== context.parentExecutionId) deny('NATIVE_CHILD_PUBLICATION_DENIED')
  } else if (target.destination !== 'channel' || target.id !== context.channelId || target.audienceHash !== context.audienceHash) deny('NATIVE_OUTPUT_AUDIENCE_CHANGED')
}

export type NativeSubscriptionBudget = { state: 'unknown' | 'exhausted' } | { state: 'available'; remainingCalls: number }
export interface NativeProviderLease { id: string; executionId: string; release(outcome?: 'complete' | 'unknown'): void }
interface WaitingCall {
  executionId: string; resolve: (lease: NativeProviderLease) => void; reject: (error: Error) => void
  signal?: AbortSignal; onAbort?: () => void; timer?: ReturnType<typeof setTimeout>
}

/** Provider-call concurrency, not agent-lifetime concurrency. A parent releases its
 * permit after each actual response before waiting for children. Every attempted
 * call consumes its reservation; an unknown outcome is never refunded/replayed.
 * One trusted backend process owns this pool. Multi-process deployments must use
 * an equivalent atomic shared lease store, not one pool per gateway process. */
export class NativeProviderCallPool {
  private budget: NativeSubscriptionBudget = { state: 'unknown' }
  private waiting: WaitingCall[] = []
  private active = new Map<string, string>()
  private admitted = 0
  private uncertain = 0
  constructor(readonly subscriptionId: string, readonly maxConcurrency: number) {
    if (!nonempty(subscriptionId) || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) deny('NATIVE_PROVIDER_POOL_INVALID')
  }
  /** A current subscription check supplies this value; never accept model claims. */
  setBudget(budget: NativeSubscriptionBudget): void {
    if (!budget || !['unknown', 'exhausted', 'available'].includes(budget.state) || budget.state === 'available' && (!Number.isSafeInteger(budget.remainingCalls) || budget.remainingCalls < 0)) deny('NATIVE_PROVIDER_BUDGET_INVALID')
    this.budget = budget.state === 'available' && budget.remainingCalls === 0 ? { state: 'exhausted' } : structuredClone(budget)
    this.drain()
  }
  acquire(input: { executionId: string; subscriptionId: string; signal?: AbortSignal; deadlineAt?: number }): Promise<NativeProviderLease> {
    if (!uuid(input.executionId) || input.subscriptionId !== this.subscriptionId) return Promise.reject(new Error('NATIVE_PROVIDER_SUBSCRIPTION_CHANGED'))
    if (input.signal?.aborted) return Promise.reject(new Error('NATIVE_PROVIDER_CALL_ABORTED'))
    if (input.deadlineAt !== undefined && (!Number.isFinite(input.deadlineAt) || input.deadlineAt <= Date.now())) return Promise.reject(new Error('NATIVE_PROVIDER_CALL_DEADLINE'))
    return new Promise((resolve, reject) => {
      const item: WaitingCall = { executionId: input.executionId, resolve, reject, signal: input.signal }
      const remove = (code: string) => {
        const index = this.waiting.indexOf(item)
        if (index < 0) return
        this.waiting.splice(index, 1); this.cleanup(item); reject(new Error(code))
      }
      item.onAbort = () => remove('NATIVE_PROVIDER_CALL_ABORTED')
      input.signal?.addEventListener('abort', item.onAbort, { once: true })
      if (input.deadlineAt !== undefined) item.timer = setTimeout(() => remove('NATIVE_PROVIDER_CALL_DEADLINE'), Math.min(2147483647, input.deadlineAt - Date.now()))
      this.waiting.push(item); this.drain()
    })
  }
  async withLease<T>(input: Parameters<NativeProviderCallPool['acquire']>[0], send: (lease: NativeProviderLease) => Promise<T>): Promise<T> {
    const lease = await this.acquire(input)
    try { const value = await send(lease); lease.release('complete'); return value }
    catch (error) { lease.release('unknown'); throw error }
  }
  snapshot() { return { subscriptionId: this.subscriptionId, maxConcurrency: this.maxConcurrency, active: this.active.size, queued: this.waiting.length, admittedCalls: this.admitted, unknownCalls: this.uncertain, budget: structuredClone(this.budget) } }
  private cleanup(item: WaitingCall): void {
    if (item.timer) clearTimeout(item.timer)
    if (item.onAbort) item.signal?.removeEventListener('abort', item.onAbort)
  }
  private drain(): void {
    if (this.budget.state !== 'available') {
      const code = this.budget.state === 'unknown' ? 'NATIVE_SUBSCRIPTION_QUOTA_UNKNOWN' : 'NATIVE_SUBSCRIPTION_QUOTA_EXHAUSTED'
      for (const item of this.waiting.splice(0)) { this.cleanup(item); item.reject(new Error(code)) }
      return
    }
    while (this.waiting.length && this.active.size < this.maxConcurrency && this.budget.remainingCalls > 0) {
      const item = this.waiting.shift()!; this.cleanup(item)
      if (item.signal?.aborted) { item.reject(new Error('NATIVE_PROVIDER_CALL_ABORTED')); continue }
      const id = randomUUID(); this.active.set(id, item.executionId); this.admitted++; this.budget.remainingCalls--
      let released = false
      item.resolve({ id, executionId: item.executionId, release: (outcome = 'complete') => {
        if (released) return
        released = true; this.active.delete(id); if (outcome === 'unknown') this.uncertain++
        this.drain()
      } })
    }
    if (this.budget.remainingCalls === 0) { this.budget = { state: 'exhausted' }; this.drain() }
  }
}
const sharedPools = new Map<string, NativeProviderCallPool>()
/** All local analyst/parent/child transports in this backend must get the same
 * subscription pool. A mismatched capacity is an error, never a second pool. */
export function getSharedNativeProviderCallPool(subscriptionId: string, maxConcurrency: number): NativeProviderCallPool {
  let pool = sharedPools.get(subscriptionId)
  if (pool && pool.maxConcurrency !== maxConcurrency) return deny('NATIVE_PROVIDER_POOL_CAPACITY_CONFLICT')
  if (!pool) { pool = new NativeProviderCallPool(subscriptionId, maxConcurrency); sharedPools.set(subscriptionId, pool) }
  return pool
}
