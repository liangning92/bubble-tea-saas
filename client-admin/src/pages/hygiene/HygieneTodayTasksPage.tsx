import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hygieneApi } from '../../services/api'
import { Loader2, CheckCircle, SkipForward, Clock, Camera, User } from 'lucide-react'

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
    }
  })

  const skipMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      hygieneApi.skipTask(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
    }
  })

  const generateMutation = useMutation({
    mutationFn: () => hygieneApi.generateTasks(selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hygiene-tasks', selectedDate] })
      queryClient.invalidateQueries({ queryKey: ['hygiene-stats', selectedDate] })
    }
  })

  const tasks = tasksData?.data?.list || []
  const stats = statsData?.data || { total: 0, completed: 0, skipped: 0, pending: 0, completionRate: 0 }

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
      case 'skipped':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">{t('hygiene.taskSkipped')}</span>
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">{t('hygiene.taskRejected')}</span>
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{t('hygiene.taskPending')}</span>
    }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => generateMutation.mutate()}
          className="btn-secondary text-sm"
        >
          {t('hygiene.generateTasks')}
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
            <div key={task.id} className="card">
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
                    <div className="flex gap-2">
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}