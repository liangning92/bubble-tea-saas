import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, BarChart3 } from 'lucide-react'
import { activitiesApi } from '../../services/api'
import { MarketingError, useMarketingCopy } from '../../components/marketing/MarketingLayout'

export function MarketingAnalyticsPage() {
  const l = useMarketingCopy(), [params] = useSearchParams(), [days,setDays] = useState(30)
  const report = useQuery({ queryKey: ['activity-performance',days], queryFn: () => activitiesApi.performance(days).then(response => response.data.data) })
  const rows = (report.data?.activities || []).filter((row:any) => !params.get('activity') || row.id === params.get('activity'))
  const summary = params.get('activity') ? rows[0] : report.data?.summary
  const money = (value:number) => 'Rp '+(value||0).toLocaleString('id-ID')
  return <div className="space-y-5">
    <div className="marketing-toolbar"><p className="text-sm text-gray-500">{l('依据统一活动的成交记录、退款和权益发放记录统计。','Based on unified activity transactions, refunds and reward records.','Berdasarkan transaksi, pengembalian dana, dan catatan hadiah aktivitas terpadu.')}</p><select aria-label={l('统计范围','Reporting period','Periode laporan')} className="input sm:w-40" value={days} onChange={event=>setDays(Number(event.target.value))}>{[7,30,90].map(day=><option key={day} value={day}>{l('最近','Last','Terakhir')} {day} {l('天','days','hari')}</option>)}</select></div>
    {report.isError ? <MarketingError retry={()=>report.refetch()}/> : report.isLoading ? <div className="card flex justify-center py-12"><Loader2 className="animate-spin text-primary"/></div> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[[l('参与订单','Related orders','Pesanan terkait'),summary?.orderCount||0],[l('退款后实收（含税）','Net receipts (tax included)','Penerimaan bersih (termasuk pajak)'),money(summary?.paidAmount)],[l('成交时优惠','Checkout discounts','Diskon saat checkout'),money(summary?.discountAmount)],[l('退款金额','Refunds','Pengembalian dana'),money(summary?.refundedAmount)]].map(([label,value])=><div className="card" key={label}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div>
      <div className="card !p-0 overflow-x-auto"><table className="min-w-[800px]"><thead><tr>{[l('活动','Activity','Aktivitas'),l('参与订单','Orders','Pesanan'),l('实收（含税）','Receipts (tax included)','Penerimaan (termasuk pajak)'),l('成交时优惠','Checkout discounts','Diskon checkout'),l('退款','Refunds','Pengembalian'),l('权益 / 已兑现','Rewards / fulfilled','Hadiah / diserahkan'),l('待处理','Outstanding','Belum selesai'),l('操作','Actions','Tindakan')].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row:any)=><tr key={row.id} className="border-t border-border"><td className="font-medium">{row.name}</td><td>{row.orderCount}</td><td>{money(row.paidAmount)}</td><td>{money(row.discountAmount)}</td><td>{money(row.refundedAmount)}</td><td>{row.rewardCount} / {row.fulfilled}</td><td>{row.pending} {row.needsAttention>0&&<span className="badge badge-warning ml-1">{row.needsAttention} {l('异常','issues','masalah')}</span>}</td><td><Link className="text-primary" to={'/marketing/promotions/activities?activity='+encodeURIComponent(row.id)}>{l('管理活动','Manage activity','Kelola aktivitas')}</Link></td></tr>)}</tbody></table>{!rows.length&&<div className="text-center text-gray-500 py-12"><BarChart3 className="mx-auto mb-3"/><p className="text-sm">{l('暂无统一活动记录','No unified activity records','Belum ada catatan aktivitas terpadu')}</p></div>}</div>
      <p className="text-xs text-gray-500">{l('实收为参与活动订单退款后的收款金额，包含税费，不代表活动带来的新增收入。同一订单可获得多个非价格权益，各活动行的订单金额可能重叠，总览按订单去重；优惠金额为成交时记录。','Receipts include tax and subtract refunds; they do not measure incremental revenue. Orders can qualify for several rewards, so activity rows overlap; summary orders are deduplicated. Discounts show checkout values.','Penerimaan termasuk pajak dan dikurangi pengembalian; bukan pendapatan tambahan. Pesanan dapat memenuhi beberapa hadiah sehingga baris tumpang tindih; ringkasan tanpa duplikasi. Diskon menunjukkan nilai checkout.')}</p>
    </>}
  </div>
}
