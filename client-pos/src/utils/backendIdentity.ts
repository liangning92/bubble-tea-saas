import { getApiUrl, normalizeApiUrl } from '../config'

export function backendIdentity(url: string): string {
  const parsed = new URL(normalizeApiUrl(url), window.location.href)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('CHECKOUT_BACKEND_INVALID')
  }
  return parsed.href.replace(/\/$/, '')
}

export function currentBackendIdentity(): string {
  return backendIdentity(getApiUrl())
}

export function readBackendAuth(): {token?: string; apiUrl?: string; user?: {id?: string; storeId?: string; role?: string; staff?:{id?:string}}} {
  try { return JSON.parse(sessionStorage.getItem('pos-auth') || '{}').state || {} } catch { return {} }
}

export function assertBackendAuth(target: string, storeId?: string): void {
  const auth = readBackendAuth()
  if (!auth.token || !auth.apiUrl || backendIdentity(auth.apiUrl) !== target ||
      (storeId && auth.user?.storeId !== storeId)) throw new Error('CHECKOUT_BACKEND_LOGIN_REQUIRED')
}

export function assertCheckoutBackend(original: string | undefined, storeId: string): string {
  if (!original) throw new Error('CHECKOUT_BACKEND_EVIDENCE_REQUIRED')
  const target = backendIdentity(original)
  if (target !== currentBackendIdentity()) throw new Error('CHECKOUT_BACKEND_CHANGED')
  assertBackendAuth(target, storeId)
  return target
}

export function backendAuthHeaders(target: string, storeId?: string): {Authorization: string} {
  assertBackendAuth(backendIdentity(target), storeId)
  return { Authorization: `Bearer ${readBackendAuth().token}` }
}
