import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import {
  ArrowLeft, CheckCircle, SkipForward, Camera, X, Loader2,
  Clock, MapPin, AlertCircle, CheckSquare
} from 'lucide-react'

interface Task {
  id: string
  name: string
  areaCode: string
  date: string
  time: string
  status: string
  priority: number
  photoRequired?: boolean
  standardBefore?: string
  standardDuring?: string
  standardAfter?: string
  evidenceType?: string
  requiresApproval?: boolean
  template?: {
    id: string
    name: string
    photoRequired?: boolean
    standardBefore?: string
    standardDuring?: string
    standardAfter?: string
    evidenceType?: string
    requiresApproval?: boolean
    checklists?: { id: string; item: string; description?: string; isRequired: boolean }[]
  }
}

interface ChecklistResult {
  checklistId: string
  completed: boolean
  note?: string
}

export function HygieneTasksPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [checklistResults, setChecklistResults] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch today's tasks
  useEffect(() => {
    const fetchTasks = async () => {
      if (!user?.storeId) return
      setLoading(true)
      try {
        const today = new Date().toISOString().split('T')[0]
        const res = await posApi.getMyTasks(today)
        setTasks(res?.data?.data?.list || [])
      } catch (e) {
        setError('Failed to load tasks')
      } finally {
        setLoading(false)
      }
    }
    fetchTasks()
  }, [user?.storeId])

  // Open task detail
  const openTask = (task: Task) => {
    setSelectedTask(task)
    setShowDetail(true)
    setShowSkipConfirm(false)
    setChecklistResults({})
    setNote('')
    setPhotoUrl('')
    setSkipReason('')
    setError('')
  }

  // Close detail
  const closeDetail = () => {
    setShowDetail(false)
    setSelectedTask(null)
  }

  // Start task
  const handleStart = async () => {
    if (!selectedTask) return
    setActionLoading(true)
    try {
      await posApi.startTask(selectedTask.id)
      setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, status: 'in_progress' } : t))
      closeDetail()
    } catch (e) {
      setError('Failed to start task')
    } finally {
      setActionLoading(false)
    }
  }

  // Complete task
  const handleComplete = async () => {
    if (!selectedTask) return
    setActionLoading(true)
    try {
      const results: ChecklistResult[] = Object.entries(checklistResults).map(([id, completed]) => ({
        checklistId: id,
        completed,
      }))
      await posApi.completeTask(selectedTask.id, {
        photoUrl: photoUrl || undefined,
        note: note || undefined,
        checklistResults: results.length > 0 ? results : undefined,
      })
      setTasks(tasks.filter(t => t.id !== selectedTask.id))
      closeDetail()
    } catch (e) {
      setError('Failed to complete task')
    } finally {
      setActionLoading(false)
    }
  }

  // Skip task
  const handleSkip = async () => {
    if (!selectedTask || !skipReason.trim()) return
    setActionLoading(true)
    try {
      await posApi.skipTask(selectedTask.id, skipReason)
      setTasks(tasks.filter(t => t.id !== selectedTask.id))
      closeDetail()
    } catch (e) {
      setError('Failed to skip task')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleChecklist = (id: string) => {
    setChecklistResults(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Get priority color
  const getPriorityColor = (priority?: number) => {
    switch (priority) {
      case 1: return 'text-red-600 bg-red-50'
      case 2: return 'text-orange-600 bg-orange-50'
      case 3: return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  // Get status badge
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed': return { label: t('tasks.completed'), class: 'text-green-600 bg-green-50' }
      case 'skipped': return { label: t('tasks.skipped'), class: 'text-gray-600 bg-gray-50' }
      case 'pending': return { label: t('tasks.pending'), class: 'text-yellow-600 bg-yellow-50' }
      default: return { label: status, class: 'text-gray-600 bg-gray-50' }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t('tasks.title')}</h1>
        <span className="text-sm text-gray-500">{tasks.length} {t('tasks.tasks')}</span>
      </div>

      {/* Task List */}
      <div className="p-4 space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle size={48} className="mx-auto mb-3 text-green-400" />
            <p>{t('tasks.noTasks')}</p>
          </div>
        ) : (
          tasks.map((task) => {
            const badge = getStatusBadge(task.status)
            return (
              <div
                key={task.id}
                onClick={() => task.status === 'pending' && openTask(task)}
                className={`bg-white rounded-xl p-4 shadow-sm ${task.status === 'pending' ? 'cursor-pointer hover:shadow-md' : 'opacity-75'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getPriorityColor(task.priority)}`}>
                    <span className="text-sm font-bold">{task.priority || 3}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{task.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${badge.class}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {task.areaCode}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {task.time}
                      </span>
                   </div>
                 </div>
                  {task.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openTask(task) }}
                      className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg"
                    >
                      {t('tasks.start')}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Task Detail Modal */}
      {showDetail && selectedTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full max-h-[90vh] rounded-t-2xl overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selectedTask.name}</h2>
              <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Task Info */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin size={16} />
                  {selectedTask.areaCode}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={16} />
                  {selectedTask.time}
                </span>
                {selectedTask.photoRequired && (
                  <span className="flex items-center gap-1">
                    <Camera size={16} />
                    {t('tasks.photoRequired')}
                  </span>
                )}
              </div>

              {/* Three-Phase Standards */}
              {(selectedTask.standardBefore || selectedTask.standardDuring || selectedTask.standardAfter) && (
                <div className="space-y-3">
                  {selectedTask.standardBefore && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        <span className="text-sm font-medium text-blue-700">{t('tasks.phaseBefore')}</span>
                      </div>
                      <p className="text-sm text-blue-800 ml-7">{selectedTask.standardBefore}</p>
                    </div>
                  )}
                  {selectedTask.standardDuring && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        <span className="text-sm font-medium text-green-700">{t('tasks.phaseDuring')}</span>
                      </div>
                      <p className="text-sm text-green-800 ml-7">{selectedTask.standardDuring}</p>
                    </div>
                  )}
                  {selectedTask.standardAfter && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        <span className="text-sm font-medium text-purple-700">{t('tasks.phaseAfter')}</span>
                      </div>
                      <p className="text-sm text-purple-800 ml-7">{selectedTask.standardAfter}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Checklist */}
              {selectedTask.template?.checklists && selectedTask.template.checklists.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">{t('tasks.checklist')}</h3>
                  {selectedTask.template.checklists.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                        checklistResults[item.id] ? 'border-green-500 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        checklistResults[item.id] ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
                      }`}>
                        {checklistResults[item.id] && <CheckCircle size={16} />}
                      </div>
                      <div className="flex-1">
                        <span className={checklistResults[item.id] ? 'line-through text-gray-400' : ''}>
                          {item.item}
                        </span>
                        {item.description && (
                          <p className="text-sm text-gray-500">{item.description}</p>
                        )}
                      </div>
                      {item.isRequired && (
                        <span className="text-xs text-red-500">*</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tasks.note')}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input w-full"
                  rows={2}
                  placeholder={t('tasks.notePlaceholder')}
                />
              </div>

              {/* Skip Reason (shown when skip clicked) */}
              {showSkipConfirm && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-red-700 font-medium">
                    <AlertCircle size={18} />
                    {t('tasks.skipReason')}
                  </div>
                  <input
                    type="text"
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    className="input w-full bg-white"
                    placeholder={t('tasks.skipReasonPlaceholder')}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSkipConfirm(false)}
                      className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSkip}
                      disabled={actionLoading || !skipReason.trim()}
                      className="flex-1 py-2 bg-red-500 text-white rounded-lg disabled:opacity-50"
                    >
                      {t('tasks.confirmSkip')}
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle size={18} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Actions */}
              {!showSkipConfirm && (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => setShowSkipConfirm(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-gray-300 rounded-xl text-gray-600"
                  >
                    <SkipForward size={20} />
                    {t('tasks.skip')}
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl"
                  >
                    {actionLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                    {t('tasks.complete')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}