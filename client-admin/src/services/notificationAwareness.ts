import api from './api'
import type { AwarenessClient, AwarenessInbox } from '../../../shared/NotificationAwareness'
export const awarenessClient: AwarenessClient = {
  inbox: async signal => (await api.get<{ data: AwarenessInbox }>('/staff-work/my/inbox', { signal, timeout: 15000 })).data.data,
  read: (id, signal) => api.post(`/staff-work/my/inbox/${encodeURIComponent(id)}/read`, {}, { signal, timeout: 15000 })
}
