import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pointsRuleApi } from '../../services/api'
import { Loader2, Info } from 'lucide-react'

interface PointsRule {
  id: string
  pointsPerRupiah: number
  minPurchase: number
  birthdayMultiplier: number
  tierMultiplier: string
  isActive: boolean
}

const DEFAULT_RULE: Omit<PointsRule, 'id'> = {
  pointsPerRupiah: 10000,
  minPurchase: 0,
  birthdayMultiplier: 2.0,
  tierMultiplier: JSON.stringify({ bronze: 1, silver: 1.2, gold: 1.5, diamond: 2 }),
  isActive: true
}

export function PointsRuleConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<Omit<PointsRule, 'id'>>(DEFAULT_RULE)
  const [tierMultiplier, setTierMultiplier] = useState<Record<string, number>>({
    bronze: 1,
    silver: 1.2,
    gold: 1.5,
    diamond: 2
  })

  // Fetch current rule
  const { data, isLoading } = useQuery({
    queryKey: ['points-rule'],
    queryFn: () => pointsRuleApi.get()
  })

  useEffect(() => {
    if (data?.data) {
      const rule = data.data
      setForm({
        pointsPerRupiah: rule.pointsPerRupiah,
        minPurchase: rule.minPurchase,
        birthdayMultiplier: rule.birthdayMultiplier,
        tierMultiplier: rule.tierMultiplier,
        isActive: rule.isActive
      })
      try {
        setTierMultiplier(JSON.parse(rule.tierMultiplier))
      } catch {}
    }
  }, [data])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) => pointsRuleApi.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points-rule'] })
      alert(t('common.success'))
    },
    onError: () => {
      alert(t('common.error'))
    }
  })

  const handleSave = () => {
    saveMutation.mutate({
      ...form,
      tierMultiplier: JSON.stringify(tierMultiplier)
    })
  }

  const updateTierMultiplier = (tier: string, value: number) => {
    setTierMultiplier(prev => ({ ...prev, [tier]: value }))
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  }

  return (
    <div>
      <div className="card max-w-2xl">
        {/* Info Banner */}
        <div className="flex gap-3 p-4 bg-blue-50 rounded-lg mb-4">
          <Info className="text-blue-500 flex-shrink-0" size={20} />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">{t('marketing.pointsRuleHint')}</p>
            <p>{t('marketing.pointsRuleDesc')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 每消费多少获得1积分 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('marketing.pointsPerRupiahLabel')}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Rp</span>
              <input
                type="number"
                value={form.pointsPerRupiah ?? 10000}
                onChange={e => setForm(f => ({ ...f, pointsPerRupiah: Number(e.target.value) }))}
                className="input w-40"
                min={1000}
                step={1000}
              />
              <span className="text-gray-500">= 1 {t('marketing.point')}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t('marketing.pointsPerRupiahHint')}
            </p>
          </div>

          {/* 最低消费门槛 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('marketing.minPurchaseLabel')}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Rp</span>
              <input
                type="number"
                value={form.minPurchase ?? 0}
                onChange={e => setForm(f => ({ ...f, minPurchase: Number(e.target.value) }))}
                className="input w-40"
                min={0}
                step={1000}
              />
              <span className="text-gray-500">{t('marketing.minPurchaseHint')}</span>
            </div>
          </div>

          {/* 生日月倍率 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('marketing.birthdayMultiplierLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={form.birthdayMultiplier}
                onChange={e => setForm(f => ({ ...f, birthdayMultiplier: Number(e.target.value) }))}
                className="input w-20"
                min={1}
                max={10}
                step={0.1}
              />
              <span className="text-gray-500">x {t('marketing.birthdayHint')}</span>
            </div>
          </div>

          {/* 等级倍率 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('marketing.tierMultiplierLabel')}
            </label>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(tierMultiplier).map(([tier, multiplier]) => (
                <div key={tier} className="flex items-center gap-2">
                  <span className={`badge ${
                    tier === 'bronze' ? 'bg-amber-100 text-amber-700' :
                    tier === 'silver' ? 'bg-gray-200 text-gray-700' :
                    tier === 'gold' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  } px-2 py-1 rounded capitalize`}>
                    {tier}
                  </span>
                  <input
                    type="number"
                    value={multiplier}
                    onChange={e => updateTierMultiplier(tier, Number(e.target.value))}
                    className="input w-20 text-center"
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                  <span className="text-gray-500 text-sm">x</span>
                </div>
              ))}
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="pt-4 border-t">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
