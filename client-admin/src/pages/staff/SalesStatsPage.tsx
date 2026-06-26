import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { RefreshCw, TrendingUp, Award } from 'lucide-react'

interface SalesStat {
  staffId: string
  name: string
  orderCount: number
  revenue: number
}

export function SalesStatsPage() {
  const { t } = useTranslation()
  const { user, token } = useAuthStore()
  const [stats, setStats] = useState<SalesStat[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [totalRevenue, setTotalRevenue] = useState(0)

  useEffect(() => {
    loadStats()
  }, [user, month])

  const loadStats = async () => {
    setLoading(true)
    try {
      const [year, monthNum] = month.split('-').map(Number)
      const response = await fetch(`/api/staff-management/sales-stats?month=${monthNum}&year=${year}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.code === 200) {
        setStats(data.data || [])
        const total = (data.data || []).reduce((sum: number, s: SalesStat) => sum + s.revenue, 0)
        setTotalRevenue(total)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getTopPercentage = (revenue: number) => {
    if (totalRevenue === 0) return 0
    return Math.round((revenue / totalRevenue) * 100)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('staff.salesStats') || '销售业绩'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('staff.salesStatsDesc') || '查看员工销售业绩和排行榜'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="input w-40"
          />
          <button onClick={loadStats} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('staff.totalRevenue') || '总销售额'}</p>
              <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Award size={24} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('staff.topPerformer') || '销售冠军'}</p>
              <p className="text-xl font-bold">{stats[0]?.name || '-'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp size={24} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('staff.avgPerOrder') || '平均订单金额'}</p>
              <p className="text-xl font-bold">
                {stats.length > 0
                  ? formatCurrency(Math.round(totalRevenue / stats.reduce((sum, s) => sum + s.orderCount, 0)))
                  : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h2 className="font-semibold">{t('staff.leaderboard') || '业绩排行榜'}</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t('staff.noData') || '暂无数据'}
          </div>
        ) : (
          <div className="divide-y">
            {stats.map((stat, index) => (
              <div key={stat.staffId} className="px-6 py-4 flex items-center gap-4">
                {/* Rank */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  index === 0 ? 'bg-yellow-100 text-yellow-600' :
                  index === 1 ? 'bg-gray-200 text-gray-600' :
                  index === 2 ? 'bg-orange-100 text-orange-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {index + 1}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="font-medium">{stat.name}</div>
                  <div className="text-sm text-gray-500">
                    {stat.orderCount} {t('staff.orders') || '订单'}
                  </div>
                </div>

                {/* Revenue */}
                <div className="text-right">
                  <div className="font-bold text-lg">{formatCurrency(stat.revenue)}</div>
                  <div className="text-sm text-gray-500">
                    {getTopPercentage(stat.revenue)}% {t('staff.ofTotal') || '占比'}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-32">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        index === 0 ? 'bg-yellow-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-orange-400' :
                        'bg-primary'
                      }`}
                      style={{ width: `${getTopPercentage(stat.revenue)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}