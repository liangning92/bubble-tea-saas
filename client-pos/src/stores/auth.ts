import { backendIdentity, currentBackendIdentity } from '../utils/backendIdentity'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import bcrypt from 'bcryptjs'
import { saveOfflineCredentials, clearOfflineCredentials, getOfflineCredentials, OfflineCredentials } from '../db/offline'
import { clearApiUrl } from '../config'
import { connectionManager } from '../services/ConnectionManager'

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

        // Cache credentials for offline login
        const passwordHash = await bcrypt.hash(password, 12)
        await saveOfflineCredentials({
          phone: user.phone,
          apiUrl: target,
          passwordHash,
          user,
          cachedAt: new Date()
        })
      },

      expireCloudSession: () => { set({token:null}) },

      logout: () => {
        set({ token: null, apiUrl: null, user: null, isAuthenticated: false })
        clearOfflineCredentials()
        clearApiUrl()
        connectionManager.reset()
      },

      loginOffline: async (phone: string, password: string) => {
        try {
          const cached = await getOfflineCredentials()

          if (!cached) {
            return { success: false, error: 'offlineCredentialsNotFound' }
          }

          if (!cached.apiUrl) return { success: false, error: 'offlineSale.initialize' }
          if (backendIdentity(cached.apiUrl) !== currentBackendIdentity()) return { success: false, error: 'offlineSale.target' }

          if (cached.phone !== phone) {
            return { success: false, error: 'offlineCredentialsNotFound' }
          }

          // Verify password using bcrypt
          const isValid = await bcrypt.compare(password, cached.passwordHash)
          if (!isValid) {
            return { success: false, error: 'auth.loginFailed' }
          }

          // Set auth state with cached user
          set({
            token: null,
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
