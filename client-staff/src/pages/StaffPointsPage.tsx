import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Star, Gift, History, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface PointLog {
  id: string
  type: string
  points: number
  description: string
  createdAt: string
  orderId?: string
}

interface Reward {
  id: string
  name: string
  pointsCost: number
  stock: number
  description?: string
}

export function StaffPointsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [currentTab, setCurrentTab] = useState<'history' | 'rewards'>('history')
  const [points, setPoints] = useState<any>(null)
  const [logs, setLogs] = useState<PointLog[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [pointsRes, logsRes, rewardsRes] = await Promise.all([
        staffApi.getMyPoints(),
        staffApi.getMyPointLogs(),
        staffApi.getAvailableRewards()
      ])
      setPoints(pointsRes.data?.data)
      setLogs(logsRes.data?.data?.list || [])
      setRewards(rewardsRes.data?.data || [])
    } catch (error) {
      console.error('Failed to load points:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleRedeem = async (reward: Reward) => {
    if (!confirm(t('staffPoints.confirmRedeem', { name: reward.name, points: reward.pointsCost }))) {
      return
    }

    setRedeeming(reward.id)
    try {
      await staffApi.redeemReward({ rewardId: reward.id })
      alert(t('staffPoints.redeemSuccess'))
      loadData()
    } catch (error: any) {
      alert(error?.response?.data?.message || t('staffPoints.redeemFailed'))
    } finally {
      setRedeeming(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{t('staffPoints.title')}</h1>
          <button onClick={() => window.history.back()} className="p-2 bg-white/20 rounded-lg">
            ✕
          </button>
        </div>

        {/* Points Card */}
        <div className="bg-white/10 rounded-2xl p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Star className="text-yellow-300" size={32} />
            <span className="text-4xl font-bold">{points?.currentPoints || 0}</span>
          </div>
          <p className="text-white/80 text-sm">{t('staffPoints.currentPoints')}</p>
          {points?.lifetimePoints && (
            <p className="text-white/60 text-xs mt-1">
              {t('staffPoints.lifetimePoints')}: {points.lifetimePoints}
            </p>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 p-4">
        <button
          onClick={() => setCurrentTab('history')}
          className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-2 ${
            currentTab === 'history'
              ? 'bg-primary text-white'
              : 'bg-white text-gray-600'
          }`}
        >
          <History size={18} />
          {t('staffPoints.history')}
        </button>
        <button
          onClick={() => setCurrentTab('rewards')}
          className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-2 ${
            currentTab === 'rewards'
              ? 'bg-primary text-white'
              : 'bg-white text-gray-600'
          }`}
        >
          <Gift size={18} />
          {t('staffPoints.rewards')}
        </button>
      </div>

      {/* Content */}
      {currentTab === 'history' ? (
        <div className="px-4">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <History size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t('staffPoints.noHistory')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{log.description}</p>
                      <p className="text-sm text-gray-500">{formatDate(log.createdAt)}</p>
                    </div>
                    <div className={`flex items-center gap-1 font-bold ${
                      log.points > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {log.points > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      {log.points > 0 ? '+' : ''}{log.points}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4">
          {rewards.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Gift size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t('staffPoints.noRewards')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rewards.map(reward => (
                <div key={reward.id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{reward.name}</p>
                      {reward.description && (
                        <p className="text-sm text-gray-500">{reward.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {t('staffPoints.stock')}: {reward.stock}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <Star size={14} />
                        {reward.pointsCost}
                      </div>
                      <button
                        onClick={() => handleRedeem(reward)}
                        disabled={redeeming === reward.id || reward.stock <= 0 || points?.currentPoints < reward.pointsCost}
                        className="mt-2 px-3 py-1 bg-primary text-white text-sm rounded-lg disabled:opacity-50"
                      >
                        {redeeming === reward.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          t('staffPoints.redeem')
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
