import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function TrainingVideo({ id, token }: { id: string; token: string | null }) {
  const { t } = useTranslation()
  const [requested, setRequested] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setUrl(''); setError(false)
    if (!requested) return
    const controller = new AbortController(); let blobUrl = ''
    fetch('/api/training/library/videos/' + id, { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error('Video unavailable'); return response.blob() })
      .then(blob => { if (!controller.signal.aborted) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl) } })
      .catch(e => { if (e.name !== 'AbortError') setError(true) })
    return () => { controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [id, token, requested, attempt])
  return <div className="space-y-2"><h4>{t('trainingMedia.title')}</h4>{!requested || error ? <button type="button" className="border rounded p-2" onClick={() => { setRequested(true); setAttempt(n => n + 1) }}>{error ? t('trainingMedia.error') : t('trainingMedia.load')}</button> : url ? <video key={url} aria-label={t('trainingMedia.title')} controls playsInline preload="metadata" src={url} className="w-full max-h-96" /> : <p role="status">{t('trainingMedia.loading')}</p>}</div>
}
