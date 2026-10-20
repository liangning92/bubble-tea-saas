import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { TeamAiSettings } from './TeamAiSettings'
import { aiSettingsCopy } from './aiSettingsCopy'
import { TeamManagementDefaults } from './TeamManagementDefaults'
import { TeamWorkflowSettings } from './TeamWorkflowSettings'

export function AiSettingsPage() {
  const { i18n } = useTranslation(), { user } = useAuthStore(), c=aiSettingsCopy(i18n.language)
  const client = useMemo<Pick<TeamClient, 'request' | 'current'>>(() => {
    const expected = user?.id, store = user?.storeId
    const current = () => { const state = useAuthStore.getState(); return state.isAuthenticated && state.user?.id === expected && state.user?.storeId === store && state.user?.role === 'admin' }
    return { current, request: async (method, url, data) => {
      if (!current()) throw Error('TEAM_AI_ADMIN_REQUIRED')
      return (await api.request({ method, url, data })).data.data
    } }
  }, [user?.id, user?.storeId, user?.role])
  if (user?.role !== 'admin' || !user.storeId) return <div className="card max-w-4xl" role="alert">{c.denied}</div>
  return <div className="max-w-5xl space-y-5" data-testid="ai-settings-page">
    <header><h2 className="text-xl font-semibold">{c.title}</h2></header>
    <TeamAiSettings key={`${user.id}:${user.storeId}`} client={client} identity={{userId:user.id,storeId:user.storeId}} language={i18n.language} />
    <TeamWorkflowSettings key={`workflow:${user.id}:${user.storeId}`} client={client} scope={`${user.id}:${user.storeId}`} staffId={user.staff?.id || ''} language={i18n.language} />
    <TeamManagementDefaults key={`management:${user.id}:${user.storeId}`} client={client} scope={`${user.id}:${user.storeId}`} staffId={user.staff?.id || ''} language={i18n.language} />
  </div>
}
