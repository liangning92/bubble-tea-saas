import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import { teamWorkCopy, teamWorkError } from '../../../../shared/teamWorkCopy'
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
const field = 'mt-1 w-full rounded-lg border bg-white p-2 text-sm'
const code = (e: any) => e?.response?.data?.message || 'TEAM_AI_PROVIDER_UNAVAILABLE'
interface Settings {
 version: number; enabled: boolean; provider: 'minimax'; model: string; monthlyBudgetUsd: number | null
 inputPerMillionUsd: number; outputPerMillionUsd: number; keyConfigured: boolean; month: string; estimatedMonthUsd: number
}
export function TeamAiSettings({ client, language }: { client: Pick<TeamClient, 'request' | 'current'>; language: string }) {
 const { t } = useTranslation()
 const w = teamWorkCopy(language), [settings, setSettings] = useState<Settings | null>(null), [apiKey, setApiKey] = useState(''), [removeKey, setRemoveKey] = useState(false)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
 useEffect(() => { let active = true; void client.request('get','/team/ai/settings').then(v => { if (active && client.current()) setSettings(v) }).catch(e => { if (active && client.current()) setError(code(e)) }); return () => { active = false } }, [client])
 async function save() {
  if (!settings || busy) return
  setBusy(true); setError(''); setSaved(false)
  try {
   const { version, enabled, provider, model, monthlyBudgetUsd, inputPerMillionUsd, outputPerMillionUsd } = settings
   const value = await client.request('put','/team/ai/settings', { expectedVersion: version, enabled, provider, model, monthlyBudgetUsd,
    inputPerMillionUsd, outputPerMillionUsd, removeKey, ...(apiKey ? { apiKey } : {}) })
   if (!client.current()) return
   setSettings(value); setApiKey(''); setRemoveKey(false); setSaved(true)
  } catch(e) { if (client.current()) setError(code(e)) } finally { setBusy(false) }
 }
 return <details open className="rounded-xl border bg-white p-4" data-testid="team-ai-settings"><summary className="cursor-pointer font-semibold">{w.settings}</summary>
  {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{teamWorkError(language, error)}</p>}
  {settings && <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void save() }}>
   <p className="text-sm">{settings.keyConfigured ? w.keyReady : w.keyMissing} · {settings.monthlyBudgetUsd === null ? w.unlimited : `$${settings.monthlyBudgetUsd}`}</p>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })}/>{w.enabled}</label>
   <label className="block text-sm">{t('aiSettings.provider')}<select className={field} value={settings.provider} onChange={e => { if (e.target.value === 'minimax') setSettings({ ...settings, provider: e.target.value }) }}><option value="minimax">MiniMax</option><option value="" disabled>{t('aiSettings.futureProvider')}</option></select></label>
   <p className="text-xs text-gray-500">{t('aiSettings.providerHelp')}</p>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{w.model}<input className={field} required maxLength={80} value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}/></label>
    <label className="text-sm">{w.budget}<input className={field} type="number" min="0.000001" max="100000" step="any" value={settings.monthlyBudgetUsd ?? ''} onChange={e => setSettings({ ...settings, monthlyBudgetUsd: e.target.value === '' ? null : Number(e.target.value) })}/></label>
    <label className="text-sm">{w.inputPrice}<input className={field} required type="number" min="0.000001" max="1000" step="any" value={settings.inputPerMillionUsd} onChange={e => setSettings({ ...settings, inputPerMillionUsd: Number(e.target.value) })}/></label>
    <label className="text-sm">{w.outputPrice}<input className={field} required type="number" min="0.000001" max="1000" step="any" value={settings.outputPerMillionUsd} onChange={e => setSettings({ ...settings, outputPerMillionUsd: Number(e.target.value) })}/></label></div>
   <p className="text-xs text-gray-500">{w.prices}</p>
   <label className="block text-sm">{w.apiKey}<input className={field} type="password" autoComplete="new-password" maxLength={8192} value={apiKey} onChange={e => setApiKey(e.target.value)}/></label>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeKey} onChange={e => setRemoveKey(e.target.checked)}/>{w.removeKey}</label>
   <p className="text-xs text-gray-500">{settings.month} · ${settings.estimatedMonthUsd.toFixed(6)} · {w.estimate}</p>
   <button className={button} disabled={busy}>{w.save}</button>{saved && <span role="status" className="ml-3 text-sm">{w.saved}</span>}
  </form>}
 </details>
}
