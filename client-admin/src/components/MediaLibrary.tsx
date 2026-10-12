import { useEmployeePermission } from '../contexts/EmployeeAccess'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { mediaApi, MediaAsset, MediaScene } from '../services/media'
import { receiptMediaUrl } from '../services/api'
import { useAuthStore } from '../stores/auth'

export function MediaPreview({asset,controls=false}:{asset:Pick<MediaAsset,'url'|'kind'|'name'>;controls?:boolean}) {
  const url=receiptMediaUrl(asset.url)
  if(asset.kind==='video')return <video src={url} controls={controls} preload="metadata" muted className="w-full h-40 object-contain bg-gray-100" />
  if(asset.kind==='audio')return <div className="h-40 flex items-center justify-center bg-gray-100"><audio src={url} controls preload="metadata" className="w-full" /></div>
  return <img src={url} alt={asset.name} loading="lazy" className="w-full h-40 object-contain bg-gray-100" />
}
export function MediaLibrary({scene='library',max=10,onSelect,onClose,imagesOnly=false}:{scene?:MediaScene;max?:number;onSelect?:(assets:MediaAsset[])=>void;onClose?:()=>void;imagesOnly?:boolean}) {
  const {t}=useTranslation(),client=useQueryClient(),storeId=useAuthStore(s=>s.user?.storeId)
  const canWrite=useEmployeePermission(scene==='library'||scene==='tv'?'marketing.write':scene==='product'?'products.write':'orders.create')
  const [search,setSearch]=useState(''),[kind,setKind]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<MediaAsset[]>([])
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<MediaAsset|null>(null),[references,setReferences]=useState<any[]|null>(null)
  const [rename,setRename]=useState<MediaAsset|null>(null),[name,setName]=useState(''),[deleting,setDeleting]=useState<MediaAsset|null>(null)
  const key=['media',storeId,scene,search,kind,page,imagesOnly]
  const query=useQuery({queryKey:key,queryFn:()=>mediaApi.list(scene,{search,kind:imagesOnly?'image':kind,page})})
  const data=query.data?.data.data
  useEffect(()=>{setPage(1)},[search,kind])
  const invalidate=()=>client.invalidateQueries({queryKey:['media',storeId]})
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await invalidate()}catch(e:any){setError(t('media.failed'));if(e.response?.status===409)setReferences(e.response.data?.data?.list||[])}finally{setBusy(false)}}
  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-xl font-bold">{t('media.title')}</h1>{onClose&&<button type="button" className="btn" onClick={onClose}>{t('common.close')}</button>}</div>
    <p className="text-sm text-gray-500">{t('media.limits')}</p>
    <div className="flex flex-wrap gap-3">
      <input aria-label={t('media.search')} className="input flex-1" placeholder={t('media.search')} value={search} onChange={e=>setSearch(e.target.value)} />
      <select aria-label={t('media.type')} className="input w-auto" value={kind} onChange={e=>setKind(e.target.value)}><option value="">{t('media.all')}</option>{(scene==='product'||imagesOnly?['image']:scene==='library'?['image','video','audio']:['image','video']).map(k=><option key={k} value={k}>{t(`media.${k}`)}</option>)}</select>
      {canWrite&&<label className={`btn btn-primary ${busy?'opacity-50':''}`}>{busy?t('common.loading'):t('media.upload')}<input disabled={busy} type="file" multiple accept={scene==='product'||imagesOnly?'.jpg,.jpeg,.png,.gif,.webp':scene==='library'?'.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mp3,.m4a,.wav,.ogg':'.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm'} className="hidden" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void run(async()=>{if(files.length>10)throw Error();await mediaApi.upload(scene,files)})}} /></label>}
    </div>
    {(error||query.isError)&&<div role="alert" className="text-red-600">{error||t('media.failed')}<button type="button" className="btn" onClick={()=>query.refetch()}>{t('media.retry')}</button></div>}
    {query.isLoading?<p>{t('common.loading')}</p>:!data?.list.length?<p className="p-8 text-center text-gray-500">{t('media.empty')}</p>:<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{data.list.map((asset:MediaAsset)=><div key={asset.id} className={`border rounded-xl overflow-hidden ${selected.some(a=>a.id===asset.id)?'border-primary ring-2 ring-primary':'border-gray-200'}`}>
      <button type="button" className="w-full" aria-label={asset.name} onClick={()=>{setPreview(asset);setReferences(null)}}><MediaPreview asset={asset} /></button>
      <div className="p-3 space-y-2"><p className="font-medium break-all">{asset.name}</p><p className="text-xs text-gray-500">{t(`media.${asset.kind}`)} · {(asset.size/1024/1024).toFixed(2)} MB</p>
      {onSelect?<button type="button" className="btn btn-sm" disabled={!selected.some(a=>a.id===asset.id)&&selected.length>=max} onClick={()=>setSelected(list=>list.some(a=>a.id===asset.id)?list.filter(a=>a.id!==asset.id):[...list,asset])}>{t(selected.some(a=>a.id===asset.id)?'media.deselect':'media.select')}</button>:<div className="flex gap-2 flex-wrap">{canWrite&&<button type="button" className="btn btn-sm" onClick={()=>{setRename(asset);setName(asset.name)}}>{t('media.rename')}</button>}<button type="button" className="btn btn-sm" onClick={()=>void run(async()=>{const r=await mediaApi.references(asset.id);setReferences(r.data.data.list)})}>{t('media.references')}</button>{canWrite&&<button type="button" className="btn btn-sm text-red-600" onClick={()=>setDeleting(asset)}>{t('common.delete')}</button>}</div>}
      </div></div>)}</div>}
    <div className="flex justify-between items-center"><button type="button" className="btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t('media.previous')}</button><span>{page} / {Math.max(1,Math.ceil((data?.total||0)/24))}</span><button type="button" className="btn" disabled={page*24>=(data?.total||0)} onClick={()=>setPage(p=>p+1)}>{t('media.next')}</button></div>
    {onSelect&&<button type="button" className="btn btn-primary" disabled={!selected.length} onClick={()=>onSelect(selected)}>{t('media.useSelected',{count:selected.length})}</button>}
    {preview&&<div role="dialog" aria-modal="true" aria-label={preview.name} className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-8"><div className="bg-white rounded-xl p-5 w-full max-w-3xl space-y-4"><p>{preview.name}</p><MediaPreview asset={preview} controls /><button type="button" className="btn" onClick={()=>setPreview(null)}>{t('common.close')}</button></div></div>}
    {references!==null&&<div className="card space-y-2" role="status"><h2>{t('media.references')}</h2>{references.length?references.map((r:any)=><div key={r.kind+r.id}>{r.kind==='product'?<Link className="text-primary" to={`/products/recipes?productId=${r.id}`}>{r.name}</Link>:t(r.id==='hardwareSettings'?'media.displayReference':r.id==='tv_screen_marketing_config'?'media.tvReference':'media.otherReference')}</div>):<p>{t('media.unused')}</p>}<button type="button" className="btn" onClick={()=>setReferences(null)}>{t('common.close')}</button></div>}
    {rename&&<div className="card flex gap-2"><input aria-label={t('media.rename')} className="input" maxLength={200} value={name} onChange={e=>setName(e.target.value)} /><button type="button" className="btn btn-primary" disabled={busy||!name.trim()} onClick={()=>void run(async()=>{await mediaApi.rename(rename.id,name);setRename(null)})}>{t('common.save')}</button><button type="button" className="btn" onClick={()=>setRename(null)}>{t('common.cancel')}</button></div>}
    {deleting&&<div className="card space-y-3"><p>{t('media.deleteConfirm',{name:deleting.name})}</p><button type="button" disabled={busy} className="btn text-red-600" onClick={()=>void run(async()=>{const asset=deleting;setDeleting(null);await mediaApi.remove(asset.id)})}>{t('common.delete')}</button><button type="button" className="btn" onClick={()=>setDeleting(null)}>{t('common.cancel')}</button></div>}
  </div>
}
export function MediaPicker(props:{scene:MediaScene;max?:number;imagesOnly?:boolean;onSelect:(assets:MediaAsset[])=>void;onClose:()=>void}) {
  const {t}=useTranslation()
  return <div role="dialog" aria-modal="true" aria-label={t('media.title')} className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-xl p-5 w-full max-w-5xl max-h-[90vh] overflow-auto"><MediaLibrary {...props} /></div></div>
}
