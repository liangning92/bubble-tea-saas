import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth'
import { configApi } from '../../services/api'
import { X, Loader2 } from 'lucide-react'

interface TaxConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

interface TaxConfig {
  ppnEnabled: boolean
  ppnRate: number
  taxExemptCategories: string[]
  taxableRatio: number  // Percentage of revenue used for tax reporting (0-100)
}

export function TaxConfigModal({ isOpen, onClose, onSaved }: TaxConfigModalProps) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [config, setConfig] = useState<TaxConfig>({
    ppnEnabled: true,
    ppnRate: 11,
    taxExemptCategories: [],
    taxableRatio: 100
  })
  const [exemptInput, setExemptInput] = useState('')

  // Load current config
  useEffect(() => {
    if (isOpen && user?.storeId) {
      loadConfig()
    }
  }, [isOpen, user?.storeId])

  const loadConfig = async () => {
    if (!user?.storeId) return
    setIsLoading(true)
    try {
      const res = await configApi.get(user.storeId)
      const configs = res.data?.data || []

      const ppnEnabledConfig = configs.find((c: any) => c.key === 'finance.ppnEnabled')
      const ppnRateConfig = configs.find((c: any) => c.key === 'finance.ppnRate')
      const exemptConfig = configs.find((c: any) => c.key === 'finance.taxExemptCategories')
      const taxableRatioConfig = configs.find((c: any) => c.key === 'finance.taxableRatio')

      setConfig({
        ppnEnabled: ppnEnabledConfig ? JSON.parse(ppnEnabledConfig.value) : true,
        ppnRate: ppnRateConfig ? parseFloat(ppnRateConfig.value) : 11,
        taxExemptCategories: exemptConfig ? JSON.parse(exemptConfig.value) : [],
        taxableRatio: taxableRatioConfig ? parseFloat(taxableRatioConfig.value) : 100
      })
    } catch (error) {
      console.error('Failed to load tax config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user?.storeId) return

    setIsSaving(true)
    try {
      const configs = [
        { key: 'finance.ppnEnabled', value: JSON.stringify(config.ppnEnabled), category: 'finance' },
        { key: 'finance.ppnRate', value: config.ppnRate.toString(), category: 'finance' },
        { key: 'finance.taxExemptCategories', value: JSON.stringify(config.taxExemptCategories), category: 'finance' },
        { key: 'finance.taxableRatio', value: config.taxableRatio.toString(), category: 'finance' }
      ]

      await configApi.setBatch(user.storeId, configs)
      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Failed to save tax config:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const addExemptCategory = () => {
    const category = exemptInput.trim()
    if (category && !config.taxExemptCategories.includes(category)) {
      setConfig(prev => ({
        ...prev,
        taxExemptCategories: [...prev.taxExemptCategories, category]
      }))
      setExemptInput('')
    }
  }

  const removeExemptCategory = (category: string) => {
    setConfig(prev => ({
      ...prev,
      taxExemptCategories: prev.taxExemptCategories.filter(c => c !== category)
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{t('finance.taxConfig')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* PPN Enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('finance.ppnEnabled')}</p>
                  <p className="text-sm text-gray-500">{t('finance.ppnEnabledHint')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.ppnEnabled}
                    onChange={(e) => setConfig(prev => ({ ...prev, ppnEnabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* PPN Rate */}
              <div>
                <label className="block font-medium mb-2">{t('finance.ppnRate')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.ppnRate}
                    onChange={(e) => setConfig(prev => ({ ...prev, ppnRate: parseFloat(e.target.value) || 0 }))}
                    className="input w-28"
                    min="0"
                    max="100"
                    step="0.1"
                    disabled={!config.ppnEnabled}
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>

              {/* Taxable Ratio */}
              <div>
                <label className="block font-medium mb-2">{t('finance.taxableRatio')}</label>
                <p className="text-sm text-gray-500 mb-2">{t('finance.taxableRatioHint')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.taxableRatio}
                    onChange={(e) => setConfig(prev => ({ ...prev, taxableRatio: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                    className="input w-28"
                    min="0"
                    max="100"
                    step="1"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>

              {/* Tax Exempt Categories */}
              <div>
                <label className="block font-medium mb-2">{t('finance.taxExemptCategories')}</label>
                <p className="text-sm text-gray-500 mb-2">{t('finance.taxExemptHint')}</p>

                {/* Existing categories */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {config.taxExemptCategories.map((category) => (
                    <span
                      key={category}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm"
                    >
                      {category}
                      <button
                        onClick={() => removeExemptCategory(category)}
                        className="p-0.5 hover:bg-gray-200 rounded-full"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add new category */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={exemptInput}
                    onChange={(e) => setExemptInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addExemptCategory()}
                    placeholder={t('finance.taxExemptPlaceholder')}
                    className="input flex-1"
                  />
                  <button onClick={addExemptCategory} className="btn btn-outline">
                    {t('common.add')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="btn btn-outline">
            {t('common.cancel')}
          </button>
          <button onClick={handleSave} className="btn btn-primary" disabled={isSaving}>
            {isSaving ?<Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}