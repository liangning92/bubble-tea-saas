import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { TeamAttachment } from './TeamAttachment'
import { teamWorkCopy } from './teamWorkCopy'
import { teamChatCopy } from './teamChatCopy'
import type { TeamClient } from './TeamCommunication'
interface ChatMessage { id: string; seq: number; authorId: string; authorName: string; text: string; files: string[]; createdAt: string; ai?: { model: string } }
export function TeamChatMessages({ messages, client, staffId, channelId, query, language, children }: {
 messages: ChatMessage[]; client: TeamClient; staffId: string; channelId: string; query: string; language: string; children: ReactNode
}) {
 const copy = teamChatCopy(language), work = teamWorkCopy(language)
 const scroll = useRef<HTMLDivElement>(null), bottom = useRef(true), initial = useRef(true)
 const [away, setAway] = useState(false)
 const locale = language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-GB' : 'id-ID'
 const jump = () => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; bottom.current = true; setAway(false) }
 useEffect(() => { initial.current = true; bottom.current = true; setAway(false) }, [channelId])
 useEffect(() => { if (bottom.current || initial.current && messages.length) { jump(); if (messages.length) initial.current = false } }, [messages.length, children])
 const day = (s: string) => new Date(s).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
 return <div className="team-message-area">
  <div ref={scroll} className="team-messages" role="log" aria-live="polite" aria-relevant="additions" data-testid="team-messages" onScroll={() => {
   const el = scroll.current!; bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAway(!bottom.current)
  }}>
   {!messages.length && <p className="team-chat-empty">{copy.empty}</p>}
   {messages.map((message, i) => <Fragment key={message.id}>
    {(!i || day(messages[i - 1].createdAt) !== day(message.createdAt)) && <div className="team-day"><span>{day(message.createdAt)}</span></div>}
    <article id={`team-message-${message.seq}`} className={`team-bubble ${message.authorId === staffId ? 'team-bubble-own' : 'team-bubble-other'}`}>
     <p className="team-message-author">{message.authorName}</p>
     {message.text && <p className="team-message-text">{message.text}</p>}
     {message.ai && <p className="team-ai-label">{work.aiApproved} · {message.ai.model}</p>}
     {message.files.map(id => <TeamAttachment key={id} client={client} language={language} url={`/team/channels/${channelId}/files/${id}${query}`} />)}
     <div className="team-message-meta"><a href={`#team-message-${message.seq}`} aria-label={`#${message.seq}`}>#{message.seq}</a><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{message.authorId === staffId && <span aria-label={copy.sent} title={copy.sent}>✓</span>}</div>
    </article>
   </Fragment>)}
   {children}
  </div>
  {away && <button type="button" className="team-jump" onClick={jump}>↓ {copy.latest}</button>}
 </div>
}
