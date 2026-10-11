import { businessDate, businessWeekStart, businessWeekday } from '../utils/businessDate'
import { LoadFailure } from '../components/LoadFailure'
import { RouteLoading } from '../components/RouteLoading'
import { useRef } from 'react'
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
  const [isLoading, setIsLoading] = useState(true)

  const [loadFailed, setLoadFailed] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    if (user?.staffId) {
      loadSchedule()
    }
    return () => { requestId.current++ }
  }, [user?.staffId, currentWeek])

  const loadSchedule = async () => {
    const id = ++requestId.current
    setIsLoading(true)
    setLoadFailed(false)
    try {
      const weekStart = getWeekStart(currentWeek)
      const response = await staffApi.getMySchedule(user!.staffId, businessDate(weekStart))
      if (id === requestId.current) setSchedule(response.data ?? null)
    } catch (error) {
      if (id === requestId.current) setLoadFailed(true)
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }

  const getWeekStart = businessWeekStart

  const getDaysOfWeek = () => {
    const weekStart = getWeekStart(currentWeek)
    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart.getTime() + i * 86400000)
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
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)

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
                {weekStart.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })} - {' '}
                {weekEnd.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })}
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
          {weekStart.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' })}
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
        {isLoading ? <RouteLoading /> : loadFailed ? <LoadFailure retry={loadSchedule} /> : <div className="grid grid-cols-7 gap-2">
          {days.map((day, idx) => {
            const shift = getShiftForDay(businessWeekday(day))
            const detail = schedule?.shiftDetails?.find((item: any) => item.key === shift)
            const ShiftIcon = SHIFT_ICONS[shift as keyof typeof SHIFT_ICONS] || Calendar
            const isToday = businessDate(day) === businessDate()

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
                  {day.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short' })}
                </p>
                <p className={`text-lg font-bold mb-2 ${
                  isToday ? 'text-white' : 'text-gray-900'
                }`}>
                  {Number(businessDate(day).slice(-2))}
                </p>
                <div className={`w-full h-8 rounded-lg flex items-center justify-center ${
                  isToday
                    ? 'bg-white/20'
                    : SHIFT_COLORS[shift as keyof typeof SHIFT_COLORS] || SHIFT_COLORS.off
                }`}>
                  <ShiftIcon size={16} />
                </div>
                <p className="mt-1 text-xs break-words">{detail?.name || t(SHIFT_LABELS_KEYS[shift as keyof typeof SHIFT_LABELS_KEYS] || shift)}
                  {detail && <span className="block mt-1">{detail.startTime}–{detail.endTime}</span>}</p>
              </div>
            )
          })}
        </div>}

        {/* Shift Swap Button */}
        <button
          onClick={() => navigate('/shift-swap')}
          className="w-full mt-4 py-3 border border-gray-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-gray-600 hover:bg-gray-50"
        >
          <Users size={18} />
          {t('schedule.requestShiftSwap')}
        </button>

        {/* Legend */}
        <div className="mt-4 bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-gray-900 mb-3">{t('schedule.shiftLegend')}</h3>
          <div className="space-y-3">
            {(schedule?.shiftDetails || []).map((shift: any) => (
              <div key={shift.key} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: shift.color || '#F2498C' }} />
                <span className="text-gray-700">{shift.name} · {shift.startTime}–{shift.endTime}</span>
              </div>
            ))}
            <p className="text-gray-500 text-sm">{t('schedule.off')}</p>
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