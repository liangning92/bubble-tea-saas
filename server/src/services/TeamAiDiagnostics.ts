// Only structured, allowlisted metadata may leave the non-success response reader.
// No response text, messages, arbitrary nested fields, or header collections survive.
const businessCategories: Record<number, string> = {
  1000: 'reported_system', 1001: 'reported_timeout', 1002: 'reported_rate_limit',
  1004: 'reported_authentication', 1008: 'reported_quota', 1013: 'reported_system',
  1024: 'reported_system', 1026: 'reported_content_filter', 1027: 'reported_content_filter',
  1033: 'reported_system', 1039: 'reported_limit', 1041: 'reported_limit',
  1042: 'reported_invalid_request', 1043: 'reported_invalid_request', 1044: 'reported_invalid_request',
  2013: 'reported_invalid_request', 20132: 'reported_invalid_request',
  2037: 'reported_invalid_request', 2038: 'reported_permission', 2039: 'reported_invalid_request',
  2042: 'reported_permission', 2045: 'reported_rate_limit', 2048: 'reported_invalid_request',
  2049: 'reported_authentication', 2056: 'reported_quota'
}
const errorCategories: Record<string, string> = {
  authentication_error: 'reported_authentication', permission_error: 'reported_permission',
  invalid_request_error: 'reported_invalid_request', not_found_error: 'reported_not_found',
  rate_limit_error: 'reported_rate_limit', api_error: 'reported_system',
  overloaded_error: 'reported_capacity'
}
const bodyStatuses = ['json', 'non_json', 'too_large', 'unavailable', 'empty'] as const
export interface ProviderDiagnostics {
  category: string; bodyStatus: typeof bodyStatuses[number]; businessCode?: number
  traceId?: string; traceSource?: 'response_header' | 'response_body'
}
const categories = new Set(['unknown', ...Object.values(businessCategories), ...Object.values(errorCategories)])
function traceId(value: unknown, protectedText: string[] = []) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{16,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(value)) return undefined
  const candidate = value.toLowerCase()
  if (!/[a-f]/.test(candidate) || !/[0-9]/.test(candidate)) return undefined
  // Never echo a credential or submitted text disguised as a trace identifier.
  if (protectedText.some(text => text && text.toLowerCase().includes(candidate))) return undefined
  return value
}
export function visibleProviderDiagnostics(value: unknown): ProviderDiagnostics | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as ProviderDiagnostics
  if (!bodyStatuses.includes(v.bodyStatus) || !categories.has(v.category)) return undefined
  const code = Number.isInteger(v.businessCode) && Object.hasOwn(businessCategories, v.businessCode) ? v.businessCode : undefined
  const trace = traceId(v.traceId), source = ['response_header', 'response_body'].includes(v.traceSource) ? v.traceSource : undefined
  return { category: v.category, bodyStatus: v.bodyStatus, ...(code !== undefined ? { businessCode: code } : {}),
    ...(trace && source ? { traceId: trace, traceSource: source } : {}) }
}
export async function readProviderDiagnostics(response: Response, protectedText: string[]): Promise<ProviderDiagnostics> {
  const trace = traceId(response.headers.get('trace_id'), protectedText)
  const base: ProviderDiagnostics = { category: 'unknown', bodyStatus: 'unavailable',
    ...(trace ? { traceId: trace, traceSource: 'response_header' } : {}) }
  const reader = response.body?.getReader()
  if (!reader) return { ...base, bodyStatus: 'empty' }
  let timer: ReturnType<typeof setTimeout>
  const read = async (): Promise<ProviderDiagnostics> => {
    const chunks: Uint8Array[] = []; let bytes = 0
    while (true) {
      const part = await reader.read(); if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 4096) return { ...base, bodyStatus: 'too_large' }
      chunks.push(part.value)
    }
    if (!bytes) return { ...base, bodyStatus: 'empty' }
    let value: any
    try { value = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) }
    catch { return { ...base, bodyStatus: 'non_json' } }
    const code = value?.base_resp?.status_code
    const knownCode = Number.isInteger(code) && Object.hasOwn(businessCategories, code) ? code as number : undefined
    const type = value?.error?.type
    const category = knownCode !== undefined ? businessCategories[knownCode]
      : typeof type === 'string' && Object.hasOwn(errorCategories, type) ? errorCategories[type] : 'unknown'
    const bodyTrace = !trace ? traceId(value?.trace_id, protectedText) : undefined
    return { ...base, bodyStatus: 'json', category, ...(knownCode !== undefined ? { businessCode: knownCode } : {}),
      ...(bodyTrace ? { traceId: bodyTrace, traceSource: 'response_body' } : {}) }
  }
  try {
    return await Promise.race([read(), new Promise<ProviderDiagnostics>(resolve => {
      timer = setTimeout(() => resolve(base), 1500)
    })])
  } catch { return base }
  finally {
    clearTimeout(timer)
    // Cancellation must not delay returning the already-known HTTP outcome.
    void reader.cancel().catch(() => {})
    try { reader.releaseLock() } catch {}
  }
}
