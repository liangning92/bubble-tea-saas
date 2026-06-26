import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function PointsIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'points-rule', label: t('marketing.pointsRule'), path: '/marketing/points/rule' },
    { key: 'points-expiry', label: t('marketing.pointsExpiry'), path: '/marketing/points/expiry' },
    { key: 'rewards', label: t('marketing.rewards'), path: '/marketing/points/rewards' },
  ]

  const currentTab = tabs.find(tab => location.pathname === tab.path || location.pathname.startsWith(tab.path + '/'))?.key || 'points-rule'

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap mb-4">
        {tabs.map(tab => (
          <Link
            key={tab.key}
            to={tab.path}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentTab === tab.key
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}