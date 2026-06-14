import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { BookOpen, RefreshCw, Loader2, CheckCircle, Clock, XCircle, FileText, Download } from 'lucide-react'

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
  const { user } = useAuthStore()
  const [trainings, setTrainings] = useState<Training[]>([])
  const [categories, setCategories] = useState<TrainingCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')

  const STATUS_ICONS: Record<string, JSX.Element> = {
    scheduled: <Clock className="text-blue-500" size={20} />,
    in_progress: <Clock className="text-yellow-500" size={20} />,
    completed: <CheckCircle className="text-green-500" size={20} />,
    cancelled: <XCircle className="text-red-500" size={20} />
  }

  const STATUS_LABELS: Record<string, string> = {
    scheduled: t('training.scheduled'),
    in_progress: t('training.inProgress'),
    completed: t('training.completed'),
    cancelled: t('training.cancelled') || 'Cancelled'
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [trainingRes, categoryRes] = await Promise.all([
        staffApi.getMyTraining(),
        staffApi.getTrainingCategories()
      ])
      setTrainings(trainingRes.data?.data || [])
      if (categoryRes.data?.data) {
        setCategories(categoryRes.data.data)
      }
    } catch (error) {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const parseAttachments = ( attachmentsStr?: string) => {
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

  const completedCount = trainings.filter(t => t.status === 'completed').length
  const inProgressCount = trainings.filter(t => t.status === 'in_progress').length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{t('training.title')}</h1>
          <button onClick={loadData} className="p-2 bg-white/20 rounded-lg">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-white/60 text-xs">{t('training.completed')}</p>
            <p className="text-2xl font-bold">{completedCount}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-white/60 text-xs">{t('training.inProgress')}</p>
            <p className="text-2xl font-bold">{inProgressCount}</p>
          </div>
        </div>
      </header>

      {/* Filter */}
      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setFilterStatus('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              !filterStatus ? 'bg-primary text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t('common.all')}
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              filterStatus === 'completed' ? 'bg-primary text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t('training.completed')}
          </button>
          <button
            onClick={() => setFilterStatus('in_progress')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              filterStatus === 'in_progress' ? 'bg-primary text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t('training.inProgress')}
          </button>
          <button
            onClick={() => setFilterStatus('scheduled')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              filterStatus === 'scheduled' ? 'bg-primary text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t('training.scheduled')}
          </button>
        </div>
      </div>

      {/* Training List */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredTrainings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t('training.noTraining')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTrainings.map(training => {
              const attachments = parseAttachments(training.attachments)
              return (
                <div key={training.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <BookOpen className="text-primary" size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-gray-900">{training.title}</p>
                          <p className="text-sm text-gray-500">
                            {getCategoryLabel(training.trainingType)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {STATUS_ICONS[training.status]}
                          <span className="text-xs">{STATUS_LABELS[training.status]}</span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">{t('training.startDate')}:</span>
                          <span className="ml-1 font-medium">{formatDate(training.startDate)}</span>
                        </div>
                        {training.endDate && (
                          <div>
                            <span className="text-gray-500">{t('training.endDate')}:</span>
                            <span className="ml-1 font-medium">{formatDate(training.endDate)}</span>
                          </div>
                        )}
                        {training.duration && (
                          <div>
                            <span className="text-gray-500">{t('training.duration')}:</span>
                            <span className="ml-1 font-medium">{training.duration}h</span>
                          </div>
                        )}
                        {training.score !== null && training.score !== undefined && (
                          <div>
                            <span className="text-gray-500">{t('training.score')}:</span>
                            <span className={`ml-1 font-medium ${training.passed ? 'text-green-600' : 'text-red-600'}`}>
                              {training.score} {training.passed ? '✓' : '✗'}
                            </span>
                          </div>
                        )}
                      </div>

                      {training.certificate && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-500">{t('training.certificate')}:</span>
                          <span className="ml-1 font-medium">{training.certificate}</span>
                        </div>
                      )}

                      {training.provider && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-500">{t('training.provider')}:</span>
                          <span className="ml-1 font-medium">{training.provider}</span>
                        </div>
                      )}

                      {/* 附件下载 */}
                      {attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-gray-500 mb-2">{t('training.attachments')}:</p>
                          <div className="space-y-2">
                            {attachments.map((att: any, index: number) => (
                              <a
                                key={index}
                                href={att.url}
                                download={att.name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 hover:bg-gray-100"
                              >
                                <FileText size={16} className="text-primary" />
                                <span className="text-sm flex-1 truncate">{att.name}</span>
                                <Download size={14} className="text-gray-400" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}