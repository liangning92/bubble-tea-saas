import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Clock, AlertTriangle } from 'lucide-react'

export function PointsExpiryConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [form, setForm] = useState({
    enabled: true,
    expiryMonths: 12,
    minPointsToExpire: 100,
    notificationDays: 14
  })

  // Load existing settings
  const { data: existingData, isLoading } = useQuery({
    queryKey: ['points-expiry-rules'],
    queryFn: () => marketingApi.pointsExpiryRules()
  })

  // Sync form state when data loads
  useEffect(() => {
    if (existingData?.data?.data?.list && existingData.data.data.list.length > 0) {
      const rule = existingData.data.data.list[0]
      setForm({
        enabled: rule.enabled ?? true,
        expiryMonths: rule.expiryMonths ?? 12,
        minPointsToExpire: rule.minPointsToExpire ?? 100,
        notificationDays: rule.notificationDays ?? 14
      })
    }
  }, [existingData])

  const saveMutation = useMutation({
    mutationFn: (data: any) => marketingApi.createPointsExpiryRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-expiry-rules'] })
      alert(t('common.saveSuccess'))
    },
    onError: () => {
      alert(t('common.error'))
    }
  })

  const processMutation = useMutation({
    mutationFn: () => marketingApi.processPointsExpiry(storeId),
    onSuccess: (res) => {
      alert(`Processed: ${res.data?.data?.processed} members, ${res.data?.data?.expired} points expired`)
    },
    onError: () => {
      alert(t('common.error'))
    }
  })

  const handleSave = () => {
    saveMutation.mutate({ storeId, ...form })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button onClick={() => processMutation.mutate()} className="btn-secondary flex items-center gap-2">
          <Clock size={16} /> {t('marketing.processNow')}
        </button>
      </div>

      <div className="card max-w-2xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-yellow-500" />
              <div>
                <div className="font-medium">{t('marketing.pointsExpiryEnabled')}</div>
                <div className="text-sm text-gray-500">{t('marketing.pointsExpiryDesc')}</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => setForm({ ...form, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.expiryMonths')}</label>
            <select
              value={form.expiryMonths}
              onChange={e => setForm({ ...form, expiryMonths: Number(e.target.value) })}
              className="input"
            >
              <option value={6}>6 {t('marketing.months')}</option>
              <option value={12}>12 {t('marketing.months')}</option>
              <option value={18}>18 {t('marketing.months')}</option>
              <option value={24}>24 {t('marketing.months')}</option>
              <option value={36}>36 {t('marketing.months')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.minPointsToExpire')}</label>
            <input
              type="number"
              value={form.minPointsToExpire}
              onChange={e => setForm({ ...form, minPointsToExpire: Number(e.target.value) })}
              className="input"
              min={0}
            />
            <p className="text-xs text-gray-500 mt-1">{t('marketing.minPointsHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('marketing.notificationDays')}</label>
            <input
              type="number"
              value={form.notificationDays}
              onChange={e => setForm({ ...form, notificationDays: Number(e.target.value) })}
              className="input"
              min={1}
            />
            <p className="text-xs text-gray-500 mt-1">{t('marketing.notificationDaysHint')}</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
