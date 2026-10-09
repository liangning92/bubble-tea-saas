import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import {
  Clock,
  Calendar,
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
  ChevronDown,
  AlertTriangle,
  Award,
  ChevronRight,
  Sparkles,
  Lock
} from 'lucide-react'

const LANGUAGES = [
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'zh', label: '中文', flag: '🇨🇳' }
]

interface MonthlyOverviewData {
  staff: {
    id: string
    name: string
    employeeNumber?: string
    position?: string
    storeName?: string
  }
  month: string
  attendance: {
    presentDays: number
    lateCount: number
    earlyLeaveCount: number
    leaveDays: number
    todayAttendance: any
  }
  pointsAndDiscipline: {
    currentPoints: number
    monthlyEarnedPoints: number
    monthlyDeductedPoints: number
    rewardsCount: number
    penaltiesCount: number
    recentLogs: any[]
    recentDisciplines: any[]
  }
  schedule: {
    todayShift: {
      shiftKey: string
      shiftName: string
      startTime?: string
      endTime?: string
      color?: string
    } | null
    weeklyList: any[]
  }
  pendingHygieneTasks: number
  announcements: any[]
}

export function HomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const [overview, setOverview] = useState<MonthlyOverviewData | null>(null)
  const [todayAttendance, setTodayAttendance] = useState<any>(null)
  const [pendingTasksCount, setPendingTasksCount] = useState(0)
  const [, setIsLoading] = useState(true)
  const [showLangMenu, setShowLangMenu] = useState(false)

  // Load saved language preference
  useEffect(() => {
    const savedLang = localStorage.getItem('bubble-tea-language')
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang)
    }
  }, [])

  useEffect(() => {
    if (user?.staffId) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // 1. Load comprehensive monthly dashboard data
      const [overviewRes, todayAttRes, pendingTasksRes] = await Promise.all([
        staffApi.getMonthlyOverview().catch(() => null),
        staffApi.getTodayAttendance(user!.staffId).catch(() => null),
        staffApi.getMyPendingTasks().catch(() => null)
      ])

      if (overviewRes?.data) {
        setOverview(overviewRes.data)
      }
      if (todayAttRes?.data) {
        setTodayAttendance(todayAttRes.data)
      } else if (overviewRes?.data?.attendance?.todayAttendance) {
        setTodayAttendance(overviewRes.data.attendance.todayAttendance)
      }
      if (pendingTasksRes?.data?.count !== undefined) {
        setPendingTasksCount(pendingTasksRes.data.count)
      } else if (overviewRes?.data?.pendingHygieneTasks !== undefined) {
        setPendingTasksCount(overviewRes.data.pendingHygieneTasks)
      }
    } catch (error) {
      console.error('Failed to load home page data:', error)
    } finally {
      setIsLoading(false)
    }
  };

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode)
    localStorage.setItem('bubble-tea-language', langCode)
    setShowLangMenu(false)
  }

  const getCurrentLang = () => {
    return LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return t('time.morning')
    if (hour < 15) return t('time.afternoon')
    if (hour < 18) return t('time.evening')
    return t('time.night')
  }

  const todayShift = overview?.schedule?.todayShift

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Top Header */}
      <header className="bg-primary text-white px-4 pt-6 pb-8 rounded-b-3xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center font-bold text-xl shadow-inner">
              {user?.name?.charAt(0) || 'S'}
            </div>
            <div>
              <p className="text-white/80 text-xs">{getGreeting()}</p>
              <h1 className="font-bold text-lg leading-tight">{user?.name || 'Staff'}</h1>
              <p className="text-white/70 text-xs mt-0.5">
                {overview?.staff?.position || user?.position || t('home.staff')} · {overview?.staff?.storeName || 'Store'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/announcements')}
              className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors relative"
            >
              <Bell size={18} />
              {(overview?.announcements?.length || 0) > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full" />
              )}
            </button>

            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="p-2 bg-white/20 rounded-full flex items-center gap-1 hover:bg-white/30 transition-colors"
              >
                <Globe size={18} />
                <span className="text-xs">{getCurrentLang().flag}</span>
                <ChevronDown size={12} />
              </button>
              {showLangMenu && (
                <div className="absolute right-0 top-11 bg-white rounded-xl shadow-xl py-2 z-50 min-w-[130px] border border-gray-100">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 ${
                        i18n.language === lang.code ? 'text-primary font-bold bg-pink-50/50' : 'text-gray-700'
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
              className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Today Shift & Duty Badge Card */}
        <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Calendar size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white/80 text-xs">{t('home.todayScheduleTitle')}</p>
                <p className="font-bold text-sm text-white">
                  {todayShift ? `${todayShift.shiftName} (${todayShift.startTime || '08:00'} - ${todayShift.endTime || '16:00'})` : t('home.noShiftToday')}
                </p>
              </div>
            </div>

            <div className="text-right">
              {todayAttendance ? (
                <div>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    todayAttendance.checkOutTime ? 'bg-white/20 text-white' : 'bg-emerald-400 text-emerald-950'
                  }`}>
                    {todayAttendance.checkOutTime ? t('home.checkedIn') : t('home.working')}
                  </span>
                  <p className="text-white/70 text-xs mt-1">
                    {new Date(todayAttendance.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ) : (
                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400 text-amber-950 animate-pulse">
                  {t('home.notCheckedIn')}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="px-4 -mt-3 space-y-4">

        {/* 1. Quick Check-In / Check-Out Hero Action */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              todayAttendance?.checkInTime && !todayAttendance?.checkOutTime
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-primary/10 text-primary'
            }`}>
              <Clock size={24} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">
                {todayAttendance?.checkInTime && !todayAttendance?.checkOutTime ? t('attendance.checkOut') : t('attendance.checkIn')}
              </h2>
              <p className="text-xs text-gray-500">
                {todayAttendance?.checkInTime && !todayAttendance?.checkOutTime ? t('home.clickToLeave') : t('home.clickToWork')}
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/attendance')}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${
              todayAttendance?.checkInTime && !todayAttendance?.checkOutTime
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {todayAttendance?.checkInTime && !todayAttendance?.checkOutTime ? t('attendance.checkOut') : t('attendance.checkIn')}
          </button>
        </div>

        {/* 2. Urgent / Active Announcement Bar (if any) */}
        {overview?.announcements && overview.announcements.length > 0 && (
          <div
            onClick={() => navigate('/announcements')}
            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/70 rounded-2xl p-3 flex items-center gap-3 cursor-pointer shadow-xs"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Bell size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded">
                  {t('home.urgentNotice')}
                </span>
                <span className="text-xs font-semibold text-gray-900 truncate">
                  {overview.announcements[0]?.title}
                </span>
              </div>
              <p className="text-xs text-gray-600 truncate mt-0.5">
                {overview.announcements[0]?.content}
              </p>
            </div>
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          </div>
        )}

        {/* 3. Hygiene Tasks Prompt (Current Important Duties) */}
        <div
          onClick={() => navigate('/hygiene')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-orange-200 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-sm">{t('home.pendingHygieneBadge')}</h3>
                {pendingTasksCount > 0 ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-600">
                    {pendingTasksCount} {t('home.hygieneTasksDue')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-100 text-emerald-700">
                    ✓ Clean & Done
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{t('hygiene.myTasks')}</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </div>

        {/* 4. This Month Profile & Essential Operational Metrics */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <h2 className="font-bold text-gray-900 text-sm">{t('home.monthlyProfile')}</h2>
            </div>
            <span className="text-xs font-medium text-gray-400">
              {overview?.month || new Date().toISOString().slice(0, 7)}
            </span>
          </div>

          {/* Attendance Health Grid */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">{t('home.attendanceHealth')}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <p className="text-lg font-bold text-gray-900">{overview?.attendance?.presentDays || 0}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('home.presentDays')}</p>
              </div>

              <div className={`rounded-xl p-2.5 border ${
                (overview?.attendance?.lateCount || 0) > 0 ? 'bg-amber-50/70 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-900'
              }`}>
                <p className="text-lg font-bold">
                  {overview?.attendance?.lateCount || 0}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('home.lateCount')}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <p className="text-lg font-bold text-gray-900">{overview?.attendance?.earlyLeaveCount || 0}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('home.earlyLeaveCount')}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                <p className="text-lg font-bold text-gray-900">{overview?.attendance?.leaveDays || 0}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('home.leaveDays')}</p>
              </div>
            </div>
          </div>

          {/* Rewards & Penalties / Points Grid */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">{t('home.rewardsPenalties')}</p>
              <button
                onClick={() => navigate('/points')}
                className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
              >
                {t('home.viewPoints')}
                <ChevronRight size={12} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-50/60 rounded-xl p-2.5 border border-amber-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Star size={16} />
                </div>
                <div>
                  <p className="text-base font-bold text-amber-900">{overview?.pointsAndDiscipline?.currentPoints || 0}</p>
                  <p className="text-[10px] text-amber-700">{t('home.netPoints')}</p>
                </div>
              </div>

              <div className="bg-emerald-50/60 rounded-xl p-2.5 border border-emerald-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <Award size={16} />
                </div>
                <div>
                  <p className="text-base font-bold text-emerald-900">+{overview?.pointsAndDiscipline?.monthlyEarnedPoints || 0}</p>
                  <p className="text-[10px] text-emerald-700">{t('home.earnedPoints')}</p>
                </div>
              </div>

              <div className="bg-rose-50/60 rounded-xl p-2.5 border border-rose-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <p className="text-base font-bold text-rose-900">-{overview?.pointsAndDiscipline?.monthlyDeductedPoints || 0}</p>
                  <p className="text-[10px] text-rose-700">{t('home.deductedPoints')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Confidential Notice (Compliance requirement) */}
          <div className="mt-3 bg-gray-50/80 rounded-xl p-2.5 flex items-center gap-2 border border-gray-200/60 text-gray-500 text-xs">
            <Lock size={14} className="text-gray-400 shrink-0" />
            <p className="text-[11px] leading-tight">
              {t('home.confidentialNotice')}
            </p>
          </div>
        </div>

        {/* 5. Quick Navigation Grid (All Tools & Sub-modules) */}
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {t('home.quickActions')}
          </h2>

          <div className="grid grid-cols-4 gap-3">
            {/* Shift Schedule */}
            <button
              onClick={() => navigate('/schedule')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-1.5">
                <Calendar size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.schedule')}</span>
            </button>

            {/* Attendance Rules */}
            <button
              onClick={() => navigate('/attendance/rules')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-1.5">
                <ShieldCheck size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('attendance.rules')}</span>
            </button>

            {/* Leave Application */}
            <button
              onClick={() => navigate('/leave')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mb-1.5">
                <CalendarDays size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.leave')}</span>
            </button>

            {/* Reimbursement */}
            <button
              onClick={() => navigate('/reimbursement')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-1.5">
                <Receipt size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.reimbursement')}</span>
            </button>

            {/* Inventory In/Out */}
            <button
              onClick={() => navigate('/inventory')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center mb-1.5">
                <Package size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('inventory.title')}</span>
            </button>

            {/* Points & Rewards */}
            <button
              onClick={() => navigate('/points')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-1.5">
                <Star size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.points')}</span>
            </button>

            {/* Deposit */}
            <button
              onClick={() => navigate('/deposit')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-1.5">
                <WalletIcon size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.deposit')}</span>
            </button>

            {/* Training Academy */}
            <button
              onClick={() => navigate('/training')}
              className="bg-white p-3 rounded-2xl shadow-xs border border-gray-100 flex flex-col items-center text-center active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center mb-1.5">
                <BookOpen size={22} />
              </div>
              <span className="text-xs font-semibold text-gray-800">{t('home.training')}</span>
            </button>
          </div>
        </div>

        {/* Training Academy Banner CTA */}
        <button
          onClick={() => navigate('/training')}
          className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-orange-400 text-white rounded-2xl shadow-sm p-4 text-left flex items-center gap-3 active:scale-[0.99] transition-transform"
        >
          <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <BookOpen size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{t('home.training')}</p>
            <p className="text-xs text-white/90 truncate">
              {i18n.language === 'zh'
                ? '服务标准 · 卫生规范 · 原料品控 · 配方制作'
                : i18n.language === 'en'
                ? 'Service Standards · Hygiene SOP · Recipes'
                : 'Standar Layanan · SOP Kebersihan · Resep'}
            </p>
          </div>
          <ChevronRight size={18} className="text-white/80 shrink-0" />
        </button>

      </div>
    </div>
  )
}
