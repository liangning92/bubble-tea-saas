import {useStoreDateSettings} from '../hooks/useStoreDateSettings'
import {formatStoreDate} from '../utils/storeDateTime'
import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import type {UsageResult,UsageRow} from '../../../shared/inventoryUsageReport'
import {formatItemName} from '../utils/helpers'
import {useEmployeeNavigation} from '../contexts/EmployeeAccess'
import {permissionForPage} from '../../../shared/StaffAccess'
export function theoryBackfillCopy(language:string){const n=language.startsWith('zh')?0:language.startsWith('id')?2:1,c=(zh:string,en:string,id:string)=>[zh,en,id][n];return {
 backfilled:c('含补算','Includes recalculation','Termasuk hitung ulang'),pending:c('待补配方','Recipes needed','Resep diperlukan'),details:c('理论耗用明细','Theory details','Rincian pemakaian teori'),basis:c('补算采用查询时的当前配方，原订单快照及历史库存保持原样。','Recalculation uses current recipes at query time. Original order snapshots and historical stock are preserved.','Hitung ulang memakai resep saat kueri. Snapshot pesanan asli dan stok historis tetap dipertahankan.'),snapshot:c('原快照','Original snapshots','Snapshot asli'),addition:c('补算','Recalculated','Dihitung ulang'),product:c('产品','Product','Produk'),orders:c('订单数','Orders','Pesanan'),servings:c('份数','Servings','Porsi'),status:c('状态','Status','Status'),resolved:c('按当前配方补算','Recalculated with current recipe','Dihitung ulang dengan resep saat ini'),configure:c('补齐配方','Complete recipes','Lengkapi resep'),noAccess:c('需有配方管理权限的人员处理','Recipe management permission is required','Memerlukan izin pengelolaan resep'),needsReview:c('历史证据待核','Historical evidence needs review','Bukti historis perlu diperiksa'),missing:c('缺少配方','Missing recipe','Resep belum tersedia'),calculated:c('补算时间','Calculated at','Waktu hitung ulang')
}}
export function TheoryBackfillDetails({data,row}:{data?:UsageResult;row?:UsageRow}){
 const {i18n}=useTranslation(),c=theoryBackfillCopy(i18n.language),allowed=useEmployeeNavigation(),dates=useStoreDateSettings(),backfill=data?.theoryBackfill
 if(!backfill||!backfill.resolved.length&&!backfill.unresolved.length)return null
 const missingCount=backfill.unresolved.filter(r=>r.reason==='BOM_MISSING').length,reviewCount=backfill.unresolved.length-missingCount
 const qty=(v?:number|null)=>v==null?'—':v.toLocaleString(i18n.language,{maximumFractionDigits:6})
 return <details className="workspace-disclosure theory-backfill-details"><summary><span>{backfill.resolved.length>0&&`${c.backfilled} ${backfill.resolved.length}`}</span>{missingCount>0&&<span className="text-amber-800">{c.pending} {missingCount}</span>}{reviewCount>0&&<span className="text-amber-800">{c.needsReview} {reviewCount}</span>}</summary>
  <div className="workspace-disclosure-content"><p>{c.basis}</p>{row&&<p>{c.snapshot}: {qty(row.snapshotTheoreticalConsumption)} {row.unit} · {c.addition}: {qty(row.backfilledTheoreticalConsumption)} {row.unit}</p>}
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{[c.product,c.orders,c.servings,c.status].map(text=><th className="text-left p-2" key={text}>{text}</th>)}</tr></thead><tbody>{[...backfill.unresolved,...backfill.resolved].map(r=><tr key={r.productId+':'+(r.reason||'resolved')}><td className="p-2">{formatItemName(r.productName,i18n.language)}</td><td className="p-2">{r.orderCount}</td><td className="p-2">{r.servings}</td><td className="p-2">{!r.reason?c.resolved:r.reason==='BOM_MISSING'?c.missing:c.needsReview}</td></tr>)}</tbody></table></div>
   {backfill.unresolved.length>0&&(allowed(permissionForPage('/products/recipes'))?<Link className="text-primary underline" to="/products/recipes">{c.configure}</Link>:<p>{c.noAccess}</p>)}<p className="text-xs text-gray-500">{c.calculated}: {formatStoreDate(backfill.calculatedAt,dates,true)}</p>
  </div>
 </details>
}
