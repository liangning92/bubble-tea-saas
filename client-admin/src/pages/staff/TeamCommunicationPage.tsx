import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TeamCommunication, TeamClient } from '../../../../shared/TeamCommunication'
import { useAuthStore } from '../../stores/auth'
import api from '../../services/api'

export function TeamCommunicationPage() {
  const { user } = useAuthStore(), { i18n } = useTranslation()
  const client = useMemo<TeamClient>(() => {
    const expected = user?.id, store = user?.storeId
    const current = () => { const state = useAuthStore.getState(); return state.isAuthenticated && state.user?.id === expected && state.user?.storeId === store }
    return { current,
      request: async (method, url, data) => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); return (await api.request({ method, url, data })).data.data },
      upload: async (file, requestId) => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); const data = new FormData(); data.append('file', file); data.append('purpose', 'team'); data.append('uploadRequestId', requestId); return (await api.post('/staff-work/my/files', data, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data.id },
      download: async url => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); return (await api.get(url, { responseType: 'blob' })).data }
    }
  }, [user?.id, user?.storeId])
  if (!user) return null
  return <TeamCommunication client={client} scope={`${location.origin}:${user.storeId}:${user.staff?.id}`} staffId={user.staff?.id || ''} language={i18n.language} administration />
}
