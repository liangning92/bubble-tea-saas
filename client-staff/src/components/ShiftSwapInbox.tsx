import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Modal } from './Modal'
import { formatDate } from '../utils/helpers'

interface Invitation { id: string; updatedAt: string; staff?: { name: string }; originalDate: string; originalShift: string; originalShiftName?: string; targetDate: string; targetShift: string; targetShiftName?: string; reason?: string }
export function ShiftSwapInbox() {
  const { user, token } = useAuthStore()
  const { t } = useTranslation()
  const [items, setItems] = useState<Invitation[]>([])
  const [deferred, setDeferred] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setItems([]); setDeferred({})
    if (!token || !user?.staffId) return
    let active = true
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      try { const response = await staffApi.getPendingShiftSwaps(); if (active) setItems(response.data || []) } catch { /* Existing offline/session handling owns connectivity errors. */ }
    }
    void refresh()
    const timer = window.setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)
    window.addEventListener('shift-swap-updated', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('shift-swap-updated', refresh) }
  }, [token, user?.staffId])
  const item = items.find(i => !deferred[`${i.id}:${i.updatedAt}`])
  if (!item || !token) return null
  const respond = async (agree: boolean) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await staffApi.confirmShiftSwap(item.id, agree, item.updatedAt)
      setItems(current => current.filter(i => i.id !== item.id))
      window.dispatchEvent(new Event('shift-swap-updated'))
    } catch { setError(t('swapFlow.replyError')); window.dispatchEvent(new Event('shift-swap-updated')) }
    finally { setBusy(false) }
  }
  return <Modal label={t('swapFlow.invitation')} className="flex items-center justify-center bg-black/50 p-4" onClose={() => { if (!busy) setDeferred(current => ({ ...current, [`${item.id}:${item.updatedAt}`]: true })) }}>
    <section className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4 break-words">
      <h2 className="text-lg font-bold">{t('swapFlow.invitation')}</h2>
      <p className="font-medium">{item.staff?.name}</p>
      <p>{t('shiftSwap.originalDate')}: {formatDate(item.originalDate)} · {item.originalShiftName || item.originalShift}</p>
      <p>{t('shiftSwap.targetDate')}: {formatDate(item.targetDate)} · {item.targetShiftName || item.targetShift}</p>
      {item.reason && <p className="text-sm text-gray-600">{item.reason}</p>}
      <p className="text-sm text-gray-500">{t('swapFlow.adminHint')}</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button disabled={busy} onClick={() => respond(false)} className="p-3 rounded-xl border border-red-300 text-red-700 disabled:opacity-50">{t('swapFlow.disagree')}</button>
        <button disabled={busy} onClick={() => respond(true)} className="p-3 rounded-xl bg-primary text-white disabled:opacity-50">{busy ? t('common.submitting') : t('swapFlow.agree')}</button>
      </div>
      <button disabled={busy} className="w-full p-2 text-gray-500" onClick={() => setDeferred(current => ({ ...current, [`${item.id}:${item.updatedAt}`]: true }))}>{t('swapFlow.later')}</button>
    </section>
  </Modal>
}
