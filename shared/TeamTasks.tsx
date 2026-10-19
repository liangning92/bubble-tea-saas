import { useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import { teamCopy } from './teamCopy'
import { teamWorkCopy, teamWorkError } from './teamWorkCopy'
export interface TeamTask {
 id: string; text: string; ownerId: string; dueDate: string; fromSeq: number; sourceSeq: number[]; minuteVersion: number
 status: 'assigned' | 'accepted' | 'submitted' | 'changes_requested' | 'completed' | 'cancelled'; version: number
 events: { action: string; by: string; at: string; note: string; sourceSeq: number[] }[]
}
type Action = 'accept' | 'submit' | 'return' | 'complete' | 'cancel'
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
export function TeamTasks({ tasks, client, channelId, staffId, language, name, canManage, readOnly, messages, onChanged }: {
 tasks: TeamTask[]; client: TeamClient; channelId: string; staffId: string; language: string; name: (id: string) => string
 canManage: boolean; readOnly: boolean; messages: { seq: number; authorId: string; text: string; files: string[] }[]; onChanged: () => void
}) {
 const w = teamWorkCopy(language), common = teamCopy(language)
 const [command, setCommand] = useState<{ task: TeamTask; action: Action; requestId: string } | null>(null)
 const [note, setNote] = useState(''), [sourceSeq, setSourceSeq] = useState<number[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
 const label = (action: Action) => action === 'cancel' ? w.cancelTask : w[action]
 async function apply() {
  if (!command || busy) return
  setBusy(true); setError('')
  try {
   await client.request('post', `/team/channels/${channelId}/tasks/${command.task.id}/actions`, {
    requestId: command.requestId, expectedVersion: command.task.version, action: command.action, note, sourceSeq })
   if (!client.current()) return
   setCommand(null); onChanged()
  } catch (e: any) { if (client.current()) setError(e?.response?.data?.message || 'TEAM_OPERATION_FAILED') }
  finally { setBusy(false) }
 }
 return <section className="space-y-3 rounded-xl border bg-white p-4" data-testid="team-tasks">
  <h3 className="font-semibold">{w.tasks}</h3><p className="text-xs text-gray-500">{w.taskHelp}</p>
  {!tasks.length && <p className="text-sm text-gray-500">{w.noTasks}</p>}
  {tasks.map(task => <article key={task.id} className="space-y-2 rounded-lg border p-3 text-sm" data-testid="team-task">
   <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="whitespace-pre-wrap break-words font-medium">{task.text}</h4><span className="rounded-full bg-gray-100 px-3 py-1">{w[task.status]}</span></div>
   <p>{common.owner}: {name(task.ownerId)} · {common.due}: {task.dueDate} · {w.snapshot}: {task.minuteVersion}</p>
   <p>{common.references}: {task.sourceSeq.map(n => <a className="mr-2 underline" href={`#team-message-${n}`} key={n}>#{n}</a>)}</p>
   <div className="flex flex-wrap gap-2">{!readOnly && (['accept', 'submit', 'return', 'complete', 'cancel'] as Action[]).filter(action => {
    if (action === 'accept') return task.ownerId === staffId && task.status === 'assigned'
    if (action === 'submit') return task.ownerId === staffId && ['accepted', 'changes_requested'].includes(task.status)
    if (action === 'cancel') return canManage && !['completed', 'cancelled'].includes(task.status)
    return canManage && task.status === 'submitted'
   }).map(action => <button className={button} key={action} disabled={busy} onClick={() => { setCommand({ task, action, requestId: crypto.randomUUID() }); setNote(''); setSourceSeq([]); setError('') }}>{label(action)}</button>)}</div>
   <details><summary className="cursor-pointer">{w.events}</summary>{task.events.map((event, i) => <div className="mt-2 border-t pt-2" key={i}>
    <p>{event.action === 'assign' ? w.assign : label(event.action as Action)} · {name(event.by)} · {new Date(event.at).toLocaleString(language)}</p>
    <p className="whitespace-pre-wrap break-words">{event.note}</p>{event.sourceSeq.map(n => <a className="mr-2 underline" href={`#team-message-${n}`} key={n}>#{n}</a>)}
   </div>)}</details>
  </article>)}
  {command && !readOnly && <form className="space-y-3 rounded-lg border border-red-200 p-3" onSubmit={e => { e.preventDefault(); void apply() }}>
   <h4 className="font-semibold">{label(command.action)} · {command.task.text}</h4>
   <label className="block text-sm">{w.note}<textarea className="mt-1 w-full rounded-lg border p-2" maxLength={1000} required={['submit','return','cancel'].includes(command.action)} value={note} onChange={e => setNote(e.target.value)} /></label>
   {command.action === 'submit' && <fieldset className="max-h-48 space-y-2 overflow-auto"><legend className="text-sm font-medium">{w.evidence}</legend>{messages.filter(m => m.authorId === staffId && m.seq >= command.task.fromSeq).map(m => <label className="flex gap-2 text-sm" key={m.seq}><input type="checkbox" checked={sourceSeq.includes(m.seq)} disabled={!sourceSeq.includes(m.seq) && sourceSeq.length >= 20} onChange={e => setSourceSeq(e.target.checked ? [...sourceSeq, m.seq] : sourceSeq.filter(n => n !== m.seq))} /><span>#{m.seq} {m.text.slice(0, 100)} {m.files.length ? `(${common.attachment}: ${m.files.length})` : ''}</span></label>)}</fieldset>}
   {error && <p role="alert" className="break-words text-sm text-red-700">{teamWorkError(language, error)}</p>}
   <div className="flex gap-2"><button className={button} disabled={busy || command.action === 'submit' && !sourceSeq.length}>{w.confirmAction}</button><button type="button" className={button} disabled={busy} onClick={() => setCommand(null)}>{w.close}</button></div>
  </form>}
 </section>
}
