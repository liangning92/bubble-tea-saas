import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function InventoryIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'list', label: t('inventory.list'), path: '/inventory' },
    { key: 'logs', label: t('inventory.logs'), path: '/inventory/logs' },
    { key: 'process', label: t('inventory.process'), path: '/inventory/process' },
    { key: 'alerts', label: t('inventory.alerts'), path: '/inventory/alerts' },
    { key: 'restock', label: t('inventory.restock'), path: '/inventory/restock' },
    { key: 'suppliers', label: t('inventory.suppliers'), path: '/inventory/suppliers' },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="flex flex-col h-full">
      {/* 固定在顶部 */}
      <div className="sticky top-0 bg-surface z-10 pb-4 border-b border-gray-200 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap overflow-x-auto">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              to={tab.path}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                isActive(tab.path)
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