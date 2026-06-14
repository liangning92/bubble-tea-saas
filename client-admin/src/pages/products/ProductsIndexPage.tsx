import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function ProductsIndexPage() {
  const { t } = useTranslation()
  const location = useLocation()

  const tabs = [
    { key: 'products', label: t('products.title'), path: '/products' },
    { key: 'costs', label: t('products.costAnalysis'), path: '/products/costs' },
    { key: 'addons', label: t('nav.addons'), path: '/products/addons' },
    { key: 'recipes', label: t('nav.recipes'), path: '/products/recipes' },
    { key: 'analysis', label: t('nav.analysis'), path: '/products/analysis' },
  ]

  // 更精确的匹配：完全匹配或者匹配 /products/后面直接跟子路径的情况
  const currentTab = tabs.find(tab =>
    location.pathname === tab.path ||
    (tab.path !== '/products' && location.pathname.startsWith(tab.path + '/'))
  )?.key || 'products'

  return (
    <div className="flex flex-col h-full">
      {/* 固定在顶部 */}
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