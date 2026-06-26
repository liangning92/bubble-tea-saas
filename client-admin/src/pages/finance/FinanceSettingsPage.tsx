import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {
  Settings, Save, RotateCcw, Building2, Wallet, Receipt,
  Calculator, FileText, Check, AlertCircle
} from 'lucide-react'

interface FinanceSettings {
  // 功能开关
  enableAccounts: boolean        // 启用账户管理
  enableBudget: boolean          // 启用预算管理
  enableTransfer: boolean        // 启用账户转账
  enableFixedAssets: boolean     // 启用固定资产

  // 会计模式
  accountingMode: 'simple' | 'standard'  // 简单模式 vs 标准会计模式

  // 现金交易
  cashOnlyMode: boolean          // 现金交易模式（简化界面）

  // 税配置
  ppnEnabled: boolean            // 启用PPN
  ppnRate: number                // PPN税率

  // 货币
  currency: string               // 货币代码
  currencySymbol: string         // 货币符号
}

const DEFAULT_SETTINGS: FinanceSettings = {
  enableAccounts: true,
  enableBudget: true,
  enableTransfer: true,
  enableFixedAssets: true,
  accountingMode: 'standard',
  cashOnlyMode: false,
  ppnEnabled: true,
  ppnRate: 11,
  currency: 'IDR',
  currencySymbol: 'Rp'
}

export function FinanceSettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const storeId = user?.storeId
      if (!storeId) return

      const configs = await configApi.get(storeId)
      const configData = configs.data?.data || []

      // 解析已保存的配置
      const savedSettings: Partial<FinanceSettings> = {}
      configData.forEach((c: any) => {
        if (c.key === 'finance.settings') {
          try {
            Object.assign(savedSettings, JSON.parse(c.value))
          } catch {}
        }
        if (c.key === 'finance.ppnRate') {
          savedSettings.ppnRate = parseFloat(c.value) || 11
        }
        if (c.key === 'finance.ppnEnabled') {
          savedSettings.ppnEnabled = c.value === 'true'
        }
      })

      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)
      const storeId = user?.storeId
      if (!storeId) return

      // 保存财务设置
      await configApi.set(
        storeId,
        'finance.settings',
        JSON.stringify({
          enableAccounts: settings.enableAccounts,
          enableBudget: settings.enableBudget,
          enableTransfer: settings.enableTransfer,
          enableFixedAssets: settings.enableFixedAssets,
          accountingMode: settings.accountingMode,
          cashOnlyMode: settings.cashOnlyMode
        }),
        'finance'
      )

      // 保存PPN配置
      await configApi.set(storeId, 'finance.ppnRate', settings.ppnRate.toString(), 'finance')
      await configApi.set(storeId, 'finance.ppnEnabled', settings.ppnEnabled.toString(), 'finance')

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError(t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm(t('finance.resetConfirm'))) {
      setSettings(DEFAULT_SETTINGS)
    }
  }

  const handleModeChange = (mode: 'simple' | 'standard') => {
    setSettings(prev => ({
      ...prev,
      accountingMode: mode,
      // 简单模式自动关闭部分功能
      ...(mode === 'simple' ? {
        enableAccounts: false,
        enableBudget: false,
        enableTransfer: false,
        enableFixedAssets: false
      } : {})
    }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Settings size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('finance.financeSettings')}</h1>
            <p className="text-sm text-gray-500">{t('finance.settingsDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={18} />
            {t('common.reset')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <Check size={18} />
            ) : (
              <Save size={18} />
            )}
            {saved ? t('common.success') : t('common.save')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* 会计模式选择 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('finance.accountingMode')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleModeChange('simple')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              settings.accountingMode === 'simple'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                settings.accountingMode === 'simple' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                <Receipt size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{t('finance.simpleMode')}</h3>
                <p className="text-sm text-gray-500">{t('finance.simpleModeDesc')}</p>
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              • {t('finance.cashOnly')}
            </div>
          </button>

          <button
            onClick={() => handleModeChange('standard')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              settings.accountingMode === 'standard'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                settings.accountingMode === 'standard' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                <Calculator size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{t('finance.standardMode')}</h3>
                <p className="text-sm text-gray-500">{t('finance.standardModeDesc')}</p>
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              • {t('finance.fullFeatures')}
            </div>
          </button>
        </div>
      </div>

      {/* 功能开关 */}
      {settings.accountingMode === 'standard' && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('finance.featureModule')}</h2>
          <div className="space-y-4">
            <SettingToggle
              icon={<Building2 size={20} />}
              title={t('finance.accountManagement')}
              description={t('finance.accountManagementDesc')}
              checked={settings.enableAccounts}
              onChange={(v) => setSettings(prev => ({ ...prev, enableAccounts: v }))}
            />

            <SettingToggle
              icon={<Wallet size={20} />}
              title={t('finance.budgetManagement')}
              description={t('finance.budgetManagementDesc')}
              checked={settings.enableBudget}
              onChange={(v) => setSettings(prev => ({ ...prev, enableBudget: v }))}
            />

            <SettingToggle
              icon={<FileText size={20} />}
              title={t('finance.transfer')}
              description={t('finance.transferDesc')}
              checked={settings.enableTransfer}
              onChange={(v) => setSettings(prev => ({ ...prev, enableTransfer: v }))}
              disabled={!settings.enableAccounts}
            />

            <SettingToggle
              icon={<Calculator size={20} />}
              title={t('finance.fixedAssets')}
              description={t('finance.fixedAssetsDesc')}
              checked={settings.enableFixedAssets}
              onChange={(v) => setSettings(prev => ({ ...prev, enableFixedAssets: v }))}
            />
          </div>
        </div>
      )}

      {/* 税务配置 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('finance.taxConfig')}</h2>
        <div className="space-y-4">
          <SettingToggle
            icon={<FileText size={20} />}
            title={t('finance.enablePPN')}
            description={t('finance.enablePPNDesc')}
            checked={settings.ppnEnabled}
            onChange={(v) => setSettings(prev => ({ ...prev, ppnEnabled: v }))}
          />

          {settings.ppnEnabled && (
            <div className="pl-9">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('finance.ppnRate')} (%)
              </label>
              <input
                type="number"
                value={settings.ppnRate}
                onChange={(e) => setSettings(prev => ({ ...prev, ppnRate: parseFloat(e.target.value) || 0 }))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                min={0}
                max={100}
                step={0.1}
              />
              <p className="text-xs text-gray-500 mt-1">{t('finance.ppnRateHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 设置开关组件
function SettingToggle({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled = false
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
          {icon}
        </div>
        <div>
          <h3 className="font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}