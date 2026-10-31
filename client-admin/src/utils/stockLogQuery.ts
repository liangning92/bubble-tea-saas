import {calendarStart} from './queryPeriods'
export function stockLogDateRange(start:string,end:string,timezone:string){
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='2100-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
 if(!valid(start)||!valid(end)||start>end)return null
 const next=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10)
 return {startDate:calendarStart(start,timezone).toISOString(),endDate:new Date(calendarStart(next,timezone).getTime()-1).toISOString()}
}
export function stockLogQueryCopy(language:string){const at=language.startsWith('zh')?0:language.startsWith('id')?2:1,c=(zh:string,en:string,id:string)=>[zh,en,id][at];return {
 apply:c('查询','Apply','Terapkan'),start:c('开始日期','Start date','Tanggal mulai'),end:c('结束日期','End date','Tanggal akhir'),
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
