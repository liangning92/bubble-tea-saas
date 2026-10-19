import { useEffect, useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import { teamWorkCopy, teamWorkError } from './teamWorkCopy'
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
const field = 'mt-1 w-full rounded-lg border bg-white p-2 text-sm'
const code = (e: any) => e?.response?.data?.message || 'TEAM_AI_PROVIDER_UNAVAILABLE'
interface Settings {
 version: number; enabled: boolean; provider: 'minimax'; model: string; monthlyBudgetUsd: number | null
 inputPerMillionUsd: number; outputPerMillionUsd: number; keyConfigured: boolean; month: string; estimatedMonthUsd: number
}
interface Draft { id: string; kind: string; text: string; status: string; model: string; sourceSeq: number[]; usage?: { estimatedUsd: number } }
export function TeamAiSettings({ client, language }: { client: TeamClient; language: string }) {
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
 return <details className="rounded-xl border bg-white p-4" data-testid="team-ai-settings"><summary className="cursor-pointer font-semibold">{w.settings}</summary>
  {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{teamWorkError(language, error)}</p>}
  {settings && <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void save() }}>
   <p className="text-sm">{settings.keyConfigured ? w.keyReady : w.keyMissing} · {settings.monthlyBudgetUsd === null ? w.unlimited : `$${settings.monthlyBudgetUsd}`}</p>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })}/>{w.enabled}</label>
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
export function TeamAi({ client, language, channelId, messages, onChanged }: { client: TeamClient; language: string; channelId: string;
 messages: { seq: number; text: string }[]; onChanged: () => void }) {
 const w = teamWorkCopy(language), [kind, setKind] = useState('translate'), [sourceSeq, setSourceSeq] = useState<number[]>([]), [instruction, setInstruction] = useState('')
 const [consent, setConsent] = useState(false), [approved, setApproved] = useState(false), [requestId, setRequestId] = useState('')
 const [draft, setDraft] = useState<Draft | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
 async function generate() {
  if (busy || !consent) return
  const id = crypto.randomUUID(); setRequestId(id); setBusy(true); setError(''); setApproved(false); setDraft(null); setText('')
  try {
   const value = await client.request('post',`/team/channels/${channelId}/ai/drafts`, { requestId: id, kind, sourceSeq, instruction, consent: true })
   if (client.current()) { setDraft(value); setText(value.text) }
  } catch(e) { if (client.current()) setError(code(e)) } finally { setBusy(false) }
 }
 async function lookup() {
  if (!requestId || busy) return
  setBusy(true); setError('')
  try { const value = await client.request('get',`/team/channels/${channelId}/ai/drafts/${requestId}`); if (client.current()) { setDraft(value); setText(value.text); setApproved(false) } }
  catch(e) { if (client.current()) setError(code(e)) } finally { setBusy(false) }
 }
 async function publish() {
  if (!draft || !approved || busy) return
  setBusy(true); setError('')
  try {
   await client.request('post',`/team/channels/${channelId}/ai/drafts/${draft.id}/publish`, { text })
   if (client.current()) { setDraft({ ...draft, status:'sent' }); setApproved(false); onChanged() }
  } catch(e) { if (client.current()) setError(code(e)) } finally { setBusy(false) }
 }
 return <details className="rounded-xl border bg-white p-4" data-testid="team-ai"><summary className="cursor-pointer font-semibold">{w.ai}</summary>
  <p className="my-3 text-sm text-gray-500">{w.aiHelp}</p>
  <form className="space-y-3" onSubmit={e => { e.preventDefault(); void generate() }}>
   <select className={field} aria-label={w.ai} value={kind} onChange={e => { setKind(e.target.value); setConsent(false) }}>{['translate','draft','report'].map(v => <option key={v} value={v}>{w[v as 'translate']}</option>)}</select>
   <label className="block text-sm">{w.instruction}<textarea className={field} required={kind === 'draft'} maxLength={1500} value={instruction} onChange={e => { setInstruction(e.target.value); setConsent(false) }}/></label>
   <fieldset className="max-h-48 space-y-2 overflow-auto"><legend className="text-sm font-medium">{w.sources}</legend>{messages.map(m => <label key={m.seq} className="flex gap-2 text-sm"><input type="checkbox" checked={sourceSeq.includes(m.seq)} disabled={!sourceSeq.includes(m.seq) && sourceSeq.length >= 20} onChange={e => { setSourceSeq(e.target.checked ? [...sourceSeq, m.seq] : sourceSeq.filter(n => n !== m.seq)); setConsent(false) }}/><span>#{m.seq} {m.text.slice(0,150)}</span></label>)}</fieldset>
   <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>{w.consent}</label>
   <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !consent || kind !== 'draft' && !sourceSeq.length}>{busy ? w.generating : w.generate}</button>{requestId && <button type="button" className={button} disabled={busy} onClick={() => void lookup()}>{w.lookup}</button>}</div>
  </form>
  {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{teamWorkError(language, error)}</p>}
  {draft && <div className="mt-4 space-y-3 border-t pt-3">
   <p className="text-sm font-medium">{w.privateDraft} · {draft.model}</p>
   {['pending','uncertain','blocked','sent'].includes(draft.status) && <p role="status" className="text-sm">{w[draft.status as 'pending']}</p>}
   {!!draft.text && <textarea className={field} aria-label={w.privateDraft} readOnly={draft.status !== 'ready' || draft.kind !== 'draft'} maxLength={3800} rows={8} value={text} onChange={e => { setText(e.target.value); setApproved(false) }}/>}
   {draft.usage && <p className="text-xs text-gray-500">${draft.usage.estimatedUsd.toFixed(6)} · {w.estimate}</p>}
   {draft.status === 'ready' && draft.kind === 'draft' && <><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>{w.approve}</label><button type="button" className={button} disabled={busy || !approved || !text.trim()} onClick={() => void publish()}>{w.publish}</button></>}
  </div>}
 </details>
}
