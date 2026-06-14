import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { staffApi } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { CheckCircle, SkipForward, Clock, Camera } from 'lucide-react'

export function HygienePage() {
  const { t } = useTranslation()
  useAuthStore()
  const [tasks, setTasks] = useState<any[]>([])
  const [, setLoading] = useState(false)
  const [selectedDate] = useState(new Date().toISOString().split('T')[0])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const data = await staffApi.getMyTasks(selectedDate)
      setTasks(data?.data?.data?.list || [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [selectedDate])

  const handleComplete = async (taskId: string) => {
    if (!confirm(t('hygiene.confirmComplete'))) return
    try {
      await staffApi.completeTask(taskId, {})
      loadTasks()
    } catch (err) {
      console.error('Failed to complete task:', err)
    }
  }

  const handleSkip = async (taskId: string) => {
    const note = prompt(t('hygiene.skipReasonPlaceholder'))
    if (note) {
      try {
        await staffApi.skipTask(taskId, note)
        loadTasks()
      } catch (err) {
        console.error('Failed to skip task:', err)
      }
    }
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white p-4 border-b">
        <h1 className="text-xl font-bold text-gray-900">{t('hygiene.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {selectedDate}
        </p>
      </div>

      {/* Summary */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{tasks.length}</div>
          <div className="text-xs text-gray-500">{t('hygiene.totalTasks')}</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-500">{pendingTasks.length}</div>
          <div className="text-xs text-gray-500">{t('hygiene.toDo')}</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-500">{completedTasks.length}</div>
          <div className="text-xs text-gray-500">{t('hygiene.done')}</div>
        </div>
      </div>

      {/* Pending Tasks */}
      <div className="px-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          {t('hygiene.pending')}
        </h2>

        {pendingTasks.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            <p>{t('hygiene.noTasks')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTasks.map(task => (
              <div key={task.id} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                        {t('hygiene.area')}: {task.area}
                      </span>
                      <span className="text-sm font-medium">{task.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {task.time}
                      </span>
                      {task.template?.photoRequired && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <Camera size={14} />
                          {t('hygiene.photoRequired')}
                        </span>
                      )}
                    </div>
                    {task.template?.standard && (
                      <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        {t('hygiene.standard')}: {task.template.standard}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="p-2 bg-green-500 text-white rounded-lg"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button
                      onClick={() => handleSkip(task.id)}
                      className="p-2 bg-yellow-500 text-white rounded-lg"
                    >
                      <SkipForward size={20} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            {t('hygiene.completed')}
          </h2>
          <div className="space-y-2">
            {completedTasks.map(task => (
              <div key={task.id} className="bg-gray-100 rounded-lg p-3 flex items-center gap-3">
                <CheckCircle size={18} className="text-green-500" />
                <span className="text-sm text-gray-600">
                  {task.area} - {task.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}