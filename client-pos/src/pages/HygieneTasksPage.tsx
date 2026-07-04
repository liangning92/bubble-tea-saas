import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import {
  ArrowLeft, CheckCircle, SkipForward, Camera, X, Loader2,
  Clock, MapPin, AlertCircle, CheckSquare, Star, AlertTriangle
} from 'lucide-react'

interface Task {
  id: string
  name: string
  areaCode: string
  date: string
  time: string
  priority: number
  status: string
  photoRequired?: boolean
  standardBefore?: string
  standardDuring?: string
  standardAfter?: string
  evidenceType?: string
  requiresApproval?: boolean
  dueTime?: string
  isTemporary?: boolean
  redoCount?: number
  parentTaskId?: string
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
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [checklistResults, setChecklistResults] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [selfRating, setSelfRating] = useState<number>(0)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'today' | 'overdue'>('today')

  // Fetch today's tasks and overdue tasks
  useEffect(() => {
    const fetchTasks = async () => {
      if (!user?.storeId) return
      setLoading(true)
      try {
        const today = new Date().toISOString().split('T')[0]
        const [tasksRes, overdueRes] = await Promise.all([
          posApi.getMyTasks(today),
          posApi.getOverdueTasks().catch(() => ({ data: { data: { list: [] } } }))
        ])
        setTasks(tasksRes?.data?.data?.list || [])
        setOverdueTasks(overdueRes?.data?.data?.list || [])
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
    setSelfRating(0)
    setError('')
  }

  // Close detail
  const closeDetail = () => {
    setShowDetail(false)
    setSelectedTask(null)
  }

  // Refresh tasks list
  const refreshTasks = async () => {
    const today = new Date().toISOString().split('T')[0]
    const [tasksRes, overdueRes] = await Promise.all([
      posApi.getMyTasks(today),
      posApi.getOverdueTasks().catch(() => ({ data: { data: { list: [] } } }))
    ])
    setTasks(tasksRes?.data?.data?.list || [])
    setOverdueTasks(overdueRes?.data?.data?.list || [])
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

      // 检查必检项是否都已完成
      const requiredChecklists = selectedTask.template?.checklists?.filter(c => c.isRequired) || []
      const incompleteRequired = requiredChecklists.filter(c => !checklistResults[c.id])
      if (incompleteRequired.length > 0) {
        setError(`Please complete all required items: ${incompleteRequired.map(c => c.item).join(', ')}`)
        setActionLoading(false)
        return
      }

      await posApi.completeTask(selectedTask.id, {
        photoUrl: photoUrl || undefined,
        note: note || undefined,
        selfRating: selfRating || undefined,
        checklistResults: results.length > 0 ? results : undefined,
      })
      await refreshTasks()
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
      await refreshTasks()
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

  // Check if task is overdue
  const isOverdue = (task: Task) => {
    if (!task.dueTime) return false
    if (['completed', 'approved', 'skipped', 'rejected'].includes(task.status)) return false
    return new Date(task.dueTime) < new Date()
  }

  // Get priority color
  const getPriorityColor = (priority?: number) => {
    switch (priority) {
      case 1: return 'text-red-600 bg-red-50 border-red-200'
      case 2: return 'text-orange-600 bg-orange-50 border-orange-200'
      case 3: return 'text-blue-600 bg-blue-50 border-blue-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  // Get status badge
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed': return { label: t('tasks.completed'), class: 'text-green-600 bg-green-50' }
      case 'approved': return { label: t('tasks.approved'), class: 'text-green-600 bg-green-50' }
      case 'skipped': return { label: t('tasks.skipped'), class: 'text-gray-600 bg-gray-50' }
      case 'rejected': return { label: t('tasks.rejected'), class: 'text-red-600 bg-red-50' }
      case 'in_progress': return { label: t('tasks.inProgress'), class: 'text-blue-600 bg-blue-50' }
      case 'pending_approval': return { label: t('tasks.pendingApproval'), class: 'text-yellow-600 bg-yellow-50' }
      default: return { label: t('tasks.pending'), class: 'text-yellow-600 bg-yellow-50' }
    }
  }

  const displayTasks = activeTab === 'today' ? tasks : overdueTasks

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
        {/* Tab Switcher */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === 'today' ? 'bg-white shadow text-primary' : 'text-gray-600'
            }`}
          >
            {t('tasks.today')} ({tasks.length})
          </button>
          {overdueTasks.length > 0 && (
            <button
              onClick={() => setActiveTab('overdue')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'overdue' ? 'bg-white shadow text-red-600' : 'text-red-600'
              }`}
            >
              {t('tasks.overdue')} ({overdueTasks.length})
              <AlertTriangle size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="p-4 space-y-3">
        {displayTasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle size={48} className="mx-auto mb-3 text-green-400" />
            <p>{activeTab === 'overdue' ? t('tasks.noOverdueTasks') : t('tasks.noTasks')}</p>
          </div>
        ) : (
          displayTasks.map((task) => {
            const badge = getStatusBadge(task.status)
            const overdue = isOverdue(task)
            const canStart = task.status === 'pending'

            return (
              <div
                key={task.id}
                onClick={() => canStart && openTask(task)}
                className={`bg-white rounded-xl p-4 shadow-sm border-2 ${
                  overdue ? 'border-red-300 bg-red-50' : 'border-transparent'
                } ${canStart ? 'cursor-pointer hover:shadow-md' : 'opacity-75'}`}
              >
                {/* Overdue Banner */}
                {overdue && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mb-2 bg-red-100 px-2 py-1 rounded">
                    <AlertTriangle size={14} />
                    <span>{t('tasks.overdue')}</span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${getPriorityColor(task.priority)}`}>
                    <span className="text-sm font-bold">{task.priority || 3}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{task.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${badge.class}`}>{badge.label}</span>
                      {task.isTemporary && (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-600">
                          {t('tasks.temporary')}
                        </span>
                      )}
                      {task.redoCount && task.redoCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-600">
                          {t('tasks.redo')} #{task.redoCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {task.areaCode}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {task.time}
                      </span>
                      {task.dueTime && (
                        <span className={`flex items-center gap-1 ${overdue ? 'text-red-600' : ''}`}>
                          <AlertCircle size={14} />
                          {t('tasks.due')}: {new Date(task.dueTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {canStart && (
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
              <div>
                <h2 className="text-lg font-semibold">{selectedTask.name}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <span>{selectedTask.areaCode}</span>
                  <span>|</span>
                  <span>{selectedTask.time}</span>
                  {isOverdue(selectedTask) && (
                    <>
                      <span>|</span>
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertTriangle size={14} />
                        {t('tasks.overdue')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Task Info */}
              <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                {selectedTask.photoRequired && (
                  <span className="flex items-center gap-1">
                    <Camera size={16} />
                    {t('tasks.photoRequired')}
                  </span>
                )}
                {selectedTask.requiresApproval && (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <CheckSquare size={16} />
                    {t('tasks.requiresApproval')}
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
                  <h3 className="font-medium flex items-center gap-2">
                    {t('tasks.checklist')}
                    <span className="text-sm text-gray-500">({t('tasks.checklistTip')})</span>
                  </h3>
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

              {/* Self Rating */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('tasks.selfRating')}
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setSelfRating(rating)}
                      className={`p-2 rounded-lg ${
                        selfRating >= rating
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <Star size={24} fill={selfRating >= rating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">{t('tasks.selfRatingTip')}</p>
              </div>

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

              {/* Actions - Pending: show Start button */}
              {!showSkipConfirm && selectedTask.status === 'pending' && (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => setShowSkipConfirm(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-gray-300 rounded-xl text-gray-600"
                  >
                    <SkipForward size={20} />
                    {t('tasks.skip')}
                  </button>
                  <button
                    onClick={handleStart}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500 text-white rounded-xl"
                  >
                    {actionLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                    {t('tasks.start')}
                  </button>
                </div>
              )}

              {/* Already in progress - only complete button */}
              {!showSkipConfirm && selectedTask.status === 'in_progress' && (
                <div className="flex gap-3 pt-4 border-t">
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
