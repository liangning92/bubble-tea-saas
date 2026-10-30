import { StoreOperationsDelegation } from './StoreOperationsDelegation'
import { AgentMemoryPanel } from './AgentMemoryPanel'
import { useMemo } from 'react'
import { aiSettingsSections } from './aiSettingsSections'
import { useTranslation } from 'react-i18next'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { TeamAiSettings } from './TeamAiSettings'
import { TeamAgentSettings } from './TeamAgentSettings'
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
  const layout = aiSettingsSections(i18n.language)
  if (user?.role !== 'admin' || !user.storeId) return <div className="card max-w-4xl" role="alert">{c.denied}</div>
  const storeId = user.storeId
  return <div className="max-w-5xl space-y-6" data-testid="ai-settings-page">
    <header className="space-y-2"><h2 className="text-xl font-semibold">{c.title}</h2><p className="text-sm leading-relaxed text-gray-600">{layout.description}</p></header>
    <nav aria-label={layout.navigation} className="flex flex-wrap gap-2 rounded-xl border bg-white p-3">
      {layout.groups.map(group => <a key={group.id} href={`#ai-${group.id}`} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary">{group.title}</a>)}
    </nav>
    {layout.groups.map(group => <section key={`${user.id}:${storeId}:${group.id}`} id={`ai-${group.id}`} aria-labelledby={`ai-group-${group.id}`} className="scroll-mt-4 space-y-4 min-w-0" data-testid={`ai-group-${group.id}`}>
      <header className="space-y-1 border-b pb-3"><h3 id={`ai-group-${group.id}`} className="text-lg font-semibold">{group.title}</h3><p className="text-sm leading-relaxed text-gray-600">{group.description}</p></header>
      {group.id === 'agent' && <TeamAgentSettings client={client} language={i18n.language} />}
      {group.id === 'model' && <><p className="rounded-lg bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">{layout.subscription}</p><TeamAiSettings client={client} identity={{userId:user.id,storeId}} language={i18n.language} /></>}
      {group.id === 'communication' && <>
        <p className="rounded-xl border bg-white p-4 text-sm leading-relaxed text-gray-600">{layout.communicationHelp}</p>
        <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-medium">{layout.channelExceptions}</summary><div className="mt-4 space-y-4"><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{layout.legacyHelp}</p><TeamManagementDefaults client={client} scope={`${user.id}:${storeId}`} staffId={user.staff?.id || ''} language={i18n.language} /><TeamWorkflowSettings client={client} scope={`${user.id}:${storeId}`} staffId={user.staff?.id || ''} language={i18n.language} /></div></details>
      </>}
      {group.id === 'knowledge' && <>
        <div className="rounded-xl border bg-white p-4 sm:p-6"><h4 className="font-semibold">{layout.nativeTitle}</h4><p className="mt-2 text-sm leading-relaxed text-gray-600">{layout.nativeHelp}</p><p className="mt-2 text-sm leading-relaxed text-gray-600">{layout.memoryHelp}</p></div>
        <AgentMemoryPanel client={client} language={i18n.language} />
      </>}
      {group.id === 'workbench' && <StoreOperationsDelegation client={client} language={i18n.language} />}
    </section>)}
  </div>
}
