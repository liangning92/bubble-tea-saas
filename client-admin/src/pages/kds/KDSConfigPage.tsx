import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Save, RotateCcw } from 'lucide-react'

interface KDSConfig {
  orderDisplayTime: number // minutes
  overdueThreshold: number // minutes
  displayOrder: 'fifo' | 'priority' | 'platform'
  soundEnabled: boolean
  autoRefreshInterval: number // seconds
  showPlatformBadges: boolean
  showTimer: boolean
}

const defaultConfig: KDSConfig = {
  orderDisplayTime: 60,
  overdueThreshold: 15,
  displayOrder: 'fifo',
  soundEnabled: true,
  autoRefreshInterval: 10,
  showPlatformBadges: true,
  showTimer: true
}

export function KDSConfigPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<KDSConfig>(defaultConfig)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    // Save to localStorage for now (in production would save to server)
    localStorage.setItem('kds-config', JSON.stringify(config))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setConfig(defaultConfig)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="bg-white rounded-xl shadow-sm border border-border">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Settings className="text-white" size={24} />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Display Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('kds.displayOrder')}
            </label>
            <select
              value={config.displayOrder}
              onChange={(e) => setConfig({ ...config, displayOrder: e.target.value as any })}
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="fifo">{t('kds.fifo')}</option>
              <option value="priority">{t('kds.priority')}</option>
              <option value="platform">{t('kds.byPlatform')}</option>
            </select>
          </div>

          {/* Overdue Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('kds.overdueThreshold')}
            </label>
            <input
              type="number"
              value={config.overdueThreshold}
              onChange={(e) => setConfig({ ...config, overdueThreshold: parseInt(e.target.value) || 15 })}
              min={5}
              max={60}
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t('kds.overdueThresholdHint')}
            </p>
          </div>

          {/* Auto Refresh Interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('kds.autoRefresh')}
            </label>
            <input
              type="number"
              value={config.autoRefreshInterval}
              onChange={(e) => setConfig({ ...config, autoRefreshInterval: parseInt(e.target.value) || 10 })}
              min={5}
              max={60}
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Toggle Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{t('kds.enableSound')}</p>
                <p className="text-sm text-gray-500">{t('kds.enableSoundHint')}</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, soundEnabled: !config.soundEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.soundEnabled ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.soundEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{t('kds.showPlatformBadge')}</p>
                <p className="text-sm text-gray-500">{t('kds.showPlatformBadgeHint')}</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, showPlatformBadges: !config.showPlatformBadges })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.showPlatformBadges ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.showPlatformBadges ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{t('kds.showTimer')}</p>
                <p className="text-sm text-gray-500">{t('kds.showTimerHint')}</p>
              </div>
              <button
                onClick={() => setConfig({ ...config, showTimer: !config.showTimer })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.showTimer ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    config.showTimer ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            <RotateCcw size={18} />
            {t('kds.resetDefault')}
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
          >
            <Save size={18} />
            {saved ? t('kds.saved') : t('kds.saveSettings')}
          </button>
        </div>
      </div>
    </div>
  )
}