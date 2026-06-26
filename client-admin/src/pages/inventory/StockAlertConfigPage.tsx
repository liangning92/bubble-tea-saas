import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../services/api'
import { Loader2, Save, RotateCcw, AlertTriangle, TrendingUp, Settings } from 'lucide-react'

interface AlertConfig {
  lowStockWarningDays: number
  lowStockCriticalDays: number
  varianceWarningPercent: number
  varianceCriticalPercent: number
  enableLowStockAlert: boolean
  enableConsumptionAlert: boolean
  autoCheckIntervalHours: number
}

export function StockAlertConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-alert-config'],
    queryFn: () => inventoryApi.getAlertConfig()
  })

  const saveMutation = useMutation({
    mutationFn: (config: AlertConfig) => inventoryApi.saveAlertConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-alert-config'] })
      alert(t('common.saveSuccess') || '保存成功')
    },
    onError: () => {
      alert(t('common.saveFailed') || '保存失败')
    }
  })

  const [config, setConfig] = useState<AlertConfig>({
    lowStockWarningDays: 7,
    lowStockCriticalDays: 3,
    varianceWarningPercent: 10,
    varianceCriticalPercent: 20,
    enableLowStockAlert: true,
    enableConsumptionAlert: true,
    autoCheckIntervalHours: 24
  })

  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (data?.data) {
      setConfig(data.data)
    }
  }, [data])

  const defaults = (data as any)?.defaults || {
    lowStockWarningDays: 7,
    lowStockCriticalDays: 3,
    varianceWarningPercent: 10,
    varianceCriticalPercent: 20,
    enableLowStockAlert: true,
    enableConsumptionAlert: true,
    autoCheckIntervalHours: 24
  }

  const handleChange = (key: keyof AlertConfig, value: number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleReset = () => {
    setConfig(defaults)
    setHasChanges(true)
  }

  const handleSave = () => {
    saveMutation.mutate(config)
    setHasChanges(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('inventory.alertConfig') || '预警规则配置'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('inventory.alertConfigDesc') || '配置库存预警规则，系统将根据这些规则发送预警通知'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="btn btn-outline flex items-center gap-2"
          >
            <RotateCcw size={16} />
            {t('common.reset') || '重置'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {t('common.save') || '保存'}
          </button>
        </div>
      </div>

      {/* Low Stock Alert Section */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-red-100">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {t('inventory.lowStockAlert') || '低库存预警'}
            </h2>
            <p className="text-sm text-gray-500">
              {t('inventory.lowStockAlertDesc') || '当原料库存预计可用天数低于阈值时发送预警'}
            </p>
          </div>
          <div className="ml-auto">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableLowStockAlert}
                onChange={(e) => handleChange('enableLowStockAlert', e.target.checked)}
                className="toggle toggle-primary"
              />
              <span className="text-sm text-gray-600">
                {config.enableLowStockAlert ? t('common.enabled') || '已启用' : t('common.disabled') || '已禁用'}
              </span>
            </label>
          </div>
        </div>

        {config.enableLowStockAlert && (
          <div className="grid grid-cols-2 gap-6">
            <div className="form-group">
              <label className="form-label">
                {t('inventory.warningDays') || '预警天数'}
              </label>
              <input
                type="number"
                value={config.lowStockWarningDays}
                onChange={(e) => handleChange('lowStockWarningDays', parseInt(e.target.value) || 7)}
                min={1}
                max={365}
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('inventory.warningDaysHint') || '库存预计可用天数 ≤ 此值时发送预警'}
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('inventory.criticalDays') || '紧急天数'}
              </label>
              <input
                type="number"
                value={config.lowStockCriticalDays}
                onChange={(e) => handleChange('lowStockCriticalDays', parseInt(e.target.value) || 3)}
                min={1}
                max={365}
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('inventory.criticalDaysHint') || '库存预计可用天数 ≤ 此值时发送紧急预警'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Consumption Variance Alert Section */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-orange-100">
            <TrendingUp size={24} className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {t('inventory.consumptionAlert') || '消耗异常预警'}
            </h2>
            <p className="text-sm text-gray-500">
              {t('inventory.consumptionAlertDesc') || '当实际消耗与理论消耗差异超过阈值时发送预警'}
            </p>
          </div>
          <div className="ml-auto">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableConsumptionAlert}
                onChange={(e) => handleChange('enableConsumptionAlert', e.target.checked)}
                className="toggle toggle-primary"
              />
              <span className="text-sm text-gray-600">
                {config.enableConsumptionAlert ? t('common.enabled') || '已启用' : t('common.disabled') || '已禁用'}
              </span>
            </label>
          </div>
        </div>

        {config.enableConsumptionAlert && (
          <div className="grid grid-cols-2 gap-6">
            <div className="form-group">
              <label className="form-label">
                {t('inventory.varianceWarningPercent') || '预警阈值 (%)'}
              </label>
              <input
                type="number"
                value={config.varianceWarningPercent}
                onChange={(e) => handleChange('varianceWarningPercent', parseFloat(e.target.value) || 10)}
                min={1}
                max={100}
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('inventory.varianceWarningHint') || '差异超过此百分比时发送预警'}
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('inventory.varianceCriticalPercent') || '紧急阈值 (%)'}
              </label>
              <input
                type="number"
                value={config.varianceCriticalPercent}
                onChange={(e) => handleChange('varianceCriticalPercent', parseFloat(e.target.value) || 20)}
                min={1}
                max={100}
                className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('inventory.varianceCriticalHint') || '差异超过此百分比时发送紧急预警'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* System Settings */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-100">
            <Settings size={24} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {t('inventory.systemSettings') || '系统设置'}
            </h2>
            <p className="text-sm text-gray-500">
              {t('inventory.systemSettingsDesc') || '预警系统的其他配置'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="form-group max-w-xs">
            <label className="form-label">
              {t('inventory.autoCheckInterval') || '自动检查间隔'}
            </label>
            <select
              value={config.autoCheckIntervalHours}
              onChange={(e) => handleChange('autoCheckIntervalHours', parseInt(e.target.value))}
              className="input w-full"
            >
              <option value={6}>6 {t('common.hours') || '小时'}</option>
              <option value={12}>12 {t('common.hours') || '小时'}</option>
              <option value={24}>24 {t('common.hours') || '小时'}</option>
              <option value={48}>48 {t('common.hours') || '小时'}</option>
              <option value={168}>168 {t('common.hours') || '小时'} (1 {t('common.week') || '周'})</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t('inventory.autoCheckIntervalHint') || '系统自动检查库存状态的时间间隔'}
            </p>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="card bg-gray-50">
        <h3 className="font-medium mb-4">{t('inventory.preview') || '规则预览'}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <span className="text-gray-600">
              {t('inventory.warning') || '预警'}: {t('inventory.stockLasts') || '库存预计可用'}{' '}
              <span className="font-bold text-orange-600">≤ {config.lowStockWarningDays} {t('common.days') || '天'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-gray-600">
              {t('inventory.critical') || '紧急'}: {t('inventory.stockLasts') || '库存预计可用'}{' '}
              <span className="font-bold text-red-600">≤ {config.lowStockCriticalDays} {t('common.days') || '天'}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="text-gray-600">
              {t('inventory.consumptionWarning') || '消耗预警'}: {t('inventory.variance') || '差异'}{' '}
              <span className="font-bold text-yellow-600">&gt; {config.varianceWarningPercent}%</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600"></span>
            <span className="text-gray-600">
              {t('inventory.consumptionCritical') || '消耗紧急'}: {t('inventory.variance') || '差异'}{' '}
              <span className="font-bold text-red-600">&gt; {config.varianceCriticalPercent}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
