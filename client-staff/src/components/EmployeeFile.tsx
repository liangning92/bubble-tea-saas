import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { employeeApi } from '../services/api'
import { Modal } from './Modal'

export function EmployeeFile({ id }: { id: string }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  return <>
    <button type="button" disabled={busy} className="text-primary-hover underline p-2" onClick={async () => {
      if (busy) return
      setBusy(true); setError(false)
      try {
        const blob = await employeeApi.file(id)
        if (live.current) setPreview({ url: URL.createObjectURL(blob), type: blob.type })
      } catch { if (live.current) setError(true) }
      finally { if (live.current) setBusy(false) }
    }}>{t(busy ? 'common.loading' : 'workspace.viewFile')}</button>
    {error && <p role="alert" className="text-red-700">{t('common.loadFailed')}</p>}
    {preview && <Modal label={t('workspace.viewFile')} onClose={() => setPreview(null)} className="bg-black/50 flex items-center justify-center p-4">
      <section className="bg-white rounded-xl p-4 w-full max-w-3xl max-h-[90dvh] overflow-auto space-y-3">
        <header className="flex justify-between gap-3 items-center"><h2>{t('workspace.viewFile')}</h2><button className="p-3 border rounded-lg" onClick={() => setPreview(null)}>{t('training.close')}</button></header>
        {preview.type.startsWith('image/') ? <img src={preview.url} alt={t('workspace.viewFile')} className="max-h-[65dvh] max-w-full mx-auto object-contain" /> : preview.type === 'application/pdf' ? <object data={preview.url} type="application/pdf" className="w-full h-[60dvh]"><p>{t('audit.previewFallback')}</p></object> : <p>{t('audit.previewFallback')}</p>}
        <a className="inline-block bg-primary text-white p-3 rounded-lg" href={preview.url} download={`document.${preview.type === 'application/pdf' ? 'pdf' : preview.type === 'image/png' ? 'png' : 'jpg'}`}>{t('audit.download')}</a>
      </section>
    </Modal>}
  </>
}
