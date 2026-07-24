import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import bcrypt from 'bcryptjs'
import { saveOfflineCredentials, clearOfflineCredentials, getOfflineCredentials, OfflineCredentials } from '../db/offline'

interface User {
  id: string
  phone: string
  role: string
  storeId: string | null
  staff: { id: string; name: string; employeeNumber?: string; position?: string } | null
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User, passwordHash?: string) => Promise<void>
  logout: () => void
  loginOffline: (phone: string, password: string) => Promise<{ success: boolean; error?: string }>
  hasCachedCredentials: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (token: string, user: User, passwordHash?: string) => {
        set({ token, user, isAuthenticated: true })

        // Cache credentials for offline login
        if (passwordHash) {
          await saveOfflineCredentials({
            phone: user.phone,
            passwordHash,
            user,
            token,
            cachedAt: new Date()
          })
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false })
        clearOfflineCredentials()
      },

      loginOffline: async (phone: string, password: string) => {
        try {
          const cached = await getOfflineCredentials()

          if (!cached) {
            return { success: false, error: 'offlineCredentialsNotFound' }
          }

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
            token: cached.token,
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
    { name: 'pos-auth' }
  )
)
