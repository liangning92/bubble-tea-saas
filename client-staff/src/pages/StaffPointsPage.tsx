import { useNavigate } from 'react-router-dom'
import { useDialogs } from '../components/Dialogs'
import { LoadFailure } from '../components/LoadFailure'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi, employeeApi } from '../services/api'
import { Star, Gift, History, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { formatDate } from '../utils/helpers'

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
  const navigate = useNavigate()
  const dialogs = useDialogs()

  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [compensation,setCompensation]=useState<any[]>([])
  const [shareMessage,setShareMessage]=useState('')
  const shareVoucher=async(code:string)=>{try{if(navigator.share)await navigator.share({title:t('voucher.title'),text:code});else{await navigator.clipboard.writeText(code);setShareMessage(t('voucher.copied'))}}catch(e:any){if(e.name!=='AbortError')setShareMessage(t('voucher.copyFailed'))}}
  const [currentTab, setCurrentTab] = useState<'history' | 'rewards'>('history')
  const [points, setPoints] = useState<any>(null)
  const [logs, setLogs] = useState<PointLog[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loadError, setLoadError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<string | null>(null)

  const loadData = async () => {
    setLoadError(false)
    setIsLoading(true)
    try {
      const [pointsRes, logsRes, rewardsRes,compensationRes] = await Promise.all([
        staffApi.getMyPoints(),
        staffApi.getMyPointLogs(),
        staffApi.getAvailableRewards(),
        employeeApi.get('/my/compensation')
      ])
      setCompensation(compensationRes)
      setPoints(pointsRes.data)
      setLogs(logsRes.data?.list || [])
      setRewards(rewardsRes.data || [])
    } catch (error) {
      setLoadError(true)
      console.error('Failed to load points:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleRedeem = async (reward: Reward) => {
    if (redeeming) return
    if (!await dialogs.confirm(t('staffPoints.confirmRedeem', { name: reward.name, points: reward.pointsCost }))) {
      return
    }

    setRedeeming(reward.id)
    try {
      await staffApi.redeemReward({ rewardId: reward.id })
      loadData()
    } catch (error: any) {
      await dialogs.alert(error?.response?.data?.message || t('staffPoints.redeemFailed'))
    } finally {
      setRedeeming(null)
    }
  }

  if (loadError) return <LoadFailure retry={loadData} />

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
          <button aria-label={t('common.back')} onClick={() => navigate('/profile')} className="p-2 bg-white/20 rounded-lg">
            ✕
          </button>
        </div>

        {/* Points Card */}
        <div className="bg-white/10 rounded-2xl p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Star className="text-yellow-300" size={32} />
            <span className="text-4xl font-bold">{points?.currentPoints || 0}</span>
          </div>
          <p className="text-white/80 text-base">{t('staffPoints.currentPoints')}</p>
          {!!points?.lifetimePoints && (
            <p className="text-white/60 text-sm mt-1">
              {t('staffPoints.lifetimePoints')}: {points.lifetimePoints}
            </p>
          )}
        </div>
      </header>
      <section className="p-4 space-y-4"><h2 className="text-xl font-bold">{t('voucher.wallet')}</h2>{shareMessage&&<p role="status">{shareMessage}</p>}{compensation.map(r=><article key={r.id} className="bg-white rounded-2xl p-5 space-y-3 border border-gray-100"><div className="flex justify-between gap-3"><strong>{r.rewardMethod==='voucher'?t('voucher.title'):t('compensation.'+r.type)}</strong><span>{r.month}</span></div><p className="text-2xl font-bold text-primary">Rp {r.amount.toLocaleString('id-ID')}</p><p>{r.reason}</p>{r.rewardMethod==='voucher'?<><p>{r.encouragement}</p><div className="rounded-xl bg-pink-50 p-3 font-mono break-all text-lg select-all">{r.voucherCode}</div><p>{t('voucher.'+(r.voucherStatus||r.status))} · {t('voucher.expires')} {formatDate(r.validUntil)}</p><p className="text-base text-gray-600">{t('voucher.rules')}</p>{r.voucherStatus==='active'&&<button type="button" className="w-full bg-primary text-white rounded-xl py-3 font-semibold" onClick={()=>void shareVoucher(r.voucherCode)}>{t('voucher.share')}</button>}</>:<p>{t('compensation.'+r.status)}</p>}</article>)}</section>

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
                      <p className="text-base text-gray-500">{formatDate(log.createdAt)}</p>
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
                        <p className="text-base text-gray-500">{reward.description}</p>
                      )}
                      <p className="text-base text-gray-500 mt-1">
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
                        className="mt-2 px-3 py-1 bg-primary text-white text-base rounded-lg disabled:opacity-50"
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
