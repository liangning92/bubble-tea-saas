import {useEmployeeNavigation} from '../../contexts/EmployeeAccess'
import {permissionForPage} from '../../../../shared/StaffAccess'
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
  const { t } = useTranslation()
  const allowed=useEmployeeNavigation()
  const location = useLocation()

  const { user } = useAuthStore()
  const [settings, setSettings] = useState<FinanceSettings | null>(null)

  useEffect(() => {
    loadSettings()
    const refresh = () => { void loadSettings() }
    window.addEventListener('finance-settings-changed', refresh)
    return () => window.removeEventListener('finance-settings-changed', refresh)
  }, [user?.storeId])

  const loadSettings = async () => {
    try {
      const storeId = user?.storeId
      if (!storeId) return

      const configs = await configApi.get(storeId)
      const foundSettings = configs.data?.data?.['finance.settings'] as FinanceSettings | undefined

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
        <div className="admin-module-nav">
          {tabs.filter(tab=>allowed(permissionForPage(tab.path))).map(tab => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.key}
                to={tab.path}
              aria-current={currentTab === tab.key ? 'page' : undefined}
                className={`admin-module-link text-sm font-medium transition-colors flex items-center gap-1.5 ${
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
