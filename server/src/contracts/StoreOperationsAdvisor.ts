/** Future integration boundary only: no route, provider, database or executor is registered. */
export interface AdvisorContext {
  /** Server-derived identity/scope; never copy these fields from a model or request body. */
  actorId: string
  authorizedStoreIds: readonly string[]
}
export interface OperationsEvidence {
  storeId: string
  sourceId: string
  observedAt: string
  source: 'application_record' | 'customer_payment_screenshot' | 'merchant_record'
  verification: 'unverified' | 'staff_confirmed' | 'provider_verified'
  summary: string
}
export interface AdviceRequest {
  requestId: string
  storeId: string
  intent: 'advise'
  question: string
  /** Supplied only by a future authorized, minimized read adapter. No photos/secrets. */
  evidence: readonly OperationsEvidence[]
}
export interface AdviceProvider {
  suggest(request: AdviceRequest): Promise<string>
}
export type AdviceResult = {
  requestId: string
  storeId: string
  actorId: string
  status: 'suggestion' | 'unavailable' | 'denied'
  message?: string
  reason?: 'scope' | 'write_not_enabled' | 'invalid_evidence' | 'no_provider' | 'provider_failure'
}
/** Output is untrusted advisory text. It is never parsed or dispatched as a command. */
export async function requestStoreAdvice(context: AdvisorContext, request: AdviceRequest, provider?: AdviceProvider): Promise<AdviceResult> {
  const audit = { requestId: request.requestId, storeId: request.storeId, actorId: context.actorId }
  if (!context.actorId || !context.authorizedStoreIds.includes(request.storeId) || request.evidence.some(item => item.storeId !== request.storeId)) {
    return { ...audit, status: 'denied', reason: 'scope' }
  }
  if (request.intent !== 'advise') return { ...audit, status: 'denied', reason: 'write_not_enabled' }
  if (request.evidence.some(item => item.source === 'customer_payment_screenshot' && item.verification === 'provider_verified')) {
    return { ...audit, status: 'denied', reason: 'invalid_evidence' }
  }
  if (!provider) return { ...audit, status: 'unavailable', reason: 'no_provider' }
  try {
    const message = await provider.suggest(request)
    if (typeof message !== 'string' || message.length > 10000) throw new Error('Invalid advice response')
    return { ...audit, status: 'suggestion', message }
  } catch {
    return { ...audit, status: 'unavailable', reason: 'provider_failure' }
  }
}
