import { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Trash2,
  Save,
  Loader2,
  BookOpen,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  MoveUp,
  MoveDown,
  CheckCircle,
  Sparkles
} from 'lucide-react'
import { TrainingModule, TrainingSection, QuizQuestion, Lang } from '../../data/trainingContent'

interface CourseEditModalProps {
  course: TrainingModule | null // null means create new
  isOpen: boolean
  onClose: () => void
  onSave: (course: TrainingModule) => Promise<void>
}

const COLOR_PRESETS = [
  { label: 'Blue / Cyan (吧台)', value: 'from-blue-600 to-cyan-500' },
  { label: 'Amber / Orange (备料)', value: 'from-amber-500 to-orange-500' },
  { label: 'Emerald / Green (果茶)', value: 'from-emerald-500 to-green-600' },
  { label: 'Amber / Yellow (奶茶)', value: 'from-amber-600 to-yellow-600' },
  { label: 'Purple / Pink (圣代)', value: 'from-purple-500 to-pink-500' },
  { label: 'Slate / Indigo (设备)', value: 'from-slate-700 to-indigo-900' },
  { label: 'Sky / Indigo (入职)', value: 'from-sky-500 to-indigo-500' },
  { label: 'Pink / Rose (服务)', value: 'from-pink-500 to-rose-500' },
  { label: 'Red / Orange (安全)', value: 'from-red-500 to-orange-600' }
]

const EMOJI_PRESETS = ['🥤', '🍵', '🍋', '🧋', '🍦', '⚙️', '👋', '😊', '🧼', '📦', '🦺', '📖', '✨']

export function CourseEditModal({ course, isOpen, onClose, onSave }: CourseEditModalProps) {
  const isEditing = !!course

  // Current active editing language tab
  const [activeLang, setActiveLang] = useState<Lang>('zh')
  const [activeSubTab, setActiveSubTab] = useState<'basic' | 'sections' | 'quiz'>('basic')
  const [saving, setSaving] = useState(false)

  // Form State
  const [form, setForm] = useState<TrainingModule>({
    key: '',
    icon: '🥤',
    color: 'from-blue-600 to-cyan-500',
    title: { zh: '', en: '', id: '' },
    subtitle: { zh: '', en: '', id: '' },
    minutes: 15,
    sections: [],
    quiz: []
  })

  useEffect(() => {
    if (course) {
      setForm(JSON.parse(JSON.stringify(course)))
    } else {
      setForm({
        key: 'course_' + Date.now().toString(36),
        icon: '🥤',
        color: 'from-blue-600 to-cyan-500',
        title: { zh: '新培训课程', en: 'New Training Course', id: 'Kursus Pelatihan Baru' },
        subtitle: { zh: '标准操作指南与配方流程', en: 'Standard Operating Procedures', id: 'Panduan Operasional Standar' },
        minutes: 15,
        sections: [
          {
            title: { zh: '第一章节：标准流程', en: 'Chapter 1: Standard Workflow', id: 'Bab 1: Alur Standar' },
            points: [
              { zh: '按配方称重，确保克数精确。', en: 'Weigh ingredients accurately.', id: 'Timbang bahan secara akurat sesuai resep.' }
            ],
            tip: { zh: '出杯前自检外观与杯身干净。', en: 'Self-check appearance before handoff.', id: 'Cek mandiri kebersihan gelas sebelum diserahkan.' }
          }
        ],
        quiz: [
          {
            q: { zh: '制作饮品时称重误差应控制在多少？', en: 'What is the acceptable weighing error?', id: 'Berapakah batas toleransi timbangan?' },
            options: [
              { zh: '±0.5g', en: '±0.5g', id: '±0.5gr' },
              { zh: '±50g', en: '±50g', id: '±50gr' }
            ],
            answer: 0
          }
        ]
      })
    }
  }, [course, isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!form.key.trim()) {
      alert('请输入课程唯一标识 (Key)')
      return
    }
    if (!form.title.zh.trim() && !form.title.id.trim()) {
      alert('请输入课程标题 (中文或印尼文)')
      return
    }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err: any) {
      console.error('Save course error:', err)
      alert('保存失败: ' + (err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  // Section helpers
  const addSection = () => {
    const newSec: TrainingSection = {
      title: { zh: `新章节 ${form.sections.length + 1}`, en: `Chapter ${form.sections.length + 1}`, id: `Bab ${form.sections.length + 1}` },
      points: [
        { zh: '要点 1：标准操作说明', en: 'Point 1: Standard instructions', id: 'Poin 1: Petunjuk standar' }
      ]
    }
    setForm(prev => ({ ...prev, sections: [...prev.sections, newSec] }))
  }

  const removeSection = (index: number) => {
    setForm(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= form.sections.length) return
    const updated = [...form.sections]
    const temp = updated[index]
    updated[index] = updated[targetIdx]
    updated[targetIdx] = temp
    setForm(prev => ({ ...prev, sections: updated }))
  }

  const addPointToSection = (secIndex: number) => {
    setForm(prev => {
      const updated = [...prev.sections]
      updated[secIndex].points.push({
        zh: '',
        en: '',
        id: ''
      })
      return { ...prev, sections: updated }
    })
  }

  const removePointFromSection = (secIndex: number, ptIndex: number) => {
    setForm(prev => {
      const updated = [...prev.sections]
      updated[secIndex].points = updated[secIndex].points.filter((_, i) => i !== ptIndex)
      return { ...prev, sections: updated }
    })
  }

  // Quiz helpers
  const addQuizQuestion = () => {
    const newQ: QuizQuestion = {
      q: { zh: '新测验题目内容？', en: 'New quiz question?', id: 'Pertanyaan kuis baru?' },
      options: [
        { zh: '正确选项 A', en: 'Option A (Correct)', id: 'Pilihan A (Benar)' },
        { zh: '错误选项 B', en: 'Option B', id: 'Pilihan B' }
      ],
      answer: 0
    }
    setForm(prev => ({ ...prev, quiz: [...prev.quiz, newQ] }))
  }

  const removeQuizQuestion = (qIndex: number) => {
    setForm(prev => ({ ...prev, quiz: prev.quiz.filter((_, i) => i !== qIndex) }))
  }

  const addOptionToQuestion = (qIndex: number) => {
    setForm(prev => {
      const updated = [...prev.quiz]
      updated[qIndex].options.push({ zh: '', en: '', id: '' })
      return { ...prev, quiz: updated }
    })
  }

  const removeOptionFromQuestion = (qIndex: number, optIndex: number) => {
    setForm(prev => {
      const updated = [...prev.quiz]
      if (updated[qIndex].options.length <= 2) {
        alert('测验题目至少需要 2 个选项')
        return prev
      }
      updated[qIndex].options = updated[qIndex].options.filter((_, i) => i !== optIndex)
      if (updated[qIndex].answer >= updated[qIndex].options.length) {
        updated[qIndex].answer = 0
      }
      return { ...prev, quiz: updated }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 md:p-6 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-scale-up">
        {/* Header Preview Banner */}
        <div className={`p-5 text-white bg-gradient-to-r ${form.color} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl p-1 bg-white/20 rounded-2xl shadow-inner">{form.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-[11px] font-mono uppercase tracking-wider">
                  {form.key || 'NEW_COURSE'}
                </span>
                <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">
                  ⏱️ {form.minutes} 分钟
                </span>
              </div>
              <h3 className="text-lg font-bold mt-0.5 line-clamp-1">
                {form.title[activeLang] || form.title.zh || form.title.id || '课程标题'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-black/20 hover:bg-black/30 rounded-full transition-colors text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Control Bar: Language Switcher & Tab Navigation */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-3">
          {/* SubTab switcher */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-xs border border-gray-200/60">
            <button
              onClick={() => setActiveSubTab('basic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'basic' ? 'bg-primary text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sparkles size={14} />
              基本信息
            </button>
            <button
              onClick={() => setActiveSubTab('sections')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'sections' ? 'bg-primary text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <BookOpen size={14} />
              SOP章节 ({form.sections.length})
            </button>
            <button
              onClick={() => setActiveSubTab('quiz')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'quiz' ? 'bg-primary text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HelpCircle size={14} />
              考核测验 ({form.quiz.length})
            </button>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">正在编辑语言:</span>
            <div className="flex items-center bg-white p-1 rounded-xl shadow-xs border border-gray-200/60">
              <button
                type="button"
                onClick={() => setActiveLang('zh')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeLang === 'zh' ? 'bg-emerald-600 text-white font-bold' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🇨🇳 中文
              </button>
              <button
                type="button"
                onClick={() => setActiveLang('id')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeLang === 'id' ? 'bg-rose-600 text-white font-bold' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🇮🇩 Indonesia
              </button>
              <button
                type="button"
                onClick={() => setActiveLang('en')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeLang === 'en' ? 'bg-blue-600 text-white font-bold' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🇬🇧 English
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: BASIC INFO */}
          {activeSubTab === 'basic' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    课程标识 (Key - 唯一代码)
                  </label>
                  <input
                    type="text"
                    disabled={isEditing}
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    className="input w-full font-mono text-sm disabled:bg-gray-100"
                    placeholder="例如: bar_station"
                  />
                  <span className="text-[10px] text-gray-400">仅限小写英文与下划线</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    学习时长 (分钟)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={form.minutes}
                    onChange={(e) => setForm({ ...form, minutes: parseInt(e.target.value) || 15 })}
                    className="input w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    图标 Emoji
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      value={form.icon}
                      onChange={(e) => setForm({ ...form, icon: e.target.value })}
                      className="input w-16 text-center text-xl"
                    />
                    <div className="flex items-center gap-1 overflow-x-auto py-1">
                      {EMOJI_PRESETS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setForm({ ...form, icon: em })}
                          className="hover:scale-125 transition-transform text-lg"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Color Preset */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  课程卡片渐变配色
                </label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {COLOR_PRESETS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setForm({ ...form, color: col.value })}
                      className={`h-9 rounded-xl bg-gradient-to-r ${col.value} text-white text-[11px] font-semibold flex items-center justify-center border-2 transition-all ${
                        form.color === col.value ? 'border-primary ring-2 ring-primary/30 scale-102' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    >
                      {form.color === col.value && <CheckCircle size={14} className="mr-1" />}
                      {col.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bilingual Titles */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-800">
                    课程标题与副标题 ({activeLang === 'zh' ? '中文' : activeLang === 'id' ? 'Bahasa Indonesia' : 'English'})
                  </h4>
                  <span className="text-xs text-gray-500">
                    可在右上角切换不同语言逐项录入
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    课程全称标题 (Title)
                  </label>
                  <input
                    type="text"
                    value={form.title[activeLang] || ''}
                    onChange={(e) => setForm({
                      ...form,
                      title: { ...form.title, [activeLang]: e.target.value }
                    })}
                    className="input w-full font-medium"
                    placeholder={`输入 ${activeLang} 课程标题...`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    副标题与核心内容提要 (Subtitle)
                  </label>
                  <textarea
                    rows={2}
                    value={form.subtitle[activeLang] || ''}
                    onChange={(e) => setForm({
                      ...form,
                      subtitle: { ...form.subtitle, [activeLang]: e.target.value }
                    })}
                    className="input w-full text-sm"
                    placeholder={`输入 ${activeLang} 副标题与核心知识点提要...`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SECTIONS & WORKFLOW */}
          {activeSubTab === 'sections' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-800">
                    SOP 章节与操作标准流程列表
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    当前正在编辑语言: <span className="font-semibold text-primary uppercase">{activeLang}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addSection}
                  className="px-3.5 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} />
                  添加章节
                </button>
              </div>

              {form.sections.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                  暂无章节，请点击上方“添加章节”开始录入。
                </div>
              ) : (
                <div className="space-y-5">
                  {form.sections.map((section, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-5 bg-gray-50/90 rounded-2xl border border-gray-200/90 space-y-4 relative group"
                    >
                      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                            {sIdx + 1}
                          </span>
                          <span className="text-xs font-bold text-gray-700">章节 #{sIdx + 1}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={sIdx === 0}
                            onClick={() => moveSection(sIdx, 'up')}
                            className="p-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30 rounded-lg hover:bg-gray-200"
                            title="上移"
                          >
                            <MoveUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={sIdx === form.sections.length - 1}
                            onClick={() => moveSection(sIdx, 'down')}
                            className="p-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30 rounded-lg hover:bg-gray-200"
                            title="下移"
                          >
                            <MoveDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSection(sIdx)}
                            className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 ml-1"
                            title="删除章节"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Section Title */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          章节标题 ({activeLang})
                        </label>
                        <input
                          type="text"
                          value={section.title[activeLang] || ''}
                          onChange={(e) => {
                            const updated = [...form.sections]
                            updated[sIdx].title[activeLang] = e.target.value
                            setForm({ ...form, sections: updated })
                          }}
                          className="input w-full text-sm font-semibold"
                          placeholder="例如: 保温桶与核心量具定位标准"
                        />
                      </div>

                      {/* Points list */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-600">
                            操作步骤与参数说明清单 ({section.points.length} 条)
                          </label>
                          <button
                            type="button"
                            onClick={() => addPointToSection(sIdx)}
                            className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5"
                          >
                            <Plus size={12} />
                            添加步骤
                          </button>
                        </div>

                        {section.points.map((pt, pIdx) => (
                          <div key={pIdx} className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 mt-2 font-mono">
                              •
                            </span>
                            <textarea
                              rows={2}
                              value={pt[activeLang] || ''}
                              onChange={(e) => {
                                const updated = [...form.sections]
                                updated[sIdx].points[pIdx][activeLang] = e.target.value
                                setForm({ ...form, sections: updated })
                              }}
                              className="input flex-1 text-xs"
                              placeholder={`输入步骤 ${pIdx + 1} (${activeLang})...`}
                            />
                            <button
                              type="button"
                              onClick={() => removePointFromSection(sIdx, pIdx)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg mt-1"
                              title="删除步骤"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Optional Tip */}
                      <div className="pt-2 border-t border-gray-200/60 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/60">
                          <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold mb-1">
                            <Lightbulb size={14} className="text-amber-600" />
                            重点提示 Tip ({activeLang})
                          </div>
                          <input
                            type="text"
                            value={section.tip ? section.tip[activeLang] || '' : ''}
                            onChange={(e) => {
                              const updated = [...form.sections]
                              if (!updated[sIdx].tip) {
                                updated[sIdx].tip = { zh: '', en: '', id: '' }
                              }
                              updated[sIdx].tip![activeLang] = e.target.value
                              setForm({ ...form, sections: updated })
                            }}
                            className="input w-full text-xs bg-white"
                            placeholder="可选：重点技巧、提效关键..."
                          />
                        </div>

                        {/* Optional Warning */}
                        <div className="p-3 bg-red-50/70 rounded-xl border border-red-200/60">
                          <div className="flex items-center gap-1.5 text-red-800 text-xs font-bold mb-1">
                            <AlertTriangle size={14} className="text-red-600" />
                            红线禁令 Warning ({activeLang})
                          </div>
                          <input
                            type="text"
                            value={section.warning ? section.warning[activeLang] || '' : ''}
                            onChange={(e) => {
                              const updated = [...form.sections]
                              if (!updated[sIdx].warning) {
                                updated[sIdx].warning = { zh: '', en: '', id: '' }
                              }
                              updated[sIdx].warning![activeLang] = e.target.value
                              setForm({ ...form, sections: updated })
                            }}
                            className="input w-full text-xs bg-white"
                            placeholder="可选：严禁事项、食品安全红线..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: QUIZ QUESTIONS */}
          {activeSubTab === 'quiz' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-800">
                    随堂考核与测验题目
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    员工学完本课程后需答题考核，答对得分自动记录入员工档案
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addQuizQuestion}
                  className="px-3.5 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} />
                  添加试题
                </button>
              </div>

              {form.quiz.length === 0 ? (
                <div className="p-8 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                  暂无测验题目，可点击“添加试题”增加随堂考核单选题。
                </div>
              ) : (
                <div className="space-y-5">
                  {form.quiz.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-5 bg-gray-50 rounded-2xl border border-gray-200 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10">
                          题目 #{qIdx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeQuizQuestion(qIdx)}
                          className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50"
                          title="删除题目"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Question prompt */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          题目内容 ({activeLang})
                        </label>
                        <input
                          type="text"
                          value={q.q[activeLang] || ''}
                          onChange={(e) => {
                            const updated = [...form.quiz]
                            updated[qIdx].q[activeLang] = e.target.value
                            setForm({ ...form, quiz: updated })
                          }}
                          className="input w-full text-sm font-semibold"
                          placeholder="例如：常温保温桶中茶汤的保质期是几小时？"
                        />
                      </div>

                      {/* Options */}
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-gray-600">
                          选项列表 (点击左侧单选框指定正确答案):
                        </label>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`quiz_answer_${qIdx}`}
                              checked={q.answer === optIdx}
                              onChange={() => {
                                const updated = [...form.quiz]
                                updated[qIdx].answer = optIdx
                                setForm({ ...form, quiz: updated })
                              }}
                              className="w-4 h-4 text-primary cursor-pointer"
                              title="设为正确答案"
                            />
                            <span className="text-xs font-bold text-gray-500 w-4">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <input
                              type="text"
                              value={opt[activeLang] || ''}
                              onChange={(e) => {
                                const updated = [...form.quiz]
                                updated[qIdx].options[optIdx][activeLang] = e.target.value
                                setForm({ ...form, quiz: updated })
                              }}
                              className={`input flex-1 text-xs ${q.answer === optIdx ? 'border-green-500 bg-green-50/30' : ''}`}
                              placeholder={`选项 ${String.fromCharCode(65 + optIdx)} (${activeLang})`}
                            />
                            <button
                              type="button"
                              onClick={() => removeOptionFromQuestion(qIdx, optIdx)}
                              className="p-1.5 text-gray-400 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addOptionToQuestion(qIdx)}
                          className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 mt-1"
                        >
                          <Plus size={12} />
                          添加选项
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span>已配置 {form.sections.length} 个章节</span>
            <span>•</span>
            <span>{form.quiz.length} 道测验题</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '正在保存...' : '保存课程'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
