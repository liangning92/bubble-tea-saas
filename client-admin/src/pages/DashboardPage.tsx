import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { reportApi, posActionLogApi } from '../services/api'
import { formatCurrency } from '../utils/helpers'
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Loader2,
  Target,
  UserPlus,
  Award,
  Clock,
} from 'lucide-react'

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
  trendKey
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  color: string
  trend?: number
  trendKey?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
          {trend !== undefined && trend !== 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend > 0 ? '+' : ''}{trend}% {trendKey ? t(trendKey) : t('dashboard.vsYesterday')}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  )
}

// ========== POS 操作预警组件 ==========
function POSAlertsWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: statsData } = useQuery({
    queryKey: ['pos-alert-stats'],
    queryFn: () => posActionLogApi.getStats(),
    refetchInterval: 30000, // Refresh every 30s
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['pos-active-sessions'],
    queryFn: () => posActionLogApi.getSessions(),
    refetchInterval: 10000, // Refresh every 10s
  })

  const stats = statsData?.data?.data
  const activeSessions = sessionsData?.data?.data || []
  const unhandledCount = (stats?.warningCount || 0) + (stats?.criticalCount || 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* 预警统计卡片 */}
      <div className="card flex items-center gap-4">
        <div className={`p-3 rounded-xl ${unhandledCount > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
          <AlertTriangle size={24} className={unhandledCount > 0 ? 'text-red-600' : 'text-green-600'} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('dashboard.posAlerts')}</p>
          <p className="text-2xl font-bold">
            {unhandledCount}
            <span className="text-sm font-normal text-gray-400 ml-1">
              ({stats?.warningCount || 0} ⚠ / {stats?.criticalCount || 0} 🔴)
            </span>
          </p>
        </div>
        <button
          onClick={() => navigate('/pos-monitor')}
          className="ml-auto text-sm text-primary hover:text-primary-hover font-medium"
        >
          {t('dashboard.viewAll')} →
        </button>
      </div>

      {/* 今日操作总数 */}
      <div className="card flex items-center gap-4">
        <div className="p-3 rounded-xl bg-blue-100">
          <Clock size={24} className="text-blue-600" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('dashboard.posOperations')}</p>
          <p className="text-2xl font-bold">{stats?.todayTotal || 0}</p>
        </div>
      </div>

      {/* 未完成订单 */}
      <div className="card flex items-center gap-4">
        <div className={`p-3 rounded-xl ${activeSessions.length > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
          <ShoppingCart size={24} className={activeSessions.length > 0 ? 'text-orange-600' : 'text-green-600'} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('dashboard.activeSessions')}</p>
          <p className="text-2xl font-bold">{activeSessions.length}</p>
          {activeSessions.length > 0 && (
            <p className="text-xs text-orange-500 mt-1">
              {activeSessions[0]?.staffName} - {t('dashboard.unpaidItems', { count: activeSessions[0]?.itemCount || 0 })}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/pos-monitor')}
          className="ml-auto text-sm text-primary hover:text-primary-hover font-medium"
        >
          {t('dashboard.viewDetails')} →
        </button>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportApi.dashboard()
  })

  const dashboard = data?.data?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('dashboard.title')}
      </h1>

      {/* ========== 今日核心数据 ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title={t('dashboard.todayOrders')}
          value={dashboard?.today?.orders || 0}
          subtitle={t('dashboard.orders')}
          icon={ShoppingCart}
          color="bg-primary"
          trend={dashboard?.today?.compareWithYesterday?.ordersChange}
          trendKey="dashboard.vsYesterday"
        />
        <StatCard
          title={t('dashboard.todayRevenue')}
          value={formatCurrency(dashboard?.today?.revenue || 0)}
          subtitle={`${t('dashboard.avg')} ${formatCurrency(dashboard?.today?.averageOrder || 0)}`}
          icon={DollarSign}
          color="bg-success"
          trend={dashboard?.today?.compareWithYesterday?.revenueChange}
          trendKey="dashboard.vsYesterday"
        />
        <StatCard
          title={t('dashboard.todayProfit')}
          value={formatCurrency(dashboard?.today?.profit || 0)}
          subtitle={`${t('dashboard.cost')}: ${formatCurrency(dashboard?.today?.cost || 0)}`}
          icon={TrendingUp}
          color="bg-info"
        />
        <StatCard
          title={t('dashboard.todayNewMembers')}
          value={dashboard?.member?.newMembers || 0}
          subtitle={`${dashboard?.member?.ratio || 0} ${t('dashboard.memberOrdersRatio')}`}
          icon={UserPlus}
          color="bg-warning"
        />
      </div>

      {/* ========== 本月累计 + 目标进度 ========== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <DollarSign size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.monthRevenue')}</p>
              <p className="text-2xl font-bold">{formatCurrency(dashboard?.thisMonth?.revenue || 0)}</p>
              <p className="text-xs text-gray-400">
                {t('dashboard.profit')}: {formatCurrency(dashboard?.thisMonth?.profit || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-success/10">
              <TrendingUp size={24} className="text-success" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.monthOrders')}</p>
              <p className="text-2xl font-bold">{dashboard?.thisMonth?.orders || 0}</p>
              <p className="text-xs text-gray-400">{t('dashboard.thisMonth')}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-warning/10">
              <Target size={24} className="text-warning" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">{t('dashboard.goalProgress')}</p>
                <p className="text-sm font-bold text-warning">{dashboard?.thisMonth?.goalProgress || 0}%</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-warning h-2 rounded-full transition-all"
                  style={{ width: `${dashboard?.thisMonth?.goalProgress || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== 左侧：热销产品 + 库存预警 ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 热销产品TOP5 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Award size={20} className="text-warning" />
              {t('dashboard.topProducts')}
            </h2>
          </div>
          {dashboard?.topProducts?.length > 0 ? (
            <div className="space-y-3">
              {dashboard.topProducts.map((product: any, index: number) => (
                <div key={product.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-yellow-400 text-white' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-amber-600 text-white' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <span className="text-sm text-gray-500">{product.quantity} cups</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
          )}
        </div>

        {/* 库存预警 - 基于预测消耗 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle size={20} className="text-error" />
              {t('dashboard.lowStockAlert')}
            </h2>
            <button
              onClick={() => navigate('/inventory/stock-alerts')}
              className="text-sm text-primary hover:text-primary-hover font-medium"
            >
              {t('dashboard.viewAll')} →
            </button>
          </div>
          {dashboard?.inventory?.lowStockItems?.length > 0 ? (
            <div className="space-y-2">
              {dashboard.inventory.lowStockItems.map((item: any) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    item.urgency === 'critical' ? 'bg-red-50 border border-red-200' :
                    item.urgency === 'warning' ? 'bg-orange-50 border border-orange-200' :
                    'bg-gray-50'
                  }`}
                >
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-sm text-gray-500 ml-2">({item.unit})</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${
                      item.urgency === 'critical' ? 'text-red-600' :
                      item.urgency === 'warning' ? 'text-orange-600' : 'text-gray-600'
                    }`}>
                      {item.daysLeft} {t('bom.days')}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      ({item.currentStock} {item.unit})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">{t('dashboard.noLowStockItems')}</p>
          )}
        </div>
      </div>

      {/* ========== 消耗异常预警 ========== */}
      {dashboard?.inventory?.consumptionAnomalies?.length > 0 && (
        <div className="card border-orange-200 bg-orange-50/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-orange-700">
              <AlertTriangle size={20} />
              {t('dashboard.consumptionAnomaly')}
            </h2>
            <button
              onClick={() => navigate('/inventory/consumption-analysis')}
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              {t('dashboard.viewAll')} →
            </button>
          </div>
          <div className="space-y-2">
            {dashboard.inventory.consumptionAnomalies.map((item: any) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  item.status === 'critical' ? 'bg-red-100 border border-red-300' :
                  item.status === 'warning' ? 'bg-yellow-100 border border-yellow-300' :
                  'bg-green-50 border border-green-200'
                }`}
              >
                <div>
                  <span className="font-medium">{item.name}</span>
                  <div className="text-xs text-gray-500 mt-1">
                    {t('dashboard.theoretical')} {item.theoretical?.toFixed(1)} {item.unit} vs{' '}
                    {t('dashboard.actual')} {item.actual?.toFixed(1)} {item.unit}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`font-bold text-lg ${
                    item.status === 'critical' ? 'text-red-600' :
                    item.status === 'warning' ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {item.variance >= 0 ? '+' : ''}{item.variancePercent?.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== 员工 + 会员情况 ========== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-100">
            <Users size={24} className="text-success" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('dashboard.staffPresent')}</p>
            <p className="text-2xl font-bold">
              {dashboard?.staff?.checkedIn || 0} / {dashboard?.staff?.total || 0}
            </p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-orange-100">
            <AlertTriangle size={24} className="text-orange-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('dashboard.pendingLeave')}</p>
            <p className="text-2xl font-bold">{dashboard?.staff?.pendingLeave || 0}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-100">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('dashboard.lowStock')}</p>
            <p className="text-2xl font-bold text-red-600">
              {dashboard?.inventory?.criticalCount || 0}
              <span className="text-sm text-gray-400 font-normal"> / {dashboard?.inventory?.warningCount || 0} {t('dashboard.warning')}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ========== POS 操作预警 ========== */}
      <POSAlertsWidget />

      {/* ========== 最近订单 ========== */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('dashboard.recentOrders')}</h2>
          <button
            onClick={() => navigate('/orders')}
            className="text-sm text-primary hover:text-primary-hover font-medium"
          >
            {t('dashboard.viewAll')} →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">{t('dashboard.orderNumber')}</th>
                <th className="pb-3 font-medium">{t('dashboard.amount')}</th>
                <th className="pb-3 font-medium">{t('dashboard.payment')}</th>
                <th className="pb-3 font-medium">{t('dashboard.status')}</th>
                <th className="pb-3 font-medium">{t('dashboard.time')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard?.recentOrders?.map((order: any) => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/orders?id=${order.id}`)}
                  className="border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 font-mono text-sm">{order.orderNumber}</td>
                  <td className="py-3 font-medium">
                    {formatCurrency(order.finalAmount)}
                  </td>
                  <td className="py-3">
                    <span className="badge badge-info capitalize">
                      {order.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`badge ${
                      order.status === 'completed' ? 'badge-success' :
                      order.status === 'pending' ? 'badge-warning' :
                      order.status === 'refunded' ? 'badge-error' : 'badge-secondary'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                </tr>
              ))}
              {(!dashboard?.recentOrders || dashboard.recentOrders.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    {t('common.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}