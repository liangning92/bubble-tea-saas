import { API_BASE, http } from './api'
import { useAuthStore } from '../stores/auth'
import type { AwarenessClient, AwarenessInbox } from '../../../shared/NotificationAwareness'
const headers = () => ({ Authorization: `Bearer ${useAuthStore.getState().token || ''}`, 'X-Client-App': 'employee' })
export const awarenessClient: AwarenessClient = {
  inbox: async signal => (await http.get(API_BASE + '/staff-work/my/inbox', { signal, headers: headers() })).data.data as AwarenessInbox,
  read: (id, signal) => http.post(`${API_BASE}/staff-work/my/inbox/${encodeURIComponent(id)}/read`, {}, { signal, headers: headers() })
}
