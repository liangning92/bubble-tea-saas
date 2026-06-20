import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hygieneApi } from '../../services/api'
import { Loader2, TrendingUp, TrendingDown, Calendar } from 'lucide-react'

export function HygieneStatsPage() {
  const { t } = useTranslation()
  const [dateRange, setDateRange] = useState('7') // 7, 14, 30 days

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['hygiene-stats-range', startDate, endDate],
    queryFn: () => hygieneApi.statsRange(startDate, endDate)
  })

  const stats = statsData?.data?.trend || []

  // Calculate summary
  const totalTasks = stats.reduce((sum: number, s: any) => sum + s.total, 0)
  const totalCompleted = stats.reduce((sum: number, s: any) => sum + s.completed, 0)
  const overallRate = totalTasks > 0 ? Math.round(totalCompleted / totalTasks * 100) : 0

  // Find best and worst days
  const sortedByRate = [...stats].sort((a: any, b: any) => b.completionRate - a.completionRate)
  const bestDay = sortedByRate[0]
  const worstDay = sortedByRate[sortedByRate.length - 1]

  // Calculate trend
  const halfLen = Math.floor(stats.length / 2)
  const firstHalf = stats.slice(0, halfLen)
  const secondHalf = stats.slice(halfLen)
  const firstHalfRate = firstHalf.length > 0
    ? firstHalf.reduce((sum: number, s: any) => sum + s.completionRate, 0) / firstHalf.length
    : 0
  const secondHalfRate = secondHalf.length > 0
    ? secondHalf.reduce((sum: number, s: any) => sum + s.completionRate, 0) / secondHalf.length
    : 0
  const trend = secondHalfRate - firstHalfRate

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />

        {/* Date Range Selector */}
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-gray-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="input w-32"
          >
            <option value="7">{t('hygiene.last7Days')}</option>
            <option value="14">{t('hygiene.last14Days')}</option>
            <option value="30">{t('hygiene.last30Days')}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
           <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <div className="text-3xl font-bold text-gray-900">{totalTasks}</div>
              <div className="text-sm text-gray-500 mt-1">{t('hygiene.totalTasks')}</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-success">{totalCompleted}</div>
              <div className="text-sm text-gray-500 mt-1">{t('hygiene.completedTasks')}</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-primary">{overallRate}%</div>
              <div className="text-sm text-gray-500 mt-1">{t('hygiene.overallCompletionRate')}</div>
            </div>
            <div className="card text-center">
              <div className={`text-3xl font-bold flex items-center justify-center gap-1 ${
                trend >= 0 ? 'text-success' : 'text-red-500'
              }`}>
                {trend >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                {Math.abs(trend).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500 mt-1">{t('hygiene.trend')}</div>
            </div>
          </div>

          {/* Best/Worst */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {bestDay && (
              <div className="card bg-green-50 border-green-200">
                <div className="text-sm text-green-600 font-medium">{t('hygiene.bestPerformance')}</div>
                <div className="text-lg font-bold text-green-700 mt-1">
                  {formatDate(bestDay.date)} - {bestDay.completionRate}%
                </div>
                <div className="text-sm text-green-600 mt-1">
                  {bestDay.completed}/{bestDay.total} {t('hygiene.tasks')}
                </div>
              </div>
            )}
            {worstDay && worstDay.completionRate < 100 && (
              <div className="card bg-red-50 border-red-200">
                <div className="text-sm text-red-600 font-medium">{t('hygiene.needsImprovement')}</div>
                <div className="text-lg font-bold text-red-700 mt-1">
                  {formatDate(worstDay.date)} - {worstDay.completionRate}%
                </div>
                <div className="text-sm text-red-600 mt-1">
                  {worstDay.completed}/{worstDay.total} {t('hygiene.tasks')}
                </div>
              </div>
            )}
          </div>

          {/* Daily Chart */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-700 mb-4">{t('hygiene.dailyCompletionTrend')}</h3>
            <div className="h-48 flex items-end gap-1">
              {stats.map((day: any, idx: number) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary/20 hover:bg-primary/30 transition-colors rounded-t"
                    style={{ height: `${day.completionRate}%` }}
                    title={`${day.date}: ${day.completionRate}%`}
                  />
                  {idx % Math.ceil(stats.length / 7) === 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(day.date)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Y-axis labels */}
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}