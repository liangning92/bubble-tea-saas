export function inspectionCopy(language: string) {
 if (language.startsWith('zh')) return {
  history: '已归档的巡检记录，只读保留。', snapshot: '包材核查依据', draft: '账面快照，实物库存待人工核实；发布时重新检查有效性。', captured: '采集时间', quantity: '账面数量', threshold: '最低／安全库存',
  lastCount: '最近有效实盘', pending: '已批准待到货', unknown: '待核实', start: '创建关联盘点', open: '打开关联盘点', count: '关联盘点',
  countHelp: '先填写并提交关联盘点，再提交任务证据。主管须单独批准盘点后才能完成任务。', failed: '操作未完成，请刷新后重试。',
  quality: { no_valid_count: '缺少有效实盘', count_stale: '实盘已过期', arrival_date_unknown: '到货日期未知', negative_stock: '账面负库存', below_threshold: '低于库存阈值', bulk_issue_usage_not_daily_consumption: '包材领用不能当作每日实际消耗' } as Record<string,string>
 }
 if (language.startsWith('en')) return {
  history: 'Archived inspection record, retained read-only.', snapshot: 'Packaging inspection basis', draft: 'Ledger snapshot; physical stock requires human verification. Validity is checked again at publication.', captured: 'Captured', quantity: 'Ledger quantity', threshold: 'Minimum / safety stock',
  lastCount: 'Last valid physical count', pending: 'Approved pending arrivals', unknown: 'Unverified', start: 'Create linked count', open: 'Open linked count', count: 'Linked count',
  countHelp: 'Fill and submit the linked count before submitting task evidence. The reviewer must approve the count separately before completing the task.', failed: 'Action failed. Refresh and try again.',
  quality: { no_valid_count: 'No valid count', count_stale: 'Count is stale', arrival_date_unknown: 'Arrival date unknown', negative_stock: 'Negative ledger stock', below_threshold: 'Below stock threshold', bulk_issue_usage_not_daily_consumption: 'Bulk issues do not establish daily consumption' } as Record<string,string>
 }
 return {
  history: 'Catatan pemeriksaan diarsipkan, hanya untuk dibaca.', snapshot: 'Dasar pemeriksaan kemasan', draft: 'Snapshot stok tercatat; stok fisik perlu diverifikasi manusia. Validitas diperiksa ulang saat diterbitkan.', captured: 'Waktu snapshot', quantity: 'Jumlah tercatat', threshold: 'Stok minimum / pengaman',
  lastCount: 'Hitungan fisik valid terakhir', pending: 'Kedatangan disetujui yang tertunda', unknown: 'Belum terverifikasi', start: 'Buat stok opname terkait', open: 'Buka stok opname terkait', count: 'Stok opname terkait',
  countHelp: 'Isi dan kirim stok opname terkait sebelum mengirim bukti tugas. Peninjau harus menyetujui stok opname secara terpisah sebelum menyelesaikan tugas.', failed: 'Tindakan gagal. Muat ulang dan coba lagi.',
  quality: { no_valid_count: 'Belum ada hitungan valid', count_stale: 'Hitungan sudah lama', arrival_date_unknown: 'Tanggal kedatangan belum diketahui', negative_stock: 'Stok tercatat negatif', below_threshold: 'Di bawah batas stok', bulk_issue_usage_not_daily_consumption: 'Pengeluaran kemasan bukan bukti konsumsi harian' } as Record<string,string>
 }
}
