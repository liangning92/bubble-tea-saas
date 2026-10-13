import { useState } from 'react'
import { ProductImageGallery } from './ProductImageGallery'
import { useTranslation } from 'react-i18next'
import { MediaPicker } from './MediaLibrary'
import { mediaUploadError, mediaApi } from '../services/media'
import { receiptMediaUrl } from '../services/api'
export type ProductPicture={mediaId?:string;url:string}
export function ProductImageEditor({images,onChange}:{images:ProductPicture[];onChange:(images:ProductPicture[])=>void}) {
  const {t}=useTranslation(),[picker,setPicker]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const add=(pictures:ProductPicture[])=>onChange([...images.filter(i=>i.mediaId),...pictures.filter(p=>!images.some(i=>i.mediaId===p.mediaId))].slice(0,5))
  return <div className="space-y-3"><p className="text-sm font-medium">{t('products.image')} · {t('media.maxImages')}</p><ProductImageGallery images={images} /><div className="flex gap-2 flex-wrap">{images.map((image,index)=><div key={image.mediaId||image.url} className="w-20"><img className="w-20 h-20 object-cover rounded" src={receiptMediaUrl(image.url)} alt="" /><p className="text-xs">{index===0?t('media.mainImage'):index+1}</p><div className="flex justify-between"><button type="button" aria-label={t('media.moveEarlier')} disabled={!index} onClick={()=>{const next=[...images];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next)}}>←</button><button type="button" aria-label={t('media.deselect')} onClick={()=>onChange(images.filter((_,i)=>i!==index))}>×</button><button type="button" aria-label={t('media.moveLater')} disabled={index===images.length-1} onClick={()=>{const next=[...images];[next[index],next[index+1]]=[next[index+1],next[index]];onChange(next)}}>→</button></div></div>)}</div>
    <div className="flex gap-2"><button type="button" disabled={busy||images.length>=5} className="btn btn-sm" onClick={()=>setPicker(true)}>{t('media.choose')}</button><label className="btn btn-sm">{busy?t('common.loading'):t('media.upload')}<input disabled={busy||images.length>=5} type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={async e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;setBusy(true);setError('');try{if(files.length+images.length>5)throw Error('INVALID_PRODUCT_IMAGES');const result=await mediaApi.upload('product',files);add(result.data.data.list.map((a:any)=>({mediaId:a.id,url:a.url})))}catch(error){setError(t(mediaUploadError(error)))}finally{setBusy(false)}}} /></label></div>
    {error&&<p className="text-red-600" role="alert">{error}</p>}
    {picker&&<MediaPicker scene="product" max={5-images.length} onClose={()=>setPicker(false)} onSelect={assets=>{add(assets.map(a=>({mediaId:a.id,url:a.url})));setPicker(false)}} />}
  </div>
}
