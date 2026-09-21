import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { Settings } from 'lucide-react'

interface FinanceSettings {
  enableAccounts: boolean
  enableBudget: boolean
  enableTransfer: boolean
  enableFixedAssets: boolean
  accountingMode: 'simple' | 'standard'
  cashOnlyMode: boolean
}

export function FinanceIndexPage() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  useEffect(() => {
    console.log('[I18N FINANCE]', {
      language: i18n.language,
      resolvedLanguage: i18n.resolvedLanguage,
      result: t('finance.revenue'),
      resource: i18n.getResourceBundle('zh', 'translation')?.finance,
    })
  }, [])
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<FinanceSettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const storeId = user?.storeId
      if (!storeId) return

      const configs = await configApi.get(storeId)
      // API returns { code, data: [...] }, axios wraps as { data: { code, data: [...] } }
      const configData = configs.data?.data?.data || []

      let foundSettings: FinanceSettings | null = null
      configData.forEach((c: any) => {
        if (c.key === 'finance.settings') {
          try {
            foundSettings = JSON.parse(c.value)
          } catch {}
        }
      })

      if (foundSettings) {
        setSettings(foundSettings)
      } else {
        // Default settings - show all features
        setSettings({
          enableAccounts: true,
          enableBudget: true,
          enableTransfer: true,
          enableFixedAssets: true,
          accountingMode: 'standard',
          cashOnlyMode: false
        })
      }
    } catch (err) {
      console.error('Failed to load finance settings:', err)
      // Default to showing all
      setSettings({
        enableAccounts: true,
        enableBudget: true,
        enableTransfer: true,
        enableFixedAssets: true,
        accountingMode: 'standard',
        cashOnlyMode: false
      })
    }
  }

  // Build tabs based on settings
  const tabs = [
    { key: 'revenue', label: t('finance.revenue'), path: 'revenue', show: true },
    { key: 'accounts', label: t('finance.chartOfAccounts'), path: 'accounts', show: settings?.enableAccounts ?? true },
    { key: 'budgets', label: t('finance.budget'), path: 'budgets', show: settings?.enableBudget ?? true },
    { key: 'orders', label: t('finance.orders'), path: 'orders', show: true },
    { key: 'expenses', label: t('finance.expense'), path: 'expenses', show: true },
    { key: 'fixed-assets', label: t('finance.fixedAssets'), path: 'fixed-assets', show: settings?.enableFixedAssets ?? true },
    { key: 'reports', label: t('finance.financialReports'), path: 'reports', show: true },
    { key: 'tax', label: t('finance.tax'), path: 'tax', show: true },
    { key: 'settings', label: t('common.settings'), path: 'settings', show: true, icon: Settings },
  ].filter(tab => tab.show)

  // Match current path
  const currentTab = tabs.find(tab => location.pathname.endsWith('/' + tab.path))?.key || 'revenue'

  return (
    <div className="flex flex-col h-full">
      {/* 二级导航 */}
      <div className="sticky top-0 bg-surface z-10 pb-4 border-b border-gray-200 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-lg shadow-sm inline-flex flex-wrap">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.key}
                to={tab.path}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  currentTab === tab.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {Icon && <Icon size={16} />}
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