import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function MarketingIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'promotions', label: t('marketing.promotions'), path: '/marketing/promotions' },
    { key: 'members', label: t('marketing.membersGroup'), path: '/marketing/members' },
    { key: 'points', label: t('marketing.points'), path: '/marketing/points' },
    { key: 'messages', label: t('marketing.messages'), path: '/marketing/messages' },
    { key: 'operations', label: t('marketing.operations'), path: '/marketing/operations' },
  ]

  const currentTab = tabs.find(tab => location.pathname === tab.path || location.pathname.startsWith(tab.path + '/'))?.key || 'promotions'

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-surface z-10 pb-4 border-b border-gray-200 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap">
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
      </div>

      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}