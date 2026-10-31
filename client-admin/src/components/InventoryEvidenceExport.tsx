import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../stores/auth'

const copy = {
  zh: { title: '库存核查证据', start: '开始营业日期', end: '结束营业日期', download: '导出只读证据包', loading: '正在生成…', hint: '最多31个营业日。包含库存流水、盘点、订单及配方引用；缺失历史证据会明确列出，不会修改库存。', error: '导出失败，请检查日期、导出权限或缩小日期范围后重试。', success: '证据包已下载；仍有未核验证据，请查看文件中的 missing 清单。', unit: '营业日期按门店时区计算。' },
  id: { title: 'Bukti pemeriksaan stok', start: 'Tanggal usaha awal', end: 'Tanggal usaha akhir', download: 'Unduh bukti baca-saja', loading: 'Menyiapkan…', hint: 'Maksimal 31 hari usaha. Berisi mutasi, catatan hitung, referensi pesanan dan resep. Kekurangan bukti ditandai; stok tidak diubah.', error: 'Unduhan gagal. Periksa tanggal dan izin ekspor atau pilih rentang lebih pendek.', success: 'Bukti diunduh; masih ada bukti yang belum diverifikasi. Lihat daftar missing dalam berkas.', unit: 'Tanggal usaha mengikuti zona waktu toko.' },
  en: { title: 'Inventory review evidence', start: 'First business date', end: 'Last business date', download: 'Download read-only evidence', loading: 'Preparing…', hint: 'Up to 31 business dates. Includes movements, counts, order and recipe references. Missing historical evidence is listed; stock is never changed.', error: 'Export failed. Check dates and export permission, or choose a shorter range.', success: 'Evidence downloaded; some evidence remains unverified. Read the missing list in the file.', unit: 'Business dates use the store time zone.' },
}
export function InventoryEvidenceExport() {
  const { i18n } = useTranslation(), { user } = useAuthStore()
  const c = copy[i18n.language.startsWith('zh') ? 'zh' : i18n.language.startsWith('id') ? 'id' : 'en']
  const [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<'success' | 'error' | null>(null)
  async function download() {
    setBusy(true); setStatus(null)
    try {
      const response = await api.get('/inventory/evidence-export', { params: { storeId: user?.storeId, startDate, endDate }, responseType: 'blob' })
      const result = JSON.parse(await response.data.text())
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(result.data)))
      const digest = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')
      if (digest !== result.contentHash || result.exportId !== 'inventory-evidence-v1:' + digest) throw Error('EVIDENCE_HASH_MISMATCH')
      const url = URL.createObjectURL(response.data), a = document.createElement('a')
      a.href = url; a.download = `inventory-evidence-${startDate}-${endDate}-${digest.slice(0, 12)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('success')
    } catch { setStatus('error') } finally { setBusy(false) }
  }
  return <section className="inventory-evidence-export" aria-label={c.title}><details className="workspace-disclosure"><summary>{c.title}</summary><div className="workspace-disclosure-content">
    <p className="text-sm text-gray-600">{c.hint} {c.unit}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm flex flex-col gap-1">{c.start}<input className="input" type="date" value={startDate} max={endDate || undefined} onChange={e => setStartDate(e.target.value)} /></label>
      <label className="text-sm flex flex-col gap-1">{c.end}<input className="input" type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} /></label>
      <button type="button" className="btn-primary" disabled={busy || !startDate || !endDate || !user?.storeId} onClick={download}>{busy ? c.loading : c.download}</button>
    </div>
    {status && <p role={status === 'error' ? 'alert' : 'status'} className={status === 'error' ? 'text-sm text-red-700' : 'text-sm text-amber-800'}>{c[status]}</p>}
  </div></details></section>
}
