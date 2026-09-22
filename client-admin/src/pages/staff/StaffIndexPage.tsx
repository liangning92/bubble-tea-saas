import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

const zhStaffFallback: Record<string, string> = {
  'staff.staffFile': '员工档案',
  'staff.attendance': '考勤',
  'staff.schedule': '排班',
  'staff.trainingLabel': '培训',
  'staff.salary': '工资',
  'staff.points': '积分',
}

export function StaffIndexPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()

  const ft = (key: string) => {
    if (i18n.language === 'zh') {
      const fb = zhStaffFallback[key]
      if (fb) return fb
    }
    return t(key)
  }

  const tabs = [
    { key: 'staff', label: ft('staff.staffFile'), path: '/staff' },
    { key: 'attendance', label: ft('staff.attendance'), path: '/staff/attendance' },
    { key: 'schedule', label: ft('staff.schedule'), path: '/staff/schedule' },
    { key: 'training', label: ft('staff.trainingLabel'), path: '/staff/training' },
    { key: 'salary', label: ft('staff.salary'), path: '/staff/salary' },
    { key: 'points', label: ft('staff.points'), path: '/staff/points' },
  ]

  const isActive = (path: string) => location.pathname === path
  const currentTab = tabs.find(tab => isActive(tab.path))?.key || 'staff'

  return (
    <div className="flex flex-col h-full">
      {/* 二级导航 */}
      <div className="sticky top-0 bg-surface z-10 pb-4 border-b border-gray-200 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap overflow-x-auto">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              to={tab.path}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                currentTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}