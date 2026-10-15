// Presentation of known legacy factory copy, including previously published copies.
// Unknown store edits, lesson IDs, parameters, quiz answers and saved revisions are preserved.
const legacyCopy: Record<string, string> = {
  "按批准卡加工，记录实际产量与剩余；加工/销售分层扣料是目标流程，未确认自动化上线。": "按本店批准卡加工，记录实际用料、产量与剩余，避免重复登记同一批原料。",
  "Olah sesuai kartu yang disetujui dan catat hasil serta sisa nyata. Pemisahan pemakaian bahan saat produksi dan penjualan adalah alur sasaran, belum dinyatakan otomatis aktif.": "Olah sesuai kartu toko yang disetujui. Catat bahan, hasil dan sisa nyata tanpa mencatat bahan yang sama dua kali.",
  "目标流程：加工时扣原料并登记实际半成品产出；销售时只消耗对应半成品，不再次扣同一份原料。此分层自动化尚未确认上线。": "员工按实际数量登记原料出库，不需要另填领用加工。加工产量与剩余按本店批准记录要求交接，不重复登记同一批原料。",
  "Alur sasaran: saat pengolahan, kurangi bahan baku dan catat hasil olahan nyata; saat penjualan, gunakan hasil olahan terkait tanpa mengurangi bahan baku yang sama lagi. Otomatisasi alur bertingkat ini belum dipastikan aktif.": "Karyawan mencatat bahan keluar sesuai jumlah nyata tanpa formulir pengolahan terpisah. Serahkan catatan hasil dan sisa sesuai ketentuan toko; jangan mencatat bahan yang sama dua kali.",
  "先由主管确认当前版本实际扣料方式和批准记录路径；未支持时采用批准纸面或现有登记流程，关联订单与批次，避免系统与手工重复扣料。": "按本店指定的出库与交接方式记录实际数量，关联订单或批次；不确定是否已登记时先向店长核实，避免重复出库。",
  "Penyelia harus memastikan cara pemakaian stok pada versi yang digunakan dan jalur pencatatan yang disetujui. Jika belum didukung, gunakan formulir atau alur pencatatan yang disetujui, hubungkan pesanan dan lot, serta hindari pencatatan pengurangan ganda.": "Catat jumlah nyata melalui alur barang keluar dan serah terima toko, terkait pesanan atau lot. Jika ragu apakah sudah dicatat, konfirmasikan kepada pengelola untuk mencegah pencatatan ganda.",
  "演练一批半成品从实产、领用到交班剩余，标明实际系统支持与纸面补充的边界。": "演练一批半成品从实产、领用到交班剩余，核对原料出库与交接记录，避免重复登记。",
  "当前版本未证实支持分层扣料，员工应怎样做？": "登记原料出库时，怎样避免重复扣料？",
  "Apa yang dilakukan jika versi saat ini belum terbukti mendukung pengurangan stok bertingkat?": "Bagaimana mencegah pencatatan ganda saat mencatat bahan keluar?",
  "目标流程不等于已上线功能，必须核实实际记录路径。": "按店内实际出库与交接流程记录，同一批原料只登记一次。",
  "Alur sasaran bukan berarti fitur sudah aktif; jalur pencatatan nyata harus dipastikan.": "Ikuti alur barang keluar dan serah terima toko. Catat bahan yang sama hanya sekali.",
  "老板独享到账查询；员工私密取证待对账。逐项退款等改动未发布，不虚构系统按钮。": "到账查询由老板负责；员工按规定保存私密凭证，退款需先申请审批并核对实际执行结果。",
  "Hanya pemilik memeriksa dana masuk; karyawan menyimpan bukti secara privat untuk rekonsiliasi. Perubahan pengembalian per item belum dirilis; jangan menganggap tombolnya tersedia.": "Pemilik memeriksa dana masuk. Karyawan menyimpan bukti secara privat; ajukan persetujuan pengembalian dana dan periksa hasil pelaksanaannya.",
  "上述是已定业务边界，不代表当前线上已支持逐项分摊、原扣料恢复或所有报表净额。部分退款整批改动尚未发布；先由主管确认版本，未支持时使用批准申请与核实记录，不虚构按钮或宣称自动完成。": "需要退款时先提交批准的申请和凭证，由主管核实退款金额、执行渠道及库存影响；出现无法处理的项目时联系主管，不自行改金额、恢复库存或重复退款。",
  "Ini adalah batas bisnis yang sudah ditetapkan, bukan pernyataan bahwa versi daring saat ini mendukung alokasi per item, pemulihan stok asal, atau seluruh laporan neto. Paket perubahan pengembalian sebagian belum dirilis. Minta penyelia memastikan versi; jika belum didukung, gunakan catatan permohonan dan pemeriksaan yang disetujui tanpa menganggap tombol atau penyelesaian otomatis tersedia.": "Ajukan permohonan dan bukti pengembalian dana yang disetujui. Penyelia memeriksa jumlah, cara pelaksanaan dan dampak stok. Hubungi penyelia jika tidak dapat diproses; jangan mengubah nilai, memulihkan stok atau mengembalikan dana lagi sendiri.",
  "实操记录路径：确认当前软件版本、半成品实际扣料方式、获准纸面表、异常恢复联系人、盘点报损审批及对账方式；不得假定未发布功能可用。": "实操记录：确认本店出库与交接方式、批准的记录表、异常联系人、盘点报损审批及对账要求。",
  "Jalur pencatatan: pastikan versi perangkat lunak, cara pemakaian stok hasil olahan, formulir yang disetujui, penanggung jawab pemulihan, persetujuan hitungan dan kerugian, serta rekonsiliasi. Jangan menganggap fungsi yang belum dirilis sudah tersedia.": "Catatan praktik: pastikan alur barang keluar dan serah terima, formulir yang disetujui, kontak masalah, persetujuan hitungan serta kerugian, dan ketentuan rekonsiliasi."
}
export function employeeTrainingPresentation<T>(value: T): T {
  if (typeof value === 'string') return (legacyCopy[value] ?? value) as T
  if (Array.isArray(value)) return value.map(employeeTrainingPresentation) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, employeeTrainingPresentation(item)])) as T
  return value
}
