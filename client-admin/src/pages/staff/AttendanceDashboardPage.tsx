import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffApi } from '../../services/api'
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'

interface DayAttendance {
  date: string
  present: number
  absent: number
  late: number
  total: number
}

interface StaffAttendance {
  staffId: string
  staffName: string
  checkIn?: string
  checkOut?: string
  status: 'present' | 'absent' | 'late'
}

interface Staff {
  id: string
  name: string
  position: string
  status: string
}

// Safe date formatter - returns fallback for invalid dates
function safeFormatDate(dateStr: string | undefined | null, options?: Intl.DateTimeFormatOptions, fallback = '-'): string {
  if (!dateStr) return fallback
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('id-ID', options)
}

function safeFormatTime(dateStr: string | undefined | null, fallback = '-'): string {
  if (!dateStr) return fallback
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return fallback
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function AttendanceDashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [todayStats, setTodayStats] = useState<{ present: number; absent: number; late: number } | null>(null)
  const [weekStats, setWeekStats] = useState<DayAttendance[]>([])
  const [staffList, setStaffList] = useState<StaffAttendance[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadAttendance = async () => {
    setIsLoading(true)
    try {
      // Get all active staff
      const staffResponse = await staffApi.list({ storeId: user?.storeId, status: 'active' })
      const staffData: Staff[] = staffResponse.data?.data?.list || staffResponse.data?.data || []

      // Get today's attendance records
      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23, 59, 59, 999)

      const attendanceResponse = await staffApi.attendanceList({
        storeId: user?.storeId,
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString()
      })
      const attendanceList = attendanceResponse.data?.data || []

      // Build staff attendance map
      const attendanceMap: Record<string, any> = {}
      for (const att of attendanceList) {
        attendanceMap[att.staffId] = att
      }

      // Calculate today's stats
      let present = 0, absent = 0, late = 0
      const todayStaffList: StaffAttendance[] = []

      for (const staff of staffData) {
        const att = attendanceMap[staff.id]
        if (att) {
          const status = att.status === 'late' ? 'late' : 'present'
          if (status === 'present') present++
          else if (status === 'late') late++

          todayStaffList.push({
            staffId: staff.id,
            staffName: staff.name,
            checkIn: safeFormatTime(att.checkInTime, undefined),
            checkOut: safeFormatTime(att.checkOutTime, undefined),
            status
          })
        } else {
          absent++
          todayStaffList.push({
            staffId: staff.id,
            staffName: staff.name,
            status: 'absent'
          })
        }
      }

      setTodayStats({ present, absent, late })
      setStaffList(todayStaffList)

      // Calculate week stats - single API call for entire week (fix N+1 query)
      const weekStartDate = new Date()
      weekStartDate.setDate(weekStartDate.getDate() - 6)
      weekStartDate.setHours(0, 0, 0, 0)
      const weekEndDate = new Date()
      weekEndDate.setHours(23, 59, 59, 999)

      try {
        const weekAttendanceResponse = await staffApi.attendanceList({
          storeId: user?.storeId,
          startDate: weekStartDate.toISOString(),
          endDate: weekEndDate.toISOString()
        })
        const weekAttendanceList = weekAttendanceResponse.data?.data || []

        // Group attendance by day
        const attendanceByDay: Record<string, any[]> = {}
        for (const att of weekAttendanceList) {
          // Use att.date first, fallback to checkInTime, fallback to today
          let dateStr = att.date?.slice(0, 10)
          if (!dateStr) {
            const fallback = att.checkInTime ? new Date(att.checkInTime) : new Date()
            dateStr = isNaN(fallback.getTime()) ? new Date().toISOString().slice(0, 10) : fallback.toISOString().slice(0, 10)
          }
          if (!attendanceByDay[dateStr]) attendanceByDay[dateStr] = []
          attendanceByDay[dateStr].push(att)
        }

        const days: DayAttendance[] = []
        for (let i = 6; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().slice(0, 10)

          const dayAttendanceList = attendanceByDay[dateStr] || []
          let dayPresent = 0, dayLate = 0
          for (const att of dayAttendanceList) {
            if (att.status === 'late') dayLate++
            else dayPresent++
          }

          days.push({
            date: dateStr,
            present: dayPresent,
            absent: Math.max(0, staffData.length - dayPresent - dayLate),
            late: dayLate,
            total: staffData.length
          })
        }
        setWeekStats(days)
      } catch {
        // Fallback: all absent
        const days: DayAttendance[] = []
        for (let i = 6; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          days.push({
            date: date.toISOString().slice(0, 10),
            present: 0,
            absent: staffData.length,
            late: 0,
            total: staffData.length
          })
        }
        setWeekStats(days)
      }

    } catch (error) {
      console.error('Failed to load attendance:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAttendance()
  }, [selectedDate, user])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-700'
      case 'late': return 'bg-yellow-100 text-yellow-700'
      case 'absent': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle size={16} className="text-green-600" />
      case 'late': return <AlertCircle size={16} className="text-yellow-600" />
      case 'absent': return <XCircle size={16} className="text-red-600" />
      default: return null
    }
  }

  const formatDateDisplay = (dateStr: string) => {
    return safeFormatDate(dateStr, { weekday: 'short', day: 'numeric', month: 'short' }, dateStr)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="p-2 border border-gray-200 rounded-lg"
          />
          <button
            onClick={loadAttendance}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <span className="text-gray-500">{t('staff.present')}</span>
          </div>
          <p className="text-3xl font-bold text-green-600">{todayStats?.present || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertCircle size={20} className="text-yellow-600" />
            </div>
            <span className="text-gray-500">{t('staff.late')}</span>
          </div>
          <p className="text-3xl font-bold text-yellow-600">{todayStats?.late || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle size={20} className="text-red-600" />
            </div>
            <span className="text-gray-500">{t('staff.absent')}</span>
          </div>
          <p className="text-3xl font-bold text-red-600">{todayStats?.absent || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold mb-4">{t('staff.weeklyTrend')}</h2>
          <div className="space-y-3">
            {weekStats.map((day) => {
              const presentRate = day.total > 0 ? (day.present / day.total) * 100 : 0
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-gray-500">{formatDateDisplay(day.date)}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${presentRate}%` }}
                    >
                      <span className="text-xs text-white font-medium">{day.present}</span>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500 w-16 text-right">
                    {day.present}/{day.total}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Today's Staff List */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-bold mb-4">{t('staff.todayStaff')}</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {staffList.map((staff) => (
                <div key={staff.staffId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getStatusColor(staff.status)}`}>
                      {getStatusIcon(staff.status)}
                    </div>
                    <div>
                      <p className="font-medium">{staff.staffName}</p>
                      <p className="text-xs text-gray-500">
                        {staff.checkIn ? `${t('staff.checkIn')}: ${staff.checkIn}` : ''}
                        {staff.checkOut ? ` ${t('staff.checkOut')}: ${staff.checkOut}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(staff.status)}`}>
                    {t(`staff.${staff.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}