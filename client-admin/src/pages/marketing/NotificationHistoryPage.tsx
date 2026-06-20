import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { marketingApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Bell, Check, Search } from 'lucide-react'

const NOTIFICATION_TYPES = [
  { key: 'all', label: 'all' },
  { key: 'birthday', label: 'birthday' },
  { key: 'reactivation', label: 'reactivation' },
  { key: 'points_expiring', label: 'pointsExpiring' },
  { key: 'referral', label: 'referral' },
  { key: 'promotion', label: 'promotion' },
  { key: 'tier_upgrade', label: 'tierUpgrade' }
]

const STATUS_OPTIONS = [
  { key: 'all', label: 'allStatuses' },
  { key: 'read', label: 'read' },
  { key: 'unread', label: 'unread' }
]

export function NotificationHistoryPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const storeId = user?.storeId || 'default'

  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => marketingApi.notifications({ storeId, limit: 100 })
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => marketingApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => marketingApi.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const notifications = data?.data?.list || []

  // Filter notifications
  const filteredNotifications = notifications.filter((n: any) => {
    const matchType = filterType === 'all' || n.type === filterType
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'read' && n.status === 'read') ||
      (filterStatus === 'unread' && n.status !== 'read')
    const matchSearch = !searchKeyword ||
      n.title?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      n.message?.toLowerCase().includes(searchKeyword.toLowerCase())
    return matchType && matchStatus && matchSearch
  })

  const unreadCount = notifications.filter((n: any) => n.status !== 'read').length

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      birthday: 'badge-warning',
      reactivation: 'badge-info',
      points_expiring: 'bg-orange-100 text-orange-800',
      referral: 'badge-primary',
      promotion: 'badge-success',
      tier_upgrade: 'bg-purple-100 text-purple-800'
    }
    return colors[type] || 'badge-gray'
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500">
              {unreadCount} {t('marketing.unreadNotifications')}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            <Check size={16} />
            {t('marketing.markAllRead')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('marketing.searchNotifications')}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input w-auto"
        >
          {NOTIFICATION_TYPES.map(type => (
            <option key={type.key} value={type.key}>
              {type.key === 'all' ? t('marketing.allTypes') : t(`marketing.${type.label}`)}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input w-auto"
        >
          {STATUS_OPTIONS.map(status => (
            <option key={status.key} value={status.key}>
              {t(`marketing.${status.label}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{notifications.length}</div>
          <div className="text-sm text-gray-500">{t('marketing.totalNotifications')}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
          <div className="text-sm text-gray-500">{t('marketing.unread')}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{notifications.length - unreadCount}</div>
          <div className="text-sm text-gray-500">{t('marketing.read')}</div>
        </div>
      </div>

      {/* Notification List */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Bell size={48} className="mb-4 opacity-50" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((n: any) => (
              <div
                key={n.id}
                className={`p-4 rounded-lg flex items-start gap-3 transition-colors ${
                  n.status === 'read' ? 'bg-gray-50' : 'bg-white border border-primary/20 hover:bg-primary/5'
                }`}
              >
                <div className={`p-2 rounded-lg ${n.status === 'read' ? 'bg-gray-100' : 'bg-primary/10'}`}>
                  <Bell size={20} className={n.status === 'read' ? 'text-gray-400' : 'text-primary'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${getTypeColor(n.type)}`}>
                      {t(`marketing.${n.type === 'points_expiring' ? 'pointsExpiring' : n.type === 'tier_upgrade' ? 'tierUpgrade' : n.type}`)}
                    </span>
                    <span className="text-sm text-gray-500">{formatDate(n.createdAt)}</span>
                    {n.status !== 'read' && (
                      <span className="badge badge-primary text-xs">{t('marketing.unread')}</span>
                    )}
                  </div>
                  <div className="font-medium mt-1">{n.title}</div>
                  <div className="text-sm text-gray-600 mt-1">{n.message}</div>
                  {n.member && (
                    <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <span className="font-medium">{t('marketing.member')}:</span>
                      <span>{n.member.name}</span>
                      {n.member.phone && <span>({n.member.phone})</span>}
                    </div>
                  )}
                </div>
                {n.status !== 'read' && (
                  <button
                    onClick={() => markReadMutation.mutate(n.id)}
                    className="btn-ghost text-sm flex items-center gap-1"
                    title={t('marketing.markRead')}
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
