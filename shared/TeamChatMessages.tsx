import { Children, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TeamAttachment } from './TeamAttachment'
import { teamWorkCopy } from './teamWorkCopy'
import { teamChatCopy } from './teamChatCopy'
import type { TeamClient } from './TeamCommunication'
export interface TeamMessageAi { provider?: string; model: string; approvedBy?: string; authorizedBy?: string; managementAuthorization?: { jobId: string; sourceSeq: number }; routineAuthorization?: { jobId: string; sourceSeq: number; policyHash: string; policyVersion: number; epoch: number; replyCode: string } }
export interface TeamMessageAgent { agentId: string; grantVersion: number; clientRevision: number; task?: { taskId: string; version: number }; replyToSeq?: number }
export interface TeamAiHandling { state: 'queued' | 'processing' | 'needs_review' | 'understood' | 'replied' | 'waiting_owner' | 'pending_action' | 'paused'; updatedAt: string }
interface ChatMessage { id: string; seq: number; authorId: string; authorName: string; text: string; files: string[]; createdAt: string; ai?: TeamMessageAi; agent?: TeamMessageAgent; aiHandling?: TeamAiHandling }
export type TeamScrollPositions = Map<string, { top: number; bottom: boolean }>
export function TeamChatMessages({ messages, client, staffId, channelId, query, language, children, scrollPositions, historyReady = true, historyFailed = false }: {
 messages: ChatMessage[]; client: TeamClient; staffId: string; channelId: string; query: string; language: string; children: ReactNode; scrollPositions?: TeamScrollPositions; historyReady?: boolean; historyFailed?: boolean
}) {
 const copy = teamChatCopy(language), work = teamWorkCopy(language)
 const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), bottom = useRef(true), initial = useRef(true), manualScroll = useRef(false)
 const [away, setAway] = useState(false)
 const restoring = initial.current && !historyReady && !historyFailed && scrollPositions?.get(channelId)?.bottom === false
 const locale = language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID'
 const jump = () => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; bottom.current = true; manualScroll.current = false; setAway(false); scrollPositions?.set(channelId, { top: scroll.current?.scrollTop || 0, bottom: true }) }
 useLayoutEffect(() => { initial.current = true; bottom.current = true; setAway(false) }, [channelId])
 useLayoutEffect(() => {
  if (!scroll.current?.clientHeight) return
  if (initial.current && (messages.length || Children.count(children))) {
   const saved = scrollPositions?.get(channelId)
   if (saved && !saved.bottom) {
    if (!historyReady) return
    scroll.current.scrollTop = saved.top; bottom.current = false; setAway(true)
   } else jump()
   initial.current = false
  } else if (bottom.current && !initial.current) jump()
 }, [messages.length, children, historyReady])
 useEffect(() => {
  if (!scrollPositions || !scroll.current || !content.current) return
  const observer = new ResizeObserver(() => { if (bottom.current && !initial.current && scroll.current?.clientHeight) jump() })
  const reference = (event: MouseEvent) => {
   const anchor = (event.target as Element).closest?.('a')
   if (anchor?.hash.startsWith('#team-message-')) { manualScroll.current = true; bottom.current = false; setAway(true) }
  }
  observer.observe(scroll.current); observer.observe(content.current)
  document.addEventListener('click', reference, true)
  return () => { observer.disconnect(); document.removeEventListener('click', reference, true) }
 }, [channelId, scrollPositions])
 const handlingLabels: Record<TeamAiHandling['state'], string> = language.startsWith('zh') ? { queued: 'AI待处理', processing: 'AI正在处理', needs_review: '问题已保存，待复核', understood: 'AI已理解，无需追问', replied: 'AI回复已保存', waiting_owner: '问题已保存，等待负责人决定', pending_action: '行动已记录，待处理', paused: '问题已保存，AI处理已暂停' } : language.startsWith('en') ? { queued: 'Queued for AI', processing: 'AI is processing', needs_review: 'Saved; needs review', understood: 'AI understood; no follow-up needed', replied: 'AI reply saved', waiting_owner: 'Saved; awaiting owner decision', pending_action: 'Action recorded; pending', paused: 'Saved; AI processing paused' } : { queued: 'Menunggu AI', processing: 'Sedang diproses AI', needs_review: 'Tersimpan; perlu ditinjau', understood: 'AI memahami; tidak perlu pertanyaan lanjutan', replied: 'Balasan AI tersimpan', waiting_owner: 'Tersimpan; menunggu keputusan penanggung jawab', pending_action: 'Tindakan tercatat; menunggu tindak lanjut', paused: 'Tersimpan; pemrosesan AI dijeda' }
 const day = (s: string) => new Date(s).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
 return <div className="team-message-area" aria-busy={restoring || undefined}>
  {restoring && <p role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{work.loading}</p>}
  <div ref={scroll} style={restoring ? { visibility: 'hidden' } : undefined} className="team-messages" role="log" tabIndex={scrollPositions ? 0 : undefined} aria-live="polite" aria-relevant="additions" data-testid="team-messages"
  onWheel={event => { if (initial.current || event.deltaY < 0 || !bottom.current) manualScroll.current = true }}
  onTouchMove={() => { manualScroll.current = true }}
  onTouchEnd={() => { const el = scroll.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) manualScroll.current = false }}
  onPointerDown={event => { const el = scroll.current; if (el && event.target === el && event.clientX >= el.getBoundingClientRect().left + el.clientWidth) manualScroll.current = true }}
  onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) manualScroll.current = true }}
  onScroll={() => {
   const el = scroll.current!; if (!el.clientHeight) return
   if (initial.current) {
    if (!manualScroll.current) return
    initial.current = false; bottom.current = false
   }
   if (scrollPositions && bottom.current && !manualScroll.current) { jump(); return }
   bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAway(!bottom.current)
   if (bottom.current) manualScroll.current = false
   scrollPositions?.set(channelId, { top: el.scrollTop, bottom: bottom.current })
  }}>
   <div ref={content}>
   {!messages.length && <p className="team-chat-empty">{copy.empty}</p>}
   {messages.map((message, i) => <Fragment key={message.id}>
    {(!i || day(messages[i - 1].createdAt) !== day(message.createdAt)) && <div className="team-day"><span>{day(message.createdAt)}</span></div>}
    <article id={`team-message-${message.seq}`} className={`team-bubble ${message.authorId === staffId ? 'team-bubble-own' : 'team-bubble-other'}`}>
     <p className="team-message-author">{message.authorName}</p>
     {message.text && <p className="team-message-text">{message.text}</p>}
     {message.agent && <p className="team-ai-label" data-testid="team-agent-source">{language.startsWith('zh') ? '运营智能体' : language.startsWith('en') ? 'Operations agent' : 'Agen operasional'}</p>}
     {message.ai && <p className="team-ai-label">{(message.ai.routineAuthorization || message.ai.managementAuthorization) ? work.aiRoutine : work.aiApproved} · {message.ai.model}</p>}
     {message.authorId === staffId && !message.ai && message.aiHandling && handlingLabels[message.aiHandling.state] && <p className="team-ai-label" data-testid="team-ai-handling" data-state={message.aiHandling.state}>{handlingLabels[message.aiHandling.state]}</p>}
     {message.files.map(id => <TeamAttachment key={id} client={client} language={language} url={`/team/channels/${channelId}/files/${id}${query}`} />)}
     <div className="team-message-meta"><a href={`#team-message-${message.seq}`} aria-label={`#${message.seq}`}>#{message.seq}</a><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{message.authorId === staffId && <span aria-label={copy.sent} title={copy.sent}>✓</span>}</div>
    </article>
   </Fragment>)}
   {children}
   </div>
  </div>
  {away && <button type="button" className="team-jump" onClick={jump}>↓ {copy.latest}</button>}
 </div>
}
