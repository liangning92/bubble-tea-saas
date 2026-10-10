import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { activitiesApi, uploadApi } from '../../services/api'
import { TvScreenConfig } from '../../../../shared/utils/tvScreenConfig'
import { MarketingError, useMarketingCopy } from './MarketingLayout'
import { ResourcePicker } from './ResourcePicker'

export function TvStandbySettings({ config, onChange, onUploadingChange }: {
  config: TvScreenConfig; onChange: (changes: Partial<TvScreenConfig>) => void; onUploadingChange: (value: boolean) => void
}) {
  const l = useMarketingCopy()
  const [selectedOnly, setSelectedOnly] = useState(config.idleProductIds.length > 0)
  useEffect(() => { if (config.idleProductIds.length) setSelectedOnly(true) }, [config.idleProductIds])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const products = useQuery({ queryKey: ['tv-standby-products'], queryFn: () => activitiesApi.resources().then(response => response.data.data.products) })
  const options = (products.data || []).filter((product: any) => product.image).map((product: any) => ({ id: product.id, name: product.name, subtitle: product.code, group: product.category?.name }))
  const updateMusic = (changes: Partial<TvScreenConfig['idleMusic']>) => onChange({ idleMusic: { ...config.idleMusic, ...changes } })
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const tracks = [...files]
    if (tracks.length > 10 || tracks.some(file => file.size > 30 * 1024 * 1024)) { setError(l('每次最多上传 10 首，每首不超过 30 MB。','Upload up to 10 tracks, each no larger than 30 MB.','Unggah hingga 10 lagu, masing-masing maksimal 30 MB.')); return }
    if (config.idleMusic.tracks.length + tracks.length > 100) { setError(l('音乐列表最多 100 首。','Maximum 100 tracks.','Maksimal 100 lagu.')); return }
    setUploading(true); onUploadingChange(true); setError('')
    try {
      const response = await uploadApi.uploadTvMusic(tracks)
      updateMusic({ tracks: [...config.idleMusic.tracks, ...response.data.data.files] })
    } catch (failure: any) { setError(failure.response?.data?.message || l('上传失败，请重试。','Upload failed. Please retry.','Unggah gagal. Coba lagi.')) }
    finally { setUploading(false); onUploadingChange(false) }
  }

  return <section className="marketing-workspace rounded-lg border border-border bg-white p-5 space-y-4">
    <h3 className="font-semibold">{l('无活动时的播放内容','Between activities','Di luar aktivitas')}</h3>
    <p className="text-sm text-gray-500">{l('没有有效活动时展示产品照片并播放音乐；活动开始后自动切换为活动宣传，结束后恢复。','Show product photos and music when no activities are active; switch automatically when activities start or end.','Tampilkan foto produk dan musik saat tidak ada aktivitas; beralih otomatis saat aktivitas mulai atau berakhir.')}</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleProductsEnabled} onChange={event => onChange({ idleProductsEnabled: event.target.checked })}/>{l('轮播产品照片','Rotate product photos','Putar foto produk')}</label>
    {config.idleProductsEnabled && <>
      <div className="flex flex-wrap gap-4 text-sm">
        <label><input type="radio" name="tv-idle-scope" checked={!selectedOnly} onChange={() => { setSelectedOnly(false); onChange({ idleProductIds: [] }) }}/>{' '}{l('全部有照片的在售商品','All active products with photos','Semua produk aktif dengan foto')}</label>
        <label><input type="radio" name="tv-idle-scope" checked={selectedOnly} onChange={() => setSelectedOnly(true)}/>{' '}{l('选择展示商品','Choose products','Pilih produk')}</label>
      </div>
      {products.isError ? <MarketingError retry={() => products.refetch()}/> : selectedOnly && <ResourcePicker label={l('电视展示商品','TV products','Produk TV')} options={options} value={config.idleProductIds} onChange={ids => onChange({ idleProductIds: ids })} loading={products.isLoading}/>}
      <p className="text-xs text-gray-500">{l('照片取自商品目录，更新商品照片后电视自动同步。没有可用照片时保留媒体轮播和欢迎语。未选择商品时使用全部有照片的商品。','Photos come from the product catalog and sync automatically. With no photos, keep media and the welcome message. An empty selection uses all products with photos.','Foto berasal dari katalog dan sinkron otomatis. Tanpa foto, tampilkan media dan pesan sambutan. Pilihan kosong memakai semua produk dengan foto.')}</p>
    </>}
    <div className="border-t border-border pt-4 space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleMusic.enabled} onChange={event => updateMusic({ enabled: event.target.checked })}/>{l('无活动时播放背景音乐','Play background music between activities','Putar musik di luar aktivitas')}</label>
      <label className="block text-sm">{l('音乐音量','Music volume','Volume musik')}: {Math.round(config.idleMusic.volume * 100)}%<input className="block w-full sm:max-w-sm mt-2 accent-primary" type="range" min="0" max="100" value={Math.round(config.idleMusic.volume * 100)} onChange={event => updateMusic({ volume: Number(event.target.value) / 100 })}/></label>
      <label className="block text-sm">{l('上传音乐（MP3 / WAV / OGG / M4A / AAC）','Upload music (MP3 / WAV / OGG / M4A / AAC)','Unggah musik (MP3 / WAV / OGG / M4A / AAC)')}<input className="block mt-2 text-sm" type="file" multiple accept=".mp3,.wav,.ogg,.m4a,.aac" disabled={uploading} onChange={event => { void upload(event.target.files); event.target.value = '' }}/></label>
      {uploading && <p role="status" className="text-sm text-gray-500">{l('正在上传…','Uploading…','Mengunggah…')}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!config.idleMusic.tracks.length && <p className="text-sm text-gray-500">{l('请上传音乐后保存电视设置。','Upload music, then save TV settings.','Unggah musik, lalu simpan pengaturan TV.')}</p>}
      {config.idleMusic.tracks.map((track, index) => <div key={track.url + index} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 text-sm"><span className="text-gray-400">{index + 1}</span><span className="flex-1 min-w-0 break-words">{track.title || l('音乐','Music','Musik')}</span><button type="button" className="btn-ghost" disabled={index === 0} aria-label={l('上移音乐','Move music up','Naikkan lagu') + ' ' + (index + 1)} onClick={() => { const tracks = [...config.idleMusic.tracks]; [tracks[index - 1], tracks[index]] = [tracks[index], tracks[index - 1]]; updateMusic({ tracks }) }}>↑</button><button type="button" className="btn-ghost" onClick={() => updateMusic({ tracks: config.idleMusic.tracks.filter((_, position) => position !== index) })}>{l('移除','Remove','Hapus')}</button></div>)}
      <p className="text-xs text-gray-500">{l('音乐按列表顺序循环；抽奖动画期间暂停。若电视浏览器限制自动发声，点击播放页的“开启音乐”。总声音开关关闭时音乐也会静音。','Tracks loop in order and pause during draws. If the browser blocks audio, tap the display’s music button. The sound toggle also mutes music.','Lagu berulang sesuai urutan dan berhenti saat undian. Jika browser memblokir audio, ketuk tombol musik. Tombol suara juga membisukan musik.')}</p>
    </div>
  </section>
}
