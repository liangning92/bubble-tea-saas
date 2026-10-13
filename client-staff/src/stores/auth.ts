import { clearMemoryDrafts } from '../utils/draftMemory'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface StaffUser {
  id: string
  phone: string
  name: string
  role: string
  storeId: string
  storeName?: string
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
        clearMemoryDrafts()
        const token=useAuthStore.getState().token
        const configured=(import.meta.env.VITE_API_BASE_URL||'/api').replace(/\/$/,'');const base=configured.endsWith('/api')?configured:configured+'/api'
        if(token)void fetch(base+'/staff-work/my/subscription',{method:'DELETE',headers:{'X-Client-App':'employee',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:sessionStorage.getItem('employee-push-id')}),keepalive:true}).catch(()=>{})
        void navigator.serviceWorker?.getRegistration().then(async registration=>{await(await registration?.pushManager.getSubscription())?.unsubscribe()}).catch(()=>{})
        Object.keys(sessionStorage).filter(k=>k.startsWith('employee-draft.')).forEach(k=>sessionStorage.removeItem(k))
        sessionStorage.removeItem('employee-push-id')
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
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)
