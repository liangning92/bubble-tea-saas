import { useTranslation } from 'react-i18next'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Star, Settings, Gift } from 'lucide-react'

export function PointsIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'points', label: t('staff.points'), path: '/staff/points', icon: Star },
    { key: 'rules', label: t('staff.pointsRule'), path: '/staff/points/rules', icon: Settings },
    { key: 'rewards', label: t('staff.rewards'), path: '/staff/points/rewards', icon: Gift },
  ]

  const currentTab = tabs.find(tab => location.pathname.includes(tab.key))?.key || 'points'

  return (
    <div className="flex flex-col h-full">
      {/* 三级导航 - 积分模块 */}
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