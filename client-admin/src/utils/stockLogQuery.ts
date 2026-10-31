import {calendarStart} from './queryPeriods'
export function stockLogDateRange(start:string,end:string,timezone:string){
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='2100-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
 if(!valid(start)||!valid(end)||start>end)return null
 const next=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 return {startDate:calendarStart(start,timezone).toISOString(),endDate:new Date(calendarStart(next,timezone).getTime()-1).toISOString()}
}
export function stockLogQueryCopy(language:string){const at=language.startsWith('zh')?0:language.startsWith('id')?2:1,c=(zh:string,en:string,id:string)=>[zh,en,id][at];return {
 comparison:c('原料出库对比','Material stock-out comparison','Perbandingan stok keluar bahan'),comparisonScope:c('按已应用日期比较；实际量跟随流水类型，理论量按同期全部订单配方计算。','Applied dates; actual follows movement type, theory uses all order recipes in that period.','Tanggal aktif; aktual mengikuti jenis pergerakan, teori dari seluruh resep pesanan periode yang sama.'),
 actualTotal:c('查询实际出库总量','Matching physical stock-out','Total keluar fisik hasil pencarian'),theoryTotal:c('同期理论耗用量','Recipe consumption for period','Pemakaian teoretis periode'),difference:c('出库差额','Stock-out difference','Selisih stok keluar'),differenceFormula:c('实际出库 − 理论耗用','Physical stock-out − recipe consumption','Keluar fisik − pemakaian teoretis'),filteredActual:c('当前筛选的全部结果，含更正','All filtered results, including corrections','Seluruh hasil filter, termasuk koreksi'),orderRecipe:c('同期订单的配方快照','Order recipe snapshots for the same period','Snapshot resep pesanan periode yang sama'),verifiedPart:c('仅已核实部分，非完整理论量','Verified portion; incomplete total','Hanya bagian terverifikasi; total belum lengkap'),allMatches:c('全部匹配流水，不受分页影响','All matches, across every page','Seluruh catatan sesuai, semua halaman'),financial:c('查看金额指标','View financial metrics','Lihat metrik keuangan'),chooseMaterial:c('选择要对比的原料','Select a material to compare','Pilih bahan untuk dibandingkan'),theoryFailed:c('理论量查询失败或没有查看权限，未将其记为零。','Recipe query failed or access is restricted; not treated as zero.','Kueri teori gagal atau akses terbatas; tidak dianggap nol.'),incompleteTheory:c('该期间配方证据不完整或存在历史覆盖缺口；只显示已核实部分，完整理论量和差额暂不可计算。仓库领料与销售耗用存在时间差，差额不直接代表损耗。','Recipe evidence or historical coverage is incomplete. Only verified quantities are shown; the complete total and difference are unavailable. Warehouse issues and sales may occur at different times; a difference is not proof of loss.','Bukti resep atau cakupan historis belum lengkap. Hanya jumlah terverifikasi ditampilkan; total lengkap dan selisih belum tersedia. Waktu pengeluaran gudang dan penjualan dapat berbeda; selisih bukan bukti kehilangan.'),theoryDetails:c('查看理论明细','View recipe details','Lihat rincian teori'),
 tableRegion:c('流水表格，可横向滚动','Scrollable movement table','Tabel pergerakan, dapat digulir mendatar'),scroll:c('左右滑动查看完整列','Scroll sideways for all columns','Geser mendatar untuk semua kolom'),
 pagination:c('流水分页','Movement pagination','Halaman pergerakan'),perPage:c('每页','Per page','Per halaman'),previous:c('上一页','Previous page','Halaman sebelumnya'),next:c('下一页','Next page','Halaman berikutnya'),pageRange:(first:number,last:number,total:number)=>c(`${first}–${last} / 共 ${total} 条`,`${first}–${last} of ${total}`,`${first}–${last} dari ${total}`),
 ledger:c('流水明细','Movement details','Rincian pergerakan'),type:c('流水类型','Movement type','Jenis pergerakan'),period:c('时间范围','Date range','Rentang tanggal'),outbound:c('实际出库','Physical stock-out','Stok keluar fisik'),summary:c('查看按原料汇总','View material totals','Lihat total per bahan'),hideSummary:c('收起汇总','Hide totals','Tutup ringkasan'),costInfo:c('更正说明','Correction details','Penjelasan koreksi'),materials:(n:number)=>c(`${n} 种原料`,`${n} materials`,`${n} bahan`),entries:(n:number)=>c(`${n} 条流水`,`${n} entries`,`${n} catatan`),
 retry:c('重试','Retry','Coba lagi'),apply:c('查询','Apply','Terapkan'),start:c('开始日期','Start date','Tanggal mulai'),end:c('结束日期','End date','Tanggal akhir'),
 invalid:c('请选择完整日期（2000—2100 年），结束日期不能早于开始日期。编辑完成后点击查询。','Choose complete dates (2000–2100); end must be on or after start. Apply after editing.','Pilih tanggal lengkap (2000–2100); tanggal akhir tidak boleh sebelum awal. Terapkan setelah mengedit.'),
 draft:c('日期尚未应用，当前仍显示上次查询结果。','Date changes are not applied. Previous results remain visible.','Perubahan tanggal belum diterapkan. Hasil sebelumnya tetap ditampilkan.'),
 failed:c('流水更新失败，请重试；已有数据保留。','Ledger refresh failed. Retry; previous data is retained.','Pembaruan riwayat gagal. Coba lagi; data sebelumnya dipertahankan.'),
 clear:c('清除筛选','Clear filters','Hapus filter'),empty:c('当前日期、分类、流水类型和关键词下没有匹配记录。','No records match this date range, category, movement type and search.','Tidak ada catatan sesuai rentang tanggal, kategori, jenis, dan pencarian.'),
 range:c('已应用查询范围','Applied query range','Rentang pencarian aktif'),quantities:c('筛选结果中的实际出库量（按原料汇总）','Physical stock-out in matching results (by material)','Keluar fisik pada hasil filter (per bahan)'),
 all:c('全部日期','All dates','Semua tanggal'),loaded:c('统计基于当前筛选的全部匹配流水。','Totals use all matching ledger entries for the current filters.','Total menggunakan semua catatan yang sesuai filter saat ini.')
}}

export function physicalStockOutQuantity(log:any):number|null{
 if(log.type!=='stock_out'||!['withdrawal','other','loss','expired','process'].includes(log.reason))return null
 let note:any;try{note=JSON.parse(log.note||'null')}catch{}
 if(['internal_conversion','internal_transfer'].includes(note?.stockEffect)||log.reason==='receipt_cost_adjustment')return null
 const quantity=Number(log.quantity);return Number.isFinite(quantity)?quantity:null
}

/** Never turn missing recipe evidence, mixed units or historical gaps into a zero difference. */
export function materialComparison(logs:any[],item:any,row:any,legacyOnly=false){
 const actual=logs.filter(log=>log.inventoryId===item?.id).reduce((sum,log)=>sum+(('physicalQuantity' in log?log.physicalQuantity:physicalStockOutQuantity(log))??0),0)
 const complete=!!row&&row.unit===item?.unit&&!row.partialPeriod&&!legacyOnly&&row.theoreticalConsumption!==null&&row.theoreticalConsumption!==undefined&&row.theoryEvidence?.complete!==false
 const known=row?.unit===item?.unit?(row?.theoreticalConsumption??row?.knownTheoreticalConsumption??null):null
 const theory=typeof known==='number'&&Number.isFinite(known)?known:null
 return {actual,theory,difference:complete&&theory!==null?Math.round((actual-theory)*1e9)/1e9:null,partial:!complete}
}
