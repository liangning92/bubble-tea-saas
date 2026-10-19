import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { AiPermissionsPage } from './AiPermissionsPage'
import { TeamAiSettings } from './TeamAiSettings'

export function AiSettingsPage() {
  const { t, i18n } = useTranslation(), { user } = useAuthStore()
  const client = useMemo<Pick<TeamClient, 'request' | 'current'>>(() => {
    const expected = user?.id, store = user?.storeId
    const current = () => { const state = useAuthStore.getState(); return state.isAuthenticated && state.user?.id === expected && state.user?.storeId === store && state.user?.role === 'admin' }
    return { current, request: async (method, url, data) => {
      if (!current()) throw Error('TEAM_AI_ADMIN_REQUIRED')
      return (await api.request({ method, url, data })).data.data
    } }
  }, [user?.id, user?.storeId, user?.role])
  if (user?.role !== 'admin' || !user.storeId) return <div className="card max-w-4xl" role="alert">{t('aiPermissions.denied')}</div>
  return <div className="max-w-5xl space-y-6" data-testid="ai-settings-page">
    <header className="space-y-2"><h2 className="text-xl font-semibold">{t('aiSettings.title')}</h2><p className="text-sm text-gray-600">{t('aiSettings.description')}</p></header>
    <TeamAiSettings key={`${user.id}:${user.storeId}`} client={client} language={i18n.language} />
    <AiPermissionsPage />
  </div>
}
