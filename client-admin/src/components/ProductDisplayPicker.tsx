import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { activitiesApi, receiptMediaUrl } from '../services/api'
import { formatCurrency } from '../utils/helpers'
import { DisplayCatalogProduct, ProductDisplayMedia } from '../../../shared/utils/customerDisplayProducts'
import { MarketingDialog } from './marketing/MarketingDialog'
import { MarketingError, useMarketingCopy } from './marketing/MarketingLayout'
import { ResourcePicker } from './marketing/ResourcePicker'

export function ProductDisplayPicker({onClose,onSelect}:{onClose:()=>void;onSelect:(media:ProductDisplayMedia)=>void}) {
  const l=useMarketingCopy(),[productId,setProductId]=useState(''),[specId,setSpecId]=useState('')
  const query=useQuery({queryKey:['display-product-catalog'],queryFn:()=>activitiesApi.resources().then(response=>response.data.data.products as DisplayCatalogProduct[])})
  const products=(query.data||[]).filter(product=>product.image && product.specs?.length)
  const product=products.find(product=>product.id===productId)
  const spec=product?.specs.find(spec=>spec.id===specId)||product?.specs.find(spec=>spec.isDefault)||product?.specs[0]
  return <MarketingDialog onClose={onClose}><div className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-4">
    <div className="flex justify-between"><h2 className="font-semibold">{l('选择展示产品','Choose display product','Pilih produk tampilan')}</h2><button type="button" onClick={onClose}>{l('关闭','Close','Tutup')}</button></div>
    <p className="text-sm text-gray-500">{l('选择产品后自动读取产品图、名称和所选规格价格。请先在产品页面保存图片。','Choose a product to load its image, name and selected specification price. Save product images first.','Pilih produk untuk memuat foto, nama, dan harga varian. Simpan foto produk terlebih dahulu.')}</p>
    {query.isError?<MarketingError retry={()=>query.refetch()}/>:<ResourcePicker label={l('产品','Products','Produk')} single options={products.map(product=>({id:product.id,name:product.name,image:receiptMediaUrl(product.image),subtitle:[product.code,formatCurrency((product.specs.find(spec=>spec.isDefault)||product.specs[0]).price)].filter(Boolean).join(' · '),group:product.category?.name}))} value={productId?[productId]:[]} onChange={ids=>{setProductId(ids[0]||'');setSpecId('')}} loading={query.isLoading}/>}
    {product && spec && <div className="flex gap-4 items-center"><img src={receiptMediaUrl(product.image)} alt={product.name} className="w-32 h-32 object-contain"/><div className="space-y-2"><p className="font-medium">{product.name}</p><select aria-label={l('展示规格','Display specification','Varian tampilan')} className="input" value={spec.id} onChange={event=>setSpecId(event.target.value)}>{product.specs.map(spec=><option key={spec.id} value={spec.id}>{spec.name} · {formatCurrency(spec.price)}</option>)}</select><p className="font-bold">{formatCurrency(spec.price)}</p></div></div>}
    <button type="button" disabled={!product||!spec} className="btn-primary disabled:opacity-50" onClick={()=>{if(product && spec)onSelect({productId:product.id,specId:spec.id,url:receiptMediaUrl(product.image),filename:product.specs.length>1&&spec.name?`${product.name} · ${spec.name}`:product.name,mimetype:'image/*',isVideo:false,productName:product.name,productPrice:spec.price,productSpecName:product.specs.length>1?spec.name:undefined})}}>{l('使用此产品','Use this product','Gunakan produk ini')}</button>
  </div></MarketingDialog>
}
