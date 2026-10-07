import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

export interface ManualQrProof { id: string; amount: number }
export function ManualQrEvidence({ amount, onChange }: { amount: number; onChange: (proof: ManualQrProof | null) => void }) {
  const { t } = useTranslation()
  const uploadGeneration = useRef(0)
  const [proof, setProof] = useState<ManualQrProof | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { uploadGeneration.current++; setProof(null); setConfirmed(false); setBusy(false); setError(''); onChange(null) }, [amount, onChange])
  const upload = async (file?: File) => {
    const generation = ++uploadGeneration.current
    setProof(null); setConfirmed(false); onChange(null); setError('')
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError(t('manualPayment.photoError')); return }
    setBusy(true)
    try {
      const data = new FormData(); data.append('photo', file); data.append('amount', String(amount))
      const response = await api.post('/payments/evidence', data, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (generation === uploadGeneration.current) setProof({ id: response.data.data.id, amount })
    } catch { if (generation === uploadGeneration.current) setError(t('manualPayment.photoError')) } finally { if (generation === uploadGeneration.current) setBusy(false) }
  }
  return <div className="p-3 bg-gray-50 rounded-xl border space-y-3 text-sm">
    <p className="font-semibold">{t('manualPayment.title')}</p>
    <p>{t('manualPayment.instructions')}</p>
    <label className="block">{t('manualPayment.photo')}<input className="block w-full mt-2" key={amount} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={event => { void upload(event.target.files?.[0]) }} /></label>
    {busy && <p role="status">{t('common.loading')}</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <label className="flex gap-2"><input type="checkbox" disabled={!proof || busy} checked={confirmed} onChange={event => { setConfirmed(event.target.checked); onChange(event.target.checked ? proof : null) }} />{t('manualPayment.confirm')}</label>
    <p className="text-xs text-amber-700">{t('manualPayment.evidenceOnly')}</p>
  </div>
}
