import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import {
  BookOpen,
  ArrowLeft,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Download,
  Award,
  Lightbulb,
  AlertTriangle,
  ChevronRight,
  X,
  Play,
  RotateCcw,
  CheckSquare,
  Sparkles
} from 'lucide-react'
import { formatDate } from '../utils/helpers'
import {
  TRAINING_MODULES,
  CHECKLISTS,
  TrainingModule,
  tr
} from '../data/trainingContent'

interface Training {
  id: string
  trainingType: string
  title: string
  provider?: string
  startDate: string
  endDate?: string
  duration?: number
  cost?: number
  certificate?: string
  status: string
  score?: number
  passed: boolean
  notes?: string
  attachments?: string // JSON array: [{url, name, type, size}]
}

interface TrainingCategory {
  key: string
  label: string
  labelZh?: string
  labelId?: string
}

export function TrainingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Tab: 'courses' | 'checklists' | 'records'
  const [activeTab, setActiveTab] = useState<'courses' | 'checklists' | 'records'>('courses')

  // Records state
  const [trainings, setTrainings] = useState<Training[]>([])
  const [categories, setCategories] = useState<TrainingCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')

  // Course study state
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null)
  const [completedModules, setCompletedModules] = useState<Record<string, boolean>>({})

  // Quiz state in modal
  const [showQuiz, setShowQuiz] = useState(false)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizScore, setQuizScore] = useState<number | null>(null)

  // Checklist state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

  // Load completed modules and checklist state from localStorage
  useEffect(() => {
    try {
      const savedModules = localStorage.getItem('btps_completed_training_modules')
      if (savedModules) {
        setCompletedModules(JSON.parse(savedModules))
      }
      const today = new Date().toISOString().slice(0, 10)
      const savedChecks = localStorage.getItem(`btps_training_checklist_${today}`)
      if (savedChecks) {
        setCheckedItems(JSON.parse(savedChecks))
      }
    } catch (e) {
      console.warn('Failed to load local training state:', e)
    }
  }, [])

  const STATUS_ICONS: Record<string, JSX.Element> = {
    scheduled: <Clock className="text-blue-500" size={18} />,
    in_progress: <Clock className="text-amber-500" size={18} />,
    completed: <CheckCircle2 className="text-green-500" size={18} />,
    cancelled: <XCircle className="text-red-500" size={18} />
  }

  const STATUS_BADGES: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-600 border border-blue-200',
    in_progress: 'bg-amber-50 text-amber-600 border border-amber-200',
    completed: 'bg-green-50 text-green-600 border border-green-200',
    cancelled: 'bg-red-50 text-red-600 border border-red-200'
  }

  const STATUS_LABELS: Record<string, string> = {
    scheduled: t('training.scheduled'),
    in_progress: t('training.inProgress'),
    completed: t('training.completed'),
    cancelled: t('training.cancelled')
  }

  const loadData = async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const [trainingRes, categoryRes] = await Promise.all([
        staffApi.getMyTraining(),
        staffApi.getTrainingCategories()
      ])
      if (!Array.isArray(trainingRes.data?.data)) throw new Error('Invalid training response')
      setTrainings(trainingRes.data.data)
      if (categoryRes.data?.data) {
        setCategories(categoryRes.data.data)
      }
    } catch (error) {
      setLoadError(true)
      console.error('Failed to load training:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const getCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key)
    if (!cat) return key
    const lang = i18n.language
    if (lang === 'zh') return cat.labelZh || cat.label
    if (lang === 'id') return cat.labelId || cat.label
    return cat.label
  }

  const parseAttachments = (attachmentsStr?: string) => {
    if (!attachmentsStr) return []
    try {
      const parsed = JSON.parse(attachmentsStr)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const filteredTrainings = filterStatus
    ? trainings.filter(t => t.status === filterStatus)
    : trainings

  // Open course detail modal
  const handleOpenModule = (mod: TrainingModule) => {
    setSelectedModule(mod)
    setShowQuiz(false)
    setSelectedAnswers({})
    setQuizSubmitted(false)
    setQuizScore(null)
  }

  // Submit Quiz
  const handleSubmitQuiz = () => {
    if (!selectedModule) return
    let correctCount = 0
    selectedModule.quiz.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.answer) {
        correctCount++
      }
    })
    const total = selectedModule.quiz.length
    const score = Math.round((correctCount / total) * 100)
    setQuizScore(score)
    setQuizSubmitted(true)

    // Pass threshold is 70%
    if (score >= 70) {
      const updated = { ...completedModules, [selectedModule.key]: true }
      setCompletedModules(updated)
      try {
        localStorage.setItem('btps_completed_training_modules', JSON.stringify(updated))
      } catch {}
    }
  }

  // Toggle checklist item
  const handleToggleCheck = (key: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const updated = { ...checkedItems, [key]: !checkedItems[key] }
    setCheckedItems(updated)
    try {
      localStorage.setItem(`btps_training_checklist_${today}`, JSON.stringify(updated))
    } catch {}
  }

  const handleResetChecklist = () => {
    const today = new Date().toISOString().slice(0, 10)
    setCheckedItems({})
    try {
      localStorage.removeItem(`btps_training_checklist_${today}`)
    } catch {}
  }

  const completedCount = Object.keys(completedModules).length
  const totalCourses = TRAINING_MODULES.length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top Header - Consistent with staff app design */}
      <header className="bg-primary text-white px-4 pt-6 pb-5 rounded-b-3xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">{t('training.title')}</h1>
              <p className="text-xs text-white/80">
                {t('home.training')} · SOP Standard Academy
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats Overview Card */}
        <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
          <div>
            <p className="text-white/70 text-xs">{t('training.completedBadge', '已学完')}</p>
            <p className="text-lg font-bold mt-0.5">{completedCount} <span className="text-xs text-white/70 font-normal">/ {totalCourses}</span></p>
          </div>
          <div className="border-x border-white/20">
            <p className="text-white/70 text-xs">{t('training.coursesTab', '课程库')}</p>
            <p className="text-lg font-bold mt-0.5">{totalCourses}</p>
          </div>
          <div>
            <p className="text-white/70 text-xs">{t('training.recordsTab', '档案数')}</p>
            <p className="text-lg font-bold mt-0.5">{trainings.length}</p>
          </div>
        </div>
      </header>

      {/* Tabs Bar - Consistent with LeavePage / ProfilePage */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-xs">
        <div className="flex px-2">
          <button
            onClick={() => setActiveTab('courses')}
            className={`flex-1 py-3.5 text-center text-sm font-medium transition-colors relative ${
              activeTab === 'courses' ? 'text-primary font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <BookOpen size={16} />
              {t('training.coursesTab', '课程学习')}
            </span>
            {activeTab === 'courses' && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('checklists')}
            className={`flex-1 py-3.5 text-center text-sm font-medium transition-colors relative ${
              activeTab === 'checklists' ? 'text-primary font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <CheckSquare size={16} />
              {t('training.checklistsTab', '开闭店规范')}
            </span>
            {activeTab === 'checklists' && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('records')}
            className={`flex-1 py-3.5 text-center text-sm font-medium transition-colors relative ${
              activeTab === 'records' ? 'text-primary font-bold' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Award size={16} />
              {t('training.recordsTab', '培训档案')}
            </span>
            {activeTab === 'records' && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Course Modules */}
      {activeTab === 'courses' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>{t('training.coursesTab', '标准 SOP 培训体系')}</span>
            <span>{completedCount}/{totalCourses} {t('training.completed', '已完成')}</span>
          </div>

          {TRAINING_MODULES.map((mod) => {
            const isCompleted = !!completedModules[mod.key]
            return (
              <div
                key={mod.key}
                onClick={() => handleOpenModule(mod)}
                className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 hover:border-primary/30 transition-all cursor-pointer flex items-center gap-3.5"
              >
                {/* Icon box */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${mod.color} text-white shadow-xs shrink-0`}>
                  {mod.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-gray-900 text-sm truncate">
                      {tr(mod.title, i18n.language)}
                    </h3>
                    {isCompleted && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">
                        <CheckCircle2 size={11} />
                        {t('training.completedBadge', '已学完')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-1 mb-2">
                    {tr(mod.subtitle, i18n.language)}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {mod.minutes} {t('training.minutes', '分钟')}
                    </span>
                    <span>·</span>
                    <span>{mod.sections.length} {t('training.sectionsCount', '个章节')}</span>
                    <span>·</span>
                    <span>{mod.quiz.length} {t('training.quizCount', '道测验')}</span>
                  </div>
                </div>

                {/* Arrow */}
                <div className="text-gray-300 pl-1 shrink-0">
                  <ChevronRight size={18} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab 2: Checklists */}
      {activeTab === 'checklists' && (
        <div className="p-4 space-y-5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-500">
              {t('training.checklistProgress', '日常开闭店 SOP 规范标准')}
            </span>
            <button
              onClick={handleResetChecklist}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <RotateCcw size={12} />
              {t('training.resetChecklist', '重置清单')}
            </button>
          </div>

          {CHECKLISTS.map((list) => {
            const checkedCount = list.items.filter((_, idx) => checkedItems[`${list.key}_${idx}`]).length
            const isAllDone = checkedCount === list.items.length

            return (
              <div key={list.key} className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100">
                <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm">
                      {tr(list.title, i18n.language)}
                    </h3>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isAllDone ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {checkedCount} / {list.items.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {list.items.map((item, idx) => {
                    const itemKey = `${list.key}_${idx}`
                    const isChecked = !!checkedItems[itemKey]

                    return (
                      <div
                        key={idx}
                        onClick={() => handleToggleCheck(itemKey)}
                        className={`p-2.5 rounded-xl flex items-start gap-3 transition-colors cursor-pointer ${
                          isChecked ? 'bg-green-50/60 text-gray-500 line-through' : 'bg-gray-50 hover:bg-gray-100/70 text-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div
                          className="mt-0.5 rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        />
                        <span className="text-xs leading-relaxed flex-1 select-none">
                          {tr(item, i18n.language)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab 3: Official Training Records */}
      {activeTab === 'records' && (
        <div className="p-4 space-y-4">
          {/* Status Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterStatus('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                !filterStatus ? 'bg-primary text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t('common.all')}
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'completed' ? 'bg-primary text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t('training.completed')}
            </button>
            <button
              onClick={() => setFilterStatus('in_progress')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'in_progress' ? 'bg-primary text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t('training.inProgress')}
            </button>
            <button
              onClick={() => setFilterStatus('scheduled')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'scheduled' ? 'bg-primary text-white shadow-xs' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {t('training.scheduled')}
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : loadError ? (
            <div role="alert" className="bg-white rounded-2xl p-8 text-center text-red-600 border border-red-100">{t('common.error')}</div>
          ) : filteredTrainings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
              <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm font-medium">{t('training.noTraining')}</p>
              <p className="text-gray-400 text-xs mt-1">
                {t('training.coursesTab', '可在“课程学习”栏目中自主学习 SOP 技能')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrainings.map(training => {
                const attachments = parseAttachments(training.attachments)
                return (
                  <div key={training.id} className="bg-white rounded-2xl shadow-xs border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{training.title}</p>
                          <p className="text-xs text-gray-400">
                            {getCategoryLabel(training.trainingType)}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                        STATUS_BADGES[training.status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {STATUS_ICONS[training.status]}
                        {STATUS_LABELS[training.status] || training.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded-xl p-3 my-2.5">
                      <div>
                        <span className="text-gray-400">{t('training.startDate')}:</span>
                        <span className="ml-1 font-medium text-gray-800">{formatDate(training.startDate)}</span>
                      </div>
                      {training.duration && (
                        <div>
                          <span className="text-gray-400">{t('training.duration')}:</span>
                          <span className="ml-1 font-medium text-gray-800">{training.duration}h</span>
                        </div>
                      )}
                      {training.score !== null && training.score !== undefined && (
                        <div>
                          <span className="text-gray-400">{t('training.score')}:</span>
                          <span className={`ml-1 font-bold ${training.passed ? 'text-green-600' : 'text-red-500'}`}>
                            {training.score} {training.passed ? '✓' : '✗'}
                          </span>
                        </div>
                      )}
                      {training.provider && (
                        <div className="truncate">
                          <span className="text-gray-400">{t('training.provider')}:</span>
                          <span className="ml-1 font-medium text-gray-800">{training.provider}</span>
                        </div>
                      )}
                    </div>

                    {training.certificate && (
                      <div className="text-xs text-gray-600 flex items-center gap-1.5 mb-2">
                        <Award size={14} className="text-amber-500" />
                        <span className="text-gray-400">{t('training.certificate')}:</span>
                        <span className="font-medium text-gray-800">{training.certificate}</span>
                      </div>
                    )}

                    {attachments.length > 0 && (
                      <div className="pt-2 border-t border-gray-100 space-y-1.5">
                        <p className="text-[11px] text-gray-400">{t('training.attachments')}:</p>
                        {attachments.map((att: any, index: number) => (
                          <a
                            key={index}
                            href={att.url}
                            download={att.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-lg p-2 text-xs text-gray-700"
                          >
                            <FileText size={14} className="text-primary shrink-0" />
                            <span className="flex-1 truncate">{att.name}</span>
                            <Download size={13} className="text-gray-400" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Course Detail Modal */}
      {selectedModule && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 animate-fade-in">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
            {/* Modal Header */}
            <div className={`p-5 text-white bg-gradient-to-r ${selectedModule.color} relative shrink-0`}>
              <button
                onClick={() => setSelectedModule(null)}
                className="absolute top-4 right-4 p-1.5 bg-black/20 hover:bg-black/30 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{selectedModule.icon}</span>
                <div>
                  <h2 className="text-lg font-bold leading-tight">
                    {tr(selectedModule.title, i18n.language)}
                  </h2>
                  <p className="text-xs text-white/80 mt-0.5">
                    {tr(selectedModule.subtitle, i18n.language)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/90 pt-1">
                <span>⏱️ {selectedModule.minutes} {t('training.minutes', '分钟')}</span>
                <span>·</span>
                <span>📖 {selectedModule.sections.length} {t('training.sectionsCount', '个章节')}</span>
                <span>·</span>
                <span>✍️ {selectedModule.quiz.length} {t('training.quizCount', '道测验')}</span>
              </div>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              {!showQuiz ? (
                <>
                  {/* Sections List */}
                  {selectedModule.sections.map((sec, secIdx) => (
                    <div key={secIdx} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {secIdx + 1}
                        </span>
                        <h4 className="font-bold text-gray-900 text-sm">
                          {tr(sec.title, i18n.language)}
                        </h4>
                      </div>

                      {/* Points */}
                      <ul className="space-y-2 text-xs text-gray-700">
                        {sec.points.map((pt, ptIdx) => (
                          <li key={ptIdx} className="flex items-start gap-2 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                            <span>{tr(pt, i18n.language)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Key Tip */}
                      {sec.tip && (
                        <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                          <Lightbulb size={16} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold mr-1">{t('training.keyTip', '重点技巧')}:</span>
                            <span>{tr(sec.tip, i18n.language)}</span>
                          </div>
                        </div>
                      )}

                      {/* Warning */}
                      {sec.warning && (
                        <div className="bg-red-50 border border-red-200/60 rounded-xl p-3 flex items-start gap-2 text-xs text-red-800">
                          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold mr-1">{t('training.warningRule', '红线禁令')}:</span>
                            <span>{tr(sec.warning, i18n.language)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                /* Quiz View */
                <div className="space-y-4">
                  <div className="bg-primary/10 rounded-2xl p-3.5 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-primary text-sm flex items-center gap-1.5">
                        <Sparkles size={16} />
                        {t('training.takeQuiz', '随堂测验考核')}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        答对 70% 以上即可通过并记录学习档案
                      </p>
                    </div>
                    {quizSubmitted && quizScore !== null && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        quizScore >= 70 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {quizScore} 分
                      </span>
                    )}
                  </div>

                  {selectedModule.quiz.map((qItem, qIdx) => {
                    const chosen = selectedAnswers[qIdx]
                    return (
                      <div key={qIdx} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                        <p className="font-bold text-gray-900 text-xs flex items-start gap-1.5">
                          <span className="text-primary">{qIdx + 1}.</span>
                          <span>{tr(qItem.q, i18n.language)}</span>
                        </p>

                        <div className="space-y-2">
                          {qItem.options.map((opt, optIdx) => {
                            const isSelected = chosen === optIdx
                            let optionClass = 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100/50'

                            if (quizSubmitted) {
                              if (optIdx === qItem.answer) {
                                optionClass = 'border-green-400 bg-green-50 text-green-800 font-bold'
                              } else if (isSelected && optIdx !== qItem.answer) {
                                optionClass = 'border-red-400 bg-red-50 text-red-700 line-through'
                              }
                            } else if (isSelected) {
                              optionClass = 'border-primary bg-primary/10 text-primary font-medium'
                            }

                            return (
                              <button
                                key={optIdx}
                                disabled={quizSubmitted}
                                onClick={() => setSelectedAnswers(prev => ({ ...prev, [qIdx]: optIdx }))}
                                className={`w-full p-2.5 text-left rounded-xl border text-xs flex items-center gap-2 transition-all ${optionClass}`}
                              >
                                <span className={`w-4 h-4 rounded-full border text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-primary bg-primary text-white' : 'border-gray-300'
                                }`}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="flex-1">{tr(opt, i18n.language)}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {quizSubmitted && quizScore !== null && (
                    <div className={`p-4 rounded-2xl text-center border ${
                      quizScore >= 70 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <p className="font-bold text-sm">
                        {quizScore >= 70
                          ? t('training.examPassed', '恭喜考核通过！')
                          : t('training.examFailed', '未达到合格线，请温习后再测！')}
                      </p>
                      <p className="text-xs mt-1 text-gray-600">
                        {t('training.scoreLabel', '得分')}: {quizScore}分
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center gap-3 shrink-0">
              {!showQuiz ? (
                <>
                  <button
                    onClick={() => setSelectedModule(null)}
                    className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors"
                  >
                    {t('training.close', '关闭')}
                  </button>
                  <button
                    onClick={() => setShowQuiz(true)}
                    className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-hover flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Play size={14} />
                    {t('training.takeQuiz', '开始随堂测验')}
                  </button>
                </>
              ) : (
                <>
                  {!quizSubmitted ? (
                    <>
                      <button
                        onClick={() => setShowQuiz(false)}
                        className="py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors"
                      >
                        {t('training.viewSop', '查看 SOP')}
                      </button>
                      <button
                        onClick={handleSubmitQuiz}
                        disabled={Object.keys(selectedAnswers).length < selectedModule.quiz.length}
                        className="flex-1 py-3 bg-primary disabled:opacity-50 text-white rounded-xl text-xs font-bold hover:bg-primary-hover transition-colors shadow-xs"
                      >
                        {t('common.submit', '提交答案')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedAnswers({})
                          setQuizSubmitted(false)
                          setQuizScore(null)
                        }}
                        className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 flex items-center justify-center gap-1 transition-colors"
                      >
                        <RotateCcw size={14} />
                        {t('training.retake', '重新测验')}
                      </button>
                      <button
                        onClick={() => setSelectedModule(null)}
                        className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-hover transition-colors shadow-xs"
                      >
                        {t('training.close', '完成并关闭')}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
