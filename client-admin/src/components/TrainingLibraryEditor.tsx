import { TrainingVideo } from './TrainingVideo'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'

type Path = (string | number)[]
const blankText = () => ({ zh: '新项目', id: 'Butir baru' })
const lessonTemplate = () => ({ key: 'item-' + crypto.randomUUID(), title: blankText(), points: [blankText()], tip: blankText(), warning: blankText(), errors: [blankText()], practice: blankText(), checklist: [blankText()] })
const optionalLessonFields = ['tip', 'warning', 'errors', 'practice', 'checklist']
const labels: Record<string, string> = { tip: '提示 / Kiat', warning: '警告 / Peringatan', title: '标题 / Judul', subtitle: '简介 / Pengantar', sections: '课程 / Materi', points: '步骤 / Langkah', errors: '常见错误 / Kesalahan', practice: '实操 / Praktik', checklist: '检查清单 / Daftar periksa', practical: '实操任务 / Tugas praktik', quiz: '题目 / Soal', q: '问题 / Pertanyaan', options: '选项 / Pilihan', answer: '正确选项（从 0 开始） / Jawaban (mulai 0)', explanation: '答案解释 / Penjelasan', assessment: '考核表 / Penilaian', standardsToConfirm: '待确认标准 / Standar belum disepakati', instructions: '说明 / Petunjuk', rows: '考核项目 / Butir', minutes: '建议分钟 / Menit', sources: '参考资料 / Referensi' }
export function TrainingLibraryEditor({ token, onClose }: { token: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<any>(null), [generation, setGeneration] = useState<string | null>(null), [published, setPublished] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [note, setNote] = useState('')
  const [selected, setSelected] = useState('0'), [language, setLanguage] = useState('zh'), [history, setHistory] = useState<any[]>([]), [cursor, setCursor] = useState<string | null>(null), [preview, setPreview] = useState<any>(null)
  const blocker = useBlocker(dirty)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch('/api/training/library' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) throw new Error(response.status === 409 ? '版本冲突：已保留当前编辑。请复制需要保留的文字，再重新加载最新版本。 / Konflik versi: salin perubahan sebelum memuat ulang.' : result.message || '保存失败 / Gagal menyimpan')
    return result.data
  }
  async function load() { const data = await api('/edit'); setDocument(data.catalogue); setGeneration(data.generation); setPublished(data.publishedRevision); setDirty(false); retry.current = null }
  async function historyPage(next?: string) { const data = await api('/history?limit=20' + (next ? '&cursor=' + encodeURIComponent(next) : '')); setHistory(old => next ? [...old, ...data.list] : data.list); setCursor(data.nextCursor) }
  useEffect(() => { Promise.all([load(), historyPage()]).catch(e => setMessage(e.message)) }, [token])
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard) }, [dirty])
  function change(path: Path, value: any) { setDocument((old: any) => { const next = structuredClone(old); let node = next; for (const key of path.slice(0, -1)) node = node[key]; if (value === undefined) delete node[path[path.length - 1]]; else node[path[path.length - 1]] = value; return next }); setDirty(true) }
  async function uploadVideo(path: Path, file: File) {
    if (busy) return
    if (file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.mp4')) { setMessage(t('trainingMedia.failed')); return }
    setBusy(true); setDirty(true); setMessage('')
    try {
      const body = new FormData(); body.append('video', file)
      const response = await fetch('/api/training/library/videos', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body })
      if (!response.ok) throw Error(t('trainingMedia.failed'))
      const result = await response.json(); change([...path, 'videoId'], result.data.id); setMessage(t('trainingMedia.saved'))
    } catch { setMessage(t('trainingMedia.failed')) } finally { setBusy(false) }
  }
  async function write(kind: 'save' | 'publish' | 'restore', id?: string) {
    if (busy) return
    if (kind !== 'save' && dirty) { setMessage('请先保存草稿。 / Simpan draf terlebih dahulu.'); return }
    if (kind === 'publish' && !window.confirm('确认内容已审核，发布给本店员工？ / Terbitkan materi yang sudah ditinjau?')) return
    if (kind === 'restore' && !window.confirm('恢复会新增草稿版本，不改变已发布内容。 / Pulihkan sebagai versi draf baru?')) return
    setBusy(true); setMessage('')
    const payload = { expectedGeneration: generation, note, ...(kind === 'save' ? { catalogue: document } : {}) }
    const signature = JSON.stringify({ kind, id, payload }); if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() }
    try { await api(kind === 'save' ? '/draft' : kind === 'publish' ? '/publish' : '/restore/' + id, kind === 'save' ? 'PUT' : 'POST', { ...payload, requestId: retry.current.id }); await load(); await historyPage(); setNote(''); setMessage('已保存新版本 / Versi baru tersimpan') } catch (e: any) { setMessage(e.message) } finally { setBusy(false) }
  }
  function arrayChange(value: any[], path: Path, action: 'add' | 'delete' | 'up' | 'down', index = 0) {
    const next = structuredClone(document); let parent = next
    for (const part of path.slice(0, -1)) parent = parent[part]
    const key = path[path.length - 1], items = structuredClone(value)
    if (action === 'add') {
      const text = { zh: '新项目', id: 'Butir baru' }
      const templates: Record<string, any> = { sources: {title:'参考资料 / Referensi',url:'https://example.com'}, quiz:{key:'new',q:text,options:[text,text],answer:0,explanation:text}, sections:lessonTemplate(), rows:{key:next.modules[0]?.key || '',station:text,scenario:text,action:text,evidence:text,result:text,critical:text}, modules:{key:'new',reviewed:false,title:text,subtitle:text,minutes:10,sections:[lessonTemplate()],quiz:[],practical:[],sources:[]} }
      const item = structuredClone((['sections', 'modules'].includes(String(key)) ? templates[String(key)] : items[0]) || templates[String(key)] || text)
      if (item.key && key !== 'rows') item.key = 'item-' + crypto.randomUUID()
      items.push(item)
    } else if (action === 'delete') items.splice(index, 1)
    else { const other = action === 'up' ? index - 1 : index + 1; [items[index], items[other]] = [items[other], items[index]] }
    if (key === 'options') {
      if (action === 'delete') parent.answer = parent.answer === index ? 0 : parent.answer > index ? parent.answer - 1 : parent.answer
      if (action === 'up' || action === 'down') { const other = action === 'up' ? index - 1 : index + 1; if (parent.answer === index) parent.answer = other; else if (parent.answer === other) parent.answer = index }
    }
    parent[key] = items; setDocument(next); setDirty(true)
  }
  function fields(value: any, path: Path): React.ReactNode {
    if (value && typeof value === 'object' && typeof value.zh === 'string' && typeof value.id === 'string') return <textarea aria-label={path.join('.') + '.' + language} className='w-full border rounded p-2 my-1' rows={3} maxLength={20000} value={value[language] || ''} onChange={e => change([...path, language], e.target.value)} />
    if (Array.isArray(value)) { const key = path[path.length - 1]; const minimum = key === 'options' ? 2 : key === 'sections' ? 1 : 0; const maximum = key === 'options' ? 20 : key === 'sections' ? 100 : 200; return <div className='pl-3 border-l'>{value.map((item, index) => <div key={index}><span>{index + 1}.</span>{fields(item, [...path, index])}<div className='flex gap-3'><button disabled={index === 0} onClick={() => arrayChange(value, path, 'up', index)}>↑</button><button disabled={index === value.length - 1} onClick={() => arrayChange(value, path, 'down', index)}>↓</button><button disabled={value.length <= minimum} onClick={() => { if (window.confirm('删除此项？ / Hapus butir ini?')) arrayChange(value, path, 'delete', index) }}>删除 / Hapus</button></div></div>)}<button disabled={value.length >= maximum} onClick={() => arrayChange(value, path, 'add')}>添加一项 / Tambah butir</button></div> }
    if (value && typeof value === 'object') {
      const isLesson = path.length === 4 && path[0] === 'modules' && path[2] === 'sections'
      const keys = Object.keys(value).filter(key => key !== 'reviewed' && key !== 'videoId' && (key !== 'key' || path[0] === 'assessment'))
      if (isLesson) for (const key of optionalLessonFields) if (!keys.includes(key)) keys.push(key)
      return <div>{isLesson && <fieldset className='my-3 border rounded p-3'><legend>{t('trainingMedia.title')}</legend><p>{t('trainingMedia.limits')}</p>{value.videoId && <><TrainingVideo id={value.videoId} token={token} /><button type='button' onClick={() => change([...path, 'videoId'], undefined)}>{t('trainingMedia.remove')}</button></>}<label className='block'>{t('trainingMedia.upload')}<input aria-label={path.join('.') + '.videoUpload'} type='file' accept='video/mp4,.mp4' disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) uploadVideo(path, file) }} /></label></fieldset>}{keys.map(key => <fieldset key={key} className='my-3'><legend className='font-semibold'>{labels[key] || key}</legend>{fields(value[key], [...path, key])}{isLesson && optionalLessonFields.includes(key) && <button aria-label={path.join('.') + '.' + key + (value[key] === undefined ? '.add' : '.remove')} onClick={() => { if (value[key] === undefined) change([...path, key], ['errors', 'checklist'].includes(key) ? [blankText()] : blankText()); else if (window.confirm('删除此字段的中印尼文内容？ / Hapus kedua bahasa pada kolom ini?')) change([...path, key], undefined) }}>{value[key] === undefined ? '添加字段 / Tambah kolom' : '删除字段（双语） / Hapus kolom (dua bahasa)'}</button>}</fieldset>)}</div>
    }
    if (path[path.length - 1] === 'key') return <select aria-label={path.join('.')} value={value} onChange={e => change(path, e.target.value)}>{document.modules.map((m: any) => <option key={m.key} value={m.key}>{m.title[language]}</option>)}</select>
    if (typeof value === 'number') return <input aria-label={path.join('.')} className='border p-2' type='number' value={value} onChange={e => change(path, Number(e.target.value))} />
    if (typeof value === 'string') return <input aria-label={path.join('.')} className='w-full border p-2' value={value} maxLength={20000} onChange={e => change(path, e.target.value)} />
    return null
  }
  const discard = () => !dirty || window.confirm('放弃未保存修改？ / Buang perubahan yang belum disimpan?')
  return <main className='max-w-5xl mx-auto p-6 space-y-4'>
    {blocker.state === 'blocked' && <div role='alertdialog' aria-modal='true' aria-label='未保存修改 / Perubahan belum disimpan' className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center'><div className='bg-white rounded p-6 space-y-4'><p>放弃未保存修改并离开？ / Buang perubahan dan tinggalkan halaman?</p><button onClick={() => blocker.reset()}>继续编辑 / Tetap mengedit</button><button onClick={() => blocker.proceed()}>放弃并离开 / Buang dan lanjutkan</button></div></div>}
    <h1 className='text-2xl font-bold'>培训资料编辑 / Editor materi pelatihan</h1>
    <p>中文和印尼文独立编辑；保存为本店草稿，审核发布后员工可读。恢复会新增版本。 / Bahasa disimpan terpisah. Draf hanya untuk admin; terbitkan setelah ditinjau.</p>
    <p>限制 / Batas: 2 MiB / 20,000 字符每文本；100 模块，100 课程/模块，200 题/模块，20 选项/题，200 项/清单。历史每页 20 条。</p>
    {message && <p role='alert' className='p-3 border'>{message}</p>}
    <div className='flex gap-3 flex-wrap'>
      <button disabled={busy} onClick={() => { if (discard()) onClose() }}>返回阅读 / Kembali</button>
      <button disabled={busy} onClick={() => { if (discard()) { setBusy(true); load().catch(e => setMessage(e.message)).finally(() => setBusy(false)) } }}>重新加载 / Muat ulang</button>
      <button disabled={busy || !document} onClick={() => write('save')}>保存草稿 / Simpan draf</button>
      <button disabled={busy || dirty || !generation} onClick={() => write('publish')}>审核并发布 / Tinjau dan terbitkan</button>
    </div>
    <p>{dirty ? '未保存 / Belum disimpan' : '无未保存修改 / Tidak ada perubahan'} · {generation || '初始草稿 / Draf awal'} · {document ? new TextEncoder().encode(JSON.stringify(document)).length : 0} bytes</p>
    <p>已发布版本 / Versi terbit: {published || '尚未发布 / Belum terbit'}</p><label>版本备注 / Catatan<input className='border p-2 w-full' maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
    {document && <fieldset disabled={busy}><div className='flex gap-3'><button disabled={document.modules.length >= 100} onClick={() => { arrayChange(document.modules, ['modules'], 'add'); setSelected(String(document.modules.length)) }}>添加模块 / Tambah modul</button>{/^\d+$/.test(selected) && document.modules[Number(selected)] && <><button disabled={Number(selected) === 0} onClick={() => { arrayChange(document.modules, ['modules'], 'up', Number(selected)); setSelected(String(Number(selected) - 1)) }}>模块 ↑</button><button disabled={Number(selected) === document.modules.length - 1} onClick={() => { arrayChange(document.modules, ['modules'], 'down', Number(selected)); setSelected(String(Number(selected) + 1)) }}>模块 ↓</button><button disabled={document.assessment?.rows.some((r: any) => r.key === document.modules[Number(selected)].key)} onClick={() => { if (window.confirm('删除模块？请先删除关联考核行。 / Hapus modul? Hapus baris penilaian terkait dahulu.')) { arrayChange(document.modules, ['modules'], 'delete', Number(selected)); setSelected('0') } }}>删除模块 / Hapus modul</button></>}</div><div className='flex gap-3'><select aria-label='编辑语言' value={language} onChange={e => setLanguage(e.target.value)}><option value='zh'>中文</option><option value='id'>Bahasa Indonesia</option></select><select aria-label='编辑模块' value={selected} onChange={e => setSelected(e.target.value)}>{document.modules.map((m: any, i: number) => <option key={m.key} value={i}>{m.title[language]}</option>)}{document.assessment && <option value='assessment'>考核表 / Penilaian</option>}<option value='standardsToConfirm'>待确认标准 / Standar</option></select></div>{selected === 'assessment' || selected === 'standardsToConfirm' ? fields(document[selected], [selected]) : fields(document.modules[Number(selected)], ['modules', Number(selected)])}</fieldset>}
    <h2 className='text-xl'>版本历史 / Riwayat versi</h2>{preview && <section className='border p-4'><button onClick={() => setPreview(null)}>关闭预览 / Tutup pratinjau</button><p>{preview.id} · {preview.createdAt}</p><pre className='whitespace-pre-wrap break-words max-h-96 overflow-auto'>{JSON.stringify(preview.catalogue, null, 2)}</pre></section>}{history.map(item => <div key={item.id} className='border p-3'><p>{item.createdAt} · {item.author} · {item.kind} · {item.id}</p><p>{item.note}</p><button disabled={busy} onClick={() => api('/history/' + item.id).then(setPreview).catch(e => setMessage(e.message))}>查看版本 / Lihat versi</button><button disabled={busy || dirty} onClick={() => write('restore', item.id)}>恢复此版本 / Pulihkan versi ini</button></div>)}{cursor && <button disabled={busy} onClick={() => historyPage(cursor).catch(e => setMessage(e.message))}>加载更多 / Muat lagi</button>}
  </main>
}
