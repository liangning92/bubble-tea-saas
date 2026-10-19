import { useState } from 'react'
import { useTranslation } from 'react-i18next'
export function DrawerReasonDialog({ submit, close }: { submit: (reason: string) => Promise<void>; close: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false)
  return <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
    <form role="dialog" aria-modal="true" aria-labelledby="drawer-title" className="w-full max-w-md rounded-xl bg-white p-5 space-y-4" onSubmit={async e => { e.preventDefault(); if (busy || reason.trim().length < 2) return; setBusy(true); try { await submit(reason.trim()) } finally { setBusy(false) } }}>
      <h2 id="drawer-title" className="text-lg font-bold">{t('posRisk.manualDrawer')}</h2>
      <p className="text-sm text-gray-600">{t('posRisk.reasonHint')}</p>
      <label className="block text-sm">{t('posRisk.reason')}<textarea autoFocus value={reason} maxLength={200} required minLength={2} disabled={busy} onChange={e=>setReason(e.target.value)} className="mt-2 w-full border rounded-lg p-3" /></label>
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button><button disabled={busy || reason.trim().length < 2} className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50">{t(busy ? 'common.loading' : 'posRisk.send')}</button></div>
    </form>
  </div>
}
