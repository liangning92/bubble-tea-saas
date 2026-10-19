import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TeamCommunication, TeamClient } from '../../../shared/TeamCommunication'
import { useAuthStore } from '../stores/auth'
import { API_BASE, employeeApi, http } from '../services/api'

export function TeamCommunicationPage() {
  const { user } = useAuthStore(), { i18n } = useTranslation()
  const client = useMemo<TeamClient>(() => {
    const expected = user?.id, store = user?.storeId
    const current = () => { const state = useAuthStore.getState(); return state.isAuthenticated && state.user?.id === expected && state.user?.storeId === store }
    return { current,
      request: async (method, url, data) => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); return (await http.request({ method, url: API_BASE + url, data, headers: { Authorization: 'Bearer ' + useAuthStore.getState().token, 'X-Client-App': 'employee' } })).data.data },
      upload: (file, requestId) => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); return employeeApi.upload(file, 'team', requestId) },
      download: async (url, options) => { if (!current()) throw Error('TEAM_IDENTITY_REQUIRED'); return (await http.get(API_BASE + url, { responseType: 'blob', timeout: 60000, signal: options?.signal, onDownloadProgress: event => options?.onProgress?.({ loaded: event.loaded, total: event.total }), headers: { Authorization: 'Bearer ' + useAuthStore.getState().token, 'X-Client-App': 'employee' } })).data }
    }
  }, [user?.id, user?.storeId])
  if (!user) return null
  return <TeamCommunication client={client} scope={`${location.origin}:${user.storeId}:${user.staffId}`} staffId={user.staffId} language={i18n.language} />
}
