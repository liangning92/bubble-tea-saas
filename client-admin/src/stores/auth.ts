import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getApiUrl } from '../config'

export interface User {
  id: string
  phone: string
  role: string
  storeId: string | null
  staff: {
    id: string
    name: string
    position: string
  } | null
}

interface AuthState {
  sessionReady: boolean
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      sessionReady: false,

      login: (token, user) => {
        set({ token, user, isAuthenticated: true })
      },

      logout: () => {
        const token = useAuthStore.getState().token
        if (token) sessionChannel?.postMessage({ type: 'logout', token })
        set({ token: null, user: null, isAuthenticated: false })
      },

      updateUser: (partial) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null
        }))
      }
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ token, user, isAuthenticated }) => ({ token, user, isAuthenticated })
    }
  )
)

// Share only a currently valid session with another tab on this origin/API.
// Nothing is written to persistent storage and no token is renewed here.
let sessionChannel: BroadcastChannel | undefined
function validSession(token: unknown, user: unknown): user is User {
  if (typeof token !== 'string' || !user || typeof user !== 'object') return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const candidate = user as User
    return Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now()
      && payload.id === candidate.id && payload.role === candidate.role
      && (payload.storeId || null) === (candidate.storeId || null)
  } catch { return false }
}

async function reuseOpenSession() {
  if (typeof BroadcastChannel === 'undefined') return
  const api = new URL(getApiUrl().replace(/\/$/, ''), window.location.href).href
  sessionChannel = new BroadcastChannel(`admin-session-v1:${api}`)
  const requestId = crypto.randomUUID()
  const candidates: Array<{ token: string; user: User }> = []
  const loggedOut = new Set<string>()
  let collecting = !useAuthStore.getState().isAuthenticated
  sessionChannel.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return
    const state = useAuthStore.getState()
    if (data.type === 'request' && validSession(state.token, state.user)) {
      sessionChannel?.postMessage({ type: 'response', requestId: data.requestId, token: state.token, user: state.user })
    } else if (data.type === 'response' && collecting && data.requestId === requestId && validSession(data.token, data.user)) {
      candidates.push({ token: data.token, user: data.user })
    } else if (data.type === 'logout' && typeof data.token === 'string') {
      loggedOut.add(data.token)
      if (data.token === state.token) useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
    }
  }
  if (!collecting) return
  sessionChannel.postMessage({ type: 'request', requestId })
  await new Promise(resolve => setTimeout(resolve, 350))
  collecting = false
  // Never choose arbitrarily between different accounts, roles or stores.
  const identities = new Set(candidates.map(({ user }) => JSON.stringify([user.id, user.storeId, user.role])))
  if (identities.size !== 1 || useAuthStore.getState().isAuthenticated) return
  const candidate = candidates[0]
  if (loggedOut.has(candidate.token)) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    // The API, including revocation and current permissions, remains authoritative.
    const response = await fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${candidate.token}` }, signal: controller.signal })
    if (!response.ok) return
    const { data: user } = await response.json()
    if (!loggedOut.has(candidate.token) && validSession(candidate.token, user) && !useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().login(candidate.token, user)
    }
  } finally { clearTimeout(timeout) }
}

void reuseOpenSession().catch(() => {}).finally(() => useAuthStore.setState({ sessionReady: true }))
