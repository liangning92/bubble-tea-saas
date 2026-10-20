import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { useAwareness, type AwarenessItem } from './NotificationAwareness'
import { notificationAwarenessCopy } from './notificationAwarenessCopy'
import './notificationAwareness.css'

// Only same-origin app paths are actionable, even if a malformed item is returned.
export const awarenessPath = (url: string) => /^\/(?!\/)/.test(url) && !/[\\\u0000-\u001f]/.test(url) ? url : null
export function AwarenessEntry() {
  const { data } = useAwareness(), { i18n } = useTranslation(), w = notificationAwarenessCopy(i18n.language)
  return <Link to="/inbox" className="awareness-entry" aria-label={`${w.title} · ${w.unread} ${data.counts.unread} · ${w.pending} ${data.counts.approvalPending}`}>
    <Bell size={18} aria-hidden="true" /><span>{w.title}</span>
    {data.counts.unread > 0 && <span className="awareness-unread">{data.counts.unread}</span>}
    {data.counts.approvalPending > 0 && <span className="awareness-pending">{w.pending} {data.counts.approvalPending}</span>}
    {data.counts.trainingUnread > 0 && <span className="awareness-training">{w.training} · {w.new}</span>}
  </Link>
}
export function NotificationAwarenessInbox({ administration = false }: { administration?: boolean }) {
  const { data, loading, failed, refresh, markRead, isCurrent } = useAwareness(), { i18n } = useTranslation(), navigate = useNavigate()
  const [params] = useSearchParams(), notice = params.get('notice') || ''
  const w = notificationAwarenessCopy(i18n.language), [filter, setFilter] = useState('all'), [opening, setOpening] = useState('')
  useEffect(() => { setOpening(''); setFilter('all') }, [isCurrent])
  useEffect(() => {
    if (!notice || loading) return
    const row = data.items.find(item => item.id === notice)
    if (!row) return
    setFilter('all')
    document.getElementById('awareness-notice-' + notice)?.scrollIntoView({ block: 'center' })
    if (!row.read && row.kind !== 'chat' && row.kind !== 'training_update') void markRead(row.id).catch(() => {})
  }, [notice, loading, data.items, markRead])
  const labels: Record<AwarenessItem['kind'], string> = { chat: w.chat, training_update: w.training, approval_request: w.request, approval_result: w.result, business_reminder: w.reminder }
  async function open(item: AwarenessItem) {
    const path = awarenessPath(administration ? item.adminUrl || item.url : item.url)
    if (!path || opening) return
    setOpening(item.id)
    // Chat receipt requires loading its actual messages. Training requires opening content.
    try { if (!item.read && item.kind !== 'chat' && item.kind !== 'training_update') await markRead(item.id) }
    catch { /* The destination remains usable; the server will retry read state later. */ }
    finally { if (isCurrent()) { setOpening(''); navigate(path) } }
  }
  const items = data.items.filter(item => filter === 'all' || filter === 'pending' && item.pending || item.kind === filter)
  return <section className="awareness-inbox" aria-labelledby="awareness-title">
    <header className="awareness-heading"><div><h1 id="awareness-title">{w.title}</h1><p>{w.hint}</p></div><button type="button" onClick={() => void refresh()} disabled={loading}>{w.retry}</button></header>
    <div className="awareness-summary" aria-live="polite"><span>{w.unread} <strong>{data.counts.unread}</strong></span><span>{w.pending} <strong>{data.counts.approvalPending}</strong></span><span>{w.training} <strong>{data.counts.trainingUnread}</strong></span></div>
    <div className="awareness-filters" aria-label={w.title}>{[['all', w.all], ['chat', w.chat], ['training_update', w.training], ['pending', w.pending]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {failed && <p role="alert" className="awareness-error">{w.failed}</p>}
    {loading ? <p role="status">{w.loading}</p> : <>
      {items.length === 0 && <p className="awareness-empty">{w.empty}</p>}
      <div className="awareness-list">{items.map(item => <article id={'awareness-notice-'+item.id} key={item.id} className={`awareness-item ${item.id===notice?'awareness-target':''} ${item.read ? '' : 'awareness-item-new'}`}>
        <div className="awareness-item-meta"><span>{labels[item.kind]}</span><span>{item.read ? w.read : w.unread}</span>{item.pending && <strong className="awareness-pending">{w.pending}</strong>}{item.kind === 'training_update' && !item.read && <strong className="awareness-training">{w.new}</strong>}</div>
        <h2>{item.title}</h2>
        {item.status && <p className="awareness-preview">{w.status}: {({pending:w.statusPending,approved:w.statusApproved,rejected:w.statusRejected,authorized:w.statusAuthorized,executed:w.statusExecuted,cancelled:w.statusCancelled,withdrawn:w.statusWithdrawn} as Record<string,string>)[item.status] || item.status}</p>}
        {item.kind === 'chat' && data.chats.find(chat => chat.id === item.objectId)?.preview && <p className="awareness-preview">{data.chats.find(chat => chat.id === item.objectId)!.preview!.authorName}: {data.chats.find(chat => chat.id === item.objectId)!.preview!.text}</p>}
        <div className="awareness-item-footer"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(i18n.language)}</time><button type="button" disabled={!!opening || !awarenessPath(administration ? item.adminUrl || item.url : item.url)} onClick={() => void open(item)}>{w.open} →</button></div>
      </article>)}</div>
      {data.hasMore && <p className="awareness-more">{w.more}</p>}
    </>}
  </section>
}
