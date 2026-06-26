import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hygieneApi } from '../../services/api'
import { Loader2, CheckCircle, SkipForward, Clock, Camera, User, X, Star } from 'lucide-react'

const AREAS = [
  { value: 'counter', label: '', color: 'bg-blue-100 text-blue-700' },
  { value: 'kitchen', label: '', color: 'bg-orange-100 text-orange-700' },
  { value: 'ingredients', label: '', color: 'bg-purple-100 text-purple-700' },
  { value: 'floor', label: '', color: 'bg-green-100 text-green-700' },
  { value: 'restroom', label: '', color: 'bg-red-100 text-red-700' },
  { value: 'waste', label: '', color: 'bg-gray-100 text-gray-700' },
]

const AREA_LABELS: Record<string, string> = {
  counter: 'hygiene.counter',
  kitchen: 'hygiene.kitchen',
  ingredients: 'hygiene.ingredients',
  floor: 'hygiene.floor',
  restroom: 'hygiene.restroom',
  waste: 'hygiene.waste',
  equipment: 'hygiene.equipment',
  ventilation: 'hygiene.ventilation',
}

export function HygieneTodayTasksPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [qualityScore, setQualityScore] = useState(3)
  const [rejectReason, setRejectReason] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)
  const [newTask, setNewTask] = useState({ name: '', areaCode: 'counter', priority: 2, note: '' })

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['hygiene-tasks', selectedDate],
    queryFn: () => hygieneApi.tasks({ date: selectedDate })
  })

  const { data: statsData } = useQuery({
    queryKey: ['hygiene-stats', selectedDate],
    queryFn: () => hygieneApi.stats(selectedDate)
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, photoUrl, note }: { id: string; photoUrl?: string; note?: string }) =>
      hygieneApi.completeTask(id, { photoUrl, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
    },
    onError: (error: any) => {
      console.error('Complete task error:', error)
      alert(t('hygiene.completeTaskFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const skipMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      hygieneApi.skipTask(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
    },
    onError: (error: any) => {
      console.error('Skip task error:', error)
      alert(t('hygiene.skipTaskFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      hygieneApi.approveTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
      setShowApproveModal(false)
      setSelectedTask(null)
    },
    onError: (error: any) => {
      console.error('Approve task error:', error)
      alert(t('hygiene.approveTaskFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const generateMutation = useMutation({
    mutationFn: () => hygieneApi.generateTasks(selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
    },
    onError: (error: any) => {
      console.error('Generate tasks error:', error)
      const message = error?.response?.data?.message || error?.message || t('common.unknownError')
      alert(t('hygiene.generateTasksFailed') + ': ' + message)
    }
  })

  const tasks = tasksData?.data?.data?.list || []
  const stats = statsData?.data?.data || { total: 0, completed: 0, skipped: 0, pending: 0, completionRate: 0 }

  const getAreaLabel = (areaCode: string) => {
    return t(AREA_LABELS[areaCode] || areaCode)
  }

  const getAreaColor = (areaCode: string) => {
    const found = AREAS.find(a => a.value === areaCode)
    return found?.color || 'bg-gray-100 text-gray-700'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">{t('hygiene.taskCompleted')}</span>
      case 'pending_approval':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">{t('hygiene.taskPendingApproval')}</span>
      case 'in_progress':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">{t('hygiene.taskInProgress')}</span>
      case 'skipped':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">{t('hygiene.taskSkipped')}</span>
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">{t('hygiene.taskRejected')}</span>
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{t('hygiene.taskPending')}</span>
    }
  }

  const openDetail = (task: any) => {
    setSelectedTask(task)
    setShowDetailModal(true)
  }

  const openApprove = (task: any) => {
    setSelectedTask(task)
    setQualityScore(3)
    setRejectReason('')
    setIsRejecting(false)
    setShowApproveModal(true)
  }

  const handleApprove = () => {
    if (!selectedTask) return
    approveMutation.mutate({
      id: selectedTask.id,
      data: { qualityScore, note: '' }
    })
  }

  const handleReject = () => {
    if (!selectedTask || !rejectReason.trim()) return
    setIsRejecting(true)
    approveMutation.mutate({
      id: selectedTask.id,
      data: { qualityScore: 0, reject: true, rejectReason }
    })
  }

  const handleComplete = (taskId: string) => {
    completeMutation.mutate({ id: taskId, photoUrl: '', note: '' })
  }

  const handleSkip = (taskId: string) => {
    const note = prompt(t('hygiene.skipTask') + ' - ' + t('hygiene.taskNotePlaceholder'))
    if (note) {
      skipMutation.mutate({ id: taskId, note })
    }
  }

  const createTempMutation = useMutation({
    mutationFn: (data: any) => hygieneApi.createTemporaryTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
      setShowCreateModal(false)
      setNewTask({ name: '', areaCode: 'counter', priority: 2, note: '' })
    },
    onError: (error: any) => {
      console.error('Create temp task error:', error)
      alert(t('hygiene.createTempTaskFailed') + ': ' + (error?.message || error?.response?.data?.message || t('common.unknownError')))
    }
  })

  const handleCreateTemp = () => {
    if (!newTask.name.trim()) return
    createTempMutation.mutate({
      name: newTask.name,
      areaCode: newTask.areaCode,
      priority: newTask.priority,
      description: newTask.note,
      date: selectedDate,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary text-sm"
        >
          + {t('hygiene.addTemporaryTask')}
        </button>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          {generateMutation.isPending ? t('common.generating') : t('hygiene.generateTasks')}
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">{t('hygiene.totalTasks')}</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-success">{stats.completed}</div>
          <div className="text-sm text-gray-500">{t('hygiene.completedTasks')}</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          <div className="text-sm text-gray-500">{t('hygiene.pendingTasks')}</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-500">{stats.overdue || 0}</div>
          <div className="text-sm text-gray-500">{t('hygiene.overdueTasks')}</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-primary">{stats.completionRate}%</div>
          <div className="text-sm text-gray-500">{t('hygiene.completionRate')}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <p>{t('hygiene.noTasks')}</p>
          <button
            onClick={() => generateMutation.mutate()}
            className="btn-primary mt-4"
          >
            {t('hygiene.generateTasks')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => (
            <div
              key={task.id}
              className="card cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openDetail(task)}
            >
              <div className="flex items-start gap-4">
                {/* Area Badge */}
                <div className={`px-3 py-1 rounded ${getAreaColor(task.areaCode)} text-sm font-medium`}>
                  {getAreaLabel(task.areaCode)}
                </div>

                {/* Task Info */}
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{task.name}</div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {task.time}
                    </span>
                    {task.staff && (
                      <span className="flex items-center gap-1">
                        <User size={14} />
                        {task.staff.name}
                      </span>
                    )}
                    {task.template?.photoRequired && (
                      <span className="flex items-center gap-1 text-orange-500">
                        <Camera size={14} />
                        {t('hygiene.photoRequired')}
                      </span>
                    )}
                  </div>
                  {task.template?.standard && (
                    <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      {task.template.standard}
                    </div>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-3">
                  {getStatusBadge(task.status)}

                  {task.status === 'pending' && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="p-2 text-success hover:bg-green-50 rounded"
                        title={t('common.complete')}
                      >
                        <CheckCircle size={20} />
                      </button>
                      <button
                        onClick={() => handleSkip(task.id)}
                        className="p-2 text-yellow-500 hover:bg-yellow-50 rounded"
                        title={t('common.skip')}
                      >
                        <SkipForward size={20} />
                      </button>
                    </div>
                  )}

                  {task.status === 'pending_approval' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openApprove(task) }}
                      className="btn-primary text-sm"
                    >
                      {t('hygiene.approveTask')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Modal */}
      {showDetailModal && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{selectedTask.name}</h2>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock size={16} /> {selectedTask.time}
                </span>
                {selectedTask.staff && (
                  <span className="flex items-center gap-1">
                    <User size={16} /> {selectedTask.staff.name}
                  </span>
                )}
              </div>

              {selectedTask.note && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-700 mb-1">{t('hygiene.taskNote')}</div>
                  <div className="text-sm text-gray-600">{selectedTask.note}</div>
                </div>
              )}

              {selectedTask.photoUrl && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">{t('hygiene.photoRequired')}</div>
                  <img src={selectedTask.photoUrl} alt="Task evidence" className="w-full rounded-lg" />
                </div>
              )}

              {getStatusBadge(selectedTask.status)}
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApproveModal && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowApproveModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('hygiene.approveTask')}</h2>
              <button onClick={() => setShowApproveModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="font-medium">{selectedTask.name}</div>

              {/* Quality Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('hygiene.qualityScore')}</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      onClick={() => setQualityScore(score)}
                      className={`p-2 rounded-lg ${qualityScore >= score ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'}`}
                    >
                      <Star size={24} fill={qualityScore >= score ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Reject Reason */}
              {isRejecting ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('hygiene.rejectReason')}</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input w-full"
                    rows={3}
                    placeholder={t('hygiene.rejectReasonPlaceholder')}
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => setIsRejecting(true)}
                    className="flex-1 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    {t('hygiene.rejectTask')}
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                    className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('hygiene.approveTask')}
                  </button>
                </div>
              )}

              {isRejecting && (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => setIsRejecting(false)}
                    className="flex-1 py-2 border border-gray-300 rounded-lg"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={approveMutation.isPending || !rejectReason.trim()}
                    className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {approveMutation.isPending ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('hygiene.confirmReject')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Temporary Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('hygiene.addTemporaryTask')}</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('hygiene.taskName')} *</label>
                <input
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                  className="input w-full"
                  placeholder={t('hygiene.taskNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('hygiene.area')}</label>
                <select
                  value={newTask.areaCode}
                  onChange={(e) => setNewTask({ ...newTask, areaCode: e.target.value })}
                  className="input w-full"
                >
                  <option value="counter">{t('hygiene.counter')}</option>
                  <option value="kitchen">{t('hygiene.kitchen')}</option>
                  <option value="ingredients">{t('hygiene.ingredients')}</option>
                  <option value="floor">{t('hygiene.floor')}</option>
                  <option value="restroom">{t('hygiene.restroom')}</option>
                  <option value="waste">{t('hygiene.waste')}</option>
                  <option value="equipment">{t('hygiene.equipment')}</option>
                  <option value="ventilation">{t('hygiene.ventilation')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('hygiene.priority')}</label>
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: parseInt(e.target.value) })}
                  className="input w-full"
                >
                  <option value={1}>{t('hygiene.priorityCritical')}</option>
                  <option value={2}>{t('hygiene.priorityHigh')}</option>
                  <option value={3}>{t('hygiene.priorityNormal')}</option>
                  <option value={4}>{t('hygiene.priorityLow')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('hygiene.taskNote')}</label>
                <textarea
                  value={newTask.note}
                  onChange={(e) => setNewTask({ ...newTask, note: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder={t('hygiene.taskNotePlaceholder')}
                />
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateTemp}
                  disabled={createTempMutation.isPending || !newTask.name.trim()}
                  className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {createTempMutation.isPending ? <Loader2 className="animate-spin mx-auto" size={18} /> : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}