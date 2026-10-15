import { POS_OFFLINE_TTL_MS, POS_OFFLINE_DAYS } from '../../../shared/utils/offlinePolicy'
import { backendIdentity, currentBackendIdentity } from '../utils/backendIdentity'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import bcrypt from 'bcryptjs'
import { saveOfflineCredentials, clearOfflineCredentials, getOfflineCredentials, OfflineCredentials } from '../db/offline'
import { serverUnavailable } from '../utils/serverUnavailable'

// Kept only in this process after the operator enters their password. Never persisted.
let reconnectCredential: {phone: string; password: string; actor: string; backend: string} | null = null
let reconnecting: Promise<boolean> | null = null
export async function recoverOnlineSession(): Promise<boolean> {
  const state = useAuthStore.getState()
  if (state.token) return true
  const credential = reconnectCredential
  if (!credential || !state.isAuthenticated || state.user?.id !== credential.actor || currentBackendIdentity() !== credential.backend) return false
  if (reconnecting) return reconnecting
  reconnecting = (async () => {
    try {
      const {posApi} = await import('../services/api')
      const response = await posApi.login(credential.phone, credential.password)
      const current = useAuthStore.getState()
      if (reconnectCredential !== credential || !current.isAuthenticated || current.user?.id !== credential.actor || currentBackendIdentity() !== credential.backend) return false
      const {token, user} = response.data.data
      if (user.id !== current.user.id || user.storeId !== current.user.storeId || !['admin','manager','cashier'].includes(user.role)) {
        reconnectCredential = null
        useAuthStore.setState({token: null, isAuthenticated: false})
        return false
      }
      // Revalidate with the server, retaining its normal token lifetime and permissions.
      await current.login(token, user, credential.password, credential.backend)
      window.dispatchEvent(new Event('staff-access-changed'))
      window.dispatchEvent(new Event('pos-session-restored'))
      return true
    } catch (error) {
      if ([401,403].includes((error as any)?.response?.status)) {
        await clearOfflineCredentials()
        reconnectCredential = null
        useAuthStore.setState({token: null, isAuthenticated: false})
      }
      return false
    } finally { reconnecting = null }
  })()
  return reconnecting
}

// Reuse only the original server-issued token, with its original expiration.
// Parsing is a local availability hint; only the server validates its authority.
function unexpiredToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const encoded = value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
    const claims = JSON.parse(atob(encoded))
    return typeof claims.exp === 'number' && claims.exp*1000 > Date.now() ? value : null
  } catch { return null }
}

interface User {
  id: string
  phone: string
  role: string
  storeId: string | null
  staff: { id: string; name: string; employeeNumber?: string; position?: string } | null
}

interface AuthState {
  token: string | null
  apiUrl: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User, password: string, apiUrl: string) => Promise<void>
  expireCloudSession: () => void
  logout: () => void
  loginOffline: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  hasCachedCredentials: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      apiUrl: null,
      user: null,
      isAuthenticated: false,

      login: async (token: string, user: User, password: string, apiUrl: string) => {
        const target = backendIdentity(apiUrl)
        if (target !== currentBackendIdentity()) throw new Error('CHECKOUT_BACKEND_CHANGED')
        set({ token, apiUrl: target, user, isAuthenticated: true })
        reconnectCredential = {phone: user.phone, password, actor: user.id, backend: target}

        // Cache credentials for offline login
        const passwordHash = await bcrypt.hash(password, 12)
        if (currentBackendIdentity() !== target || useAuthStore.getState().token !== token || useAuthStore.getState().user?.id !== user.id) throw new Error('CHECKOUT_AUTH_CHANGED')
        await saveOfflineCredentials({
          phone: user.phone,
          resumeToken: unexpiredToken(token) || undefined,
          apiUrl: target,
          passwordHash,
          user,
          cachedAt: new Date()
        })
      },

      expireCloudSession: () => { set({token:null}) },

      logout: () => {
        reconnectCredential = null
        set({ token: null, apiUrl: null, user: null, isAuthenticated: false })
        // Signing out clears the active session. Previously authorized cashiers still
        // need their password to start the next shift without a network connection.
      },

      loginOffline: async (phone: string, password: string) => {
        try {
          const cached = await getOfflineCredentials(phone)

          if (!cached) {
            return { success: false, error: 'offlineCredentialsNotFound' }
          }

          if (!cached.apiUrl) return { success: false, error: 'offlineSale.initialize' }
          if (backendIdentity(cached.apiUrl) !== currentBackendIdentity()) return { success: false, error: 'offlineSale.target' }

          if (cached.phone !== phone) {
            return { success: false, error: 'offlineCredentialsNotFound' }
          }

          const age = Date.now() - new Date(cached.cachedAt).getTime()
          if (!Number.isFinite(age) || age < 0 || age > POS_OFFLINE_TTL_MS) return {success: false, error: 'offlineSale.authorizationExpired'}
          if (!['admin','manager','cashier'].includes(cached.user.role) || !cached.user.storeId) return {success: false, error: 'auth.loginFailed'}
          // Verify password using bcrypt
          const isValid = await bcrypt.compare(password, cached.passwordHash)
          if (!isValid) {
            return { success: false, error: 'auth.loginFailed' }
          }

          if (backendIdentity(cached.apiUrl) !== currentBackendIdentity()) return {success:false,error:'offlineSale.target'}
          reconnectCredential = {phone, password, actor: cached.user.id, backend: backendIdentity(cached.apiUrl)}
          // Set auth state with cached user
          set({
            token: unexpiredToken(cached.resumeToken),
            apiUrl: cached.apiUrl,
            user: cached.user,
            isAuthenticated: true
          })

          return { success: true }
        } catch (error) {
          console.error('[AuthStore] Offline login error:', error)
          return { success: false, error: 'auth.loginFailed' }
        }
      },

      hasCachedCredentials: async () => {
        const cached = await getOfflineCredentials()
        return !!cached
      }
    }),
    { name: 'pos-auth', storage: createJSONStorage(() => sessionStorage) }
  )
)
