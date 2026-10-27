import { TeamWorkTargetStatus, teamWorkTargetStyle } from './teamWorkTarget'
import { Children, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TeamAttachment } from './TeamAttachment'
import { teamWorkCopy } from './teamWorkCopy'
import { teamChatCopy } from './teamChatCopy'
import type { TeamClient } from './TeamCommunication'
export interface TeamMessageAi { provider?: string; model: string; approvedBy?: string; authorizedBy?: string; managementAuthorization?: { jobId: string; sourceSeq: number }; routineAuthorization?: { jobId: string; sourceSeq: number; policyHash: string; policyVersion: number; epoch: number; replyCode: string } }
export interface TeamMessageAgent { agentId: string; grantVersion: number; clientRevision: number; task?: { taskId: string; version: number }; replyToSeq?: number }
export interface TeamAiHandling { state: 'queued' | 'processing' | 'needs_review' | 'understood' | 'replied' | 'waiting_owner' | 'pending_action' | 'paused' | 'failed'; updatedAt: string; failureReason?:'permission'|'paused'|'execution'|'delayed' }
interface ChatMessage { id: string; seq: number; authorId: string; authorName: string; text: string; files: string[]; createdAt: string; ai?: TeamMessageAi; agent?: TeamMessageAgent; aiHandling?: TeamAiHandling }
export type TeamScrollPositions = Map<string, { top: number; bottom: boolean }>
export function TeamChatMessages({ messages, client, staffId, channelId, query, language, children, scrollPositions, historyReady = true, historyFailed = false, targetSeq, targetActive = true }: {
 targetSeq?: number; targetActive?: boolean
 messages: ChatMessage[]; client: TeamClient; staffId: string; channelId: string; query: string; language: string; children: ReactNode; scrollPositions?: TeamScrollPositions; historyReady?: boolean; historyFailed?: boolean
}) {
 const copy = teamChatCopy(language), work = teamWorkCopy(language)
 const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null), bottom = useRef(true), initial = useRef(true), manualScroll = useRef(false)
 const targetLocked = useRef(!!targetSeq)
 const [away, setAway] = useState(false)
 const restoring = initial.current && !historyReady && !historyFailed && scrollPositions?.get(channelId)?.bottom === false
 const locale = language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID'
 const jump = (manual = false) => { if (targetLocked.current && !manual) return; if (manual) targetLocked.current = false; if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; bottom.current = true; manualScroll.current = false; setAway(false); scrollPositions?.set(channelId, { top: scroll.current?.scrollTop || 0, bottom: true }) }
 useLayoutEffect(() => { targetLocked.current = !!targetSeq; initial.current = !targetSeq; bottom.current = !targetSeq; manualScroll.current = !!targetSeq; setAway(!!targetSeq) }, [channelId, targetSeq])
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
 const handlingLabels: Record<TeamAiHandling['state'], string> = language.startsWith('zh') ? { failed:'AI未完成这次请求', queued: 'AI待处理', processing: 'AI正在处理', needs_review: '问题已保存，待复核', understood: 'AI已理解，无需追问', replied: 'AI回复已保存', waiting_owner: '问题已保存，等待负责人决定', pending_action: '行动已记录，待处理', paused: '问题已保存，AI处理已暂停' } : language.startsWith('en') ? { failed:'AI could not complete this request', queued: 'Queued for AI', processing: 'AI is processing', needs_review: 'Saved; needs review', understood: 'AI understood; no follow-up needed', replied: 'AI reply saved', waiting_owner: 'Saved; awaiting owner decision', pending_action: 'Action recorded; pending', paused: 'Saved; AI processing paused' } : { failed:'AI belum menyelesaikan permintaan ini', queued: 'Menunggu AI', processing: 'Sedang diproses AI', needs_review: 'Tersimpan; perlu ditinjau', understood: 'AI memahami; tidak perlu pertanyaan lanjutan', replied: 'Balasan AI tersimpan', waiting_owner: 'Tersimpan; menunggu keputusan penanggung jawab', pending_action: 'Tindakan tercatat; menunggu tindak lanjut', paused: 'Tersimpan; pemrosesan AI dijeda' }
 const failureCopy=language.startsWith('zh')?{permission:'Hermes 当前授权不足，无法完成这项操作。管理员可在 AI 设置调整对应模块权限；不会执行未授权操作。',paused:'Hermes 服务或会话已暂停，或授权已到期。消息已保存，但本次请求尚未确认完成。已保存的操作不会自动重做；管理员可在 AI 设置查看并恢复。',execution:'Hermes 本次执行未完成，服务发生异常。已保存的操作不会自动重做；如涉及写入，请先核对操作记录，避免重复提交。',delayed:'Hermes 尚未开始处理这条消息，等待时间较长。请检查 AI 服务是否在线；消息已保留，不会因重复投递而自动重做业务。'}:language.startsWith('en')?{permission:'Hermes lacks the authorization for this operation. An administrator can adjust the module permissions in AI settings. Unauthorized operations are not performed.',paused:'Hermes or this conversation is paused, or its authorization expired. Your message is saved but completion is unconfirmed. Saved operations are not repeated automatically. Check AI settings to resume.',execution:'Hermes did not complete this request because execution failed. Saved operations are not automatically repeated. Check operation records before resubmitting a write.',delayed:'Hermes has not started this message and the wait is taking longer than expected. Check whether the AI service is online. The message is retained.'}:{permission:'Izin Hermes belum cukup untuk operasi ini. Administrator dapat mengatur izin modul di pengaturan AI. Operasi tanpa izin tidak dijalankan.',paused:'Hermes atau percakapan dijeda, atau izin telah kedaluwarsa. Pesan tersimpan, tetapi penyelesaian belum terkonfirmasi. Operasi tersimpan tidak diulang otomatis. Periksa pengaturan AI untuk melanjutkan.',execution:'Hermes belum menyelesaikan permintaan ini karena eksekusi gagal. Operasi tersimpan tidak diulang otomatis. Periksa catatan operasi sebelum mengirim ulang perubahan.',delayed:'Hermes belum mulai memproses pesan ini dan waktu tunggu lebih lama dari perkiraan. Periksa apakah layanan AI aktif. Pesan tetap tersimpan.'}
 const day = (s: string) => new Date(s).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
 return <div className="team-message-area" data-team-target-scope={channelId} aria-busy={restoring || undefined}>
  <div style={{position:'absolute',top:8,left:8,right:8,zIndex:1,pointerEvents:'none'}}><TeamWorkTargetStatus id={targetSeq === undefined ? undefined : String(targetSeq)} kind="message" scope={channelId + staffId} ready={historyReady} failed={historyFailed} found={messages.some(message=>message.seq===targetSeq)} active={targetActive} language={language}/></div>
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
    <article id={`team-message-${message.seq}`} data-team-target-kind="message" data-team-target-id={String(message.seq)} style={!historyFailed&&message.seq===targetSeq?teamWorkTargetStyle:undefined} className={`team-bubble ${message.authorId === staffId ? 'team-bubble-own' : 'team-bubble-other'}`}>
     <p className="team-message-author">{message.authorName}</p>
     {message.text && <p className="team-message-text">{message.text}</p>}
     {message.agent && <p className="team-ai-label" data-testid="team-agent-source">{language.startsWith('zh') ? '运营智能体' : language.startsWith('en') ? 'Operations agent' : 'Agen operasional'}</p>}
     {message.ai && <p className="team-ai-label">{(message.ai.routineAuthorization || message.ai.managementAuthorization) ? work.aiRoutine : work.aiApproved} · {message.ai.model}</p>}
     {message.authorId === staffId && !message.ai && message.aiHandling && handlingLabels[message.aiHandling.state] && <p className="team-ai-label" data-testid="team-ai-handling" data-state={message.aiHandling.state}>{handlingLabels[message.aiHandling.state]}</p>}
     {message.authorId === staffId && !message.ai && message.aiHandling?.failureReason && failureCopy[message.aiHandling.failureReason] && <div role="status" data-testid="team-ai-failure" style={{marginTop:8,padding:'10px 12px',border:'1px solid #f0c36d',borderRadius:8,background:'#fffbeb',color:'#78350f',fontSize:13,lineHeight:1.6,overflowWrap:'anywhere'}}>{failureCopy[message.aiHandling.failureReason]}</div>}
     {message.files.map(id => <TeamAttachment key={id} client={client} language={language} url={`/team/channels/${channelId}/files/${id}${query}`} />)}
     <div className="team-message-meta"><a href={`#team-message-${message.seq}`} aria-label={`#${message.seq}`}>#{message.seq}</a><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{message.authorId === staffId && <span aria-label={copy.sent} title={copy.sent}>✓</span>}</div>
    </article>
   </Fragment>)}
   {children}
   </div>
  </div>
  {away && <button type="button" className="team-jump" onClick={() => jump(true)}>↓ {copy.latest}</button>}
 </div>
}
