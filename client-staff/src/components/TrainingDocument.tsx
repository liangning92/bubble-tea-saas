import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
export function TrainingDocument({ id, token }: { id: string; token: string | null }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setUrl(''); setError(false)
    if (!attempt) return
    const controller = new AbortController(); let blobUrl = ''
    setBusy(true)
    fetch('/api/training/library/documents/' + id, { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok || !response.headers.get('Content-Type')?.includes('application/pdf')) throw Error('Document unavailable'); return response.blob() })
      .then(blob => { if (!controller.signal.aborted) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl) } })
      .catch(e => { if (e.name !== 'AbortError') setError(true) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => { controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [id, token, attempt])
  return <div className="rounded border bg-pink-50 p-3 space-y-2"><h4 className="font-semibold">{t('trainingDocument.title')}</h4>{url ? <div className="flex gap-4"><a href={url} target="_blank" rel="noopener noreferrer" className="underline">{t('trainingDocument.open')}</a><a href={url} download="POS-operation-manual.pdf" className="underline">{t('trainingDocument.download')}</a></div> : <button type="button" disabled={busy} className="border rounded p-2" onClick={() => setAttempt(n => n + 1)}>{busy ? t('trainingDocument.loading') : error ? t('trainingDocument.retry') : t('trainingDocument.load')}</button>}</div>
}
