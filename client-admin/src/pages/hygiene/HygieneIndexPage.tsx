import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const tabs = [
  { key: 'templates', path: '', label: 'hygiene.templates' },
  { key: 'areas', path: '/areas', label: 'hygiene.areas' },
  { key: 'calendar', path: '/calendar', label: 'hygiene.calendar' },
  { key: 'today', path: '/today', label: 'hygiene.todayTasks' },
  { key: 'stats', path: '/stats', label: 'hygiene.stats' },
  { key: 'config', path: '/config', label: 'hygiene.config' },
]

export function HygieneIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '') return location.pathname === '/hygiene'
    const fullPath = `/hygiene${path}`
    return location.pathname === fullPath || location.pathname.startsWith(fullPath + '/')
  }

  const currentTab = tabs.find(tab => isActive(tab.path))?.key || 'templates'

  return (
    <div className="flex flex-col h-full">
      {/* 二级导航 */}
      <div className="sticky top-0 bg-surface z-10 pb-4 border-b border-gray-200 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              to={`/hygiene${tab.path}`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t(tab.label)}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
