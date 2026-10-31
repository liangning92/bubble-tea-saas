export function inventoryReconciliationCopy(language:string){
 const at=language.startsWith('zh')?0:language.startsWith('id')?2:1,c=(zh:string,en:string,id:string)=>[zh,en,id][at]
 return {
  recipeProducts:c('以下商品的配方证据不完整，已保留其他可核实用量；补配方不会回填历史快照。','Recipe evidence is incomplete for these products. Verified usage remains visible; recipe edits do not rewrite historical snapshots.','Bukti resep produk berikut belum lengkap. Pemakaian terverifikasi tetap terlihat; perubahan resep tidak mengisi ulang snapshot historis.'),
  knownPart:c('已核实部分','Verified portion','Bagian terverifikasi'),evidence:c('订单快照 / 缺失订单 / 配方问题','Order snapshots / missing orders / recipe issues','Snapshot pesanan / pesanan belum lengkap / masalah resep'),
  dailyTitle:c('每日耗用对比','Daily usage comparison','Perbandingan pemakaian harian'),countTitle:c('盘点库存核对','Count reconciliation','Rekonsiliasi opname'),
  dailyHint:c('按门店日期汇总订单配方理论耗用与实际登记出库，不需要盘点数据。','Compare order recipe usage with registered stock-out by store date. Counts are not required.','Bandingkan pemakaian resep pesanan dan stok keluar tercatat per tanggal toko. Tidak memerlukan opname.'),
  countHint:c('以已完成盘点为基准，加上期间入库、减去期间实际出库，核对下一次实盘；订单理论量不参与库存核对。','Opening completed count + receipts − actual physical stock-out is compared with the next physical count. Order theory does not determine this balance.','Opname awal selesai + penerimaan − stok keluar fisik dibandingkan opname berikutnya. Teori pesanan tidak menentukan saldo ini.'),
  formula:c('本次应有库存＝上次实盘＋期间入库－期间实际出库；盘点差异＝本次实盘－本次应有库存。盘点调整与订单理论扣减不重复算作实际出库。','Expected stock = opening physical count + receipts − physical stock-out. Count difference = closing count − expected stock. Count adjustments and theoretical sales entries are not counted as physical stock-out.','Stok seharusnya = opname awal + penerimaan − stok keluar fisik. Selisih opname = opname akhir − stok seharusnya. Penyesuaian opname dan teori penjualan bukan pengeluaran fisik tambahan.'),
  limits:c('实盘与应有库存不一致时提醒核查；差异不是自动损耗判定，不会因此自动修改库存。第二次实盘可在待审核时先核对。','A count mismatch prompts review without automatically changing stock or treating it as waste. A submitted closing count can be checked before approval.','Selisih opname memerlukan pemeriksaan tanpa perubahan stok otomatis atau penetapan pemborosan. Opname akhir yang diajukan dapat diperiksa sebelum persetujuan.'),
  latest:c('最近基准与本次实盘','Latest baseline and count','Opname awal dan akhir terbaru'),
  opening:c('上次实盘','Opening count','Opname awal'),incoming:c('期间入库','Interval receipts','Penerimaan periode'),outgoing:c('期间实际出库','Physical stock-out','Keluar fisik periode'),expected:c('本次应有库存','Expected closing stock','Stok akhir seharusnya'),closing:c('本次实盘','Closing count','Opname akhir'),difference:c('盘点差异','Count difference','Selisih opname'),
  awaiting:c('待下次盘点','Awaiting next count','Menunggu opname berikutnya'),noBaseline:c('尚无已完成基准盘点','No completed baseline count','Belum ada opname awal selesai'),
  nextHint:c('已有盘点基准，已计算期间应有库存，等待下一次实盘核对。','The baseline is available and expected stock is calculated. Awaiting the next count.','Opname awal tersedia dan stok seharusnya telah dihitung. Menunggu opname berikutnya.'),
  baselineHint:c('请完成一次基准盘点；每日耗用对比不受此限制。','Complete a baseline count. Daily usage comparison remains available.','Selesaikan opname awal. Perbandingan harian tetap tersedia.'),
  observing:c('观察区间','Observation interval','Rentang pengamatan'),pending:c('本次实盘待审核','Closing count awaiting approval','Opname akhir menunggu persetujuan'),
  comparable:c('可核对库存','Reconciled materials','Bahan dapat direkonsiliasi'),missing:c('待盘点或补充','Awaiting counts or data','Menunggu opname atau data'),normal:c('库存一致','Stock matches','Stok sesuai'),
  before:c('已完成基准盘点数','Completed baseline counts','Jumlah opname awal selesai')
 }
}
