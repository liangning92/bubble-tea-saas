import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import { teamWorkCopy } from './teamWorkCopy'
export function TeamAttachment({ client, url, language }: { client: TeamClient; url: string; language: string }) {
 const w = teamWorkCopy(language), [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false)
 const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0)
 useEffect(() => { generation.current++; setPreview(''); setError(false); setBusy(false); return () => { generation.current++ } }, [client, url])
 useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
 async function load(download = false) {
  if (busy) return
  const current = generation.current; setBusy(true); setError(false)
  try {
   const blob = await client.download(url)
   if (current !== generation.current || !client.current()) return
   const objectUrl = URL.createObjectURL(blob)
   if (!download && ['image/jpeg','image/png'].includes(blob.type)) setPreview(objectUrl)
   else {
    const a = document.createElement('a'); a.href = objectUrl; a.download = 'attachment' + (blob.type === 'application/pdf' ? '.pdf' : blob.type === 'image/png' ? '.png' : '.jpg'); a.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
   }
  } catch { if (current === generation.current && client.current()) setError(true) }
  finally { if (current === generation.current) setBusy(false) }
 }
 return <div className="my-2 space-y-2">
  <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" disabled={busy} onClick={() => void load()}>{busy ? w.loading : error ? w.retry : w.preview}</button><button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" disabled={busy} onClick={() => void load(true)}>{w.download}</button></div>
  {error && <p role="alert" className="text-sm text-red-700">{w.error}</p>}
  {preview && <><button type="button" className="block max-w-full rounded-lg border bg-white p-2" aria-label={w.enlarge} onClick={() => dialog.current?.showModal()}><img src={preview} alt={w.image} className="max-h-56 max-w-full rounded object-contain" onError={() => { setPreview(''); setError(true) }} /></button>
   <dialog ref={dialog} className="max-h-[95vh] max-w-[95vw] rounded-xl p-4 backdrop:bg-black/60"><button type="button" className="mb-3 rounded-lg border px-4 py-2" onClick={() => dialog.current?.close()}>{w.close}</button><img src={preview} alt={w.image} className="max-h-[80vh] max-w-full object-contain" /></dialog></>}
 </div>
}
