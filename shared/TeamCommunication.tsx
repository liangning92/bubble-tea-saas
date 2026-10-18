import { FormEvent, useEffect, useRef, useState } from 'react'
import { teamCopy } from './teamCopy'
import { TeamPending, pendingMessages, removePending, savePending } from './teamOutbox'

export interface TeamClient {
  request: (method: 'get' | 'post' | 'put', url: string, data?: unknown) => Promise<any>
  upload: (file: File) => Promise<string>
  download: (url: string) => Promise<Blob>
  current: () => boolean
}
interface Channel {
  id: string; title: string; kind: string; ownerId: string; lastSeq: number; version: number; archived: boolean
  members: { staffId: string; fromSeq: number }[]; member: boolean; canEdit: boolean; canAudit: boolean; unread: number
  round: { id: string; title: string } | null
}
interface Message { id: string; requestId: string; seq: number; authorId: string; authorName: string; text: string; files: string[]; createdAt: string }
interface Minute {
  id: string; title: string; participants: string[]; fromSeq: number; toSeq: number; startedAt: string; endedAt: string
  version: number; status: 'draft' | 'confirmed'; decisions: string[]; pending: string[]; sourceSeq: number[]
  actions: { text: string; ownerId: string; dueDate: string; sourceSeq: number[] }[]
}
const button = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50'
const primary = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const field = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm'
const numbers = (value: string) => value.split(',').filter(v => v.trim()).map(v => Number(v.trim()))
const lines = (value: string) => value.split('\n').map(v => v.trim()).filter(Boolean)
const errorCode = (e: any) => e?.response?.data?.message || e?.message || 'TEAM_OPERATION_FAILED'
export function TeamCommunication({ client, scope, staffId, language, administration = false }: {
  client: TeamClient; scope: string; staffId: string; language: string; administration?: boolean
}) {
  const w = teamCopy(language)
  const [channels, setChannels] = useState<Channel[]>([]), [directory, setDirectory] = useState<{ id: string; name: string }[]>([])
  const [capabilities, setCapabilities] = useState({ manage: false, audit: false })
  const [selectedId, setSelectedId] = useState(''), [meta, setMeta] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([]), [minutes, setMinutes] = useState<Minute[]>([])
  const [receipts, setReceipts] = useState<{ staffId: string; seq: number }[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
  const [auditInput, setAuditInput] = useState(''), [auditReason, setAuditReason] = useState('')
  const [refreshKey, setRefreshKey] = useState(0), [online, setOnline] = useState(navigator.onLine)
  const [text, setText] = useState(''), [files, setFiles] = useState<File[]>([]), [outbox, setOutbox] = useState<TeamPending[]>([])
  const [creating, setCreating] = useState(false), [newTitle, setNewTitle] = useState(''), [kind, setKind] = useState('direct'), [members, setMembers] = useState<string[]>([])
  const [managing, setManaging] = useState(false), [memberIds, setMemberIds] = useState<string[]>([]), [hostId, setHostId] = useState('')
  const [editing, setEditing] = useState<Minute | null>(null), [versions, setVersions] = useState<Minute[]>([])
  const [saved, setSaved] = useState(''), [queueReady, setQueueReady] = useState(false)
  const pollRef = useRef<(() => Promise<void>) | null>(null)
  const flushRef = useRef(false), currentChannel = channels.find(c => c.id === selectedId)
  const name = (id: string) => directory.find(m => m.id === id)?.name || id
  const query = auditReason ? '?auditReason=' + encodeURIComponent(auditReason) : ''
  const date = (s: string) => new Date(s).toLocaleString(language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID')
  async function reload() {
    try {
      const [list, people, permissions] = await Promise.all([
        client.request('get', administration ? '/team/admin/channels' : '/team/channels'),
        client.request('get', '/team/directory'), client.request('get', '/team/capabilities')])
      if (!client.current()) return
      setChannels(list); setDirectory(people); setCapabilities(permissions); setLoaded(true)
    } catch (e) { if (client.current()) { setError(errorCode(e)); setLoaded(true) } }
  }
  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 5000)
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) { void reload(); setRefreshKey(v => v + 1) } }
    window.addEventListener('online', connection); window.addEventListener('offline', connection)
    return () => { clearInterval(timer); window.removeEventListener('online', connection); window.removeEventListener('offline', connection) }
  }, [client, scope, administration])
  useEffect(() => {
    let active = true
    setQueueReady(false)
    pendingMessages(scope).then(values => { if (active) { setOutbox(values); setQueueReady(true) } }).catch(() => { if (active) setError('OUTBOX_STORAGE_FAILED') })
    return () => { active = false }
  }, [scope])
  async function flush() {
    if (flushRef.current || !navigator.onLine || !client.current()) return
    flushRef.current = true
    try {
      for (const message of await pendingMessages(scope)) {
        if (!client.current() || !navigator.onLine) break
        if (message.retryable === false || (message.nextRetryAt || 0) > Date.now()) continue
        try {
          while (message.uploaded.length < message.files.length) {
            const id = await client.upload(message.files[message.uploaded.length])
            message.uploaded.push(id); await savePending(message)
            if (!client.current()) return
          }
          await client.request('post', `/team/channels/${message.channelId}/messages`, { requestId: message.id, text: message.text, files: message.uploaded })
          await removePending(message.id)
          await pollRef.current?.()
        } catch (e: any) {
          const status = e?.response?.status
          message.error = errorCode(e); message.attempts = (message.attempts || 0) + 1
          message.retryable = !status || status >= 500 || status === 429
          message.nextRetryAt = Date.now() + (status === 429 ? 60000 : Math.min(60000, 3000 * 2 ** Math.min(message.attempts, 5)))
          await savePending(message)
        }
      }
      if (client.current()) setOutbox(await pendingMessages(scope))
    } catch { if (client.current()) setError('OUTBOX_STORAGE_FAILED') }
    finally { flushRef.current = false }
  }
  useEffect(() => {
    if (!queueReady) return
    void flush()
    const timer = window.setInterval(() => void flush(), 5000)
    return () => clearInterval(timer)
  }, [client, scope, online, queueReady])
  useEffect(() => {
    setMessages([]); setMinutes([]); setReceipts([]); setMeta(null); setEditing(null); setVersions([]); setError('')
    if (!selectedId || !currentChannel?.member && !auditReason) return
    let active = true, inFlight = false, cursor = 0, stopped = false
    const pull = async () => {
      if (!active || stopped || inFlight || !client.current()) return
      inFlight = true
      try {
        const response = await client.request('get', `/team/channels/${selectedId}/messages?after=${cursor}${auditReason ? '&auditReason=' + encodeURIComponent(auditReason) : ''}`)
        const records = await client.request('get', `/team/channels/${selectedId}/minutes${query}`)
        if (!active || !client.current()) return
        setMeta({ ...currentChannel!, ...response.channel, canEdit: response.canEdit })
        setMessages(previous => [...new Map([...previous, ...response.messages].map((m: Message) => [m.seq, m])).values()].sort((a, b) => a.seq - b.seq))
        cursor = response.cursor; setMinutes(records); setError('')
        if (!auditReason && document.visibilityState === 'visible') {
          await client.request('put', `/team/channels/${selectedId}/read`, { seq: cursor })
          const values = await client.request('get', `/team/channels/${selectedId}/receipts`)
          if (active) setReceipts(values)
        }
        if (response.hasMore) window.setTimeout(() => void pull(), 0)
      } catch (e: any) {
        if (active) {
          setError(errorCode(e))
          if ([401, 403, 404].includes(e.response?.status)) { setMessages([]); setMinutes([]); setMeta(null); stopped = true }
        }
      } finally { inFlight = false }
    }
    pollRef.current = pull
    void pull()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void pull() }, 3000)
    return () => { active = false; clearInterval(timer); pollRef.current = null }
  }, [client, scope, selectedId, auditReason, refreshKey, currentChannel?.member])
  useEffect(() => {
    const acknowledged = outbox.filter(pending => messages.some(message => message.authorId === staffId && message.requestId === pending.id))
    if (acknowledged.length) void Promise.all(acknowledged.map(m => removePending(m.id))).then(async () => { if (client.current()) setOutbox(await pendingMessages(scope)) }).catch(() => setError('OUTBOX_STORAGE_FAILED'))
  }, [messages, outbox, scope, client, staffId])
  function select(c: Channel) {
    setSelectedId(c.id); setAuditInput(''); setAuditReason(''); setManaging(false); setText(''); setFiles([]); setSaved('')
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!selectedId || busy || !queueReady || !text.trim() && !files.length) return
    setBusy(true); setError('')
    try {
      if ((await pendingMessages(scope)).length >= 100) throw new Error('TEAM_OUTBOX_LIMIT')
      const value: TeamPending = { id: crypto.randomUUID(), scope, channelId: selectedId, text: text.trim(), files, uploaded: [], createdAt: new Date().toISOString() }
      await savePending(value); setOutbox(await pendingMessages(scope)); setText(''); setFiles([])
      await flush()
    } catch (e) { setError(errorCode(e)) } finally { setBusy(false) }
  }
  async function act(fn: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError(''); setSaved('')
    try { await fn(); await reload(); setRefreshKey(v => v + 1) } catch (e) { setError(errorCode(e)) } finally { setBusy(false) }
  }
  async function download(fileId: string) {
    try {
      const blob = await client.download(`/team/channels/${selectedId}/files/${fileId}${query}`)
      if (!client.current()) return
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'attachment' + (blob.type === 'application/pdf' ? '.pdf' : blob.type === 'image/png' ? '.png' : '.jpg'); a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch (e) { setError(errorCode(e)) }
  }
  async function saveMinute(status: 'draft' | 'confirmed') {
    if (!editing) return
    if (editing.actions.some(a => !a.text.trim() || !a.ownerId || !a.dueDate || !a.sourceSeq.length)) { setError(w.sourceRequired); return }
    const result = await client.request('put', `/team/channels/${selectedId}/minutes/${editing.id}${query}`, {
      requestId: crypto.randomUUID(), expectedVersion: editing.version, title: editing.title, decisions: editing.decisions,
      pending: editing.pending, actions: editing.actions, sourceSeq: editing.sourceSeq, status })
    setEditing(null); setSaved(w.saved); setMinutes(previous => previous.map(m => m.id === result.id ? result : m))
  }
  return <main className="space-y-4 p-4 text-gray-900" data-testid="team-communication">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">{administration ? w.admin : w.title}</h1><p className="text-sm text-gray-500">{w.subtitle}</p></div><div className="flex gap-2"><button className={button} onClick={() => { void reload(); setRefreshKey(v => v + 1) }}>{w.refresh}</button><button className={primary} onClick={() => setCreating(v => !v)}>{w.newChat}</button></div></header>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{w.notice}</p>
    {!online && <p role="status" className="rounded-lg bg-yellow-50 p-3">{w.offline}</p>}
    {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error === 'TEAM_VERSION_CONFLICT' ? w.conflict : w.error} <span>{error}</span></p>}
    {saved && <p role="status">{saved}</p>}
    {creating && <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={event => { event.preventDefault(); void act(async () => { const c = await client.request('post', '/team/channels', { requestId: crypto.randomUUID(), title: newTitle, kind, members }); setCreating(false); setNewTitle(''); setMembers([]); setSelectedId(c.id) }) }}>
      <label className="block text-sm">{w.channelTitle}<input className={field} maxLength={120} required value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label>
      <select aria-label={w.newChat} className={field} value={kind} onChange={e => { setKind(e.target.value); setMembers([]) }}>{(['direct', 'group', 'meeting', ...(capabilities.manage ? ['public'] : [])] as const).map(value => <option key={value} value={value}>{w[value as 'direct']}</option>)}</select>
      <fieldset><legend className="mb-2 text-sm font-medium">{w.members}</legend><div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto">{directory.filter(m => m.id !== staffId).map(m => <label className="flex items-center gap-2 text-sm" key={m.id}><input type={kind === 'direct' ? 'radio' : 'checkbox'} name="team-member" checked={members.includes(m.id)} onChange={e => setMembers(kind === 'direct' ? [m.id] : e.target.checked ? [...members, m.id] : members.filter(id => id !== m.id))} />{m.name}</label>)}</div></fieldset>
      <div className="flex gap-2"><button className={primary} disabled={busy || !members.length}>{w.create}</button><button type="button" className={button} onClick={() => setCreating(false)}>{w.cancel}</button></div>
    </form>}
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border bg-white p-3"><h2 className="mb-2 font-semibold">{w.channels}</h2>{!loaded ? <p>{w.loading}</p> : !channels.length ? <p className="text-sm text-gray-500">{w.empty}</p> : <div className="flex gap-2 overflow-auto lg:max-h-[70vh] lg:flex-col">{channels.map(c => <button key={c.id} className={`min-w-40 rounded-lg border p-3 text-left text-sm lg:min-w-0 ${selectedId === c.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-gray-50'}`} onClick={() => select(c)}><span className="block break-words font-semibold">{c.title}</span><span className="text-xs text-gray-500">{w[c.kind as 'direct']} {c.archived ? '· ' + w.archived : ''}</span>{c.unread > 0 && <span aria-label={`${c.unread} ${w.unread}`} className="ml-2 inline-flex whitespace-nowrap rounded-full bg-red-600 px-2 text-xs text-white">{c.unread}</span>}{outbox.some(m => m.channelId === c.id) && <span className="mt-1 block text-xs text-amber-700">{w.pending}: {outbox.filter(m => m.channelId === c.id).length}</span>}</button>)}</div>}</aside>
      <section className="min-w-0 space-y-4">
        {!selectedId ? <p className="rounded-xl border bg-white p-8 text-center text-gray-500">{w.select}</p> : <>
          <header className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-bold">{currentChannel?.title}</h2><p className="text-xs text-gray-500">{w.members}: {currentChannel?.members.map(m => name(m.staffId)).join('、')}</p>
            {currentChannel?.canEdit && <button className={button} onClick={() => { setMemberIds(currentChannel.members.map(m => m.staffId)); setHostId(currentChannel.ownerId); setManaging(v => !v) }}>{w.manage}</button>}
            {managing && <div className="space-y-3 border-t pt-3"><p className="text-sm text-gray-500">{w.joined}</p><div className="grid grid-cols-2 gap-2">{directory.map(m => <label key={m.id} className="text-sm"><input type="checkbox" disabled={currentChannel?.kind === 'direct'} checked={memberIds.includes(m.id)} onChange={e => setMemberIds(e.target.checked ? [...memberIds, m.id] : memberIds.filter(id => id !== m.id))} /> {m.name}</label>)}</div><label className="block text-sm">{w.transferred}<select className={field} value={hostId} onChange={e => setHostId(e.target.value)}>{directory.filter(m => memberIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy} onClick={() => void act(async () => { await client.request('put', `/team/channels/${selectedId}/members`, { expectedVersion: currentChannel!.version, members: memberIds, ownerId: hostId, archived: currentChannel!.archived }); setManaging(false) })}>{w.apply}</button>{!currentChannel?.archived && <button className={button} disabled={busy} onClick={() => void act(() => client.request('put', `/team/channels/${selectedId}/members`, { expectedVersion: currentChannel!.version, members: memberIds, ownerId: hostId, archived: true }))}>{w.archive}</button>}</div></div>}
            {!currentChannel?.member && <div className="space-y-2"><p className="text-sm">{w.memberOnly}</p>{capabilities.audit && <><label className="block text-sm">{w.auditReason}<input className={field} value={auditInput} maxLength={500} onChange={e => setAuditInput(e.target.value)} /></label><button className={button} disabled={auditInput.trim().length < 5} onClick={() => setAuditReason(auditInput.trim())}>{w.auditOpen}</button></>}</div>}
          </header>
          {(currentChannel?.member || auditReason) && <>
            {auditReason && <p className="rounded-lg bg-purple-50 p-3 text-sm">{w.audit} · {w.readOnly}</p>}
            <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-semibold">{w.history}</h3><div className="max-h-[55vh] space-y-3 overflow-auto" aria-live="polite" data-testid="team-messages">{messages.length === 0 && <p className="text-sm text-gray-500">{w.noMessages}</p>}{messages.map(m => <article id={`team-message-${m.seq}`} key={m.id} className={`rounded-lg p-3 ${m.authorId === staffId ? 'bg-red-50' : 'bg-gray-50'}`}><p className="text-xs text-gray-500">#{m.seq} · {m.authorName} · {date(m.createdAt)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.text}</p>{m.files.map((id, i) => <button key={id} className="mr-3 mt-2 text-sm text-red-700 underline" onClick={() => void download(id)}>{w.attachment} {i + 1}</button>)}</article>)}</div>
              {outbox.filter(m => m.channelId === selectedId && !messages.some(message => message.requestId === m.id)).map(m => <article key={m.id} className="mt-3 rounded-lg border border-dashed p-3 text-sm"><p className="whitespace-pre-wrap break-words">{m.text}</p><p>{m.files.length ? `${w.attachment}: ${m.files.length} · ` : ''}{m.error ? w.failed + ' (' + m.error + ')' : w.pending}</p><button className={button} onClick={() => { void savePending({ ...m, retryable: true, nextRetryAt: 0 }).then(() => flush()) }}>{w.retry}</button></article>)}
              {currentChannel?.member && !meta?.archived && !currentChannel.archived && <>{meta?.kind === 'meeting' && !meta.round ? <p className="mt-4 text-sm">{w.ended}</p> : <form className="mt-4 space-y-2 border-t pt-4" onSubmit={send}><textarea aria-label={w.message} className={field} maxLength={4000} value={text} onChange={e => setText(e.target.value)} rows={3} /><label className="block text-sm">{w.attach}<input type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={e => { const values = Array.from(e.target.files || []); if (values.length > 5 || values.some(file => file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))) { setError(w.fileLimit); return } setFiles(values) }} /></label><p className="text-xs text-gray-500">{w.fileLimit}</p>{files.length > 0 && <p className="text-xs">{files.map(f => f.name).join('、')}</p>}<button className={primary} disabled={busy || !queueReady || !text.trim() && !files.length}>{w.send}</button></form>}</>}
              {meta?.canEdit && currentChannel?.member && !meta.archived && <div className="mt-3 flex gap-2">{meta.round ? <button className={button} disabled={busy} onClick={() => void act(() => client.request('post', `/team/channels/${selectedId}/rounds/close`, { expectedVersion: meta.version }))}>{w.close}</button> : meta.kind === 'meeting' && <button className={button} disabled={busy} onClick={() => void act(() => client.request('post', `/team/channels/${selectedId}/rounds/start`, { expectedVersion: meta.version }))}>{w.start}</button>}</div>}
              {!!receipts.length && <details className="mt-4 text-xs text-gray-500"><summary>{w.receipts}</summary>{receipts.map(r => <p key={r.staffId}>{name(r.staffId)} · {w.allRead} #{r.seq}</p>)}</details>}
            </section>
            <section className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">{w.minutes}</h3><p className="text-xs text-gray-500">{w.manual} · {w.notShared}</p>{minutes.map(m => <article key={m.id} className="space-y-2 rounded-lg border p-3 text-sm"><h4 className="font-semibold">{m.title} · {w.version} {m.version} · {w[m.status]}</h4><p>{date(m.startedAt)} — {date(m.endedAt)}</p><p>{w.participants}: {m.participants.map(name).join('、')}</p><p>{w.range}: {m.toSeq >= m.fromSeq ? `#${m.fromSeq} — #${m.toSeq}` : w.noMessages}</p><p className="whitespace-pre-wrap">{w.decisions}: {m.decisions.join('\n')}</p><p className="whitespace-pre-wrap">{w.questions}: {m.pending.join('\n')}</p>{m.actions.map((a, i) => <p key={i}>{a.text} · {name(a.ownerId)} · {a.dueDate} · {a.sourceSeq.map(n => '#' + n).join(', ')}</p>)}<div className="flex flex-wrap gap-2">{m.toSeq >= m.fromSeq && <a className={button} href={`#team-message-${m.fromSeq}`}>{w.messagesLink}</a>}{meta?.canEdit && <button className={button} onClick={() => { setEditing(structuredClone(m)); setVersions([]) }}>{w.edit}</button>}<button className={button} onClick={() => void client.request('get', `/team/channels/${selectedId}/minutes/${m.id}/versions${query}`).then(setVersions).catch(e => setError(errorCode(e)))}>{w.versions}</button></div></article>)}
              {!!versions.length && <details open className="rounded-lg bg-gray-50 p-3"><summary>{w.versions}</summary>{versions.map(m => <pre key={m.id + m.version} className="my-2 whitespace-pre-wrap break-words text-xs">{w.version} {m.version} · {w[m.status]}{'\n'}{m.decisions.join('\n')}{'\n'}{m.pending.join('\n')}{'\n'}{m.actions.map(a => `${a.text} · ${name(a.ownerId)} · ${a.dueDate}`).join('\n')}</pre>)}</details>}
              {editing && <form className="space-y-3 rounded-xl border border-red-200 p-3" onSubmit={e => { e.preventDefault(); void act(() => saveMinute('draft')) }}><h4 className="font-bold">{w.edit} · {w.version} {editing.version}</h4><label className="block">{w.channelTitle}<input className={field} value={editing.title} maxLength={120} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label><label className="block">{w.decisions}<textarea className={field} value={editing.decisions.join('\n')} onChange={e => setEditing({ ...editing, decisions: e.target.value.split('\n') })} onBlur={() => setEditing({ ...editing, decisions: lines(editing.decisions.join('\n')) })} /></label><label className="block">{w.questions}<textarea className={field} value={editing.pending.join('\n')} onChange={e => setEditing({ ...editing, pending: e.target.value.split('\n') })} onBlur={() => setEditing({ ...editing, pending: lines(editing.pending.join('\n')) })} /></label><label className="block">{w.references}<input className={field} key={editing.id + editing.version} defaultValue={editing.sourceSeq.join(',')} onBlur={e => setEditing({ ...editing, sourceSeq: numbers(e.target.value) })} /></label><h5>{w.actions}</h5>{editing.actions.map((a, i) => <div key={i} className="grid gap-2 rounded-lg border p-3"><label>{w.action}<input className={field} value={a.text} maxLength={1000} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, text: e.target.value } : v) })} /></label><label>{w.owner}<select className={field} value={a.ownerId} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, ownerId: e.target.value } : v) })}><option value="">—</option>{directory.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>{w.due}<input className={field} type="date" value={a.dueDate} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, dueDate: e.target.value } : v) })} /></label><label>{w.references}<input className={field} defaultValue={a.sourceSeq.join(',')} onBlur={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, sourceSeq: numbers(e.target.value) } : v) })} /></label><button type="button" className={button} onClick={() => setEditing({ ...editing, actions: editing.actions.filter((_, n) => n !== i) })}>{w.remove}</button></div>)}<button type="button" className={button} onClick={() => setEditing({ ...editing, actions: [...editing.actions, { text: '', ownerId: '', dueDate: '', sourceSeq: [] }] })}>{w.addAction}</button><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy}>{w.save}</button><button type="button" className={button} disabled={busy} onClick={() => void act(() => saveMinute('confirmed'))}>{w.confirm}</button><button type="button" className={button} onClick={() => setEditing(null)}>{w.cancel}</button></div></form>}
            </section>
          </>}
        </>}
      </section>
    </div>
  </main>
}
