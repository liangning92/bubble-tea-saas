import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { staffApi, shiftApi } from '../../services/api'
import { ChevronLeft, ChevronRight, Calendar, RefreshCw, Check, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Staff {
  id: string
  name: string
  position: string
}

interface ScheduleEntry {
  id: string
  staffId: string
  date: string
  shift: string
  status: string
}

interface Shift {
  id: string
  key: string
  name: string
  nameZh?: string
  nameId?: string
  startTime: string
  endTime: string
  color: string
  sortOrder: number
  isActive: boolean
}

const DEFAULT_SHIFTS: Shift[] = [
  { id: 'default-1', key: 'morning', name: 'Morning', nameZh: 'Morning', nameId: 'Pagi', startTime: '08:00', endTime: '16:00', color: '#F59E0B', sortOrder: 0, isActive: true },
  { id: 'default-2', key: 'afternoon', name: 'Afternoon', nameZh: 'Afternoon', nameId: 'Siang', startTime: '14:00', endTime: '22:00', color: '#F97316', sortOrder: 1, isActive: true },
  { id: 'default-3', key: 'evening', name: 'Evening', nameZh: 'Evening', nameId: 'Malam', startTime: '18:00', endTime: '02:00', color: '#3B82F6', sortOrder: 2, isActive: true },
  { id: 'default-4', key: 'off', name: 'Off', nameZh: 'Off', nameId: 'Libur', startTime: '', endTime: '', color: '#6B7280', sortOrder: 3, isActive: true }
]

const DEFAULT_SHIFT_KEYS = new Set(['morning', 'afternoon', 'evening', 'off'])

const DEFAULT_SHIFT_I18N_KEYS: Record<string, string> = {
  morning: 'staff.morning',
  afternoon: 'staff.afternoon',
  evening: 'staff.evening',
  off: 'staff.off',
}

export function ScheduleCalendarPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuthStore()
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(now.setDate(diff))
  })
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [shifts, setShifts] = useState<Shift[]>(DEFAULT_SHIFTS)
  const [leaves, setLeaves] = useState<any[]>([])
  const [leaveLinkageEnabled, setLeaveLinkageEnabled] = useState(false)
  const [positionFilter, setPositionFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null)

  // Get translated shift labels — uses i18n for default shifts, stored fields for custom shifts
  const getShiftLabel = (key: string) => {
    const shift = shifts.find(s => s.key === key)
    if (shift) {
      // Default shifts: use i18n so English also gets proper translations
      if (DEFAULT_SHIFT_KEYS.has(key)) {
        const i18nKey = DEFAULT_SHIFT_I18N_KEYS[key]
        if (i18nKey) {
          const translated = t(i18nKey)
          if (translated !== i18nKey) return translated
        }
      }
      // Fall back to stored fields
      if (i18n.language === 'zh' && shift.nameZh) return shift.nameZh
      if (i18n.language === 'id' && shift.nameId) return shift.nameId
      return shift.name
    }
    return key
  }

  // 批量选择状态
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [batchShift, setBatchShift] = useState('morning')

  const loadData = async () => {
    setIsLoading(true)
    try {
      const staffResponse = await staffApi.list({ storeId: user?.storeId, status: 'active' })
      const staffData = staffResponse.data?.data?.list || staffResponse.data?.data || []
      setStaffList(Array.isArray(staffData) ? staffData : [])

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const scheduleResponse = await staffApi.scheduleList({
        storeId: user?.storeId,
        month: weekStart.toISOString().slice(0, 7)
      })
      setSchedules(scheduleResponse.data?.data || [])
      setLeaves(scheduleResponse.data?.leaves || [])
      setLeaveLinkageEnabled(scheduleResponse.data?.leaveLinkageEnabled || false)

      // Load shifts from API
      try {
        const shiftResponse = await shiftApi.list(user?.storeId ?? undefined)
        const shiftData = shiftResponse.data?.data || []
        if (Array.isArray(shiftData) && shiftData.length > 0) {
          setShifts(shiftData)
        }
      } catch (shiftError) {
        console.error('Failed to load shifts:', shiftError)
      }
    } catch (error) {
      console.error('Failed to load schedule data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [weekStart, user])

  const getWeekDays = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      days.push(date)
    }
    return days
  }

  const getSchedule = (staffId: string, date: Date) => {
    const dateStr = date.toISOString().slice(0, 10)
    return schedules.find(s => s.staffId === staffId && s.date?.slice(0, 10) === dateStr)
  }

  // Get leave info for a specific staff and date
  const getLeaveInfo = (staffId: string, date: Date) => {
    if (!leaveLinkageEnabled) return null
    const dateStr = date.toISOString().slice(0, 10)
    return leaves.find(l => {
      if (l.staffId !== staffId) return false
      const startDate = l.startDate?.slice(0, 10)
      const endDate = l.endDate?.slice(0, 10)
      return dateStr >= startDate && dateStr <= endDate
    })
  }

  const handleCellClick = (staffId: string, date: Date) => {
    if (batchMode) {
      // 批量模式：切换选中状态
      const newSelected = new Set(selectedStaff)
      if (newSelected.has(staffId)) {
        newSelected.delete(staffId)
      } else {
        newSelected.add(staffId)
      }
      setSelectedStaff(newSelected)
    } else {
      setEditingCell({ staffId, date: date.toISOString().slice(0, 10) })
    }
  }

  const handleShiftSelect = async (shift: string) => {
    if (!editingCell) return

    try {
      await staffApi.schedule({
        staffId: editingCell.staffId,
        date: editingCell.date,
        shift
      })
      await loadData()
    } catch (error) {
      console.error('Failed to save schedule:', error)
    }
    setEditingCell(null)
  }

  // 批量保存排班
  const handleBatchSave = async () => {
    if (selectedStaff.size === 0) return

    try {
      const weekDays = getWeekDays()
      for (const staffId of selectedStaff) {
        for (const date of weekDays) {
          const dateStr = date.toISOString().slice(0, 10)
          await staffApi.schedule({
            staffId,
            date: dateStr,
            shift: batchShift
          })
        }
      }
      await loadData()
      setSelectedStaff(new Set())
      setBatchMode(false)
    } catch (error) {
      console.error('Failed to batch save schedule:', error)
      alert(t('common.error'))
    }
  }

  const prevWeek = () => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() - 7)
    setWeekStart(newStart)
  }

  const nextWeek = () => {
    const newStart = new Date(weekStart)
    newStart.setDate(newStart.getDate() + 7)
    setWeekStart(newStart)
  }

  const thisWeek = () => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    setWeekStart(new Date(now.setDate(diff)))
  }

  const getShiftInfo = (shiftKey: string) => {
    return shifts.find(s => s.key === shiftKey) || shifts.find(s => s.key === 'off') || shifts[shifts.length - 1]
  }

  const filteredStaff = positionFilter
    ? staffList.filter(s => s.position === positionFilter)
    : staffList

  const weekDays = getWeekDays()
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const positions = [...new Set(staffList.map(s => s.position))]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={28} className="text-primary" />
          <div />
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/staff/schedule/shifts"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Settings size={16} />
            {t('staff.shiftConfig')}
          </Link>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="input w-40"
          >
            <option value="">{t('staff.allPositions')}</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{t(`staff.${pos}`)}</option>
            ))}
          </select>
          <button onClick={loadData} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={isLoading}>
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Batch Controls */}
      <div className="flex items-center gap-3 mb-4 bg-white rounded-xl shadow-sm p-4">
        <button
          onClick={() => {
            setBatchMode(!batchMode)
            setSelectedStaff(new Set())
          }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            batchMode
              ? 'bg-primary text-white'
              : 'border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {batchMode ? t('staff.batchModeActive') : t('staff.batchMode')}
        </button>

        {batchMode && (
          <>
            <select
              value={batchShift}
              onChange={e => setBatchShift(e.target.value)}
              className="input w-40"
            >
              {shifts.map(shift => (
                <option key={shift.key} value={shift.key}>{getShiftLabel(shift.key)}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              {t('staff.selectedCount')}: {selectedStaff.size} {t('staff.staff')}
            </span>
            <button
              onClick={handleBatchSave}
              disabled={selectedStaff.size === 0}
              className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Check size={18} />
              {t('staff.applyToWeek')}
            </button>
            <button
              onClick={() => {
                setSelectedStaff(new Set())
                setBatchMode(false)
              }}
              className="px-4 py-2 border border-gray-200 rounded-lg"
            >
              {t('common.cancel')}
            </button>
          </>
        )}
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-center gap-4 mb-6 bg-white rounded-xl shadow-sm p-4">
        <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft size={20} />
        </button>
        <span className="font-medium min-w-[200px] text-center">
          {weekDays[0].toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {weekDays[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <button onClick={thisWeek} className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          {t('staff.thisWeek')}
        </button>
        <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4">
        {shifts.map(shift => (
          <div
            key={shift.key}
            className="px-3 py-1 rounded-full text-xs font-medium border"
            style={{ backgroundColor: shift.color + '20', color: shift.color, borderColor: shift.color }}
          >
            {getShiftLabel(shift.key)}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 w-40">
                    {batchMode && (
                      <input
                        type="checkbox"
                        checked={selectedStaff.size === filteredStaff.length && filteredStaff.length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedStaff(new Set(filteredStaff.map(s => s.id)))
                          } else {
                            setSelectedStaff(new Set())
                          }
                        }}
                        className="mr-2"
                      />
                    )}
                    {t('staff.name')}
                  </th>
                  {weekDays.map((day, i) => (
                    <th key={i} className="px-2 py-3 text-center text-sm font-medium text-gray-500 min-w-[100px]">
                      <div>{dayNames[i]}</div>
                      <div className="text-xs text-gray-400">{day.getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staff => (
                  <tr key={staff.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {batchMode && (
                          <input
                            type="checkbox"
                            checked={selectedStaff.has(staff.id)}
                            onChange={() => {
                              const newSelected = new Set(selectedStaff)
                              if (newSelected.has(staff.id)) {
                                newSelected.delete(staff.id)
                              } else {
                                newSelected.add(staff.id)
                              }
                              setSelectedStaff(newSelected)
                            }}
                            className="mr-2"
                          />
                        )}
                        <div>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-gray-500">{t(`staff.${staff.position}`)}</div>
                        </div>
                      </div>
                    </td>
                    {weekDays.map((day, i) => {
                      const schedule = getSchedule(staff.id, day)
                      const shiftInfo = schedule ? getShiftInfo(schedule.shift) : null
                      const leaveInfo = getLeaveInfo(staff.id, day)
                      const isSelected = selectedStaff.has(staff.id)

                      return (
                        <td
                          key={i}
                          className={`px-2 py-3 text-center cursor-pointer transition-colors ${
                            batchMode
                              ? isSelected
                                ? 'bg-primary/10'
                                : ''
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleCellClick(staff.id, day)}
                        >
                          {leaveInfo ? (
                            <span
                              className="inline-block px-2 py-1 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-300"
                              title={`Leave: ${leaveInfo.leaveType}`}
                            >
                              {t('staff.onLeave')}
                            </span>
                          ) : shiftInfo ? (
                            <span
                              className="inline-block px-2 py-1 rounded-full text-xs font-medium border"
                              style={{ backgroundColor: shiftInfo.color + '20', color: shiftInfo.color, borderColor: shiftInfo.color }}
                            >
                              {getShiftLabel(shiftInfo.key)}
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift Selection Modal */}
      {editingCell && (
        <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50" onClick={() => setEditingCell(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{t('staff.selectShift')}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {shifts.map(shift => (
                <button
                  key={shift.key}
                  onClick={() => handleShiftSelect(shift.key)}
                  className="px-4 py-3 rounded-xl border text-center transition-colors hover:opacity-80"
                  style={{ backgroundColor: shift.color + '20', color: shift.color, borderColor: shift.color }}
                >
                  <span className="font-medium">{getShiftLabel(shift.key)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setEditingCell(null)}
              className="w-full py-2 border border-gray-200 rounded-lg"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}