const zh = {
 hint:'一次带出清单，连续填写后统一保存。空白表示未盘，0 表示实物为零；差异说明选填，审核后才调整库存。',
 search:'搜索物料', all:'全部', pending:'未盘', difference:'有差异', actual:'实盘数量', theory:'账面库存', delta:'差异', unit:'单位', note:'差异说明（选填）', noteToggle:'补充说明',
 save:'保存已填写项', saving:'保存中…', saved:'草稿已保存，可继续盘点。', dirty:'有未保存内容，请先保存再提交或离开。', empty:'没有符合条件的物料。', invalid:'请输入大于或等于 0 的有效数量；未盘物料请留空。',
 failed:'保存失败，已填内容保留，请重试。', conflict:'账面库存已变化。请重新核对实物数量，更新账面库存后再保存。', reload:'更新账面库存并保留输入', retryFailed:'刷新失败，已填内容保留。', details:'已保存的盘点明细与库存变动',
 progress:'已保存 {saved} / {total} 项 · 待保存 {dirty} 项', select:'批量选择物料', selectHint:'默认盘点全部物料；也可搜索后勾选本次要盘的物料。', selectVisible:'选中搜索结果', clear:'清空选择', selected:'已选择 {count} 项'
}
const en: typeof zh = {
 hint:'Enter quantities continuously, then save together. Blank means uncounted; 0 means none on hand. Notes are optional. Stock changes only after approval.',
 search:'Search materials',all:'All',pending:'Uncounted',difference:'With variance',actual:'Counted quantity',theory:'Book stock',delta:'Variance',unit:'Unit',note:'Variance note (optional)',noteToggle:'Add note',
 save:'Save entered quantities',saving:'Saving…',saved:'Draft saved. You can continue counting.',dirty:'Unsaved entries. Save before submitting or leaving.',empty:'No matching materials.',invalid:'Enter a valid quantity of 0 or more. Leave uncounted materials blank.',
 failed:'Save failed. Your entries are retained. Please retry.',conflict:'Book stock has changed. Recheck physical quantities, refresh book stock, then save again.',reload:'Refresh book stock and keep entries',retryFailed:'Refresh failed. Your entries are retained.',details:'Saved counts and stock movements',
 progress:'Saved {saved} / {total} · Unsaved {dirty}',select:'Select materials in bulk',selectHint:'Count all materials by default, or search and select materials for this count.',selectVisible:'Select search results',clear:'Clear selection',selected:'{count} selected'
}
const id: typeof zh = {
 hint:'Isi jumlah berurutan, lalu simpan sekaligus. Kosong berarti belum dihitung; 0 berarti stok fisik habis. Catatan opsional. Stok berubah setelah disetujui.',
 search:'Cari bahan',all:'Semua',pending:'Belum dihitung',difference:'Ada selisih',actual:'Jumlah fisik',theory:'Stok buku',delta:'Selisih',unit:'Satuan',note:'Catatan selisih (opsional)',noteToggle:'Tambah catatan',
 save:'Simpan jumlah yang diisi',saving:'Menyimpan…',saved:'Draf tersimpan. Penghitungan dapat dilanjutkan.',dirty:'Ada isian belum disimpan. Simpan sebelum mengirim atau meninggalkan halaman.',empty:'Tidak ada bahan yang cocok.',invalid:'Masukkan jumlah valid minimal 0. Biarkan kosong jika belum dihitung.',
 failed:'Gagal menyimpan. Isian tetap tersimpan di halaman. Coba lagi.',conflict:'Stok buku berubah. Periksa kembali jumlah fisik, perbarui stok buku, lalu simpan lagi.',reload:'Perbarui stok buku, pertahankan isian',retryFailed:'Gagal memperbarui. Isian tetap dipertahankan.',details:'Hasil tersimpan dan pergerakan stok',
 progress:'Tersimpan {saved} / {total} · Belum disimpan {dirty}',select:'Pilih bahan sekaligus',selectHint:'Hitung semua bahan secara default, atau cari dan pilih bahan untuk penghitungan ini.',selectVisible:'Pilih hasil pencarian',clear:'Kosongkan pilihan',selected:'{count} dipilih'
}
export const inventoryCountLabels=(language:string)=>language.startsWith('zh')?zh:language.startsWith('id')?id:en
