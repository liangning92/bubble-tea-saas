import './teamChat.css'
import { prepareTeamPhotos } from './teamPhoto'
import type { AttachmentOptions } from './teamAttachmentResource'
import { TeamChatMessages, type TeamScrollPositions } from './TeamChatMessages'
import { teamChatCopy } from './teamChatCopy'
import { FormEvent, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { teamCopy } from './teamCopy'
import { TeamPending, pendingMessages, removePending, savePending } from './teamOutbox'
import { TeamTasks, TeamTask } from './TeamTasks'
import { TeamAi } from './TeamAi'
import { teamWorkCopy } from './teamWorkCopy'
import { TeamOperations } from './TeamOperations'

export interface TeamClient {
  request: (method: 'get' | 'post' | 'put', url: string, data?: unknown) => Promise<any>
  upload: (file: File, requestId: string) => Promise<string>
  download: (url: string, options?: AttachmentOptions) => Promise<Blob>
  current: () => boolean
}
interface Channel {
  id: string; title: string; kind: string; ownerId: string; lastSeq: number; version: number; archived: boolean
  members: { staffId: string; fromSeq: number }[]; member: boolean; canEdit: boolean; canAudit: boolean; unread: number
  preview?: { text: string; authorName: string; createdAt: string } | null
  round: { id: string; title: string } | null
}
interface Message { id: string; requestId: string; seq: number; authorId: string; authorName: string; text: string; files: string[]; createdAt: string; ai?: { provider: string; model: string; approvedBy: string } }
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
export function TeamCommunication({ client, scope, staffId, language, administration = false, aiAdmin = false, compact = false, navigation, workflowPanel }: {
  client: TeamClient; scope: string; staffId: string; language: string; administration?: boolean; aiAdmin?: boolean; compact?: boolean
  navigation?: { channelId: string; select: (id: string) => void }
  workflowPanel?: (context: { channelId: string; directory: { id: string; name: string }[]; tasks: TeamTask[]; onChanged: () => void }) => ReactNode
}) {
  const w = teamCopy(language), work = teamWorkCopy(language), chat = teamChatCopy(language)
  const [search, setSearch] = useState(''), [panel, setPanel] = useState<'chat' | 'work'>('chat')
  const filePicker = useRef<HTMLInputElement>(null), composerInput = useRef<HTMLTextAreaElement>(null), conversationInfo = useRef<HTMLDetailsElement>(null)
  const drafts = useRef(new Map<string, { text: string; files: File[]; original: boolean }>())
  const scrollPositions = useRef<TeamScrollPositions>(new Map())
  const [sendOriginal, setSendOriginal] = useState(false), [preparing, setPreparing] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([]), [directory, setDirectory] = useState<{ id: string; name: string }[]>([])
  const [capabilities, setCapabilities] = useState({ manage: false, audit: false })
  const [internalId, setInternalId] = useState(''), [meta, setMeta] = useState<Channel | null>(null)
  const selectedId = navigation?.channelId ?? internalId
  const setSelectedId = (id: string) => navigation ? navigation.select(id) : setInternalId(id)
  const selectedRef = useRef(selectedId)
  const [historyReady, setHistoryReady] = useState(false)
  const [messages, setMessages] = useState<Message[]>([]), [messageChannelId, setMessageChannelId] = useState(''), [minutes, setMinutes] = useState<Minute[]>([])
  const [tasks, setTasks] = useState<TeamTask[]>([])
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
  function updateDraft(value: Partial<{ text: string; files: File[]; original: boolean }>) {
    if (compact) drafts.current.set(selectedId, { text, files, original: sendOriginal, ...value })
    if (value.text !== undefined) setText(value.text)
    if (value.files !== undefined) setFiles(value.files)
    if (value.original !== undefined) setSendOriginal(value.original)
  }
  useLayoutEffect(() => {
    selectedRef.current = selectedId
    const draft = compact ? drafts.current.get(selectedId) : undefined
    setText(draft?.text || ''); setFiles(draft?.files || []); setSendOriginal(draft?.original || false)
    setPanel('chat'); setAuditInput(''); setAuditReason(''); setManaging(false); setSaved('')
  }, [selectedId, compact])
  useLayoutEffect(() => {
    if (!compact || !composerInput.current) return
    const input = composerInput.current
    input.style.height = '0px'
    input.style.height = input.scrollHeight + 'px'
  }, [text, compact, selectedId, panel])
  useEffect(() => {
    if (!compact) return
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const menu = conversationInfo.current
      if (menu?.open && (event.type === 'keydown' ? (event as KeyboardEvent).key === 'Escape' : !menu.contains(event.target as Node))) menu.open = false
    }
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [compact])
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
            const id = await client.upload(message.files[message.uploaded.length], `${message.id}:${message.uploaded.length}`)
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
    setMessages([]); setHistoryReady(false); setMinutes([]); setTasks([]); setReceipts([]); setMeta(null); setEditing(null); setVersions([]); setError('')
    if (!selectedId || !currentChannel?.member && !auditReason) return
    let active = true, inFlight = false, cursor = 0, stopped = false
    const pull = async () => {
      if (!active || stopped || inFlight || !client.current()) return
      inFlight = true
      try {
        const response = await client.request('get', `/team/channels/${selectedId}/messages?after=${cursor}${auditReason ? '&auditReason=' + encodeURIComponent(auditReason) : ''}`)
        if (!active || !client.current()) return
        setMeta({ ...currentChannel!, ...response.channel, canEdit: response.canEdit }); setMessageChannelId(selectedId)
        setMessages(previous => [...new Map([...previous, ...response.messages].map((m: Message) => [m.seq, m])).values()].sort((a, b) => a.seq - b.seq))
        cursor = response.cursor; setHistoryReady(!response.hasMore); setError('')
        const [records, followUps] = await Promise.all([client.request('get', `/team/channels/${selectedId}/minutes${query}`), client.request('get', `/team/channels/${selectedId}/tasks${query}`)])
        if (!active || !client.current()) return
        setMinutes(records); setTasks(followUps)
        if (!auditReason && document.visibilityState === 'visible') {
          await client.request('put', `/team/channels/${selectedId}/read`, { seq: cursor })
          if (active && client.current()) window.dispatchEvent(new Event('notification-awareness-changed'))
          const values = await client.request('get', `/team/channels/${selectedId}/receipts`)
          if (active) setReceipts(values)
        }
        if (response.hasMore) window.setTimeout(() => void pull(), 0)
      } catch (e: any) {
        if (active) {
          setError(errorCode(e))
          if ([401, 403, 404].includes(e.response?.status)) { setMessages([]); setMinutes([]); setTasks([]); setMeta(null); stopped = true }
        }
      } finally { inFlight = false }
    }
    pollRef.current = pull
    void pull()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void pull() }, 3000)
    const resume = () => { if (document.visibilityState === 'visible') void pull() }
    window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume)
    return () => { active = false; clearInterval(timer); pollRef.current = null; window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume) }
  }, [client, scope, selectedId, auditReason, currentChannel?.member])
  useEffect(() => { void pollRef.current?.() }, [refreshKey])
  useEffect(() => {
    const acknowledged = outbox.filter(pending => messages.some(message => message.authorId === staffId && message.requestId === pending.id))
    if (acknowledged.length) void Promise.all(acknowledged.map(m => removePending(m.id))).then(async () => { if (client.current()) setOutbox(await pendingMessages(scope)) }).catch(() => setError('OUTBOX_STORAGE_FAILED'))
  }, [messages, outbox, scope, client, staffId])
  function select(c: Channel) {
    setSelectedId(c.id)
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!selectedId || busy || !queueReady || !text.trim() && !files.length) return
    setBusy(true); setError('')
    try {
      if ((await pendingMessages(scope)).length >= 100) throw new Error('TEAM_OUTBOX_LIMIT')
      setPreparing(!sendOriginal && files.length > 0)
      const preparedFiles = sendOriginal ? files : await prepareTeamPhotos(files)
      setPreparing(false)
      if (!client.current()) return
      const value: TeamPending = { id: crypto.randomUUID(), scope, channelId: selectedId, text: text.trim(), files: preparedFiles, uploaded: [], createdAt: new Date().toISOString() }
      await savePending(value); setOutbox(await pendingMessages(scope)); drafts.current.delete(selectedId)
      if (selectedRef.current === selectedId) { setText(''); setFiles([]); if (compact) setSendOriginal(false) }
      void flush()
    } catch (e) { setError(errorCode(e)) } finally { setBusy(false); setPreparing(false) }
  }
  async function act(fn: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError(''); setSaved('')
    try { await fn(); await reload(); setRefreshKey(v => v + 1) } catch (e) { setError(errorCode(e)) } finally { setBusy(false) }
  }
  async function saveMinute(status: 'draft' | 'confirmed') {
    if (!editing) return
    if (editing.actions.some(a => !a.text.trim() || !a.ownerId || !a.dueDate || !a.sourceSeq.length)) { setError(w.sourceRequired); return }
    const result = await client.request('put', `/team/channels/${selectedId}/minutes/${editing.id}${query}`, {
      requestId: crypto.randomUUID(), expectedVersion: editing.version, title: editing.title, decisions: editing.decisions,
      pending: editing.pending, actions: editing.actions, sourceSeq: editing.sourceSeq, status })
    setEditing(null); setSaved(w.saved); setMinutes(previous => previous.map(m => m.id === result.id ? result : m))
  }
  const privacy = <details className="team-privacy"><summary>{chat.privacy}</summary><p>{w.notice}</p></details>
  const receiptDetails = !!receipts.length && <details className="team-receipts mt-4 text-xs text-gray-500"><summary>{w.receipts}</summary>{receipts.map(r => <p key={r.staffId}>{name(r.staffId)} · {w.allRead} #{r.seq}</p>)}</details>
  const roundControls = meta?.canEdit && currentChannel?.member && !meta.archived && <div className="team-round-controls mt-3 flex gap-2">{meta.round ? <button className={button} disabled={busy} onClick={() => void act(() => client.request('post', `/team/channels/${selectedId}/rounds/close`, { expectedVersion: meta.version }))}>{w.close}</button> : meta.kind === 'meeting' && <button className={button} disabled={busy} onClick={() => void act(() => client.request('post', `/team/channels/${selectedId}/rounds/start`, { expectedVersion: meta.version }))}>{w.start}</button>}</div>
  return <main className={`team-app ${compact ? 'team-compact' : ''} ${selectedId ? 'team-has-selection' : ''}`} data-testid="team-communication">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">{administration ? w.admin : w.title}</h1><p className="text-sm text-gray-500">{w.subtitle}</p></div><div className="flex gap-2"><button className={button} onClick={() => { void reload(); setRefreshKey(v => v + 1) }}>{w.refresh}</button><button className={primary} onClick={() => setCreating(v => !v)}>{w.newChat}</button></div></header>
    {(!compact || !selectedId) && privacy}
    {!online && <p role="status" className="rounded-lg bg-yellow-50 p-3">{w.offline}</p>}
    {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">{error === 'TEAM_VERSION_CONFLICT' ? w.conflict : w.error} <span>{error}</span></p>}
    {saved && <p role="status">{saved}</p>}
    {creating && <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={event => { event.preventDefault(); void act(async () => { const c = await client.request('post', '/team/channels', { requestId: crypto.randomUUID(), title: newTitle, kind, members }); setCreating(false); setNewTitle(''); setMembers([]); setPanel('chat'); setSelectedId(c.id) }) }}>
      <label className="block text-sm">{w.channelTitle}<input className={field} maxLength={120} required value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label>
      <select aria-label={w.newChat} className={field} value={kind} onChange={e => { setKind(e.target.value); setMembers([]) }}>{(['direct', 'group', 'meeting', ...(capabilities.manage ? ['public'] : [])] as const).map(value => <option key={value} value={value}>{w[value as 'direct']}</option>)}</select>
      <fieldset><legend className="mb-2 text-sm font-medium">{w.members}</legend><div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto">{directory.filter(m => m.id !== staffId).map(m => <label className="flex items-center gap-2 text-sm" key={m.id}><input type={kind === 'direct' ? 'radio' : 'checkbox'} name="team-member" checked={members.includes(m.id)} onChange={e => setMembers(kind === 'direct' ? [m.id] : e.target.checked ? [...members, m.id] : members.filter(id => id !== m.id))} />{m.name}</label>)}</div></fieldset>
      <div className="flex gap-2"><button className={primary} disabled={busy || !members.length}>{w.create}</button><button type="button" className={button} onClick={() => setCreating(false)}>{w.cancel}</button></div>
    </form>}
    <div className="team-shell">
      <aside className="team-sidebar"><div className="team-sidebar-heading"><h2>{w.channels}</h2><span>{channels.length}</span></div><input className="team-search" type="search" aria-label={chat.search} placeholder={chat.search} value={search} onChange={e => setSearch(e.target.value)} />{!loaded ? <p className="p-4">{w.loading}</p> : !channels.length ? <p className="p-4 text-sm text-gray-500">{w.empty}</p> : <div className="team-channel-list">{channels.filter(c => c.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => <button key={c.id} disabled={busy} aria-pressed={selectedId === c.id} className={`team-channel ${selectedId === c.id ? 'team-channel-active' : ''}`} onClick={() => select(c)}><span className="team-avatar" aria-hidden="true">{c.title.slice(0, 1).toLocaleUpperCase()}</span><span className="team-channel-text"><span className="team-channel-title">{c.title}</span><span className="team-channel-kind">{w[c.kind as 'direct']} {c.archived ? '· ' + w.archived : ''}</span>{c.preview && <span className="team-channel-preview block truncate text-xs text-gray-500" title={c.preview.authorName + ': ' + c.preview.text}>{c.preview.authorName}: {c.preview.text}</span>}{outbox.some(m => m.channelId === c.id) && <span className="team-pending-label">{w.pending}: {outbox.filter(m => m.channelId === c.id).length}</span>}</span>{c.unread > 0 && <span aria-label={`${c.unread} ${w.unread}`} className="team-unread">{c.unread}</span>}</button>)}{!channels.some(c => c.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="p-4 text-sm text-gray-500">{chat.searchEmpty}</p>}</div>}</aside>
      <section className="team-conversation">
        {!selectedId ? <p className="rounded-xl border bg-white p-8 text-center text-gray-500">{w.select}</p> : <>
          <header className="team-conversation-header"><div className="team-conversation-title"><button type="button" className="team-mobile-back team-control" aria-label={compact && panel === 'work' ? chat.chat : chat.back} disabled={busy} onClick={() => panel === 'work' && compact ? setPanel('chat') : setSelectedId('')}>←</button><span className="team-avatar" aria-hidden="true">{currentChannel?.title.slice(0, 1).toLocaleUpperCase()}</span><div className="min-w-0"><h2 title={currentChannel?.title}>{currentChannel?.title}</h2><p>{w[currentChannel?.kind as 'direct']}</p></div>{compact && <button type="button" className="team-work-entry" aria-label={panel === 'work' ? chat.chat : chat.work} title={chat.work} aria-pressed={panel === 'work'} onClick={() => setPanel(panel === 'work' ? 'chat' : 'work')}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 6 2 2 3-4M11 6h10M3 13h4m4 0h10M3 20h4m4 0h10" /></svg>{tasks.some(t => !['completed', 'cancelled'].includes(t.status)) && <i aria-hidden="true" />}</button>}</div><details ref={conversationInfo} className="team-conversation-info"><summary aria-label={chat.info}>{compact ? <span aria-hidden="true">⋯</span> : chat.info}</summary>{compact && <><h3>{chat.info}</h3><p>{currentChannel?.title} · {w[currentChannel?.kind as 'direct']}</p>{privacy}{receiptDetails}{roundControls}<p>{w.fileLimit}</p></>}<p className="text-xs text-gray-500">{w.members}: {currentChannel?.members.map(m => name(m.staffId)).join('、')}</p>
            {currentChannel?.canEdit && <button className={button} onClick={() => { setMemberIds(currentChannel.members.map(m => m.staffId)); setHostId(currentChannel.ownerId); setManaging(v => !v) }}>{w.manage}</button>}
            {managing && <div className="space-y-3 border-t pt-3"><p className="text-sm text-gray-500">{w.joined}</p><div className="grid grid-cols-2 gap-2">{directory.map(m => <label key={m.id} className="text-sm"><input type="checkbox" disabled={currentChannel?.kind === 'direct'} checked={memberIds.includes(m.id)} onChange={e => setMemberIds(e.target.checked ? [...memberIds, m.id] : memberIds.filter(id => id !== m.id))} /> {m.name}</label>)}</div><label className="block text-sm">{w.transferred}<select className={field} value={hostId} onChange={e => setHostId(e.target.value)}>{directory.filter(m => memberIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy} onClick={() => void act(async () => { await client.request('put', `/team/channels/${selectedId}/members`, { expectedVersion: currentChannel!.version, members: memberIds, ownerId: hostId, archived: currentChannel!.archived }); setManaging(false) })}>{w.apply}</button>{!currentChannel?.archived && <button className={button} disabled={busy} onClick={() => void act(() => client.request('put', `/team/channels/${selectedId}/members`, { expectedVersion: currentChannel!.version, members: memberIds, ownerId: hostId, archived: true }))}>{w.archive}</button>}</div></div>}
            {!currentChannel?.member && <div className="space-y-2"><p className="text-sm">{w.memberOnly}</p>{capabilities.audit && <><label className="block text-sm">{w.auditReason}<input className={field} value={auditInput} maxLength={500} onChange={e => setAuditInput(e.target.value)} /></label><button className={button} disabled={auditInput.trim().length < 5} onClick={() => setAuditReason(auditInput.trim())}>{w.auditOpen}</button></>}</div>}
            </details><div className="team-tabs"><button type="button" aria-pressed={panel === 'chat'} onClick={() => setPanel('chat')}>{chat.chat}</button><button type="button" aria-pressed={panel === 'work'} onClick={() => setPanel('work')}>{chat.work}{tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).length > 0 && <span> · {tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).length}</span>}</button></div>
          </header>
          {(currentChannel?.member || auditReason) && <>
            {auditReason && <p className="rounded-lg bg-purple-50 p-3 text-sm">{w.audit} · {w.readOnly}</p>}
            <section className="team-chat-panel" hidden={panel !== 'chat'} aria-label={chat.chat}>
              <TeamChatMessages key={selectedId} historyFailed={!!error} historyReady={!compact || messageChannelId === selectedId && historyReady} scrollPositions={compact ? scrollPositions.current : undefined} messages={messageChannelId === selectedId ? messages : []} client={client} staffId={staffId} channelId={selectedId} query={query} language={language}>
              {outbox.filter(m => m.channelId === selectedId && !messages.some(message => message.requestId === m.id)).map(m => <article key={m.id} className="team-bubble team-bubble-own team-pending"><p className="team-message-text">{m.text}</p><p className="team-pending-label">{m.files.length ? `${w.attachment}: ${m.files.length} · ` : ''}{m.error ? w.failed : w.pending}</p>{m.error && <button className="team-control" onClick={() => { void savePending({ ...m, retryable: true, nextRetryAt: 0 }).then(() => flush()) }}>{w.retry}</button>}</article>)}
              </TeamChatMessages>
              {currentChannel?.member && !meta?.archived && !currentChannel.archived && <>{meta?.kind === 'meeting' && !meta.round ? <p className="mt-4 text-sm">{w.ended}</p> : <form className="team-composer" onSubmit={send}>
                {files.length > 0 && <div className="team-selected-files">{files.map((file, index) => <span key={index}>▧ {file.name}<button type="button" aria-label={`${chat.removeFile}: ${file.name}`} onClick={() => updateDraft({ files: files.filter((_, i) => i !== index) })}>×</button></span>)}</div>}
                <div className="team-composer-row"><button type="button" className="team-attach-button" disabled={busy} aria-label={w.attach} title={w.fileLimit} onClick={() => filePicker.current?.click()}>＋</button><input ref={filePicker} className="sr-only" aria-hidden="true" tabIndex={-1} type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={e => { const values = Array.from(e.target.files || []); if (values.length > 5 || values.some(file => file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))) { setError(w.fileLimit); return } updateDraft({ files: values, ...(compact ? { original: false } : {}) }); e.target.value = '' }} /><textarea ref={composerInput} disabled={busy} aria-label={w.message} placeholder={w.message} maxLength={4000} value={text} onChange={e => updateDraft({ text: e.target.value })} rows={compact ? 1 : 2} /><button className="team-send" disabled={busy || !queueReady || !text.trim() && !files.length}>{preparing ? chat.preparing : w.send} <span aria-hidden="true">➤</span></button></div>
                {(!compact || files.some(file => file.type.startsWith('image/'))) && <div className="team-photo-quality"><label><input type="checkbox" disabled={busy} checked={sendOriginal} onChange={e => updateDraft({ original: e.target.checked })} /> {chat.original}</label><span>{chat.photoHelp}</span></div>}{!compact && <details className="team-composer-help"><summary>{w.attachment} · {chat.hint}</summary><p>{w.fileLimit}</p></details>}
              </form>}</>}
              {!compact && <>{roundControls}{receiptDetails}</>}
            </section>
            <div className="team-work-panel" hidden={panel !== 'work'}>
            {aiAdmin && currentChannel?.member && !auditReason && workflowPanel?.({ channelId: selectedId, directory, tasks, onChanged: () => setRefreshKey(v => v + 1) })}
            {aiAdmin && currentChannel?.member && !auditReason && !meta?.archived && <TeamAi key={'ai:' + scope + selectedId} client={client} language={language} channelId={selectedId} messages={messages} onChanged={() => setRefreshKey(v => v + 1)} />}
            {aiAdmin && currentChannel?.member && !auditReason && !meta?.archived && <TeamOperations key={'operations:' + scope + selectedId} client={client} scope={scope} staffId={staffId} language={language} channelId={selectedId} directory={directory.filter(d => currentChannel.members.some(m => m.staffId === d.id))} tasks={tasks} onChanged={() => setRefreshKey(v => v + 1)} />}
            <TeamTasks key={'tasks:' + scope + selectedId + auditReason} tasks={tasks} client={client} channelId={selectedId} staffId={staffId} language={language} name={name} canManage={!!meta?.canEdit && !!currentChannel?.member && !auditReason} readOnly={!!auditReason || !!meta?.archived} messages={messages} onChanged={() => setRefreshKey(v => v + 1)} />
            <section className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">{w.minutes}</h3><p className="text-xs text-gray-500">{w.manual} · {w.notShared}</p>{minutes.map(m => <article key={m.id} className="space-y-2 rounded-lg border p-3 text-sm"><h4 className="font-semibold">{m.title} · {w.version} {m.version} · {w[m.status]}</h4><p>{date(m.startedAt)} — {date(m.endedAt)}</p><p>{w.participants}: {m.participants.map(name).join('、')}</p><p>{w.range}: {m.toSeq >= m.fromSeq ? `#${m.fromSeq} — #${m.toSeq}` : w.noMessages}</p><p className="whitespace-pre-wrap">{w.decisions}: {m.decisions.join('\n')}</p><p className="whitespace-pre-wrap">{w.questions}: {m.pending.join('\n')}</p>{m.actions.map((a, i) => <div key={i} className="space-y-2 rounded-lg border p-2"><p>{a.text} · {name(a.ownerId)} · {a.dueDate} · {a.sourceSeq.map(n => '#' + n).join(', ')}</p>{m.status === 'confirmed' && meta?.canEdit && currentChannel?.member && !auditReason && !meta.archived && <button className={button} disabled={busy} onClick={() => void act(() => client.request('post', `/team/channels/${selectedId}/tasks`, { requestId: crypto.randomUUID(), roundId: m.id, minuteVersion: m.version, actionIndex: i }))}>{work.promote}</button>}</div>)}<div className="flex flex-wrap gap-2">{m.toSeq >= m.fromSeq && <a className={button} href={`#team-message-${m.fromSeq}`} onClick={() => setPanel('chat')}>{w.messagesLink}</a>}{meta?.canEdit && <button className={button} onClick={() => { setEditing(structuredClone(m)); setVersions([]) }}>{w.edit}</button>}<button className={button} onClick={() => void client.request('get', `/team/channels/${selectedId}/minutes/${m.id}/versions${query}`).then(setVersions).catch(e => setError(errorCode(e)))}>{w.versions}</button></div></article>)}
              {!!versions.length && <details open className="rounded-lg bg-gray-50 p-3"><summary>{w.versions}</summary>{versions.map(m => <pre key={m.id + m.version} className="my-2 whitespace-pre-wrap break-words text-xs">{w.version} {m.version} · {w[m.status]}{'\n'}{m.decisions.join('\n')}{'\n'}{m.pending.join('\n')}{'\n'}{m.actions.map(a => `${a.text} · ${name(a.ownerId)} · ${a.dueDate}`).join('\n')}</pre>)}</details>}
              {editing && <form className="space-y-3 rounded-xl border border-red-200 p-3" onSubmit={e => { e.preventDefault(); void act(() => saveMinute('draft')) }}><h4 className="font-bold">{w.edit} · {w.version} {editing.version}</h4><label className="block">{w.channelTitle}<input className={field} value={editing.title} maxLength={120} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label><label className="block">{w.decisions}<textarea className={field} value={editing.decisions.join('\n')} onChange={e => setEditing({ ...editing, decisions: e.target.value.split('\n') })} onBlur={() => setEditing({ ...editing, decisions: lines(editing.decisions.join('\n')) })} /></label><label className="block">{w.questions}<textarea className={field} value={editing.pending.join('\n')} onChange={e => setEditing({ ...editing, pending: e.target.value.split('\n') })} onBlur={() => setEditing({ ...editing, pending: lines(editing.pending.join('\n')) })} /></label><label className="block">{w.references}<input className={field} key={editing.id + editing.version} defaultValue={editing.sourceSeq.join(',')} onBlur={e => setEditing({ ...editing, sourceSeq: numbers(e.target.value) })} /></label><h5>{w.actions}</h5>{editing.actions.map((a, i) => <div key={i} className="grid gap-2 rounded-lg border p-3"><label>{w.action}<input className={field} value={a.text} maxLength={1000} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, text: e.target.value } : v) })} /></label><label>{w.owner}<select className={field} value={a.ownerId} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, ownerId: e.target.value } : v) })}><option value="">—</option>{directory.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>{w.due}<input className={field} type="date" value={a.dueDate} onChange={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, dueDate: e.target.value } : v) })} /></label><label>{w.references}<input className={field} defaultValue={a.sourceSeq.join(',')} onBlur={e => setEditing({ ...editing, actions: editing.actions.map((v, n) => n === i ? { ...v, sourceSeq: numbers(e.target.value) } : v) })} /></label><button type="button" className={button} onClick={() => setEditing({ ...editing, actions: editing.actions.filter((_, n) => n !== i) })}>{w.remove}</button></div>)}<button type="button" className={button} onClick={() => setEditing({ ...editing, actions: [...editing.actions, { text: '', ownerId: '', dueDate: '', sourceSeq: [] }] })}>{w.addAction}</button><div className="flex flex-wrap gap-2"><button className={primary} disabled={busy}>{w.save}</button><button type="button" className={button} disabled={busy} onClick={() => void act(() => saveMinute('confirmed'))}>{w.confirm}</button><button type="button" className={button} onClick={() => setEditing(null)}>{w.cancel}</button></div></form>}
            </section>
            </div>
          </>}
        </>}
      </section>
    </div>
  </main>
}
