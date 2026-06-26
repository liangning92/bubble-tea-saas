import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import {
  Clock,
  Calendar,
  Wallet,
  User,
  LogOut,
  Bell,
  CalendarDays,
  Receipt,
  ShieldCheck,
  Package,
  Star,
  Wallet as WalletIcon,
  BookOpen,
  Globe,
  ChevronDown
} from 'lucide-react'

const LANGUAGES = [
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'zh', label: '中文', flag: '🇨🇳' }
]

export function HomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [todayAttendance, setTodayAttendance] = useState<any>(null)
  const [pendingTasksCount, setPendingTasksCount] = useState(0)
  const [, setIsLoading] = useState(true)
  const [showLangMenu, setShowLangMenu] = useState(false)

  // Load saved language preference
  useEffect(() => {
    const savedLang = localStorage.getItem('staff-language')
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang)
    }
  }, [])

  useEffect(() => {
    if (user?.staffId) {
      loadTodayAttendance()
      loadPendingTasks()
    }
  }, [user])

  const loadTodayAttendance = async () => {
    try {
      const response = await staffApi.getTodayAttendance(user!.staffId)
      if (response.data) {
        setTodayAttendance(response.data)
      }
    } catch (error) {
      console.error('Failed to load attendance:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPendingTasks = async () => {
    try {
      const response = await staffApi.getMyPendingTasks()
      if (response.data) {
        setPendingTasksCount(response.data.count || 0)
      }
    } catch (error) {
      console.error('Failed to load pending tasks:', error)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('staff-language', langCode)
    setShowLangMenu(false)
  }

  // Get current language
  const getCurrentLang = () => {
    return LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]
  }

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return t('time.morning')
    if (hour < 15) return t('time.afternoon')
    if (hour < 18) return t('time.evening')
    return t('time.night')
  }

  // Get current shift
  const getCurrentShift = () => {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 14) return t('schedule.morningShift')
    if (hour >= 14 && hour < 22) return t('schedule.afternoonShift')
    return t('schedule.eveningShift')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white px-4 py-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold">
                {user?.name?.charAt(0) || 'S'}
              </span>
            </div>
            <div>
              <p className="text-white/80 text-sm">{getGreeting()}</p>
              <p className="font-bold text-lg">{user?.name || 'Staff'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/announcements')}
              className="p-2 bg-white/20 rounded-full"
            >
              <Bell size={20} />
            </button>
            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="p-2 bg-white/20 rounded-full flex items-center gap-1"
              >
                <Globe size={20} />
                <span className="text-xs">{getCurrentLang().flag}</span>
                <ChevronDown size={14} />
              </button>
              {showLangMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-lg shadow-lg py-2 z-50 min-w-[140px]">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 ${
                        i18n.language === lang.code ? 'text-primary font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 bg-white/20 rounded-full"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Today's Status Card */}
        <div className="bg-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Shift {getCurrentShift()}</p>
              <p className="text-white/80 text-sm">{user?.position || 'Staff'}</p>
            </div>
            <div className="text-right">
              {todayAttendance ? (
                <>
                  <p className={`font-bold text-lg ${
                    todayAttendance.checkOut ? 'text-white/60' : 'text-green-300'
                  }`}>
                    {todayAttendance.checkOut ? t('home.checkedIn') : t('home.working')}
                  </p>
                  <p className="text-white/60 text-sm">
                    {new Date(todayAttendance.checkIn).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </>
              ) : (
                <p className="text-yellow-300 font-bold">{t('home.notCheckedIn')}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Check In/Out Button */}
          <button
            onClick={() => navigate('/attendance')}
            className={`p-4 rounded-2xl text-left ${
              todayAttendance?.checkIn && !todayAttendance?.checkOut
                ? 'bg-green-500 text-white'
                : 'bg-white shadow-sm'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
              todayAttendance?.checkIn && !todayAttendance?.checkOut
                ? 'bg-white/20'
                : 'bg-primary/10'
            }`}>
              <Clock className={`${
                todayAttendance?.checkIn && !todayAttendance?.checkOut
                  ? 'text-white'
                  : 'text-primary'
              }`} size={24} />
            </div>
            <p className={`font-bold ${
              todayAttendance?.checkIn && !todayAttendance?.checkOut
                ? 'text-white'
                : 'text-gray-900'
            }`}>
              {todayAttendance?.checkIn && !todayAttendance?.checkOut ? t('attendance.checkOut') : t('attendance.checkIn')}
            </p>
            <p className={`text-sm ${
              todayAttendance?.checkIn && !todayAttendance?.checkOut
                ? 'text-white/80'
                : 'text-gray-500'
            }`}>
              {todayAttendance?.checkIn && !todayAttendance?.checkOut ? t('home.clickToLeave') : t('home.clickToWork')}
            </p>
          </button>

          {/* Attendance Rules */}
          <button
            onClick={() => navigate('/attendance/rules')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
              <ShieldCheck className="text-purple-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('attendance.rules') || '考勤规则'}</p>
            <p className="text-sm text-gray-500">{t('attendance.viewRules') || '查看规则'}</p>
          </button>

          {/* Schedule */}
          <button
            onClick={() => navigate('/schedule')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.schedule')}</p>
            <p className="text-sm text-gray-500">{t('home.viewSchedule')}</p>
          </button>

          {/* Salary */}
          <button
            onClick={() => navigate('/salary')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-3">
              <Wallet className="text-green-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.salary')}</p>
            <p className="text-sm text-gray-500">{t('home.viewSalary')}</p>
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate('/profile')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
              <User className="text-purple-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('nav.profile')}</p>
            <p className="text-sm text-gray-500">{t('profile.changePassword')}</p>
          </button>

          {/* Leave */}
          <button
            onClick={() => navigate('/leave')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
              <CalendarDays className="text-orange-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.leave')}</p>
            <p className="text-sm text-gray-500">{t('home.applyLeave')}</p>
          </button>

          {/* Reimbursement */}
          <button
            onClick={() => navigate('/reimbursement')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-3">
              <Receipt className="text-teal-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.reimbursement')}</p>
            <p className="text-sm text-gray-500">{t('home.applyReimbursement')}</p>
          </button>

          {/* Hygiene Tasks */}
          <button
            onClick={() => navigate('/hygiene')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left relative"
          >
            {pendingTasksCount > 0 && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingTasksCount > 9 ? '9+' : pendingTasksCount}
              </span>
            )}
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
              <ShieldCheck className="text-orange-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('hygiene.title')}</p>
            <p className="text-sm text-gray-500">{t('hygiene.myTasks')}</p>
          </button>

          {/* Inventory */}
          <button
            onClick={() => navigate('/inventory')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center mb-3">
              <Package className="text-cyan-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('inventory.title') || 'Inventory'}</p>
            <p className="text-sm text-gray-500">{t('inventory.stockInOut') || 'Stock In/Out'}</p>
          </button>

          {/* Points */}
          <button
            onClick={() => navigate('/points')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-3">
              <Star className="text-yellow-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.points')}</p>
            <p className="text-sm text-gray-500">{t('home.viewPoints')}</p>
          </button>

          {/* Deposit */}
          <button
            onClick={() => navigate('/deposit')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-3">
              <WalletIcon className="text-indigo-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.deposit')}</p>
            <p className="text-sm text-gray-500">{t('home.viewDeposit')}</p>
          </button>

          {/* Training */}
          <button
            onClick={() => navigate('/training')}
            className="p-4 bg-white shadow-sm rounded-2xl text-left"
          >
            <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center mb-3">
              <BookOpen className="text-pink-600" size={24} />
            </div>
            <p className="font-bold text-gray-900">{t('home.training')}</p>
            <p className="text-sm text-gray-500">{t('home.viewTraining')}</p>
          </button>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-gray-900 mb-3">{t('home.recentActivity')}</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-gray-500">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm">{t('home.checkInToday')}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm">{t('home.scheduleTomorrow')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around">
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-1 text-primary"
        >
          <Clock size={22} />
          <span className="text-xs">{t('nav.attendance')}</span>
        </button>
        <button
          onClick={() => navigate('/schedule')}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <Calendar size={22} />
          <span className="text-xs">{t('nav.schedule')}</span>
        </button>
        <button
          onClick={() => navigate('/leave')}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <CalendarDays size={22} />
          <span className="text-xs">{t('nav.leave')}</span>
        </button>
        <button
          onClick={() => navigate('/reimbursement')}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <Receipt size={22} />
          <span className="text-xs">{t('nav.reimbursement')}</span>
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <User size={22} />
          <span className="text-xs">{t('nav.profile')}</span>
        </button>
      </nav>
    </div>
  )
}