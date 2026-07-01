import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { Star, Save, RefreshCw } from 'lucide-react'

interface TierMultiplier {
  bronze: number
  silver: number
  gold: number
  diamond: number
}

export function PointsRuleConfigPage() {
  const { t } = useTranslation()
  const { token, user } = useAuthStore()
  const [, setRule] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    pointsPerRupiah: 10000,
    minPurchase: 0,
    birthdayMultiplier: 2.0,
    isActive: true,
    tierMultipliers: {
      bronze: 1,
      silver: 1.2,
      gold: 1.5,
      diamond: 2
    } as TierMultiplier
  })

  const loadRule = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('storeId', user?.storeId || '')
      const res = await fetch(`/api/points-rules?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200 && data.data) {
        setRule(data.data)
        const tierMultipliers = JSON.parse(data.data.tierMultiplier || '{"bronze":1,"silver":1.2,"gold":1.5,"diamond":2}')
        setFormData({
          pointsPerRupiah: data.data.pointsPerRupiah,
          minPurchase: data.data.minPurchase,
          birthdayMultiplier: data.data.birthdayMultiplier,
          isActive: data.data.isActive,
          tierMultipliers
        })
      }
    } catch (error) {
      console.error('Failed to load points rule:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadRule()
  }, [token])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/points-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          pointsPerRupiah: formData.pointsPerRupiah,
          minPurchase: formData.minPurchase,
          birthdayMultiplier: formData.birthdayMultiplier,
          tierMultiplier: JSON.stringify(formData.tierMultipliers),
          isActive: formData.isActive
        })
      })
      const data = await res.json()
      if (data.code === 200) {
        alert(t('common.success'))
        loadRule()
      } else {
        alert(data.message || 'Failed to save')
      }
    } catch (error) {
      console.error('Failed to save:', error)
      alert(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const updateTierMultiplier = (tier: keyof TierMultiplier, value: string) => {
    const numValue = parseFloat(value) || 0
    setFormData({
      ...formData,
      tierMultipliers: {
        ...formData.tierMultipliers,
        [tier]: numValue
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Star size={28} className="text-primary" />
          <h1 className="text-xl font-bold">{t('staff.pointsRuleConfig')}</h1>
        </div>
        <button onClick={loadRule} className="btn-secondary">
          <RefreshCw size={18} className="mr-2" />
          {t('common.refresh')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
        <div className="mb-6 pb-6 border-b border-gray-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="font-medium">{t('staff.pointsEnabled')}</span>
          </label>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('staff.pointsPerRupiah')}
          </label>
          <input
            type="number"
            value={formData.pointsPerRupiah}
            onChange={(e) => setFormData({ ...formData, pointsPerRupiah: parseInt(e.target.value) || 0 })}
            className="input w-full"
            min="1000"
            step="1000"
          />
          <p className="text-xs text-gray-500 mt-1">{t('staff.pointsPerRupiahHint')}</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('staff.minPurchase')}
          </label>
          <input
            type="number"
            value={formData.minPurchase}
            onChange={(e) => setFormData({ ...formData, minPurchase: parseInt(e.target.value) || 0 })}
            className="input w-full"
            min="0"
            step="1000"
          />
          <p className="text-xs text-gray-500 mt-1">{t('staff.minPurchaseHint')}</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('staff.birthdayMultiplier')}
          </label>
          <input
            type="number"
            value={formData.birthdayMultiplier}
            onChange={(e) => setFormData({ ...formData, birthdayMultiplier: parseFloat(e.target.value) || 1 })}
            className="input w-full"
            min="1"
            max="5"
            step="0.1"
          />
          <p className="text-xs text-gray-500 mt-1">{t('staff.birthdayMultiplierHint')}</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('staff.tierMultipliers')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            {(['bronze', 'silver', 'gold', 'diamond'] as const).map(tier => (
              <div key={tier}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">
                  {tier}
                </label>
                <input
                  type="number"
                  value={formData.tierMultipliers[tier]}
                  onChange={(e) => updateTierMultiplier(tier, e.target.value)}
                  className="input w-full"
                  min="0.1"
                  max="10"
                  step="0.1"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">{t('staff.tierMultipliersHint')}</p>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}