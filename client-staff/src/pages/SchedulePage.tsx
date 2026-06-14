import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Calendar, ChevronLeft, ChevronRight, Sun, Moon, Coffee, X, Users } from 'lucide-react'

const SHIFT_ICONS = {
  morning: Sun,
  afternoon: Coffee,
  evening: Moon,
  off: X
}

const SHIFT_COLORS = {
  morning: 'bg-yellow-100 text-yellow-700',
  afternoon: 'bg-orange-100 text-orange-700',
  evening: 'bg-blue-100 text-blue-700',
  off: 'bg-gray-100 text-gray-500'
}

const SHIFT_LABELS_KEYS = {
  morning: 'schedule.morning',
  afternoon: 'schedule.afternoon',
  evening: 'schedule.evening',
  off: 'schedule.off'
}

export function SchedulePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [schedule, setSchedule] = useState<any>(null)
  const [, setIsLoading] = useState(true)

  useEffect(() => {
    if (user?.staffId) {
      loadSchedule()
    }
  }, [user, currentWeek])

  const loadSchedule = async () => {
    setIsLoading(true)
    try {
      const weekStart = getWeekStart(currentWeek)
      const response = await staffApi.getMySchedule(user!.staffId, weekStart.toISOString().slice(0, 10))
      if (response.data) {
        setSchedule(response.data)
      }
    } catch (error) {
      console.error('Failed to load schedule:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  const getDaysOfWeek = () => {
    const weekStart = getWeekStart(currentWeek)
    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(weekStart.getDate() + i)
      days.push(day)
    }
    return days
  }

  const getShiftForDay = (dayIndex: number) => {
    if (!schedule) return 'off'
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    return schedule[dayKeys[dayIndex]] || 'off'
  }

  const goToPrevWeek = () => {
    const prev = new Date(currentWeek)
    prev.setDate(prev.getDate() - 7)
    setCurrentWeek(prev)
  }

  const goToNextWeek = () => {
    const next = new Date(currentWeek)
    next.setDate(next.getDate() + 7)
    setCurrentWeek(next)
  }

  const days = getDaysOfWeek()
  const weekStart = getWeekStart(currentWeek)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={28} />
            <div>
              <h1 className="text-xl font-bold">{t('schedule.title')}</h1>
              <p className="text-white/80 text-sm">
                {weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {' '}
                {weekEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Week Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={goToPrevWeek}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronLeft size={24} className="text-gray-600" />
        </button>
        <span className="font-bold text-gray-900">
          {weekStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={goToNextWeek}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronRight size={24} className="text-gray-600" />
        </button>
      </div>

      {/* Schedule Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, idx) => {
            const shift = getShiftForDay(idx)
            const ShiftIcon = SHIFT_ICONS[shift as keyof typeof SHIFT_ICONS] || X
            const isToday = day.toDateString() === new Date().toDateString()

            return (
              <div
                key={idx}
                className={`p-2 rounded-xl text-center ${
                  isToday ? 'bg-primary text-white' : 'bg-white'
                }`}
              >
                <p className={`text-xs font-medium mb-1 ${
                  isToday ? 'text-white/80' : 'text-gray-500'
                }`}>
                  {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                </p>
                <p className={`text-lg font-bold mb-2 ${
                  isToday ? 'text-white' : 'text-gray-900'
                }`}>
                  {day.getDate()}
                </p>
                <div className={`w-full h-8 rounded-lg flex items-center justify-center ${
                  isToday
                    ? 'bg-white/20'
                    : SHIFT_COLORS[shift as keyof typeof SHIFT_COLORS] || SHIFT_COLORS.off
                }`}>
                  <ShiftIcon size={16} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Shift Swap Button */}
        <button
          onClick={() => navigate('/shift-swap')}
          className="w-full mt-4 py-3 border border-gray-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-gray-600 hover:bg-gray-50"
        >
          <Users size={18} />
          {t('schedule.requestShiftSwap') || '申请调班'}
        </button>

        {/* Legend */}
        <div className="mt-4 bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-gray-900 mb-3">{t('schedule.shiftLegend')}</h3>
          <div className="space-y-3">
            {(['morning', 'afternoon', 'evening', 'off'] as const).map((shift) => {
              const Icon = SHIFT_ICONS[shift]
              return (
                <div key={shift} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${SHIFT_COLORS[shift]}`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-gray-700">{t(SHIFT_LABELS_KEYS[shift])}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
          <p className="text-sm text-yellow-800">
            {t('schedule.scheduleNote')}
          </p>
        </div>
      </div>
    </div>
  )
}