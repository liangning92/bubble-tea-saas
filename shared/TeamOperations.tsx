import { useEffect, useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import type { TeamTask } from './TeamTasks'
import { TeamAi, OperationScope } from './TeamAi'
import { teamOperationCopy, teamOperationError } from './teamOperationCopy'

interface Item { key: string; text: string; ownerId: string; acceptByAt: string; deadlineAt: string; evidenceRequired: string; acceptanceCriteria: string }
interface Content { schema: 'team.operations.plan.v1'; title: string; objective: string; reviewerId: string; items: Item[] }
interface Plan { id: string; version: number; revision: number; status: 'draft' | 'published' | 'paused'; content: Content }
interface Command { url: string; data: any }
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50', field = 'mt-1 w-full min-w-0 rounded-lg border bg-white p-2 text-sm'
const newItem = (): Item => ({ key: crypto.randomUUID().slice(0, 8), text: '', ownerId: '', acceptByAt: '', deadlineAt: '', evidenceRequired: '', acceptanceCriteria: '' })
const localTime = (value: string) => {
 const d = new Date(value)
 return value && Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
}
export function TeamOperations({ client, channelId, scope, staffId, language, directory, tasks, onChanged }: {
 client: TeamClient; channelId: string; scope: string; staffId: string; language: string; directory: { id: string; name: string }[]; tasks: TeamTask[]; onChanged: () => void
}) {
 const w = teamOperationCopy(language), base = `/team/channels/${channelId}/operations`, storage = `team-operation:${scope}:${channelId}`
 const [plans, setPlans] = useState<Plan[]>([]), [selected, setSelected] = useState(''), [editor, setEditor] = useState<Content | null>(null)
 const [editing, setEditing] = useState<{ id: string; version: number } | null>(null), [pasted, setPasted] = useState('')
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [approved, setApproved] = useState(false), [note, setNote] = useState('')
 const [pending, setPending] = useState<Command | null>(null), [report, setReport] = useState<any>(null), [scan, setScan] = useState<any>(null)
 const [taskId, setTaskId] = useState(''), [purpose, setPurpose] = useState<OperationScope['purpose']>('explain')
 const p = plans.find(p => p.id === selected), planTasks = tasks.filter(t => t.planId === p?.id && t.planRevision === p?.revision && !['completed','cancelled'].includes(t.status))
 const task = planTasks.find(t => t.id === taskId), name = (id: string) => directory.find(d => d.id === id)?.name || id
 const date = (s: string) => new Date(s).toLocaleString(language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID')
 async function load() {
  try { const value = await client.request('get', base); if (client.current()) { setPlans(value); setSelected(id => id || value[0]?.id || '') } }
  catch (e: any) { if (client.current()) setError(e?.response?.data?.message || 'TEAM_OPERATION_FAILED') }
 }
 useEffect(() => { void load() }, [client, channelId, tasks])
 useEffect(() => {
  try { const raw = sessionStorage.getItem(storage); if (raw) { const c = JSON.parse(raw); if (typeof c.url === 'string' && c.url.startsWith(base + '/') && typeof c.data?.requestId === 'string') setPending(c) } }
  catch { setError('TEAM_OPERATION_FAILED') }
 }, [storage])
 useEffect(() => { setApproved(false); setNote(''); setReport(null); setScan(null); setTaskId('') }, [selected, p?.version])
 async function mutate(command: Command) {
  if (busy) return
  setBusy(true); setError(''); setSaved(false)
  try {
   // Keep the same command through uncertain responses and page reloads. Never auto-retry.
   sessionStorage.setItem(storage, JSON.stringify(command)); setPending(command)
   const value = await client.request('post', command.url, command.data)
   sessionStorage.removeItem(storage)
   if (!client.current()) return
   setPending(null); setSaved(true)
   if (command.url.endsWith('/scan')) setScan(value)
   else { setSelected(value.id); setEditor(null); setEditing(null) }
   await load(); onChanged()
  } catch (e: any) { if (client.current()) setError(e?.response?.data?.message || 'TEAM_OPERATION_FAILED') }
  finally { setBusy(false) }
 }
 async function exportResult() {
  if (!p || busy) return
  setBusy(true); setError('')
  try { const result = await client.request('get', `${base}/${p.id}/export`); if (client.current()) setReport(result) }
  catch (e: any) { setError(e?.response?.data?.message || 'TEAM_OPERATION_FAILED') } finally { setBusy(false) }
 }
 function download() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })), a = document.createElement('a')
  a.href = url; a.download = `operations-result-${p?.id}.json`; a.click(); URL.revokeObjectURL(url)
 }
 function begin(value?: Plan) {
  setEditing(value ? { id: value.id, version: value.version } : null)
  setEditor(value ? structuredClone(value.content) : { schema: 'team.operations.plan.v1', title: '', objective: '', reviewerId: staffId, items: [newItem()] })
  setError(''); setPasted('')
 }
 const locked = busy || !!pending
 const update = (i: number, key: keyof Item, value: string) => editor && setEditor({ ...editor, items: editor.items.map((a, n) => n === i ? { ...a, [key]: value } : a) })
 return <details className="min-w-0 space-y-3 rounded-xl border bg-white p-4" data-testid="team-operations"><summary className="cursor-pointer font-semibold">{w.title}</summary>
  <p className="mt-3 text-sm text-gray-500">{w.help}</p>
  {error && <p role="alert" className="break-words text-sm text-red-700">{teamOperationError(language, error)} <span>{error}</span></p>}
  {saved && <p role="status" className="text-sm">{w.saved}</p>}
  {pending && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm"><p>{w.pending}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void mutate(pending)}>{w.retry}</button><button className={button} disabled={busy} onClick={() => { sessionStorage.removeItem(storage); setPending(null) }}>{w.discard}</button></div></div>}
  <div className="flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={() => begin()}>{w.newPlan}</button><button className={button} disabled={busy} onClick={() => void load()}>{w.refresh}</button></div>
  <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{w.importTitle}</summary><p className="my-2 text-xs text-gray-500">{w.importHelp}</p><textarea className={field} aria-label={w.importTitle} maxLength={50000} rows={5} value={pasted} onChange={e => setPasted(e.target.value)} /><button className={button} disabled={locked} onClick={() => {
   try { const c = JSON.parse(pasted); if (c.schema !== 'team.operations.plan.v1' || typeof c.title !== 'string' || typeof c.objective !== 'string' || typeof c.reviewerId !== 'string' || !Array.isArray(c.items) || !c.items.length || c.items.length > 20 || c.items.some((i: any) => ['key','text','ownerId','acceptByAt','deadlineAt','evidenceRequired','acceptanceCriteria'].some(k => typeof i[k] !== 'string'))) throw Error()
    setEditor(c); setEditing(null); setError('')
   } catch { setError('TEAM_INVALID_INPUT') }
  }}>{w.load}</button></details>
  {editor && <form className="space-y-3 rounded-lg border p-3" onSubmit={e => { e.preventDefault(); if (!locked) void mutate({ url: base + '/import', data: { requestId: crypto.randomUUID(), expectedVersion: editing?.version || 0, ...(editing ? { planId: editing.id } : {}), content: editor } }) }}>
   <label className="block text-sm">{w.planTitle}<input required maxLength={120} className={field} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} /></label>
   <label className="block text-sm">{w.objective}<textarea required maxLength={800} className={field} value={editor.objective} onChange={e => setEditor({ ...editor, objective: e.target.value })} /></label>
   <label className="block text-sm">{w.reviewer}<select required className={field} value={editor.reviewerId} onChange={e => setEditor({ ...editor, reviewerId: e.target.value })}><option value="">—</option>{directory.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
   <p className="text-xs text-gray-500">{w.timezone}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
   {editor.items.map((item, i) => <fieldset className="min-w-0 space-y-2 rounded-lg border p-3" key={i}><legend className="text-sm font-medium">{w.item} {i + 1}</legend>
    <label className="block text-sm">{w.taskText}<textarea required className={field} maxLength={600} value={item.text} onChange={e => update(i, 'text', e.target.value)} /></label>
    <label className="block text-sm">{w.owner}<select required className={field} value={item.ownerId} onChange={e => update(i, 'ownerId', e.target.value)}><option value="">—</option>{directory.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <div className="grid min-w-0 gap-2 md:grid-cols-2">{(['acceptByAt','deadlineAt'] as const).map(k => <label className="block min-w-0 text-sm" key={k}>{k === 'acceptByAt' ? w.acceptBy : w.deadline}<input required type="datetime-local" className={field} value={localTime(item[k])} onChange={e => update(i, k, e.target.value ? new Date(e.target.value).toISOString() : '')} /></label>)}</div>
    <label className="block text-sm">{w.evidence}<textarea required className={field} maxLength={400} value={item.evidenceRequired} onChange={e => update(i, 'evidenceRequired', e.target.value)} /></label>
    <label className="block text-sm">{w.criteria}<textarea required className={field} maxLength={600} value={item.acceptanceCriteria} onChange={e => update(i, 'acceptanceCriteria', e.target.value)} /></label>
    <button className={button} type="button" disabled={editor.items.length < 2} onClick={() => setEditor({ ...editor, items: editor.items.filter((_, n) => n !== i) })}>{w.remove}</button>
   </fieldset>)}
   <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={editor.items.length >= 20} onClick={() => setEditor({ ...editor, items: [...editor.items, newItem()] })}>{w.add}</button><button className={button} disabled={locked}>{w.save}</button><button type="button" className={button} onClick={() => setEditor(null)}>{w.cancel}</button></div>
  </form>}
  {!plans.length ? <p className="text-sm text-gray-500">{w.empty}</p> : <label className="block text-sm">{w.choose}<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>{plans.map(p => <option key={p.id} value={p.id}>{p.content.title} · {w[p.status]} · {p.revision}</option>)}</select></label>}
  {p && <article className="min-w-0 space-y-3 border-t pt-3"><h4 className="font-semibold break-words">{p.content.title} · {w[p.status]}</h4><p className="text-sm">{w.revision} {p.revision} · {w.stateVersion} {p.version}</p><p className="whitespace-pre-wrap break-words text-sm">{p.content.objective}</p><p className="text-sm">{w.reviewer}: {name(p.content.reviewerId)}</p>
   {p.content.items.map(i => <div key={i.key} className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm"><p className="whitespace-pre-wrap break-words font-medium">{i.text}</p><p>{w.owner}: {name(i.ownerId)}</p><p>{w.acceptBy}: {date(i.acceptByAt)} · {w.deadline}: {date(i.deadlineAt)}</p><p className="whitespace-pre-wrap break-words">{w.evidence}: {i.evidenceRequired}</p><p className="whitespace-pre-wrap break-words">{w.criteria}: {i.acceptanceCriteria}</p></div>)}
   <label className="block text-sm">{w.note}<textarea className={field} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setApproved(false) }} /></label>
   {p.status !== 'published' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />{w.approve}</label>}
   <div className="flex flex-wrap gap-2"><button className={button} disabled={locked || !note.trim() || p.status !== 'published' && !approved} onClick={() => void mutate({ url: `${base}/${p.id}/actions`, data: { requestId: crypto.randomUUID(), expectedVersion: p.version, action: p.status === 'draft' ? 'publish' : p.status === 'paused' ? 'resume' : 'pause', approved, note } })}>{p.status === 'draft' ? w.publish : p.status === 'paused' ? w.resume : w.pause}</button>
    {p.status !== 'published' && <button className={button} disabled={locked} onClick={() => begin(p)}>{w.revise}</button>}
    <button className={button} disabled={locked || p.status !== 'published'} onClick={() => void mutate({ url: `${base}/${p.id}/scan`, data: { requestId: crypto.randomUUID(), expectedVersion: p.version } })}>{w.scan}</button><button className={button} disabled={busy} onClick={() => void exportResult()}>{w.export}</button></div>
   {scan && <div className="space-y-2 rounded-lg border p-3 text-sm"><p>{w.checkedAt}: {date(scan.checkedAt)}</p><h5>{w.escalation}</h5>{scan.records.map((r: any) => <div className="rounded border p-2" key={r.id}><p className="whitespace-pre-wrap break-words">{tasks.find(t => t.id === r.taskId)?.text || r.taskId}</p><p>{w[r.kind as 'overdue']} · {w[r.status as 'open']} · {name(r.assigneeId)} · {w.reviewer}: {name(r.supervisorId)}</p></div>)}</div>}
   {p.status === 'published' && !!planTasks.length && <div className="space-y-2 border-t pt-3"><h5 className="text-sm font-semibold">{w.assist}</h5><select aria-label={w.item} className={field} value={taskId} onChange={e => setTaskId(e.target.value)}><option value="">—</option>{planTasks.map(t => <option key={t.id} value={t.id}>{t.text}</option>)}</select><select aria-label={w.assist} className={field} value={purpose} onChange={e => setPurpose(e.target.value as OperationScope['purpose'])}>{(['explain','followup','remind'] as const).map(v => <option key={v} value={v}>{w[v]}</option>)}</select><p className="text-xs text-gray-500">{w.scope}</p>
    {task && <TeamAi key={`${p.version}:${task.id}:${task.version}:${purpose}`} client={client} language={language} channelId={channelId} messages={[]} operation={{ planId: p.id, planVersion: p.version, taskId: task.id, taskVersion: task.version, purpose }} onChanged={onChanged} />}
   </div>}
   {report && <div className="space-y-2 rounded-lg border p-3"><p className="text-xs text-gray-500">{date(report.generatedAt)} · {w.checkedAt}: {report.lastEscalationCheckAt ? date(report.lastEscalationCheckAt) : '—'}</p><label className="block text-sm">{w.report}<textarea readOnly className={field} rows={9} value={report.summaryZh} /></label><button className={button} onClick={download}>{w.download}</button></div>}
  </article>}
 </details>
}
