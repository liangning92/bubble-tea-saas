import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from './TeamCommunication'
import { teamWorkCopy } from './teamWorkCopy'
import { createTeamAttachmentResource, type AttachmentProgress } from './teamAttachmentResource'
export function TeamAttachment({ client, url, language }: { client: TeamClient; url: string; language: string }) {
 const w = teamWorkCopy(language), [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false)
 const [progress, setProgress] = useState<AttachmentProgress>({ loaded: 0 })
 const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0)
 const resource = useRef<ReturnType<typeof createTeamAttachmentResource>>()
 useEffect(() => {
  generation.current++; setPreview(''); setError(false); setBusy(false)
  return () => { generation.current++; resource.current?.dispose(); resource.current = undefined; dialog.current?.close() }
 }, [client, url])
 async function load(download = false) {
  if (busy || !client.current()) return
  const current = generation.current; setBusy(true); setError(false); setProgress({ loaded: 0 })
  try {
   resource.current ||= createTeamAttachmentResource(options => client.download(url, options), client.current)
   const result = await resource.current.read(value => { if (current === generation.current && client.current()) setProgress(value) })
   if (current !== generation.current || !client.current()) return
   const type = result.blob.type.split(';')[0]
   if (!download && type.startsWith('image/')) setPreview(result.url)
   else {
    const a = document.createElement('a'); a.href = result.url; a.download = 'attachment' + (type === 'application/pdf' ? '.pdf' : type === 'image/png' ? '.png' : '.jpg')
    document.body.appendChild(a); a.click(); a.remove()
   }
  } catch (e: any) { if (current === generation.current && client.current() && !['CanceledError', 'AbortError'].includes(e?.name)) setError(true) }
  finally { if (current === generation.current) setBusy(false) }
 }
 const percent = progress.total ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : undefined
 return <div className="team-attachment" aria-busy={busy}>
  {preview && <><button type="button" className="team-image-preview" aria-label={w.enlarge} onClick={() => dialog.current?.showModal()}><img src={preview} alt={w.image} onError={() => { setPreview(''); setError(true); resource.current?.dispose(); resource.current = undefined }} /></button>
   <dialog ref={dialog} className="team-image-dialog"><button type="button" className="team-control" onClick={() => dialog.current?.close()}>{w.close}</button><img src={preview} alt={w.image} /></dialog></>}
  <div className="team-attachment-actions"><button type="button" className="team-control" disabled={busy} onClick={() => void load()}>▧ {error ? w.retry : w.preview}</button><button type="button" className="team-control" disabled={busy} onClick={() => void load(true)}>↓ {w.download}</button></div>
  {busy && <div role="status" className="team-transfer"><span>{w.loading} {percent === undefined ? `${(progress.loaded / 1024 / 1024).toFixed(1)} MB` : `${percent}%`}</span><button type="button" className="team-control" onClick={() => resource.current?.cancel()}>{w.cancelTransfer}</button><progress max={progress.total || undefined} value={progress.total ? progress.loaded : undefined} /></div>}
  {error && <p role="alert" className="text-sm text-red-700">{w.attachmentError}</p>}
 </div>
}
