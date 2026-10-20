import { staffPermissionClient } from './api'
import type { AwarenessClient, AwarenessInbox } from '../../../shared/NotificationAwareness'
export const awarenessClient: AwarenessClient = {
  inbox: async signal => (await staffPermissionClient.get('/staff-work/my/inbox', { signal })).data.data as AwarenessInbox,
  read: (id, signal) => staffPermissionClient.post(`/staff-work/my/inbox/${encodeURIComponent(id)}/read`, {}, { signal })
}
