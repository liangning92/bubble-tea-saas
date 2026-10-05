import { useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { memberApi } from '../../services/api'
import { formatCurrency, formatDateTime } from '../../utils/helpers'
import { ArrowLeft, Gift, History, Award, Filter } from 'lucide-react'

const POINT_TYPE_LABELS: Record<string, string> = {
  earn: 'Earned',
  redeem: 'Redeemed',
  adjust: 'Adjusted',
  expire: 'Expired',
  coupon: 'Coupon'
}

export function MemberDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [redeemPoints, setRedeemPoints] = useState('')
  const [showRedeem, setShowRedeem] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [ordersPage, setOrdersPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['member', id, filterType, ordersPage],
    queryFn: () => memberApi.get(id!, { ...(filterType ? { type: filterType } : {}), ordersPage }),
    enabled: !!id
  })

  const redeemMutation = useMutation({
    mutationFn: (points: number) => memberApi.redeemPoints(id!, points),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member', id] })
      setShowRedeem(false)
      setRedeemPoints('')
    }
  })

  const member = data?.data?.data

  if (isLoading) return <div className="text-center py-8">{t('common.loading')}</div>
  if (!member) return <div className="text-center py-8">{t('common.noData')}</div>

  const levelColors: Record<string, string> = {
    bronze: 'bg-amber-100 text-amber-700',
    silver: 'bg-gray-200 text-gray-700',
    gold: 'bg-yellow-100 text-yellow-700',
    diamond: 'bg-blue-100 text-blue-700'
  }

  const getPointTypeLabel = (type: string) => {
    return t(`members.pointTypes.${type}`) || POINT_TYPE_LABELS[type] || type
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={location.pathname.startsWith('/marketing/') ? '/marketing/members' : '/members'} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-900">{member.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Member Info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${levelColors[member.level] || levelColors.bronze}`}>
                {member.level?.toUpperCase() || 'BRONZE'}
              </span>
              <span className="text-sm text-gray-500">{t('members.id')}: {member.id}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">{t('members.phone')}:</span> <span className="font-medium">{member.phone}</span></div>
              <div><span className="text-gray-500">{t('members.birthday')}:</span> <span className="font-medium">{member.birthday || '-'}</span></div>
              <div><span className="text-gray-500">{t('members.email', 'Email')}:</span> <span className="font-medium">{member.email || '-'}</span></div>
              <div><span className="text-gray-500">{t('members.points')}:</span> <span className="font-medium text-primary">{member.points?.toLocaleString()}</span></div>
              <div><span className="text-gray-500">{t('members.totalSpent')}:</span> <span className="font-medium">{formatCurrency(member.totalSpent || 0)}</span></div>
              <div><span className="text-gray-500">{t('members.balance', 'Balance')}:</span> <span className="font-medium">{formatCurrency(member.balance || 0)}</span></div>
              <div><span className="text-gray-500">{t('members.status', 'Status')}:</span> <span className="font-medium">{member.status || '-'}</span></div>
              <div><span className="text-gray-500">{t('members.referralCode', 'Referral code')}:</span> <span className="font-medium">{member.referralCode || '-'}</span></div>
              <div><span className="text-gray-500">{t('members.memberSince')}:</span> <span className="font-medium">{member.createdAt ? formatDateTime(member.createdAt) : '-'}</span></div>
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">{t('members.coupons', 'Coupons')} ({member.coupons?.length || 0})</h2>
            {member.coupons?.length ? (
              <div className="divide-y">
                {member.coupons.map((entry: any) => (
                  <div key={entry.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium">{entry.coupon?.code || '-'}</p>
                      <p className="text-gray-500">{entry.coupon?.type || '-'} · {entry.coupon?.value ?? '-'}</p>
                      <p className="text-xs text-gray-400">{entry.coupon?.validUntil ? formatDateTime(entry.coupon.validUntil) : '-'}</p>
                    </div>
                    <span className={`badge ${entry.status === 'unused' ? 'badge-success' : 'badge'}`}>{entry.status}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-center py-4 text-gray-500">{t('common.noData')}</p>}
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">{t('members.orders', 'Orders')} ({member.orderCount || 0})</h2>
            {member.orders?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">{t('orders.orderNumber')}</th><th>{t('orders.date')}</th><th>{t('orders.status')}</th><th className="text-right">{t('orders.amount')}</th></tr></thead>
                  <tbody>{member.orders.map((order: any) => (
                    <tr key={order.id} className="border-b last:border-0"><td className="py-2 font-mono">{order.orderNumber}</td><td>{formatDateTime(order.createdAt)}</td><td>{order.status}</td><td className="text-right">{formatCurrency(order.finalAmount ?? order.totalAmount)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="text-center py-4 text-gray-500">{t('common.noData')}</p>}
            {member.orderCount > 20 && <div className="mt-3 flex items-center justify-between text-sm"><span className="text-gray-500">{t('common.page', 'Page')} {member.ordersPage} / {Math.ceil(member.orderCount / member.ordersPageSize)}</span><div className="flex gap-2"><button className="btn btn-outline btn-sm" disabled={ordersPage <= 1} onClick={() => setOrdersPage(p => Math.max(1, p - 1))}>{t('common.previous', 'Previous')}</button><button className="btn btn-outline btn-sm" disabled={ordersPage * member.ordersPageSize >= member.orderCount} onClick={() => setOrdersPage(p => p + 1)}>{t('common.next', 'Next')}</button></div></div>}
          </div>

          {/* Points History */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><History size={18} /> {t('members.pointsHistory')}</h2>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="input py-1 px-2 text-sm"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="earn">{t('members.pointTypes.earn')}</option>
                  <option value="redeem">{t('members.pointTypes.redeem')}</option>
                  <option value="adjust">{t('members.pointTypes.adjust')}</option>
                  <option value="expire">{t('members.pointTypes.expire')}</option>
                  <option value="coupon">{t('members.pointTypes.coupon')}</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {member.pointLogs?.length > 0 ? member.pointLogs.map((log: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{getPointTypeLabel(log.type)}</p>
                    <p className="text-gray-500 text-xs">{formatDateTime(log.createdAt)}</p>
                    {log.note && <p className="text-gray-400 text-xs mt-1">{log.note}</p>}
                    {log.orderId && <p className="text-gray-400 text-xs">Order: {log.orderId.slice(0, 8)}...</p>}
                  </div>
                  <span className={`font-medium ${log.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {log.points > 0 ? '+' : ''}{log.points}
                  </span>
                </div>
              )) : (
                <p className="text-gray-500 text-center py-4">{t('common.noData')}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Gift size={18} /> {t('members.quickActions')}</h2>
            {!showRedeem ? (
              <button onClick={() => setShowRedeem(true)} className="btn-primary w-full">{t('members.redeemPoints')}</button>
            ) : (
              <div className="space-y-3">
                <input type="number" value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} placeholder={t('members.pointsToRedeem')} className="input" />
                <button onClick={() => redeemMutation.mutate(parseInt(redeemPoints))} disabled={redeemMutation.isPending} className="btn-primary w-full">
                  {redeemMutation.isPending ? t('common.loading') : t('common.confirm')}
                </button>
                <button onClick={() => setShowRedeem(false)} className="btn-secondary w-full">{t('common.cancel')}</button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Award size={18} /> {t('members.memberStats')}</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{t('members.totalVisits')}</span><span className="font-medium">{member.visitCount || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('members.lastVisit')}</span><span className="font-medium">{member.lastVisit ? formatDateTime(member.lastVisit) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('members.memberSince')}</span><span className="font-medium">{member.createdAt ? formatDateTime(member.createdAt) : '-'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
