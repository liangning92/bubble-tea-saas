import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * Channel Management Index Page
 * Contains: Channel List, Reports, Commission Settings, Channel Pricing
 * All child routes render under this parent
 */
export function ChannelIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'list', label: t('channels.list'), path: '/channels' },
    { key: 'reports', label: t('channels.reports'), path: '/channels/reports' },
    { key: 'commissions', label: t('channels.commissions'), path: '/channels/commissions' },
    { key: 'pricing', label: t('channels.pricing'), path: '/channels/pricing' },
  ]

  const currentTab = tabs.find(tab =>
    location.pathname === tab.path ||
    (tab.path !== '/channels' && location.pathname.startsWith(tab.path))
  )?.key || 'list'

  return (
    <div className="flex flex-col h-full">
      {/* Secondary Navigation Tabs */}
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

      {/* 子路由内容 */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}