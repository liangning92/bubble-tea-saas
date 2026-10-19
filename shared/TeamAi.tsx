import { useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import { teamWorkCopy, teamWorkError } from './teamWorkCopy'
import { teamOperationCopy } from './teamOperationCopy'
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
const field = 'mt-1 w-full rounded-lg border bg-white p-2 text-sm'
const code = (e: any) => e?.response?.data?.message || 'TEAM_AI_PROVIDER_UNAVAILABLE'
interface Draft { id: string; kind: string; text: string; status: string; model: string; sourceSeq: number[]; usage?: { estimatedUsd: number } }
export interface OperationScope { planId: string; taskId: string; planVersion: number; taskVersion: number; purpose: 'explain' | 'followup' | 'remind' }
export function TeamAi({ client, language, channelId, messages, onChanged, operation }: { client: TeamClient; language: string; channelId: string;
 messages: { seq: number; text: string }[]; onChanged: () => void; operation?: OperationScope }) {
 const w = teamWorkCopy(language), [kind, setKind] = useState(operation ? 'draft' : 'translate'), [sourceSeq, setSourceSeq] = useState<number[]>([]), [instruction, setInstruction] = useState('')
 const [consent, setConsent] = useState(false), [approved, setApproved] = useState(false), [requestId, setRequestId] = useState('')
 const [draft, setDraft] = useState<Draft | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
 async function generate() {
  if (busy || !consent) return
  const id = crypto.randomUUID(); setRequestId(id); setBusy(true); setError(''); setApproved(false); setDraft(null); setText('')
  try {
   const value = await client.request('post',`/team/channels/${channelId}/ai/drafts`, { requestId: id, kind, sourceSeq, instruction, consent: true, ...(operation ? { operation } : {}) })
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
  <p className="my-3 text-sm text-gray-500">{operation ? teamOperationCopy(language).scope : w.aiHelp}</p>
  <form className="space-y-3" onSubmit={e => { e.preventDefault(); void generate() }}>
   {!operation && <><select className={field} aria-label={w.ai} value={kind} onChange={e => { setKind(e.target.value); setConsent(false) }}>{['translate','draft','report'].map(v => <option key={v} value={v}>{w[v as 'translate']}</option>)}</select>
   <label className="block text-sm">{w.instruction}<textarea className={field} required={kind === 'draft'} maxLength={1500} value={instruction} onChange={e => { setInstruction(e.target.value); setConsent(false) }}/></label>
   <fieldset className="max-h-48 space-y-2 overflow-auto"><legend className="text-sm font-medium">{w.sources}</legend>{messages.map(m => <label key={m.seq} className="flex gap-2 text-sm"><input type="checkbox" checked={sourceSeq.includes(m.seq)} disabled={!sourceSeq.includes(m.seq) && sourceSeq.length >= 20} onChange={e => { setSourceSeq(e.target.checked ? [...sourceSeq, m.seq] : sourceSeq.filter(n => n !== m.seq)); setConsent(false) }}/><span>#{m.seq} {m.text.slice(0,150)}</span></label>)}</fieldset></>}
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
