import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Crown, Medal, Gem, Circle } from 'lucide-react'

type TierLevel = 'bronze' | 'silver' | 'gold' | 'diamond'

const TIERS: TierLevel[] = ['bronze', 'silver', 'gold', 'diamond']
const TIER_ICONS: Record<TierLevel, JSX.Element> = {
  bronze: <Circle size={20} className="text-orange-400" />,
  silver: <Medal size={20} className="text-gray-400" />,
  gold: <Crown size={20} className="text-yellow-500" />,
  diamond: <Gem size={20} className="text-blue-400" />
}

const DEFAULT_BENEFITS: Record<TierLevel, { pointsRate: number; discountPercent: number; pointsToUpgrade: number | null; description: string }> = {
  bronze: { pointsRate: 1.0, discountPercent: 0, pointsToUpgrade: 1000, description: '' },
  silver: { pointsRate: 1.2, discountPercent: 2, pointsToUpgrade: 5000, description: '' },
  gold: { pointsRate: 1.5, discountPercent: 5, pointsToUpgrade: 15000, description: '' },
  diamond: { pointsRate: 2.0, discountPercent: 10, pointsToUpgrade: null, description: '' }
}

export function TierBenefitsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || ''

  const [benefits, setBenefits] = useState(DEFAULT_BENEFITS)

  const { data, isLoading } = useQuery({
    queryKey: ['tier-benefits', user?.storeId],
    queryFn: () => marketingApi.tierBenefits(user?.storeId || '')
  })

  // Sync form state when data loads
  useEffect(() => {
    if (data?.data?.data?.list) {
      const fetched = data.data.data.list
      const merged = { ...DEFAULT_BENEFITS }
      TIERS.forEach(tier => {
        const fb = fetched.find((b: any) => b.level === tier)
        if (fb) {
          merged[tier] = {
            pointsRate: fb.pointsRate ?? DEFAULT_BENEFITS[tier].pointsRate,
            discountPercent: fb.discountPercent ?? DEFAULT_BENEFITS[tier].discountPercent,
            pointsToUpgrade: fb.pointsToUpgrade ?? DEFAULT_BENEFITS[tier].pointsToUpgrade,
            description: fb.description ?? ''
          }
        }
      })
      setBenefits(merged)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (payload: any) => marketingApi.createTierBenefit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier-benefits'] })
    },
    onError: () => {
      alert(t('common.error'))
    }
  })

  const handleSave = (level: TierLevel) => {
    saveMutation.mutate({
      storeId,
      level,
      ...benefits[level]
    })
  }

  const handleChange = (level: TierLevel, field: string, value: any) => {
    setBenefits(prev => ({
      ...prev,
      [level]: { ...prev[level], [field]: value }
    }))
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TIERS.map((tier) => (
          <div key={tier} className="card">
            <div className="flex items-center gap-3 mb-4">
              {TIER_ICONS[tier]}
              <h3 className="text-lg font-semibold capitalize">{tier}</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.pointsRate')} (x{tier})</label>
                <input
                  type="number"
                  step="0.1"
                  value={benefits[tier].pointsRate}
                  onChange={e => handleChange(tier, 'pointsRate', Number(e.target.value))}
                  className="input"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.discountPercent')} (%)</label>
                <input
                  type="number"
                  value={benefits[tier].discountPercent}
                  onChange={e => handleChange(tier, 'discountPercent', Number(e.target.value))}
                  className="input"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.pointsToUpgrade')}</label>
                <input
                  type="number"
                  value={benefits[tier].pointsToUpgrade ?? ''}
                  onChange={e => handleChange(tier, 'pointsToUpgrade', e.target.value ? Number(e.target.value) : null)}
                  className="input"
                  placeholder={tier === 'diamond' ? t('marketing.topTier') : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('marketing.description')}</label>
                <input
                  type="text"
                  value={benefits[tier].description || ''}
                  onChange={e => handleChange(tier, 'description', e.target.value)}
                  className="input"
                />
              </div>
              <button
                onClick={() => handleSave(tier)}
                disabled={saveMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {saveMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                {t('common.save')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}