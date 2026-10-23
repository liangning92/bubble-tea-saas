import type { StaffUser } from '../stores/auth'

export const OFFLINE_LOGIN_DAYS = 30
export const OFFLINE_LOGIN_TTL = OFFLINE_LOGIN_DAYS * 86400000
const PREFIX = 'employee-offline-login.v1:'
const ITERATIONS = 210000
export type OfflineIdentity = Pick<StaffUser, 'id' | 'phone' | 'name' | 'role' | 'storeId' | 'storeName' | 'staffId' | 'position'>
interface Grant { version: 1; backend: string; phone: string; user: OfflineIdentity; salt: number[]; verifier: number[]; issuedAt: number; expiresAt: number }
export function loginBackend(base: string): string {
  return new URL(base.replace(/\/$/, ''), window.location.origin).href.replace(/\/$/, '')
}
const key = (backend: string, phone: string) => PREFIX + encodeURIComponent(backend) + ':' + encodeURIComponent(phone)
export function temporaryLoginFailure(error: any): boolean {
  const status = error?.response?.status
  return !error?.response || [502, 503, 504].includes(status) || (status >= 520 && status <= 530)
}
async function verifier(password: string, salt: number[]): Promise<number[]> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return Array.from(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: ITERATIONS }, material, 256)))
}
export function forgetOfflineLogin(backend: string, phone: string): void {
  localStorage.removeItem(key(backend, phone))
}
export async function prepareOfflineLogin(backend: string, user: StaffUser, password: string): Promise<number> {
  if (!user.id || !user.staffId || !user.storeId || !user.phone) throw new Error('auth.staffMissing')
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)))
  const issuedAt = Date.now(), expiresAt = issuedAt + OFFLINE_LOGIN_TTL
  const { id, phone, name, role, storeId, storeName, staffId, position } = user
  const grant: Grant = { version: 1, backend, phone, user: { id, phone, name, role, storeId, storeName, staffId, position }, salt, verifier: await verifier(password, salt), issuedAt, expiresAt }
  localStorage.setItem(key(backend, phone), JSON.stringify(grant))
  return expiresAt
}
export async function unlockOfflineLogin(backend: string, phone: string, password: string): Promise<{user: OfflineIdentity; expiresAt: number}> {
  let grant: Grant
  try { grant = JSON.parse(localStorage.getItem(key(backend, phone)) || 'null') } catch { throw new Error('auth.offlineMissing') }
  if (!grant || grant.version !== 1 || grant.backend !== backend || grant.phone !== phone || grant.user?.phone !== phone || !grant.user?.id || !grant.user?.staffId || !grant.user?.storeId) throw new Error('auth.offlineMissing')
  const now = Date.now()
  if (!Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt) || now < grant.issuedAt || now >= grant.expiresAt || grant.expiresAt - grant.issuedAt !== OFFLINE_LOGIN_TTL) throw new Error('auth.offlineExpired')
  if (!Array.isArray(grant.salt) || grant.salt.length !== 32 || !Array.isArray(grant.verifier) || grant.verifier.length !== 32 || ![...grant.salt, ...grant.verifier].every(x => Number.isInteger(x) && x >= 0 && x <= 255)) throw new Error('auth.offlineMissing')
  const actual = await verifier(password, grant.salt)
  let different = 0
  actual.forEach((value, index) => { different |= value ^ grant.verifier[index] })
  if (different) throw new Error('auth.invalidCredentials')
  return { user: grant.user, expiresAt: grant.expiresAt }
}
