import { useTranslation } from 'react-i18next'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Calendar, Clock, FileText, ArrowLeftRight, Settings, Timer } from 'lucide-react'

export function AttendanceIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'dashboard', label: t('staff.attendanceDashboard'), path: '/staff/attendance/dashboard', icon: Calendar },
    { key: 'leave', label: t('nav.leave'), path: '/staff/attendance/leave', icon: FileText },
    { key: 'shift-swap', label: t('staff.shiftSwap'), path: '/staff/attendance/shift-swap', icon: ArrowLeftRight },
    { key: 'overtime', label: t('staff.overtimeRequest'), path: '/staff/attendance/overtime', icon: Timer },
    { key: 'correction', label: t('staff.attendanceCorrection'), path: '/staff/attendance/correction', icon: Clock },
    { key: 'rules', label: t('staff.attendanceRules'), path: '/staff/attendance/rules', icon: Settings },
  ]

  const currentTab = tabs.find(tab => location.pathname.includes(tab.key))?.key || 'dashboard'

  return (
    <div className="flex flex-col h-full">
      {/* 三级导航 - 考勤模块 */}
      <div className="sticky top-0 bg-gray-50 z-10 pb-4 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.key}
                to={tab.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  currentTab === tab.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}