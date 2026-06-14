import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface StaffUser {
  id: string
  phone: string
  name: string
  role: string
  storeId: string
  staffId: string
  position: string
}

interface AuthState {
  token: string | null
  user: StaffUser | null
  isAuthenticated: boolean
  login: (token: string, user: StaffUser) => void
  logout: () => void
  updateUser: (user: Partial<StaffUser>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token: string, user: StaffUser) => {
        set({ token, user, isAuthenticated: true })
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false })
      },

      updateUser: (userUpdate: Partial<StaffUser>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userUpdate } : null
        }))
      }
    }),
    {
      name: 'staff-auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)