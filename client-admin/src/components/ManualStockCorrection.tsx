import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../services/api'
import { AdminDialog } from './AdminDialog'
import { formatCurrency, formatDateTime, formatItemName } from '../utils/helpers'

export function ManualStockCorrection({ log, items, onClose, onSaved }: { log: any; items: any[]; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation(), [detail, setDetail] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [action, setAction] = useState<'correct' | 'cancel'>('correct'), [inventoryId, setInventoryId] = useState(''), [quantity, setQuantity] = useState(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState(''), [legacyMode, setLegacyMode] = useState('')
  const pending = useRef<{body:string;id:string} | null>(null), lock = useRef(false)
  const showError = (e: any) => { const code = e.response?.data?.message; setError(t('manualStockCorrection.errors.' + code, { defaultValue: t('manualStockCorrection.failed') })) }
  const load = async () => {
    setLoading(true); setError('')
    try { const response = await inventoryApi.correction(log.type, log.id), data = response.data.data; setDetail(data); const value = data.current || data.original; setInventoryId(value.inventoryId); setQuantity(String(value.quantity)); setAmount(String(value.totalAmount)); setNote(value.note || ''); setReason(''); setLegacyMode(''); pending.current = null }
    catch (e) { showError(e) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [log.id, log.type])
  const material = items.find(item => item.id === inventoryId), current = detail?.current
  const metadataOnly = current && inventoryId === current.inventoryId && Number(quantity) === current.quantity && Number(amount) === current.totalAmount
  const invalid = loading || !current || !reason.trim() || reason.length > 1000 || (action === 'correct' && (!material || !quantity.trim() || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || !amount.trim() || !Number.isSafeInteger(Number(amount)) || Number(amount) < 0 || Number(amount) > 2147483647 || note.length > 2000)) || current?.ambiguousCost && current?.stockEffect !== 'internal_transfer' && (action === 'cancel' || !metadataOnly) && !legacyMode
  const submit = async () => {
    if (invalid || lock.current) return
    lock.current = true; setBusy(true); setError('')
    const data = { expectedVersion: detail.version, action, reason: reason.trim(), ...(legacyMode ? { legacyCostMode: legacyMode } : {}), ...(action === 'correct' ? { replacement: { inventoryId, quantity: Number(quantity), totalAmount: Number(amount), note } } : {}) }
    const body = JSON.stringify(data)
    if (!pending.current || pending.current.body !== body) pending.current = { body, id: crypto.randomUUID() }
    try { await inventoryApi.correctManual(log.type, log.id, { ...data, requestId: pending.current.id }); onSaved(); await load() }
    catch (e) { showError(e) } finally { lock.current = false; setBusy(false) }
  }
  const precise = (value:number) => new Intl.NumberFormat(i18n.language, {maximumFractionDigits:9}).format(value)
  const describe = (value: any) => value ? `${formatItemName(value.materialName)} · ${precise(value.quantity)} ${value.unit} · ${formatCurrency(value.totalAmount)}` : t('manualStockCorrection.cancelled')
  return <AdminDialog key={detail?.version || 'loading'} title={t('manualStockCorrection.title')} onClose={onClose} busy={busy} className="max-w-3xl" trackChanges chrome>
    <div className="space-y-5" data-testid="manual-stock-correction">
      <p className="text-sm text-gray-600">{t('manualStockCorrection.hint')}</p>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700 space-y-2"><p>{error}</p><button type="button" className="underline" disabled={busy} onClick={load}>{t('manualStockCorrection.reload')}</button></div>}
      {detail && <>
        <section className="rounded-xl border bg-gray-50 p-4 space-y-2 text-sm break-words">
          <h3 className="font-semibold">{t('manualStockCorrection.original')}</h3><p>{describe(detail.original)}</p>
          <p>{detail.originalActor?.name || detail.original.originalActor || t('inventoryActors.unrecorded')} · {formatDateTime(detail.original.createdAt)}</p>
          <p>{t('inventory.notes')}: {detail.original.note || '—'}</p><p className="text-xs text-gray-500">{log.id}</p>
          <h3 className="font-semibold pt-2">{t('manualStockCorrection.current')}</h3><p>{describe(current)}</p>
          {current?.stockEffect === 'internal_transfer' && <p className="text-amber-800">{t('manualStockCorrection.internal')}</p>}
        </section>
        {current && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit() }}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm font-medium">{t('manualStockCorrection.action')}<select aria-label={t('manualStockCorrection.action')} className="input w-full mt-1" value={action} onChange={e => setAction(e.target.value as any)}><option value="correct">{t('manualStockCorrection.correct')}</option><option value="cancel">{t('manualStockCorrection.cancel')}</option></select></label>
            {action === 'correct' && <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm font-medium sm:col-span-2">{t('manualStockCorrection.material')}<select aria-label={t('manualStockCorrection.material')} required className="input w-full mt-1" value={inventoryId} onChange={e => { setInventoryId(e.target.value); setQuantity(''); setAmount('') }}>{items.filter(item => item.type !== 'semi_finished' || !item.processRecipeId).map(item => <option key={item.id} value={item.id}>{formatItemName(item.name)} ({item.unit})</option>)}</select></label>
                <label className="block text-sm font-medium">{t('manualStockCorrection.quantity')} ({material?.unit || current.unit})<input required type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className="input w-full mt-1"/></label>
                <label className="block text-sm font-medium">{t('manualStockCorrection.amount')} (Rp)<input required type="number" min="0" max="2147483647" step="1" value={amount} onChange={e => setAmount(e.target.value)} className="input w-full mt-1"/></label>
              </div>
              <p className="text-xs text-gray-500">{t('manualStockCorrection.units')}</p>
              <label className="block text-sm font-medium">{t('manualStockCorrection.note')}<textarea aria-label={t('manualStockCorrection.note')} maxLength={2000} className="input w-full mt-1" value={note} onChange={e => setNote(e.target.value)}/></label>
            </>}
            {current.ambiguousCost && current.stockEffect !== 'internal_transfer' && (action === 'cancel' || !metadataOnly) && <label className="block text-sm font-medium rounded-lg bg-amber-50 p-3">{t('manualStockCorrection.legacy')}<select required className="input w-full mt-2" value={legacyMode} onChange={e => setLegacyMode(e.target.value)}><option value="">{t('manualStockCorrection.choose')}</option><option value="recorded">{t('manualStockCorrection.free')}</option><option value="current_average">{t('manualStockCorrection.unpriced')}</option></select></label>}
            <label className="block text-sm font-medium">{t('manualStockCorrection.reason')} *<textarea aria-label={t('manualStockCorrection.reason') + ' *'} required maxLength={1000} className="input w-full mt-1" value={reason} onChange={e => setReason(e.target.value)}/></label>
            <div className="rounded-lg border p-3 text-sm space-y-1"><p>{t('manualStockCorrection.before')}: {describe(current)}</p><p>{t('manualStockCorrection.after')}: {action === 'cancel' ? t('manualStockCorrection.cancelled') : `${formatItemName(material?.name || '')} · ${quantity || '—'} ${material?.unit || ''} · Rp ${amount || '—'}`}</p></div>
            <p className="text-xs text-gray-500">{t('manualStockCorrection.guard')}</p>
            <button className="btn-primary w-full sm:w-auto" type="submit" disabled={!!invalid}>{busy ? t('common.loading') : t('manualStockCorrection.save')}</button>
          </fieldset>
        </form>}
        <section className="space-y-3"><h3 className="font-semibold">{t('manualStockCorrection.history')} ({detail.events.length})</h3>{!detail.events.length && <p className="text-sm text-gray-500">{t('manualStockCorrection.noHistory')}</p>}{[...detail.events].reverse().map((event: any) => <article key={event.id} className="border rounded-xl p-4 space-y-2 text-sm break-words"><p className="font-semibold">{t(event.action === 'cancel' ? 'manualStockCorrection.cancel' : 'manualStockCorrection.correct')} · {event.actor?.name || event.actorName || event.actorId}</p><p className="text-gray-500">{formatDateTime(event.at)}</p><p>{t('manualStockCorrection.reason')}: {event.reason}</p><p>{t('manualStockCorrection.before')}: {describe(event.before)}</p><p>{t('manualStockCorrection.after')}: {describe(event.after)}</p><p>{t('inventory.notes')}: {event.before.note || '—'} → {event.after?.note || '—'}</p>{event.balances.map((balance: any, index: number) => <p key={index} className="text-xs text-gray-600">{formatItemName(items.find(item => item.id === balance.inventoryId)?.name || balance.inventoryId)}: {precise(balance.beforeStock)} → {precise(balance.afterStock)} · {t('inventory.avgCost')}: Rp {precise(balance.beforeAvgCost)} → Rp {precise(balance.afterAvgCost)}</p>)}</article>)}</section>
      </>}
    </div>
  </AdminDialog>
}
