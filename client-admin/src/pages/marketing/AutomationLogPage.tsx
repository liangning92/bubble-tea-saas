import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Filter } from 'lucide-react'

interface AutomationLog {
  id: string
  campaignId?: string
  campaignName?: string
  triggerType: string
  status: 'running' | 'success' | 'failed'
  matchedCount: number
  executedCount: number
  failedCount: number
  messageLog?: string
  errorLog?: string
  startedAt: string
  completedAt?: string
}

export function AutomationLogPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed'>('all')
  const [filterType, setFilterType] = useState<string>('all')

  // Fetch automation logs
  const { data, isLoading } = useQuery({
    queryKey: ['automation-logs', storeId],
    queryFn: () => marketingApi.automationLogs(storeId)
  })

  const logs: AutomationLog[] = data?.data || []

  const triggerTypes = [
    { value: 'all', label: t('common.all') },
    { value: 'birthday', label: t('marketing.birthdayAutomation') },
    { value: 'reactivation', label: t('marketing.reactivationAutomation') },
    { value: 'points_expiring', label: t('marketing.pointsExpiringAutomation') },
    { value: 'seasonal', label: t('marketing.seasonalAutomation') },
    { value: 'welcome', label: t('marketing.welcomeAutomation') }
  ]

  const filteredLogs = logs.filter(log => {
    if (filterStatus === 'success' && log.status !== 'success') return false
    if (filterStatus === 'failed' && log.status !== 'failed') return false
    if (filterType !== 'all' && log.triggerType !== filterType) return false
    return true
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Clock size={16} className="text-blue-500 animate-pulse" />
      case 'success': return <CheckCircle size={16} className="text-green-500" />
      case 'failed': return <XCircle size={16} className="text-red-500" />
      default: return <AlertCircle size={16} className="text-gray-500" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'running': return t('marketing.running')
      case 'success': return t('common.success')
      case 'failed': return t('common.error')
      default: return status
    }
  }

  const getTriggerTypeLabel = (type: string) => {
    const found = triggerTypes.find(t => t.value === type)
    return found ? found.label : type
  }

  const formatDuration = (start: string, end?: string) => {
    if (!end) return '-'
    const diff = new Date(end).getTime() - new Date(start).getTime()
    if (diff < 1000) return '<1s'
    return `${(diff / 1000).toFixed(1)}s`
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Calendar size={24} className="text-primary" />
        <h1 className="text-xl font-semibold">{t('marketing.automationLogs')}</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input py-2"
          >
            {triggerTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-2 rounded-lg text-sm ${filterStatus === 'all' ? 'bg-primary text-white' : 'bg-gray-100'}`}
          >
            {t('common.all')}
          </button>
          <button
            onClick={() => setFilterStatus('success')}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${filterStatus === 'success' ? 'bg-green-500 text-white' : 'bg-gray-100'}`}
          >
            <CheckCircle size={14} />
            {t('common.success')}
          </button>
          <button
            onClick={() => setFilterStatus('failed')}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${filterStatus === 'failed' ? 'bg-red-500 text-white' : 'bg-gray-100'}`}
          >
            <XCircle size={14} />
            {t('common.error')}
          </button>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Calendar size={48} className="mb-4 opacity-50" />
            <p>{t('marketing.noAutomationLogs')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`p-4 rounded-lg border ${log.status === 'success' ? 'border-green-200 bg-green-50' : log.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(log.status)}
                    <div>
                      <div className="font-medium">{log.campaignName || getTriggerTypeLabel(log.triggerType)}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {new Date(log.startedAt).toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'failed' ? 'badge-danger' : 'badge-info'}`}>
                      {getStatusLabel(log.status)}
                    </div>
                    {log.completedAt && (
                      <div className="text-sm text-gray-500 mt-1">
                        {formatDuration(log.startedAt, log.completedAt)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">{log.matchedCount}</div>
                    <div className="text-xs text-gray-500">{t('marketing.matched')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{log.executedCount}</div>
                    <div className="text-xs text-gray-500">{t('marketing.executed')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">{log.failedCount}</div>
                    <div className="text-xs text-gray-500">{t('marketing.failed')}</div>
                  </div>
                </div>

                {/* Error log */}
                {log.errorLog && (
                  <div className="mt-3 p-2 bg-red-100 rounded text-sm text-red-700">
                    {log.errorLog}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}