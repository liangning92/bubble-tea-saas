import { TrainingVideo } from './TrainingVideo'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

type Text = { zh: string; id: string; en?: string }
type Module = { key: string; reviewed: boolean; title: Text; subtitle: Text; minutes: number; sections: { videoId?: string; title: Text; points: Text[]; tip?: Text; warning?: Text; errors?: Text[]; practice?: Text; checklist?: Text[] }[]; quiz: { q: Text; options: Text[]; answer: number; explanation: Text }[]; practical: Text[]; sources: { title: string; url: string }[] }
type Assessment = { reviewed: boolean; title: Text; instructions: Text[]; rows: {key: string; station: Text; scenario: Text; action: Text; evidence: Text; result: Text; critical: Text}[] }
const words = {
  zh: { boundary: '本库通用培训正文已通过内容审查；这不代表店主已批准配方、用量、温度、保存期限或清洁剂参数。执行前必须取得本店现行批准卡；待确认内容不得当作配方或操作参数执行。', title: '培训资料库', back: '培训记录', draft: '待审核资料 · 仅本地预览，不作为正式操作标准', reading: '阅读资料与练习；不会记录学习完成、成绩或资格认证。', empty: '暂无已审核培训资料。', error: '培训资料加载失败，请重试。', retry: '重试', minutes: '分钟', modules: '返回模块列表', practice: '实操检查', quiz: '练习题（不计分）', answer: '参考答案与解释', sources: '参考来源', steps: '操作步骤', errors: '常见错误', exercise: '带教练习', checks: '检查表', assessment: '综合实操表', standards: '执行前需取得的批准资料', columns: ['岗位','情景','观察动作','所需证据','结论记录','关键停止项'] },
  id: { boundary: 'Materi pelatihan umum telah ditinjau; ini bukan persetujuan pemilik atas resep, takaran, suhu, masa simpan, atau parameter bahan pembersih. Gunakan kartu kerja toko yang telah disetujui sebelum bekerja. Hal yang belum dikonfirmasi tidak boleh dipakai sebagai resep atau parameter operasi.', title: 'Pustaka Pelatihan', back: 'Catatan Pelatihan', draft: 'Draf belum ditinjau · pratinjau lokal, bukan standar operasional resmi', reading: 'Materi baca dan latihan; tidak mencatat penyelesaian, nilai, atau sertifikasi.', empty: 'Belum ada materi pelatihan yang ditinjau.', error: 'Gagal memuat materi. Silakan coba lagi.', retry: 'Coba lagi', minutes: 'menit', modules: 'Kembali ke daftar modul', practice: 'Pemeriksaan praktik', quiz: 'Latihan (tanpa nilai)', answer: 'Jawaban dan penjelasan', sources: 'Referensi', steps: 'Langkah kerja', errors: 'Kesalahan umum', exercise: 'Latihan didampingi', checks: 'Daftar pemeriksaan', assessment: 'Lembar praktik terpadu', standards: 'Dokumen persetujuan yang diperlukan sebelum pelaksanaan', columns: ['Posisi','Skenario','Tindakan yang diamati','Bukti','Catatan hasil','Kondisi wajib berhenti'] },
  en: { boundary: 'The general training text has passed content review. This does not approve store recipes, quantities, temperatures, shelf lives or cleaning parameters. Obtain the current approved store cards before execution; pending items must not be used as recipes or operating parameters.', title: 'Training Library', back: 'Training Records', draft: 'Unreviewed draft · local preview only, not an approved operating standard', reading: 'Reading and practice material; no completion, scores, or certification are recorded.', empty: 'No reviewed training material is available.', error: 'Training material could not be loaded. Please retry.', retry: 'Retry', minutes: 'minutes', modules: 'Back to modules', practice: 'Practical checks', quiz: 'Practice questions (ungraded)', answer: 'Answer and explanation', sources: 'Sources', steps: 'Steps', errors: 'Common errors', exercise: 'Supervised practice', checks: 'Checklist', assessment: 'Practical assessment', standards: 'Approved documents needed before execution', columns: ['Station','Scenario','Observed action','Evidence','Result record','Critical stop'] }
}
export function TrainingLibrary({ token, recordsPath, embedded = false }: { token: string | null; recordsPath: string; embedded?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.split('-')[0] as keyof typeof words
  const w = words[lang] || words.id
  const text = (value?: Text) => value?.[lang] || value?.id || value?.zh || ''
  const [modules, setModules] = useState<Module[]>([])
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [standards, setStandards] = useState<Text[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false); setModules([]); setAssessment(null); setStandards([]); setSelected(null)
    fetch('/api/training/library', { headers: { Authorization: `Bearer ${token || ''}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error('Library unavailable'); return response.json() })
      .then(body => { if (!Array.isArray(body.data?.modules)) throw Error('Invalid library'); setModules(body.data.modules); setAssessment(body.data.assessment || null); setStandards(body.data.standardsToConfirm || []) })
      .catch(e => { if (e.name !== 'AbortError') setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, retry])
  const module = modules.find(m => m.key === selected)
  return <main className="p-4 space-y-4 max-w-4xl mx-auto">
    {!embedded && <Link to={recordsPath} className="text-blue-700 underline">{w.back}</Link>}
    <h1 className="text-2xl font-bold">{embedded ? t('trainingMedia.courses') : w.title}</h1>
    <p>{w.reading}</p>
    <p role="note" className="border border-amber-400 bg-amber-50 p-3">{w.boundary}</p>
    <div className="flex gap-3"><button className="underline" onClick={() => i18n.changeLanguage('id')}>Bahasa Indonesia</button><button className="underline" onClick={() => i18n.changeLanguage('zh')}>中文对照</button></div>
    {loading ? <p role="status">…</p> : error ? <div role="alert">{w.error} <button onClick={() => setRetry(retry + 1)}>{w.retry}</button></div> : !modules.length ? <p>{w.empty}</p> : selected === 'assessment' && assessment ? <article className="space-y-4">
      <button className="underline" onClick={() => setSelected(null)}>{w.modules}</button>
      {!assessment.reviewed && <p role="alert" className="p-3 bg-amber-100">{w.draft}</p>}
      <h2 className="text-xl font-bold">{text(assessment.title)}</h2>
      {assessment.instructions.map((line,i) => <p key={i}>{text(line)}</p>)}
      <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{w.columns.map(c=><th key={c} className="border p-2">{c}</th>)}</tr></thead><tbody>{assessment.rows.map(row=><tr key={row.key}>{[row.station,row.scenario,row.action,row.evidence,row.result,row.critical].map((cell,i)=><td key={i} className="border p-2 align-top min-w-40">{text(cell)}</td>)}</tr>)}</tbody></table></div>
      <h3 className="font-bold">{w.standards}</h3><ul className="list-disc pl-5">{standards.map((line,i)=><li key={i}>{text(line)}</li>)}</ul>
    </article> : module ? <article className="space-y-5">
      <button className="underline text-blue-700" onClick={() => setSelected(null)}>{w.modules}</button>
      {!module.reviewed && <p role="alert" className="p-3 bg-amber-100">{w.draft}</p>}
      <h2 className="text-xl font-bold">{text(module.title)}</h2><p>{text(module.subtitle)} · {module.minutes} {w.minutes}</p>
      {module.sections.map((section, index) => <section key={index} className="p-4 bg-white border rounded space-y-2"><h3 className="font-bold">{text(section.title)}</h3>{section.videoId && <TrainingVideo id={section.videoId} token={token} />}<h4>{w.steps}</h4><ol className="list-decimal pl-5">{section.points.map((point, i) => <li key={i} className="whitespace-pre-wrap">{text(point)}</li>)}</ol>{section.errors && <><h4>{w.errors}</h4><ul className="list-disc pl-5">{section.errors.map((line,i)=><li key={i}>{text(line)}</li>)}</ul></>}{section.practice && <><h4>{w.exercise}</h4><p>{text(section.practice)}</p></>}{section.checklist && <><h4>{w.checks}</h4><ul className="list-disc pl-5">{section.checklist.map((line,i)=><li key={i}>{text(line)}</li>)}</ul></>}{section.tip && <p>{text(section.tip)}</p>}{section.warning && <p className="font-semibold">{text(section.warning)}</p>}</section>)}
      {!!module.practical.length && <section><h3 className="font-bold">{w.practice}</h3><ul className="list-disc pl-5">{module.practical.map((point, i) => <li key={i}>{text(point)}</li>)}</ul></section>}
      {!!module.quiz.length && <section><h3 className="font-bold">{w.quiz}</h3>{module.quiz.map((question, i) => <div key={i} className="my-4"><p>{i + 1}. {text(question.q)}</p><ol className="list-[upper-alpha] pl-6">{question.options.map((option, j) => <li key={j}>{text(option)}</li>)}</ol><details><summary>{w.answer}</summary><p>{text(question.options[question.answer])} — {text(question.explanation)}</p></details></div>)}</section>}
      <section><h3 className="font-bold">{w.sources}</h3><ul>{module.sources.filter(source => source.url.startsWith('https://')).map(source => <li key={source.url}><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></section>
    </article> : <div className="grid gap-3 md:grid-cols-2">{modules.map(module => <button key={module.key} onClick={() => setSelected(module.key)} data-testid="training-module" className="text-left p-4 border rounded bg-white"><strong>{text(module.title)}</strong><p>{text(module.subtitle)}</p><p>{module.minutes} {w.minutes}</p>{!module.reviewed && <small>{w.draft}</small>}</button>)}{assessment && <button className="text-left p-4 border rounded bg-white" onClick={() => setSelected('assessment')}>{w.assessment}</button>}</div>}
  </main>
}
