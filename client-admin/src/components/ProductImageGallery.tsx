import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { receiptMediaUrl } from '../services/api'

/** The gallery also accepts legacy products whose only image is a URL. */
export function ProductImageGallery({ images, name }: { images: { url: string }[]; name?: string }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [selectedUrl, setSelectedUrl] = useState('')
  const pictures = images.filter(image => image.url)
  const selectedIndex = Math.max(0, pictures.findIndex(image => image.url === selectedUrl))
  const selected = pictures[selectedIndex]
  if (!selected) return null

  const move = (direction: number) => {
    const next = (selectedIndex + direction + pictures.length) % pictures.length
    setSelectedUrl(pictures[next].url)
  }
  const thumbnails = (large = false) => (
    <div className="flex flex-wrap justify-center gap-2">
      {pictures.map((image, index) => (
        <button key={`${image.url}-${index}`} type="button" aria-pressed={index === selectedIndex}
          aria-label={`${t('products.image')} ${index + 1}`}
          onClick={() => setSelectedUrl(image.url)}
          className={`rounded-lg border-2 p-1 ${index === selectedIndex ? 'border-primary' : 'border-gray-200'} ${large ? 'bg-white' : ''}`}>
          <img src={receiptMediaUrl(image.url)} alt="" className="h-14 w-14 object-contain" />
        </button>
      ))}
    </div>
  )
  return <section className="mb-4 space-y-3" aria-label={t('products.image')}>
    <button type="button" aria-haspopup="dialog" aria-label={t('products.image')}
      onClick={() => dialog.current?.showModal()}
      className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-3 cursor-zoom-in">
      <img src={receiptMediaUrl(selected.url)} alt={name || `${t('products.image')} ${selectedIndex + 1}`}
        className="h-64 w-full object-contain sm:h-80" />
    </button>
    {pictures.length > 1 && thumbnails()}
    <p className="text-center text-xs text-gray-500">{selectedIndex + 1} / {pictures.length}</p>
    <dialog ref={dialog} aria-label={t('products.image')}
      className="w-[min(96vw,1100px)] max-h-[95vh] rounded-xl bg-white p-4 backdrop:bg-black/70"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}>
      <div className="mb-3 flex items-center justify-between">
        <span>{t('products.image')} · {selectedIndex + 1} / {pictures.length}</span>
        <button type="button" autoFocus aria-label={t('common.close')} onClick={() => dialog.current?.close()} className="rounded p-2"><X size={22} /></button>
      </div>
      <div className="flex items-center justify-center gap-2">
        {pictures.length > 1 && <button type="button" aria-label={t('media.moveEarlier')} onClick={() => move(-1)} className="shrink-0 rounded p-2"><ChevronLeft /></button>}
        <img src={receiptMediaUrl(selected.url)} alt={`${t('products.image')} ${selectedIndex + 1}`} className="min-w-0 max-h-[65vh] max-w-full object-contain" />
        {pictures.length > 1 && <button type="button" aria-label={t('media.moveLater')} onClick={() => move(1)} className="shrink-0 rounded p-2"><ChevronRight /></button>}
      </div>
      {pictures.length > 1 && <div className="mt-4">{thumbnails(true)}</div>}
    </dialog>
  </section>
}
