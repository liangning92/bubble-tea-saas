import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { QRCameraScannerModal } from '../components/QRCameraScannerModal'
import {
  Clock,
  MapPin,
  CheckCircle,
  LogOut,
  Calendar,
  Loader2,
  Edit3,
  PlusCircle,
  X,
  ChevronLeft,
  Camera,
  RotateCcw
} from 'lucide-react'

export function AttendancePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [attendance, setAttendance] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [scannerDefaultMode, setScannerDefaultMode] = useState<'check_in' | 'check_out'>('check_in')

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

  const handleQRCheckIn = async (type: 'check_in' | 'check_out', qrData?: string) => {
    const rawData = (qrData || '').trim()
    if (!rawData) return

    setIsLoading(true)
    setMessage(null)

    try {
      const response = await staffApi.checkInWithQR(
        rawData,
        type,
        type === 'check_out' ? attendance?.id : undefined
      )

      if (response.code === 200 || response.code === 201) {
        if (type === 'check_in') {
          setAttendance(response.data)
          setMessage({
            type: 'success',
            text: `${t('attendance.checkInSuccess', '签到成功！')} ${response.data?.storeName ? `(${response.data.storeName})` : ''}`
          })
        } else {
          setAttendance({ ...attendance, checkOutTime: response.data?.checkOutTime || new Date().toISOString() })
          setMessage({
            type: 'success',
            text: `${t('attendance.checkOutSuccess', '签退成功！')} ${response.data?.storeName ? `(${response.data.storeName})` : ''}`
          })
        }
        setShowScanner(false)
        await loadTodayAttendance()
        loadHistory()
      } else {
        setMessage({ type: 'error', text: response.message || t('attendance.checkInFailed') })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || t('attendance.invalidQR') })
      throw error
    } finally {
      setIsLoading(false)
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

  const isCheckedIn = Boolean(attendance?.checkInTime && !attendance?.checkOutTime)
  const isShiftFinished = Boolean(attendance?.checkInTime && attendance?.checkOutTime)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <ChevronLeft size={22} />
          </button>
          <Clock size={26} />
          <div>
            <h1 className="text-xl font-bold">{t('attendance.title', '考勤签到')}</h1>
            <p className="text-white/80 text-xs">{new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-2 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'
          }`}>
            {message.type === 'success' ? <CheckCircle size={18} /> : <X size={18} />}
            <span>{message.text}</span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="p-4">
        {/* Check In/Out Card */}
        <div className={`bg-white rounded-2xl shadow-sm border p-6 mb-6 ${
          isCheckedIn ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-50/20 to-white' : isShiftFinished ? 'border-blue-400/50 bg-gradient-to-b from-blue-50/20 to-white' : 'border-gray-100'
        }`}>
          <div className="text-center mb-6">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all ${
              isCheckedIn ? 'bg-emerald-100 text-emerald-600' : isShiftFinished ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-primary'
            }`}>
              {isCheckedIn ? (
                <CheckCircle size={42} />
              ) : isShiftFinished ? (
                <CheckCircle size={42} />
              ) : (
                <Clock size={42} />
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-3">
              {isCheckedIn
                ? t('attendance.statusWorking', '工作中')
                : isShiftFinished
                ? t('attendance.todayShiftCompleted', '今日出勤已完成')
                : t('attendance.statusNotCheckedIn', '未签到')}
            </h2>
            <p className="text-gray-500 text-xs mt-1">
              {isCheckedIn
                ? t('attendance.workingSince', {
                    time: new Date(attendance.checkInTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  })
                : isShiftFinished
                ? `${t('attendance.checkInLabel', '上班')}: ${new Date(attendance.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · ${t('attendance.checkOutLabel', '下班')}: ${new Date(attendance.checkOutTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                : t('attendance.scanQRDesc', '请用手机扫描收银机上的动态考勤码签到')}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-center">
              <p className="text-lg font-bold text-primary">{getWorkingHours().split(' ')[0]}</p>
              <p className="text-[11px] text-gray-400">{t('attendance.workHours', '工时')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-blue-600">
                {attendance?.checkInTime
                  ? new Date(attendance.checkInTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '--:--'}
              </p>
              <p className="text-[11px] text-gray-400">{t('attendance.checkInLabel', '上班')}</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600">
                {attendance?.checkOutTime
                  ? new Date(attendance.checkOutTime).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : '--:--'}
              </p>
              <p className="text-[11px] text-gray-400">{t('attendance.checkOutLabel', '下班')}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {isCheckedIn ? (
              <>
                <button
                  onClick={() => {
                    setScannerDefaultMode('check_out')
                    setShowScanner(true)
                  }}
                  disabled={isLoading}
                  className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold text-base hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
                >
                  <Camera size={22} />
                  {t('attendance.scanPosQrCheckOut', '扫码下班打卡')}
                </button>
                <button
                  onClick={handleCheckOut}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                  {t('attendance.checkOut', '直接签退 (备用)')}
                </button>
              </>
            ) : isShiftFinished ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setScannerDefaultMode('check_in')
                    setShowScanner(true)
                  }}
                  disabled={isLoading}
                  className="flex-1 py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
                >
                  <RotateCcw size={18} />
                  {t('attendance.scanAgain', '再次扫码打卡')}
                </button>
                <button
                  onClick={() => navigate('/attendance/overtime')}
                  className="py-3.5 px-4 bg-gray-100 text-gray-700 rounded-2xl font-medium text-xs hover:bg-gray-200"
                >
                  {t('attendance.requestOvertime', '申请加班')}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    setScannerDefaultMode('check_in')
                    setShowScanner(true)
                  }}
                  disabled={isLoading}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-base hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-98 transition-all"
                >
                  <Camera size={22} />
                  {t('attendance.scanPosQrCheckIn', '扫码上班签到')}
                </button>
                <button
                  onClick={handleCheckIn}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                  {t('attendance.gpsCheckIn', 'GPS打卡 (备用)')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 动态二维码相机扫码弹窗 */}
        <QRCameraScannerModal
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={async (qrData, mode) => {
            await handleQRCheckIn(mode, qrData)
          }}
          defaultMode={scannerDefaultMode}
          isLoading={isLoading}
        />

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