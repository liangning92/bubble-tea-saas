import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hygieneApi } from '../../services/api'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const AREAS = [
  { value: 'counter', label: '', color: 'bg-blue-100 text-blue-700' },
  { value: 'kitchen', label: '', color: 'bg-orange-100 text-orange-700' },
  { value: 'ingredients', label: '', color: 'bg-purple-100 text-purple-700' },
  { value: 'floor', label: '', color: 'bg-green-100 text-green-700' },
  { value: 'restroom', label: '', color: 'bg-red-100 text-red-700' },
  { value: 'waste', label: '', color: 'bg-gray-100 text-gray-700' },
]

const AREA_LABELS: Record<string, string> = {
  counter: 'hygiene.counter',
  kitchen: 'hygiene.kitchen',
  ingredients: 'hygiene.ingredients',
  floor: 'hygiene.floor',
  restroom: 'hygiene.restroom',
  waste: 'hygiene.waste',
}

export function HygieneCalendarPage() {
  const { t } = useTranslation()
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const startDate = new Date(year, month, 1).toISOString().split('T')[0]
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['hygiene-stats-range', startDate, endDate],
    queryFn: () => hygieneApi.statsRange(startDate, endDate)
  })

  const statsByDate = (statsData?.data?.data?.trend || []).reduce((acc: any, stat: any) => {
    acc[stat.date] = stat
    return acc
  }, {})

  const getDaysInMonth = () => {
    const days = []
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Padding for first week
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null)
    }

    // Days of month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d))
    }

    return days
  }

  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const days = getDaysInMonth()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />

        {/* Month Navigation */}
        <div className="flex items-center gap-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-medium min-w-[120px] text-center">
            {year}/{month + 1}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        {AREAS.map((area) => (
          <span key={area.value} className={`px-3 py-1 rounded text-sm ${area.color}`}>
            {t(AREA_LABELS[area.value])}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="card">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 border-b border-border">
            {[t('calendar.sun'), t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat')].map((day) => (
              <div key={day} className="py-3 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {days.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="min-h-[80px] border-r border-b border-border" />
              }

              const dateStr = formatDate(date)
              const dayStats = statsByDate[dateStr]
              const isToday = dateStr === new Date().toISOString().split('T')[0]

              return (
                <div
                  key={dateStr}
                  className={`min-h-[80px] border-r border-b border-border p-2 ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`text-sm mb-1 ${isToday ? 'font-bold text-primary' : 'text-gray-600'}`}>
                    {date.getDate()}
                  </div>
                  {dayStats && (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">
                        {dayStats.completed}/{dayStats.total}
                      </div>
                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success transition-all"
                          style={{ width: `${dayStats.completionRate}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}