import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function FinanceIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'revenue', label: t('finance.revenue'), path: 'revenue' },
    { key: 'orders', label: t('finance.orders'), path: 'orders' },
    { key: 'expenses', label: t('finance.expense'), path: 'expenses' },
    { key: 'fixed-assets', label: t('finance.fixedAssets'), path: 'fixed-assets' },
    { key: 'reports', label: t('finance.financialReports'), path: 'reports' },
    { key: 'tax', label: t('finance.tax'), path: 'tax' },
  ]

  // Match current path - since we're nested under /finance, we check if location.pathname ends with the tab path
  const currentTab = tabs.find(tab => location.pathname.endsWith('/' + tab.path))?.key || 'revenue'

  return (
    <div className="flex flex-col h-full">
      {/* 二级导航 */}
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

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}