import { API_BASE, http } from './api'
import { useAuthStore } from '../stores/auth'
export interface PushDeviceTest { id: string; createdAt: string; status: string; push: string; serviceAcceptedAt: string | null; attempts: number; deviceReportedDisplayedAt: string | null; deviceReportedOpenedAt: string | null }
export interface PushDeviceCheck { configured: boolean; subscription: { state: string }; test: PushDeviceTest | null }
export interface PushDeviceConfig { configured: boolean; publicKey: string | null }
export interface LocalPushDevice { supported: boolean; secure: boolean; online: boolean; ios: boolean; installed: boolean; permission: NotificationPermission | 'unsupported'; subscriptionId?: string; applicationKey?: string }
export const pushIdentity = () => { const s = useAuthStore.getState(); return `${s.user?.id}:${s.user?.storeId}:${s.token || ''}` }
export function pushDeviceClient(identity: string) {
  const session = useAuthStore.getState(), headers = { Authorization: `Bearer ${session.token || ''}`, 'X-Client-App': 'employee' }
  const current = () => pushIdentity() === identity && !!session.token && useAuthStore.getState().isAuthenticated
  async function request<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, data: unknown, signal: AbortSignal): Promise<T> {
    if (!current()) throw Error('PUSH_DEVICE_IDENTITY_CHANGED')
    const response = await http.request({ method, url: API_BASE + '/staff-work' + path, data, signal, headers })
    if (!current()) throw Error('PUSH_DEVICE_IDENTITY_CHANGED')
    return response.data.data as T
  }
  return { current,
    config: (signal: AbortSignal) => request<PushDeviceConfig>('get', '/my/push-device/config', undefined, signal),
    check: (subscriptionId: string | undefined, signal: AbortSignal, testId?: string) => request<PushDeviceCheck>('post', '/my/push-device/check', { subscriptionId, testId }, signal),
    save: (data: unknown, signal: AbortSignal) => request<{ id: string }>('put', '/my/subscription', data, signal),
    remove: (id: string, signal: AbortSignal) => request('delete', '/my/subscription', { id }, signal),
    test: (subscriptionId: string, requestId: string, signal: AbortSignal) => request<{ id: string }>('post', '/my/push-device/test', { subscriptionId, requestId }, signal),
    receipt: (subscriptionId: string, id: string, phase: 'displayed' | 'opened', signal: AbortSignal) => request('post', `/my/push-device/tests/${id}/receipt`, { subscriptionId, phase }, signal)
  }
}
export async function pushDeadline<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('PUSH_DEVICE_TIMEOUT')), ms) })]) }
  finally { clearTimeout(timer) }
}
export async function subscriptionId(endpoint: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('')
}
export async function readLocalPushDevice(): Promise<LocalPushDevice> {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const subscription = supported ? await pushDeadline(navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription())) : null
  return { ios, installed, supported, secure: window.isSecureContext, online: navigator.onLine,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    subscriptionId: subscription ? await subscriptionId(subscription.endpoint) : undefined,
    applicationKey: subscription?.options.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined }
}
// Serialize browser-level subscription changes across account/component switches.
let deviceMutation = Promise.resolve()
export function mutatePushDevice<T>(operation: () => Promise<T>): Promise<T> {
  const result = deviceMutation.then(operation)
  deviceMutation = result.then(() => {}, () => {})
  // A UI timeout must not release this queue while the browser mutation is still pending.
  return pushDeadline(result)
}
export async function connectPushDevice(publicKey: string, current: () => boolean = () => true, renew = false) {
  return mutatePushDevice(async () => {
    const guard = () => { if (!current()) throw Error('PUSH_DEVICE_IDENTITY_CHANGED') }
    guard(); await pushDeadline(navigator.serviceWorker.register('/employee-sw.js', { updateViaCache: 'none' })); guard()
    const registration = await pushDeadline(navigator.serviceWorker.ready); guard()
    const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), key = Uint8Array.from(raw, c => c.charCodeAt(0))
    const previous = await pushDeadline(registration.pushManager.getSubscription()); guard()
    const oldKey = previous?.options.applicationServerKey
    if (previous && (renew || !oldKey || oldKey.byteLength !== key.byteLength || !new Uint8Array(oldKey).every((v, i) => v === key[i]))) {
      guard(); await previous.unsubscribe(); guard()
    }
    const existing = await pushDeadline(registration.pushManager.getSubscription()); guard()
    return existing || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  })
}
export async function disconnectPushDevice(current: () => boolean) {
  return mutatePushDevice(async () => {
    if (!current()) return
    const registration = await pushDeadline(navigator.serviceWorker.getRegistration())
    if (!current()) return
    const subscription = await pushDeadline(registration?.pushManager.getSubscription() || Promise.resolve(null))
    if (current()) await subscription?.unsubscribe()
  })
}
export async function localTestReceipt(id: string): Promise<{ displayedAt?: string; openedAt?: string } | null> {
  const registration = await navigator.serviceWorker?.getRegistration()
  if (!registration?.active) return null
  const channel = new MessageChannel()
  try {
    return await pushDeadline(new Promise(resolve => {
      channel.port1.onmessage = event => resolve(event.data?.id === id ? event.data : null)
      registration.active!.postMessage({ type: 'EMPLOYEE_PUSH_TEST_RECEIPT', id }, [channel.port2])
    }), 1500)
  } catch { return null } finally { channel.port1.close(); channel.port2.close() }
}
