import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { ArrowLeft, Loader2, Users, CheckCircle, Clock, XCircle } from 'lucide-react'

export function ReferralDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['referral', id],
    queryFn: () => marketingApi.getReferral(id!),
    enabled: !!id
  })

  const { data: statsData } = useQuery({
    queryKey: ['referral-stats', id],
    queryFn: () => marketingApi.referralStats(id!),
    enabled: !!id
  })

  const referral = data?.data?.data
  const stats = statsData?.data?.data

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
  }

  if (!referral) {
    return <div className="text-center py-12 text-gray-500">{t('common.noData')}</div>
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'fulfilled': return <span className="badge badge-success flex items-center gap-1"><CheckCircle size={12} />{t('marketing.fulfilled') || 'Fulfilled'}</span>
      case 'pending': return <span className="badge badge-warning flex items-center gap-1"><Clock size={12} />{t('marketing.pending') || 'Pending'}</span>
      case 'cancelled': return <span className="badge badge-danger flex items-center gap-1"><XCircle size={12} />{t('marketing.cancelled') || 'Cancelled'}</span>
      default: return <span className="badge badge-gray">{status}</span>
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/marketing/referrals')} className="btn-ghost">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">{referral.name}</h1>
        <span className={`badge ${referral.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
          {referral.status}
        </span>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-3xl font-bold text-primary">{stats?.totalReferrals || 0}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.totalReferrals')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-success">{stats?.fulfilledInviterRewards || 0}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.fulfilledInviterRewards')}</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-info">{stats?.fulfilledRewardeeRewards || 0}</div>
          <div className="text-sm text-gray-500 mt-1">{t('marketing.fulfilledRewardeeRewards')}</div>
        </div>
      </div>

      {/* Campaign info */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">{t('marketing.referralCode')}: </span>
            <span className="font-mono font-medium">{referral.referralCode}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('marketing.startDate')}: </span>
            <span>{referral.startDate ? new Date(referral.startDate).toLocaleDateString('id-ID') : '-'}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('marketing.inviterReward')}: </span>
            <span>
              {(() => {
                try {
                  const r = JSON.parse(referral.inviterReward || '{}')
                  return `${r.value} ${r.type}`
                } catch { return '-' }
              })()}
            </span>
          </div>
          <div>
            <span className="text-gray-500">{t('marketing.rewardeeReward')}: </span>
            <span>
              {(() => {
                try {
                  const r = JSON.parse(referral.rewardeeReward || '{}')
                  return `${r.value} ${r.type}`
                } catch { return '-' }
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="card">
        <h3 className="font-semibold mb-4">{t('marketing.referralLogs')}</h3>
        {stats?.logs?.length > 0 ? (
          <div className="space-y-3">
            {stats.logs.map((log: any) => (
              <div key={log.id} className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-gray-400" />
                  <div>
                    <div className="font-medium">
                      {log.inviterMember?.name || 'Unknown'} → {log.rewardeeMember?.name || 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
                {getStatusBadge(log.inviterRewardStatus)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
        )}
      </div>
    </div>
  )
}