import { Link } from 'react-router-dom'
import { useMarketingCopy } from '../../components/marketing/MarketingLayout'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Zap, Gift, Users, Clock, CheckCircle, AlertCircle } from 'lucide-react'

interface Automation {
  type: 'birthday' | 'reactivation' | 'points_expiring' | 'seasonal'
  label: string
  description: string
  icon: React.ReactNode
  lastRun?: string
  status: 'ready' | 'running' | 'success' | 'error'
}

export function AutomationPage() {
  const { t } = useTranslation()
  const l=useMarketingCopy()
  const { user } = useAuthStore()
  const storeId = user?.storeId || undefined

  const [runningType, setRunningType] = useState<string | null>(null)
  const [result, setResult] = useState<{ type: string; success: boolean; message: string } | null>(null)

  const runBirthdayMutation = useMutation({
    mutationFn: () => marketingApi.runBirthdayAutomation(storeId),
    onSuccess: () => {
      setResult({ type: 'birthday', success: true, message: t('marketing.automationSuccess') })
      setRunningType(null)
    },
    onError: () => {
      setResult({ type: 'birthday', success: false, message: t('marketing.automationError') })
      setRunningType(null)
    }
  })

  const runReactivationMutation = useMutation({
    mutationFn: () => marketingApi.runReactivationAutomation(storeId),
    onSuccess: () => {
      setResult({ type: 'reactivation', success: true, message: t('marketing.automationSuccess') })
      setRunningType(null)
    },
    onError: () => {
      setResult({ type: 'reactivation', success: false, message: t('marketing.automationError') })
      setRunningType(null)
    }
  })

  const runPointsExpiringMutation = useMutation({
    mutationFn: () => marketingApi.runPointsExpiringAutomation(storeId),
    onSuccess: () => {
      setResult({ type: 'points_expiring', success: true, message: t('marketing.automationSuccess') })
      setRunningType(null)
    },
    onError: () => {
      setResult({ type: 'points_expiring', success: false, message: t('marketing.automationError') })
      setRunningType(null)
    }
  })

  const runSeasonalMutation = useMutation({
    mutationFn: () => marketingApi.runSeasonalAutomation(storeId),
    onSuccess: () => {
      setResult({ type: 'seasonal', success: true, message: t('marketing.automationSuccess') })
      setRunningType(null)
    },
    onError: () => {
      setResult({ type: 'seasonal', success: false, message: t('marketing.automationError') })
      setRunningType(null)
    }
  })

  const automations: Automation[] = [
    {
      type: 'birthday',
      label: t('marketing.automationTypes.birthday'),
      description: t('marketing.automationDescriptions.birthday'),
      icon: <Gift size={24} className="text-pink-500" />,
      status: runningType === 'birthday' ? 'running' : result?.type === 'birthday' ? (result.success ? 'success' : 'error') : 'ready'
    },
    {
      type: 'reactivation',
      label: t('marketing.automationTypes.reactivation'),
      description: t('marketing.automationDescriptions.reactivation'),
      icon: <Users size={24} className="text-blue-500" />,
      status: runningType === 'reactivation' ? 'running' : result?.type === 'reactivation' ? (result.success ? 'success' : 'error') : 'ready'
    },
    {
      type: 'points_expiring',
      label: t('marketing.automationTypes.pointsExpiring'),
      description: t('marketing.automationDescriptions.pointsExpiring'),
      icon: <Clock size={24} className="text-orange-500" />,
      status: runningType === 'points_expiring' ? 'running' : result?.type === 'points_expiring' ? (result.success ? 'success' : 'error') : 'ready'
    },
    {
      type: 'seasonal',
      label: t('marketing.automationTypes.seasonal'),
      description: t('marketing.automationDescriptions.seasonal'),
      icon: <Zap size={24} className="text-green-500" />,
      status: runningType === 'seasonal' ? 'running' : result?.type === 'seasonal' ? (result.success ? 'success' : 'error') : 'ready'
    }
  ]

  const handleRun = (type: string) => {
    setRunningType(type)
    setResult(null)
    switch (type) {
      case 'birthday':
        runBirthdayMutation.mutate()
        break
      case 'reactivation':
        runReactivationMutation.mutate()
        break
      case 'points_expiring':
        runPointsExpiringMutation.mutate()
        break
      case 'seasonal':
        runSeasonalMutation.mutate()
        break
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 size={20} className="animate-spin text-primary" />
      case 'success':
        return <CheckCircle size={20} className="text-green-500" />
      case 'error':
        return <AlertCircle size={20} className="text-red-500" />
      default:
        return <Zap size={20} className="text-gray-400" />
    }
  }

  return (
    <div>
      <div className="card mb-5 space-y-3"><h2 className="font-semibold">{l('活动权益自动执行','Automatic activity rewards','Hadiah aktivitas otomatis')}</h2><p className="text-sm text-gray-500">{l('统一活动在支付成功后自动发放权益，无需逐项点击运行。可在权益记录中查看待兑现、资源不足和退款处理情况。','Unified activity rewards are processed automatically after payment. Review fulfilment, resource shortages and refunds in Rewards.','Hadiah aktivitas terpadu diproses otomatis setelah pembayaran. Tinjau penyerahan, sumber tidak tersedia, dan pengembalian di Hadiah.')}</p><Link className="text-primary text-sm" to="/marketing/promotions/activities?tab=grants">{l('查看权益执行记录','View reward execution','Lihat eksekusi hadiah')}</Link></div>
      <p className="text-gray-600 mb-4">
        {t('marketing.automationDescription')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {automations.map((automation) => (
          <div key={automation.type} className="card">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                {automation.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{automation.label}</h3>
                <p className="text-sm text-gray-600 mb-4">{automation.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(automation.status)}
                    <span className="text-sm text-gray-500">
                      {automation.status === 'running' && t('marketing.running')}
                      {automation.status === 'success' && t('common.success')}
                      {automation.status === 'error' && t('common.error')}
                      {automation.status === 'ready' && t('marketing.ready')}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRun(automation.type)}
                    disabled={automation.status === 'running'}
                    className="btn-primary flex items-center gap-2"
                  >
                    {automation.status === 'running' && <Loader2 size={16} className="animate-spin" />}
                    {t('marketing.runNow')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {result && (
        <div className={`mt-6 p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <div className="flex items-center gap-2">
            {result.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span>{result.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
