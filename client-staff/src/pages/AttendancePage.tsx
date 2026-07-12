import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import {
  Clock,
  MapPin,
  CheckCircle,
  LogOut,
  Calendar,
  Loader2,
  Edit3,
  PlusCircle
} from 'lucide-react'

export function AttendancePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [attendance, setAttendance] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    if (user?.staffId) {
      loadTodayAttendance()
      loadHistory()
    }
  }, [user])

  const loadTodayAttendance = async () => {
    try {
      const response = await staffApi.getTodayAttendance(user!.staffId)
      if (response.data) {
        setAttendance(response.data)
      }
    } catch (error) {
      console.error('Failed to load attendance:', error)
    }
  }

  const loadHistory = async () => {
    try {
      const now = new Date()
      const response = await staffApi.getAttendanceHistory(user!.staffId, now.getMonth() + 1, now.getFullYear())
      if (response.data) {
        setHistory(response.data)
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  const handleCheckIn = async () => {
    setIsLoading(true)
    setMessage(null)

    // Try to get GPS location
    let locationStr = ''
    try {
      if ('geolocation' in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        })
        locationStr = `${position.coords.latitude},${position.coords.longitude}`
      }
    } catch (e) {
      console.warn('Could not get GPS location:', e)
      locationStr = 'GPS unavailable'
    }

    try {
      const response = await staffApi.checkIn({
        storeId: user!.storeId,
        date: new Date().toISOString().slice(0, 10),
        checkInTime: new Date().toISOString(),
        location: locationStr
      })

      if (response.code === 201) {
        setAttendance(response.data)
        setMessage({ type: 'success', text: t('attendance.checkInSuccess') })
        loadHistory()
      } else {
        setMessage({ type: 'error', text: response.message || t('attendance.checkInFailed') })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || t('attendance.errorOccurred') })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCheckOut = async () => {
    if (!attendance?.id) return

    setIsLoading(true)
    setMessage(null)

    // Try to get GPS location
    let locationStr = ''
    try {
      if ('geolocation' in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        })
        locationStr = `${position.coords.latitude},${position.coords.longitude}`
      }
    } catch (e) {
      console.warn('Could not get GPS location:', e)
      locationStr = 'GPS unavailable'
    }

    try {
      const response = await staffApi.checkOut(attendance.id, {
        checkOutTime: new Date().toISOString(),
        location: locationStr
      })

      if (response.data) {
        setAttendance({ ...attendance, checkOutTime: response.data.checkOutTime })
        setMessage({ type: 'success', text: t('attendance.checkOutSuccess') })
        loadHistory()
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || t('attendance.errorOccurred') })
    } finally {
      setIsLoading(false)
    }
  }

  const getWorkingHours = () => {
    if (!attendance?.checkInTime) return t('attendance.workingHoursZero')
    const checkOutTime = attendance.checkOutTime ? new Date(attendance.checkOutTime) : new Date()
    const checkInTime = new Date(attendance.checkInTime)
    const diff = checkOutTime.getTime() - checkInTime.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return t('attendance.workingHoursFormat', { hours, minutes })
  }

  const isCheckedIn = attendance?.checkInTime && !attendance?.checkOutTime

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock size={28} />
          <div>
            <h1 className="text-xl font-bold">{t('attendance.title')}</h1>
            <p className="text-white/80 text-sm">{new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-3 rounded-xl ${
            message.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}>
            {message.text}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="p-4">
        {/* Check In/Out Card */}
        <div className={`bg-white rounded-2xl shadow-lg p-6 mb-6 ${
          isCheckedIn ? 'border-2 border-green-500' : ''
        }`}>
          <div className="text-center mb-6">
            <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center ${
              isCheckedIn ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {isCheckedIn ? (
                <CheckCircle className="text-green-500" size={48} />
              ) : (
                <Clock className="text-gray-400" size={48} />
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-4">
              {isCheckedIn ? t('attendance.statusWorking') : t('attendance.statusNotCheckedIn')}
            </h2>
            <p className="text-gray-500">
              {isCheckedIn
                ? t('attendance.workingSince', { time: new Date(attendance.checkInTime).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })})
                : t('attendance.pressButtonToStart')}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{getWorkingHours().split(' ')[0]}</p>
              <p className="text-sm text-gray-500">{t('attendance.workHours')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {new Date(attendance?.checkInTime || Date.now()).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
              <p className="text-sm text-gray-500">{t('attendance.checkInLabel')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">
                {attendance?.checkOutTime
                  ? new Date(attendance.checkOutTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '--:--'}
              </p>
              <p className="text-sm text-gray-500">{t('attendance.checkOutLabel')}</p>
            </div>
          </div>

          {/* Action Button */}
          {isCheckedIn ? (
            <button
              onClick={handleCheckOut}
              disabled={isLoading}
              className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  <LogOut size={24} />
                  {t('attendance.checkOut')}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={isLoading}
              className="w-full py-4 bg-green-500 text-white rounded-xl font-bold text-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  <CheckCircle size={24} />
                  {t('attendance.checkIn')}
                </>
              )}
            </button>
          )}
        </div>

        {/* Location Info */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <MapPin className="text-blue-600" size={20} />
          </div>
          <div>
            <p className="font-medium text-gray-900">{t('attendance.location')}</p>
            <p className="text-sm text-gray-500">{t('attendance.defaultLocation')}</p>
          </div>
        </div>

        {/* Correction Button */}
        <button
          onClick={() => navigate('/attendance/correction')}
          className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-gray-600 hover:bg-gray-50 mb-2"
        >
          <Edit3 size={18} />
          {t('attendance.requestCorrection')}
        </button>

        {/* Overtime Button */}
        <button
          onClick={() => navigate('/overtime')}
          className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-gray-600 hover:bg-gray-50 mb-6"
        >
          <PlusCircle size={18} />
          {t('attendance.requestOvertime')}
        </button>

        {/* Monthly History */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">{t('attendance.monthlyHistory')}</h3>
            <span className="text-sm text-gray-500">
              {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-gray-400 py-4">{t('attendance.noData')}</p>
            ) : (
              history.slice(0, 7).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      item.checkOutTime ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      <Calendar className={item.checkOutTime ? 'text-green-600' : 'text-yellow-600'} size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {new Date(item.checkInTime).toLocaleDateString('id-ID', {
                          weekday: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '--:--'}
                        {' - '}
                        {item.checkOutTime ? new Date(item.checkOutTime).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '--:--'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    item.checkOutTime ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {item.checkOutTime ? t('attendance.present') : t('attendance.stillWorking')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}