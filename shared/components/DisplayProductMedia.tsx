import { ProductDisplayMedia } from '../utils/customerDisplayProducts'
export function DisplayProductMedia({ media, fit, background }: { media: ProductDisplayMedia; fit: 'contain' | 'cover'; background: string }) {
  if (!media.productId) return <img src={media.url} alt="" className="w-full h-full" style={{background,objectFit:fit}} />
  return <div className="relative w-full h-full" style={{ background }}>
    <img src={media.url} alt={media.productName || ''} className="w-full h-full" style={{ objectFit: fit }} />
    {media.productId && media.productName && typeof media.productPrice === 'number' && <div className="absolute bottom-0 inset-x-0 bg-black/75 text-white px-5 py-3">
      <p className="font-bold text-xl break-words">{media.productName}</p>
      <p className="text-2xl font-bold">{new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0}).format(media.productPrice)}</p>
    </div>}
  </div>
}
