import { TeamWorkTargetStatus, teamWorkTargetStyle } from './teamWorkTarget'
import { Children, Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TeamAttachment } from './TeamAttachment'
import { teamWorkCopy } from './teamWorkCopy'
import { teamChatCopy } from './teamChatCopy'
import type { TeamClient } from './TeamCommunication'
export interface TeamMessageAi { provider?: string; model: string; approvedBy?: string; authorizedBy?: string; managementAuthorization?: { jobId: string; sourceSeq: number }; routineAuthorization?: { jobId: string; sourceSeq: number; policyHash: string; policyVersion: number; epoch: number; replyCode: string } }
export interface TeamMessageAgent { agentId: string; grantVersion: number; clientRevision: number; task?: { taskId: string; version: number }; replyToSeq?: number }
export interface TeamAiHandling { state: 'queued' | 'processing' | 'needs_review' | 'understood' | 'replied' | 'waiting_owner' | 'pending_action' | 'paused' | 'failed'; updatedAt: string; failureReason?:'permission'|'paused'|'execution'|'delayed'|'timeout'|'review'|'human' }
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
 const handlingLabels: Record<TeamAiHandling['state'], string> = language.startsWith('zh') ? { failed:'AI未完成这次请求', queued: 'AI待处理', processing: 'AI正在处理', needs_review: '问题已保存，待复核', understood: 'AI已理解，无需追问', replied: 'AI回复已保存', waiting_owner: '问题已保存，等待负责人决定', pending_action: '行动已记录，待处理', paused: '问题已保存，AI处理已暂停' } : language.startsWith('en') ? { failed:'AI could not complete this request', queued: 'Queued for AI', processing: 'AI is processing', needs_review: 'Saved; needs review', understood: 'AI understood; no follow-up needed', replied: 'AI reply saved', waiting_owner: 'Saved; awaiting owner decision', pending_action: 'Action recorded; pending', paused: 'Saved; AI processing paused' } : { failed:'AI belum menyelesaikan permintaan ini', queued: 'Pesan diterima; menunggu Hermes', processing: 'Hermes sedang menyiapkan balasan', needs_review: 'Tersimpan; perlu ditinjau', understood: 'Pesan sudah diterima', replied: 'Balasan AI tersimpan', waiting_owner: 'Tersimpan; menunggu keputusan penanggung jawab', pending_action: 'Tindakan tercatat; menunggu tindak lanjut', paused: 'Tersimpan; pemrosesan AI dijeda' }
 const failureCopy=language.startsWith('zh')?{permission:'当前账户或会话成员缺少这项操作所需的权限。请管理员核对员工权限；Hermes 不会执行未授权操作。',paused:'Hermes 服务或会话已暂停，或授权已到期。消息已保存，但本次请求尚未确认完成。已保存的操作不会自动重做；管理员可在 AI 设置查看并恢复。',execution:'Hermes 本次执行未完成，服务发生异常。已保存的操作不会自动重做；如涉及写入，请先核对操作记录，避免重复提交。',delayed:'Hermes 回复等待时间较长。消息已保存，请管理员检查服务状态；不要在核对结果前重复提交业务操作。',timeout:'Hermes 尚未确认完成本次请求，处理时间已超出预期。消息已保存，请管理员核对服务与操作记录；不会自动重做业务。',review:'消息已保存，需要负责人检查后才能继续。',human:'这条消息是在负责人接管期间保存的，尚未由 Hermes 处理。负责人可在本会话的工作流设置明确恢复自动回复；旧业务操作不会自行重做。'}:language.startsWith('en')?{permission:'The current account or conversation members lack the required permission. Ask an administrator to check employee access. Hermes will not perform unauthorized operations.',paused:'Hermes or this conversation is paused, or its authorization expired. Your message is saved but completion is unconfirmed. Saved operations are not repeated automatically. Check AI settings to resume.',execution:'Hermes did not complete this request because execution failed. Saved operations are not automatically repeated. Check operation records before resubmitting a write.',delayed:'The Hermes reply is taking longer than expected. Your message is saved. Ask a manager to check the service before repeating a business operation.',timeout:'Completion is unconfirmed and processing has taken longer than expected. Your message is saved. Ask a manager to check the service and operation records; operations are not repeated automatically.',review:'Your message is saved. A manager needs to review it before Hermes can continue.',human:'This message was saved while a manager had taken over the conversation. Hermes has not handled it. A manager can explicitly resume replies in this conversation’s workflow settings; old operations are not repeated automatically.'}:{permission:'Akun ini atau anggota percakapan belum punya izin yang diperlukan. Minta pengelola memeriksa izin karyawan. Hermes tidak akan menjalankan pekerjaan tanpa izin.',paused:'Hermes belum aktif, sedang dijeda, atau izinnya sudah habis. Pesanmu sudah disimpan. Minta pengelola memeriksa layanan Hermes. Pekerjaan sebelumnya tidak diulang otomatis.',execution:'Hermes sedang bermasalah dan belum berhasil menjawab. Pesanmu sudah disimpan. Minta pengelola mengecek. Jika tadi meminta perubahan data, periksa catatannya sebelum mengulang.',delayed:'Balasan Hermes lebih lama dari biasanya. Pesanmu sudah disimpan. Minta pengelola memeriksa layanan Hermes. Jangan ulangi perubahan data sebelum diperiksa.',timeout:'Balasan belum selesai dan hasil pekerjaan belum bisa dipastikan. Pesanmu sudah disimpan. Minta pengelola memeriksa. Jangan ulangi perubahan data sebelum catatannya diperiksa.',review:'Pesanmu sudah disimpan. Pengelola perlu memeriksa sebelum Hermes melanjutkan.',human:'Pesan ini disimpan saat pengelola mengambil alih percakapan. Hermes belum menjawabnya. Minta pengelola memeriksa dan mengaktifkan balasan Hermes di pengaturan percakapan ini. Pekerjaan lama tidak diulang otomatis.'}
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
    <article id={`team-message-${message.seq}`} data-team-target-kind="message" data-team-target-id={String(message.seq)} style={!historyFailed&&message.seq===targetSeq?teamWorkTargetStyle:undefined} className={`team-bubble ${message.authorId === staffId && !message.ai && !message.agent ? 'team-bubble-own' : 'team-bubble-other'}`}>
     <p className="team-message-author">{message.authorName}</p>
     {message.agent?.replyToSeq!==undefined&&<a className="team-ai-label" href={`#team-message-${message.agent.replyToSeq}`} data-testid="team-agent-reply-source">{language.startsWith('zh')?'回复':language.startsWith('en')?'Reply to':'Balasan untuk'} #{message.agent.replyToSeq}</a>}
     {message.text && <p className="team-message-text">{message.text}</p>}
     {message.agent && <p className="team-ai-label" data-testid="team-agent-source">{language.startsWith('zh') ? '运营智能体' : language.startsWith('en') ? 'Operations agent' : 'Agen operasional'}</p>}
     {message.ai && <p className="team-ai-label">{(message.ai.routineAuthorization || message.ai.managementAuthorization) ? work.aiRoutine : work.aiApproved} · {message.ai.model}</p>}
     {message.authorId === staffId && !message.ai && !message.agent && message.aiHandling && handlingLabels[message.aiHandling.state] && <p className="team-ai-label" data-testid="team-ai-handling" data-state={message.aiHandling.state}>{handlingLabels[message.aiHandling.state]}</p>}
     {message.authorId === staffId && !message.ai && !message.agent && message.aiHandling?.failureReason && failureCopy[message.aiHandling.failureReason] && <div role="status" data-testid="team-ai-failure" style={{marginTop:8,padding:'10px 12px',border:'1px solid #f0c36d',borderRadius:8,background:'#fffbeb',color:'#78350f',fontSize:13,lineHeight:1.6,overflowWrap:'anywhere'}}>{failureCopy[message.aiHandling.failureReason]}</div>}
     {message.files.map(id => <TeamAttachment key={id} client={client} language={language} url={`/team/channels/${channelId}/files/${id}${query}`} />)}
     <div className="team-message-meta"><a href={`#team-message-${message.seq}`} aria-label={`#${message.seq}`}>#{message.seq}</a><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{message.authorId === staffId && !message.ai && !message.agent && <span aria-label={copy.sent} title={copy.sent}>✓</span>}</div>
    </article>
   </Fragment>)}
   {children}
   </div>
  </div>
  {away && <button type="button" className="team-jump" onClick={() => jump(true)}>↓ {copy.latest}</button>}
 </div>
}
