import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { useAwareness, type AwarenessItem } from './NotificationAwareness'
import { notificationAwarenessCopy } from './notificationAwarenessCopy'
import { NotificationDeliveryStatus } from './NotificationDeliveryStatus'
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
  const w = notificationAwarenessCopy(i18n.language), [filter, setFilter] = useState('unread'), [opening, setOpening] = useState('')
  useEffect(() => { setOpening(''); setFilter('unread') }, [isCurrent])
  useEffect(() => {
    if (!notice || loading) return
    const row = data.items.find(item => item.id === notice)
    if (!row) return
    setFilter('all')
    document.getElementById('awareness-notice-' + notice)?.scrollIntoView({ block: 'center' })
    if (!row.read && row.kind !== 'chat' && row.kind !== 'training_update') void markRead(row.id).catch(() => {})
  }, [notice, loading, data.items, markRead])
  const labels: Record<AwarenessItem['kind'], string> = { chat: w.chat, training_update: w.training, approval_request: w.request, approval_result: w.result, business_reminder: w.reminder }
  const domainNames: Record<string, string[]> = { leave: ['请假','Leave','Cuti'], overtimeRequest: ['加班','Overtime','Lembur'], attendanceCorrection: ['考勤更正','Attendance correction','Koreksi absensi'], shiftSwap: ['调班','Shift swap','Tukar shift'], reimbursement: ['报销','Reimbursement','Penggantian biaya'], hygiene: ['卫生检查','Hygiene','Higiene'], inventoryCount: ['库存盘点','Stock count','Stok opname'], profile: ['员工资料','Employee profile','Data pegawai'], appeal: ['考勤申诉','Attendance appeal','Banding absensi'], staffActionApproval: ['业务授权','Action approval','Persetujuan tindakan'], refundRequest: ['退款','Refund','Pengembalian dana'] }
  const domainName = (domain?: string) => domain && domainNames[domain]?.[i18n.language.startsWith('zh') ? 0 : i18n.language.startsWith('en') ? 1 : 2]
  async function open(item: AwarenessItem) {
    const path = awarenessPath(administration ? item.adminUrl || item.url : item.url)
    if (!path || opening) return
    setOpening(item.id)
    // Chat receipt requires loading its actual messages. Training requires opening content.
    try { if (!item.read && item.kind !== 'chat' && item.kind !== 'training_update') await markRead(item.id) }
    catch { /* The destination remains usable; the server will retry read state later. */ }
    finally { if (isCurrent()) { setOpening(''); navigate(path) } }
  }
  const items = data.items.filter(item => filter === 'all' || filter === 'unread' && !item.read || filter === 'read' && item.read || filter === 'pending' && item.pending || item.kind === filter)
  return <section className="awareness-inbox" aria-labelledby="awareness-title">
    <header className="awareness-heading"><div><h1 id="awareness-title">{w.title}</h1><p>{w.hint}</p></div><button type="button" onClick={() => void refresh()} disabled={loading}>{w.retry}</button></header>
    <div className="awareness-summary" aria-live="polite"><span>{w.unread} <strong>{data.counts.unread}</strong></span><span>{w.pending} <strong>{data.counts.approvalPending}</strong></span><span>{w.training} <strong>{data.counts.trainingUnread}</strong></span></div>
    <div className="awareness-filters" aria-label={w.title}>{[['unread', w.unread], ['all', w.all], ['read', w.history], ['chat', w.chat], ['training_update', w.training], ['pending', w.actionPending]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {failed && <p role="alert" className="awareness-error">{w.failed}</p>}
    {loading ? <p role="status">{w.loading}</p> : <>
      {items.length === 0 && <p className="awareness-empty">{w.empty}</p>}
      <div className="awareness-list">{items.map(item => <article id={'awareness-notice-'+item.id} key={item.id} className={`awareness-item ${item.id===notice?'awareness-target':''} ${item.read ? '' : 'awareness-item-new'}`}>
        <div className="awareness-item-meta"><span>{labels[item.kind]}</span><span>{item.read ? w.read : w.unread}</span>{item.pending && <strong className="awareness-pending">{item.kind === 'approval_request' ? w.pending : w.actionPending}</strong>}{item.kind === 'training_update' && !item.read && <strong className="awareness-training">{w.new}</strong>}</div>
        <h2>{domainName(item.domain) ? domainName(item.domain) + ' · ' : ''}{item.title}</h2>
        <NotificationDeliveryStatus value={item.delivery} language={i18n.language} />
        {item.status && <p className="awareness-preview">{w.status}: {({pending:w.statusPending,approved:w.statusApproved,rejected:w.statusRejected,authorized:w.statusAuthorized,executed:w.statusExecuted,cancelled:w.statusCancelled,withdrawn:w.statusWithdrawn} as Record<string,string>)[item.status] || item.status}</p>}
        {item.kind === 'chat' && data.chats.find(chat => chat.id === item.objectId)?.preview && <p className="awareness-preview">{data.chats.find(chat => chat.id === item.objectId)!.preview!.authorName}: {data.chats.find(chat => chat.id === item.objectId)!.preview!.text}</p>}
        <div className="awareness-item-footer"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(i18n.language)}</time><button type="button" disabled={!!opening || !awarenessPath(administration ? item.adminUrl || item.url : item.url)} onClick={() => void open(item)}>{w.open} →</button></div>
      </article>)}</div>
      {data.hasMore && <p className="awareness-more">{w.more}</p>}
    </>}
  </section>
}
