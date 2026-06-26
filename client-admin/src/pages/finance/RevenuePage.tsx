import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { revenueApi, configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { formatCurrency } from '../../utils/helpers'
import { TrendingUp, TrendingDown, ShoppingBag, Bike, Store, Utensils, CreditCard, Calendar } from 'lucide-react'

interface ChannelData {
  channel: string
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  todayOrders: number
  weekOrders: number
  monthOrders: number
  todayAvgOrder: number
  weekAvgOrder: number
  monthAvgOrder: number
  // 对比数据
  todayChange: number
  weekChange: number
  monthChange: number
}

interface Summary {
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  todayOrders: number
  weekOrders: number
  monthOrders: number
  todayChange: number
  weekChange: number
  monthChange: number
}

const CHANNEL_ICONS: Record<string, any> = {
  pos: ShoppingBag,
  gofood: Bike,
  grabfood: Bike,
  shopee: ShoppingBag,
  tokopedia: Store,
  dine_in: Utensils,
  takeaway: Store,
  cash: CreditCard,
  default: Store
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS',
  gofood: 'GoFood',
  grabfood: 'GrabFood',
  shopee: 'ShopeeFood',
  tokopedia: 'Tokopedia',
  dine_in: 'Dine In',
  takeaway: 'Takeaway',
  cash: 'Cash',
  default: 'Other'
}

type Period = 'today' | 'week' | 'month' | 'custom'

export function RevenuePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [period, setPeriod] = useState<Period>('today')
  const [isLoading, setIsLoading] = useState(true)
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' })

  // Refs to avoid stale closure
  const periodRef = useRef(period)
  const customDateRangeRef = useRef(customDateRange)

  // Load user preference for default period
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const res = await configApi.get(user?.storeId || '')
        // API returns { code, data: [...] }, axios wraps as { data: { code, data: [...] } }
        const configs = res.data?.data?.data || []
        const pref = configs.find((c: any) => c.key === 'revenue.defaultPeriod')
        if (pref) {
          setPeriod(pref.value as Period)
          periodRef.current = pref.value as Period
        }
      } catch (e) {
        console.error('Failed to load preference:', e)
      }
    }
    loadPreference()
  }, [user])

  // Save preference when period changes
  const handlePeriodChange = async (newPeriod: Period) => {
    setPeriod(newPeriod)
    periodRef.current = newPeriod
    try {
      await configApi.set(user?.storeId || '', 'revenue.defaultPeriod', newPeriod, 'finance')
    } catch (e) {
      console.error('Failed to save preference:', e)
    }
  }

  useEffect(() => {
    loadData()
  }, [period, customDateRange])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const currentPeriod = periodRef.current
      const dateRange = customDateRangeRef.current

      // Determine date range params
      let params: any = { period: currentPeriod }
      if (currentPeriod === 'custom' && dateRange.start && dateRange.end) {
        params.startDate = dateRange.start
        params.endDate = dateRange.end
      }

      // Fetch all data in parallel
      const [todayRes, weekRes, monthRes, summaryRes] = await Promise.all([
        revenueApi.byChannel({ period: 'today' }),
        revenueApi.byChannel({ period: 'week' }),
        revenueApi.byChannel({ period: 'month' }),
        revenueApi.summary(params)
      ])

      // Merge channel data from3 periods
      const todayData = todayRes.data?.data || []
      const weekData = weekRes.data?.data || []
      const monthData = monthRes.data?.data || []
      const summaryData = summaryRes.data?.data || null

      // Build channel map
      const channelMap: Record<string, ChannelData> = {}

      // Process today data
      for (const item of todayData) {
        channelMap[item.channel] = {
          channel: item.channel,
          todayRevenue: item.revenue,
          todayOrders: item.orders,
          todayAvgOrder: item.avgOrderValue,
          todayChange: 0,
          weekRevenue: 0,
          weekOrders: 0,
          weekAvgOrder: 0,
          weekChange: 0,
          monthRevenue: 0,
          monthOrders: 0,
          monthAvgOrder: 0,
          monthChange: 0
        }
      }

      // Process week data
      for (const item of weekData) {
        if (!channelMap[item.channel]) {
          channelMap[item.channel] = {
            channel: item.channel,
            todayRevenue: 0,
            todayOrders: 0,
            todayAvgOrder: 0,
            todayChange: 0,
            weekRevenue: 0,
            weekOrders: 0,
            weekAvgOrder: 0,
            weekChange: 0,
            monthRevenue: 0,
            monthOrders: 0,
            monthAvgOrder: 0,
            monthChange: 0
          }
        }
        channelMap[item.channel].weekRevenue = item.revenue
        channelMap[item.channel].weekOrders = item.orders
        channelMap[item.channel].weekAvgOrder = item.avgOrderValue
      }

      // Process month data
      for (const item of monthData) {
        if (!channelMap[item.channel]) {
          channelMap[item.channel] = {
            channel: item.channel,
            todayRevenue: 0,
            todayOrders: 0,
            todayAvgOrder: 0,
            todayChange: 0,
            weekRevenue: 0,
            weekOrders: 0,
            weekAvgOrder: 0,
            weekChange: 0,
            monthRevenue: 0,
            monthOrders: 0,
            monthAvgOrder: 0,
            monthChange: 0
          }
        }
        channelMap[item.channel].monthRevenue = item.revenue
        channelMap[item.channel].monthOrders = item.orders
        channelMap[item.channel].monthAvgOrder = item.avgOrderValue
      }

      setChannels(Object.values(channelMap))
      setSummary(summaryData || null)
    } catch (error) {
      console.error('Failed to load revenue:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getChannelIcon = (channel: string) => {
    return CHANNEL_ICONS[channel] || CHANNEL_ICONS.default
  }

  const getChannelLabel = (channel: string) => {
    return CHANNEL_LABELS[channel] || channel
  }

  const renderChange = (change: number) => {
    if (change === 0 || isNaN(change)) {
      return <span className="text-gray-400">-</span>
    }
    const isPositive = change >= 0
    return (
      <span className={`flex items-center gap-0.5 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {Math.abs(change).toFixed(1)}%
      </span>
    )
  }

  const formatOrders = (data: ChannelData) => {
    // Return orders based on current period
    if (period === 'today') return data.todayOrders
    if (period === 'week') return data.weekOrders
    if (period === 'month') return data.monthOrders
    return data.monthOrders
  }

  const formatAvgOrder = (data: ChannelData) => {
    if (period === 'today') return data.todayAvgOrder
    if (period === 'week') return data.weekAvgOrder
    if (period === 'month') return data.monthAvgOrder
    return data.monthAvgOrder
  }

  const formatChange = (data: ChannelData) => {
    if (period === 'today') return data.todayChange
    if (period === 'week') return data.weekChange
    if (period === 'month') return data.monthChange
    return data.monthChange
  }

  // Calculate totals
  const totalToday = channels.reduce((sum, c) => sum + c.todayRevenue, 0)
  const totalWeek = channels.reduce((sum, c) => sum + c.weekRevenue, 0)
  const totalMonth = channels.reduce((sum, c) => sum + c.monthRevenue, 0)
  const totalOrders = channels.reduce((sum, c) => sum + c.monthOrders, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Period Selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handlePeriodChange('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              period === 'today'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('finance.today')}
          </button>
          <button
            onClick={() => handlePeriodChange('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              period === 'week'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('finance.thisWeek')}
          </button>
          <button
            onClick={() => handlePeriodChange('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              period === 'month'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('finance.thisMonth')}
          </button>
          <div className="h-6 w-px bg-gray-300 mx-1" />
          <button
            onClick={() => handlePeriodChange('custom')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${
              period === 'custom'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar size={14} />
            {t('finance.custom')}
          </button>
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customDateRange.start}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-gray-500">-</span>
              <input
                type="date"
                value={customDateRange.end}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">{t('finance.todayRevenue')}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalToday)}</p>
            {summary && renderChange(summary.todayChange)}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">{t('finance.weekRevenue')}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalWeek)}</p>
            {summary && renderChange(summary.weekChange)}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">{t('finance.monthRevenue')}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalMonth)}</p>
            {summary && renderChange(summary.monthChange)}
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm p-4 text-white">
            <p className="text-sm text-green-100">{t('finance.netRevenue')}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalMonth)}</p>
            <p className="text-xs text-green-100 mt-1">{totalOrders} {t('finance.orders')}</p>
          </div>
        </div>
      </div>

      {/* Revenue Table */}
      <div className="p-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              {t('finance.loading')}
            </div>
          ) : channels.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {t('finance.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.channel')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.todayRevenue')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.weekRevenue')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.monthRevenue')}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.orders')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.avgOrderValue')}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('finance.change')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {channels.map((channel) => {
                    const Icon = getChannelIcon(channel.channel)
                    return (
                      <tr key={channel.channel} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                              <Icon size={20} className="text-primary" />
                            </div>
                            <span className="font-medium text-gray-900">
                              {getChannelLabel(channel.channel)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(channel.todayRevenue)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {channel.todayOrders} {t('finance.orders')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(channel.weekRevenue)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {channel.weekOrders} {t('finance.orders')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(channel.monthRevenue)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {channel.monthOrders} {t('finance.orders')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium text-gray-900">
                            {formatOrders(channel)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-gray-900">
                            {formatCurrency(formatAvgOrder(channel))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {renderChange(formatChange(channel))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-3">
                      <span className="font-bold text-gray-900">{t('finance.total')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-gray-900">{formatCurrency(totalToday)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-gray-900">{formatCurrency(totalWeek)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-gray-900">{formatCurrency(totalMonth)}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-gray-900">{totalOrders}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-gray-900">
                        {totalOrders > 0 ? formatCurrency(Math.round(totalMonth / totalOrders)) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}