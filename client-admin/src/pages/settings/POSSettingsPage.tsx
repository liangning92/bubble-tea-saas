import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { CheckCircle, Loader2, Smartphone, LayoutGrid, CreditCard, Volume2, Tag, Layers, Users, Receipt, Wallet, Printer } from 'lucide-react'

type POSSubTab = 'layout' | 'toolbar' | 'channels' | 'tax' | 'quickAmounts' | 'sound' | 'display' | 'shift' | 'payment' | 'receipt' | 'hardware'

export function POSSettingsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeSubTab, setActiveSubTab] = useState<POSSubTab>('layout')
  const [showSuccess, setShowSuccess] = useState(false)

  // ========== DATA LOADING ==========
  const { data: posConfig, isLoading } = useQuery({
    queryKey: ['config', 'pos', user?.storeId],
    queryFn: () => configApi.get(user?.storeId || ''),
    enabled: !!user?.storeId
  })

  // ========== STATE WITH DEFAULT VALUES ==========
  const [posLayout, setPosLayout] = useState({
    gridCols: '4',
    cardSize: 'medium',
    showCategory: true,
    showPrice: true,
    productImage: true,
    compactMode: false,
    productSortBy: 'name', // name, price_asc, price_desc, category
    productSortOrder: 'asc',
  })

  const [toolbarSettings, setToolbarSettings] = useState({
    showSuspend: true,
    showHistory: true,
    showScan: true,
    showShift: true,
    showCash: false,
    showTasks: true,
    showLogout: true,
    // Button labels (customizable)
    labels: {
      suspend: 'suspend',
      history: 'history',
      scan: 'scan',
      shift: 'shift',
      cash: 'cash',
      tasks: 'tasks',
      logout: 'logout'
    }
  })

  const [channelSettings, setChannelSettings] = useState({
    dineIn: { enabled: true, name: 'Dine In', icon: '🍵', color: '#EC6D88' },
    gofood: { enabled: true, name: 'GoFood', icon: '🟢', color: '#25A549' },
    grab: { enabled: true, name: 'Grab', icon: '🟡', color: '#F88100' },
    shopee: { enabled: true, name: 'Shopee', icon: '🟠', color: '#EE4D2D' },
  })

  const [taxSettings, setTaxSettings] = useState({
    enabled: true,
    rate: 11,
    showOnReceipt: true,
    exemptItems: [] as string[], // product IDs that are tax-exempt
  })

  const [quickAmounts, setQuickAmounts] = useState({
    enabled: true,
    amounts: [10000, 20000, 50000, 100000],
  })

  const [soundSettings, setSoundSettings] = useState({
    keypress: { enabled: true, volume: 80 },
    orderComplete: { enabled: true, volume: 100 },
    error: { enabled: true, volume: 100 },
    newOrder: { enabled: true, volume: 100 },
  })

  const [displaySettings, setDisplaySettings] = useState({
    language: 'id',
    theme: 'light', // light, dark
    fontSize: 'medium', // small, medium, large
    showOfflineIndicator: true,
    autoLogoutMinutes: 30,
    autoLockMinutes: 5, // 锁屏时间（分钟），0 = 禁用
    lockScreenPin: '', // 锁屏密码
  })

  // 交接班设置
  const [shiftSettings, setShiftSettings] = useState({
    requireReconciliation: false,
    requireSupervisorConfirm: false,
    showSummary: true,
    cashDifferenceLimit: 0,
    summaryItems: {
      orderCount: true,
      customerCount: true,
      cashSales: true,
      qrisSales: true,
      cashIn: true,
      cashOut: true,
      openFloat: true,
      closeCash: true,
      dineInCount: true,
      gofoodCount: true,
      grabCount: true,
      shopeeCount: true,
      suspendedOrders: true,
      pendingSync: true,
    }
  })

  // 支付方式设置
  const [paymentMethods, setPaymentMethods] = useState({
    cash: true,
    qris: true,
    debit: false,
    gopay: false,
    ovo: false,
    dana: false,
    card: false,
  })

  // 小票设置
  const [posReceipt, setPosReceipt] = useState({
    header: 'Bubble Tea Shop',
    footer: 'Thank you!',
    taxRate: 11,
    showLogo: true,
    headerCustomText: '',
    footerMessage: '',
  })

  // 硬件设置
  const [hardwareSettings, setHardwareSettings] = useState({
    printerIp: '192.168.1.100',
    printerPort: 9100,
    autoOpenCashDrawer: true,
  })

  // ========== LOAD SAVED CONFIG ==========
  useEffect(() => {
    if (posConfig?.data) {
      const configs = posConfig.data
      // Load posLayout
      if (configs.posLayout) {
        setPosLayout(prev => ({ ...prev, ...configs.posLayout }))
      }
      // Load toolbar settings
      if (configs.toolbarSettings) {
        setToolbarSettings(prev => ({
          ...prev,
          ...configs.toolbarSettings,
          labels: { ...prev.labels, ...configs.toolbarSettings.labels }
        }))
      }
      // Load channel settings
      if (configs.channelSettings) {
        setChannelSettings(prev => ({ ...prev, ...configs.channelSettings }))
      }
      // Load tax settings
      if (configs.taxSettings) {
        setTaxSettings(prev => ({ ...prev, ...configs.taxSettings }))
      }
      // Load quick amounts
      if (configs.quickAmounts) {
        setQuickAmounts(prev => ({ ...prev, ...configs.quickAmounts }))
      }
      // Load sound settings
      if (configs.soundSettings) {
        setSoundSettings(prev => ({ ...prev, ...configs.soundSettings }))
      }
      // Load display settings
      if (configs.displaySettings) {
        setDisplaySettings(prev => ({ ...prev, ...configs.displaySettings }))
      }
      // Load shift settings
      if (configs.shiftSettings) {
        setShiftSettings(prev => ({ ...prev, ...configs.shiftSettings }))
      }
      // Load payment methods
      if (configs.paymentMethods) {
        setPaymentMethods(configs.paymentMethods)
      }
      // Load receipt settings
      if (configs.posReceipt || configs.receiptSettings) {
        const receiptConfig = configs.posReceipt || configs.receiptSettings
        setPosReceipt(prev => ({ ...prev, ...receiptConfig }))
      }
      // Load hardware settings
      if (configs.hardwareSettings) {
        setHardwareSettings(prev => ({ ...prev, ...configs.hardwareSettings }))
      }
    }
  }, [posConfig])

  // ========== SAVE MUTATION ==========
  const saveConfigMutation = useMutation({
    mutationFn: (data: { key: string; value: any }) =>
      configApi.set(user?.storeId || '', data.key, data.value, 'pos'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    }
  })

  const handleSave = (key: string, value: any) => {
    saveConfigMutation.mutate({ key, value })
  }

  // ========== TOGGLE COMPONENT ==========
  const Toggle: React.FC<{ enabled: boolean; onChange: () => void }> = ({ enabled, onChange }) => (
    <button
      onClick={onChange}
      className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${enabled ? 'translate-x-[26px]' : 'translate-x-[2px]'}`} />
    </button>
  )

  // ========== SUB TABS ==========
  const subTabs: { key: POSSubTab; labelKey: string; icon: React.ReactNode }[] = [
    { key: 'layout', labelKey: 'posSettings.layout', icon: <LayoutGrid size={18} /> },
    { key: 'toolbar', labelKey: 'posSettings.toolbar', icon: <Smartphone size={18} /> },
    { key: 'channels', labelKey: 'posSettings.channels', icon: <Layers size={18} /> },
    { key: 'tax', labelKey: 'posSettings.tax', icon: <Tag size={18} /> },
    { key: 'quickAmounts', labelKey: 'posSettings.quickAmounts', icon: <CreditCard size={18} /> },
    { key: 'sound', labelKey: 'posSettings.sound', icon: <Volume2 size={18} /> },
    { key: 'display', labelKey: 'posSettings.display', icon: <Smartphone size={18} /> },
    { key: 'shift', labelKey: 'posSettings.shift', icon: <Users size={18} /> },
    { key: 'payment', labelKey: 'posSettings.payment', icon: <Wallet size={18} /> },
    { key: 'receipt', labelKey: 'posSettings.receipt', icon: <Receipt size={18} /> },
    { key: 'hardware', labelKey: 'posSettings.hardware', icon: <Printer size={18} /> },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-pulse">
          <CheckCircle size={18} />
          <span>{t('common.saved')}</span>
        </div>
      )}

      {/* Sub Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm p-1">
        <div className="flex gap-1 overflow-x-auto">
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSubTab === tab.key
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* ========== LAYOUT TAB ========== */}
      {activeSubTab === 'layout' && (
        <div className="space-y-6">
          {/* Grid & Card Settings */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.gridAndCard')}</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.gridColumns')}</label>
                <select
                  value={posLayout.gridCols}
                  onChange={(e) => {
                    setPosLayout({ ...posLayout, gridCols: e.target.value })
                    handleSave('posLayout', { ...posLayout, gridCols: e.target.value })
                  }}
                  className="input"
                >
                  <option value="3">3 {t('posSettings.columns')}</option>
                  <option value="4">4 {t('posSettings.columns')}</option>
                  <option value="5">5 {t('posSettings.columns')}</option>
                  <option value="6">6 {t('posSettings.columns')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.cardSize')}</label>
                <select
                  value={posLayout.cardSize}
                  onChange={(e) => {
                    setPosLayout({ ...posLayout, cardSize: e.target.value })
                    handleSave('posLayout', { ...posLayout, cardSize: e.target.value })
                  }}
                  className="input"
                >
                  <option value="small">{t('posSettings.sizeSmall')}</option>
                  <option value="medium">{t('posSettings.sizeMedium')}</option>
                  <option value="large">{t('posSettings.sizeLarge')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Display Options */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.productDisplay')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showCategory')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showCategoryHint')}</p>
                </div>
                <Toggle
                  enabled={posLayout.showCategory}
                  onChange={() => {
                    const newVal = !posLayout.showCategory
                    setPosLayout({ ...posLayout, showCategory: newVal })
                    handleSave('posLayout', { ...posLayout, showCategory: newVal })
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showPrice')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showPriceHint')}</p>
                </div>
                <Toggle
                  enabled={posLayout.showPrice}
                  onChange={() => {
                    const newVal = !posLayout.showPrice
                    setPosLayout({ ...posLayout, showPrice: newVal })
                    handleSave('posLayout', { ...posLayout, showPrice: newVal })
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showImage')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showImageHint')}</p>
                </div>
                <Toggle
                  enabled={posLayout.productImage}
                  onChange={() => {
                    const newVal = !posLayout.productImage
                    setPosLayout({ ...posLayout, productImage: newVal })
                    handleSave('posLayout', { ...posLayout, productImage: newVal })
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.compactMode')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.compactModeHint')}</p>
                </div>
                <Toggle
                  enabled={posLayout.compactMode}
                  onChange={() => {
                    const newVal = !posLayout.compactMode
                    setPosLayout({ ...posLayout, compactMode: newVal })
                    handleSave('posLayout', { ...posLayout, compactMode: newVal })
                  }}
                />
              </div>
            </div>
          </div>

          {/* Product Sort */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.productSort')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.sortBy')}</label>
                <select
                  value={posLayout.productSortBy}
                  onChange={(e) => {
                    setPosLayout({ ...posLayout, productSortBy: e.target.value })
                    handleSave('posLayout', { ...posLayout, productSortBy: e.target.value })
                  }}
                  className="input"
                >
                  <option value="name">{t('posSettings.sortByName')}</option>
                  <option value="price_asc">{t('posSettings.sortByPriceLow')}</option>
                  <option value="price_desc">{t('posSettings.sortByPriceHigh')}</option>
                  <option value="category">{t('posSettings.sortByCategory')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.sortOrder')}</label>
                <select
                  value={posLayout.productSortOrder}
                  onChange={(e) => {
                    setPosLayout({ ...posLayout, productSortOrder: e.target.value })
                    handleSave('posLayout', { ...posLayout, productSortOrder: e.target.value })
                  }}
                  className="input"
                >
                  <option value="asc">{t('posSettings.ascending')}</option>
                  <option value="desc">{t('posSettings.descending')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== TOOLBAR TAB ========== */}
      {activeSubTab === 'toolbar' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.toolbarButtons')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.toolbarButtonsHint')}</p>
            <div className="space-y-3">
              {[
                { key: 'showSuspend', label: t('posSettings.suspendOrder') },
                { key: 'showHistory', label: t('posSettings.orderHistory') },
                { key: 'showScan', label: t('posSettings.scanBarcode') },
                { key: 'showShift', label: t('posSettings.shiftChange') },
                { key: 'showCash', label: t('posSettings.cashManagement') },
                { key: 'showTasks', label: t('posSettings.hygieneTasks') },
                { key: 'showLogout', label: t('posSettings.logout') },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{item.label}</span>
                  <Toggle
                    enabled={toolbarSettings[item.key as keyof typeof toolbarSettings] as boolean}
                    onChange={() => {
                      const newSettings = {
                        ...toolbarSettings,
                        [item.key]: !toolbarSettings[item.key as keyof typeof toolbarSettings]
                      }
                      setToolbarSettings(newSettings)
                      handleSave('toolbarSettings', newSettings)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== CHANNELS TAB ========== */}
      {activeSubTab === 'channels' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.orderChannels')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.orderChannelsHint')}</p>
            <div className="space-y-3">
              {Object.entries(channelSettings).map(([key, channel]) => (
                <div key={key} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{channel.icon}</span>
                      <span className="font-medium">{channel.name}</span>
                    </div>
                    <Toggle
                      enabled={channel.enabled}
                      onChange={() => {
                        const newChannels = {
                          ...channelSettings,
                          [key]: { ...channel, enabled: !channel.enabled }
                        }
                        setChannelSettings(newChannels)
                        handleSave('channelSettings', newChannels)
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 ml-10">
                    <div>
                      <label className="text-xs text-gray-500">{t('posSettings.channelName')}</label>
                      <input
                        type="text"
                        value={channel.name}
                        onChange={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, name: e.target.value }
                          }
                          setChannelSettings(newChannels)
                        }}
                        onBlur={() => handleSave('channelSettings', channelSettings)}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">{t('posSettings.channelIcon')}</label>
                      <input
                        type="text"
                        value={channel.icon}
                        onChange={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, icon: e.target.value }
                          }
                          setChannelSettings(newChannels)
                        }}
                        onBlur={() => handleSave('channelSettings', channelSettings)}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== TAX TAB ========== */}
      {activeSubTab === 'tax' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.taxSettings')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.enableTax')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.enableTaxHint')}</p>
                </div>
                <Toggle
                  enabled={taxSettings.enabled}
                  onChange={() => {
                    const newVal = !taxSettings.enabled
                    setTaxSettings({ ...taxSettings, enabled: newVal })
                    handleSave('taxSettings', { ...taxSettings, enabled: newVal })
                  }}
                />
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.taxRate')}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={taxSettings.rate}
                    onChange={(e) => setTaxSettings({ ...taxSettings, rate: Number(e.target.value) })}
                    onBlur={() => handleSave('taxSettings', taxSettings)}
                    className="input w-24 text-center"
                    min="0"
                    max="100"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showOnReceipt')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showOnReceiptHint')}</p>
                </div>
                <Toggle
                  enabled={taxSettings.showOnReceipt}
                  onChange={() => {
                    const newVal = !taxSettings.showOnReceipt
                    setTaxSettings({ ...taxSettings, showOnReceipt: newVal })
                    handleSave('taxSettings', { ...taxSettings, showOnReceipt: newVal })
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== QUICK AMOUNTS TAB ========== */}
      {activeSubTab === 'quickAmounts' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.quickAmounts')}</h3>
            <div className="flex items-center gap-4 mb-4">
              <span className="font-medium">{t('posSettings.enableQuickAmounts')}</span>
              <Toggle
                enabled={quickAmounts.enabled}
                onChange={() => {
                  const newVal = !quickAmounts.enabled
                  setQuickAmounts({ ...quickAmounts, enabled: newVal })
                  handleSave('quickAmounts', { ...quickAmounts, enabled: newVal })
                }}
              />
            </div>
            {quickAmounts.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  {quickAmounts.amounts.map((amount, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => {
                          const newAmounts = [...quickAmounts.amounts]
                          newAmounts[idx] = parseInt(e.target.value) || 0
                          setQuickAmounts({ ...quickAmounts, amounts: newAmounts })
                        }}
                        onBlur={() => handleSave('quickAmounts', quickAmounts)}
                        className="input text-center"
                        min="0"
                      />
                      {quickAmounts.amounts.length > 1 && (
                        <button
                          onClick={() => {
                            const newAmounts = quickAmounts.amounts.filter((_, i) => i !== idx)
                            const newQuickAmounts = { ...quickAmounts, amounts: newAmounts }
                            setQuickAmounts(newQuickAmounts)
                            handleSave('quickAmounts', newQuickAmounts)
                          }}
                          className="text-red-500 hover:text-red-700 p-2"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {quickAmounts.amounts.length < 6 && (
                  <button
                    onClick={() => {
                      const newAmounts = [...quickAmounts.amounts, 10000]
                      const newQuickAmounts = { ...quickAmounts, amounts: newAmounts }
                      setQuickAmounts(newQuickAmounts)
                      handleSave('quickAmounts', newQuickAmounts)
                    }}
                    className="btn-secondary text-sm"
                  >
                    + {t('posSettings.addAmount')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== SOUND TAB ========== */}
      {activeSubTab === 'sound' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.soundSettings')}</h3>
            <div className="space-y-4">
                {[
                  { key: 'keypress', label: t('posSettings.keypressSound') },
                  { key: 'orderComplete', label: t('posSettings.orderCompleteSound') },
                  { key: 'error', label: t('posSettings.errorSound') },
                  { key: 'newOrder', label: t('posSettings.newOrderSound') },
                ].map((sound) => (
                  <div key={sound.key} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{sound.label}</span>
                      <Toggle
                        enabled={soundSettings[sound.key as keyof typeof soundSettings]?.enabled ?? true}
                        onChange={() => {
                          const newSettings = {
                            ...soundSettings,
                            [sound.key]: {
                              ...soundSettings[sound.key as keyof typeof soundSettings],
                              enabled: !soundSettings[sound.key as keyof typeof soundSettings]?.enabled
                            }
                          }
                          setSoundSettings(newSettings)
                          handleSave('soundSettings', newSettings)
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <span className="text-sm text-gray-500 w-16">{t('posSettings.volume')}</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={soundSettings[sound.key as keyof typeof soundSettings]?.volume ?? 100}
                        onChange={(e) => {
                          const newSettings = {
                            ...soundSettings,
                            [sound.key]: {
                              ...soundSettings[sound.key as keyof typeof soundSettings],
                              volume: parseInt(e.target.value)
                            }
                          }
                          setSoundSettings(newSettings)
                        }}
                        onMouseUp={() => handleSave('soundSettings', soundSettings)}
                        className="flex-1"
                      />
                      <span className="text-sm w-12">{soundSettings[sound.key as keyof typeof soundSettings]?.volume ?? 100}%</span>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* ========== DISPLAY TAB ========== */}
      {activeSubTab === 'display' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.displaySettings')}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.language')}</label>
                  <select
                    value={displaySettings.language}
                    onChange={(e) => {
                      setDisplaySettings({ ...displaySettings, language: e.target.value })
                      handleSave('displaySettings', { ...displaySettings, language: e.target.value })
                      i18n.changeLanguage(e.target.value)
                    }}
                    className="input"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.fontSize')}</label>
                  <select
                    value={displaySettings.fontSize}
                    onChange={(e) => {
                      setDisplaySettings({ ...displaySettings, fontSize: e.target.value })
                      handleSave('displaySettings', { ...displaySettings, fontSize: e.target.value })
                    }}
                    className="input"
                  >
                    <option value="small">{t('posSettings.sizeSmall')}</option>
                    <option value="medium">{t('posSettings.sizeMedium')}</option>
                    <option value="large">{t('posSettings.sizeLarge')}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showOfflineIndicator')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showOfflineIndicatorHint')}</p>
                </div>
                <Toggle
                  enabled={displaySettings.showOfflineIndicator}
                  onChange={() => {
                    const newVal = !displaySettings.showOfflineIndicator
                    setDisplaySettings({ ...displaySettings, showOfflineIndicator: newVal })
                    handleSave('displaySettings', { ...displaySettings, showOfflineIndicator: newVal })
                  }}
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.autoLogout')}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={displaySettings.autoLogoutMinutes}
                    onChange={(e) => setDisplaySettings({ ...displaySettings, autoLogoutMinutes: Number(e.target.value) })}
                    onBlur={() => handleSave('displaySettings', displaySettings)}
                    className="input w-24 text-center"
                    min="0"
                    max="120"
                  />
                  <span className="text-gray-500">{t('posSettings.minutes')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('posSettings.autoLogoutHint')}</p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.autoLock')}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={displaySettings.autoLockMinutes}
                    onChange={(e) => setDisplaySettings({ ...displaySettings, autoLockMinutes: Number(e.target.value) })}
                    onBlur={() => handleSave('displaySettings', displaySettings)}
                    className="input w-24 text-center"
                    min="0"
                    max="60"
                  />
                  <span className="text-gray-500">{t('posSettings.minutes')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('posSettings.autoLockHint')}</p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.lockScreenPin')}</label>
                <input
                  type="password"
                  value={displaySettings.lockScreenPin || ''}
                  onChange={(e) => setDisplaySettings({ ...displaySettings, lockScreenPin: e.target.value })}
                  onBlur={() => handleSave('displaySettings', displaySettings)}
                  className="input w-40"
                  placeholder="****"
                  maxLength={6}
                />
                <p className="text-xs text-gray-400 mt-1">{t('posSettings.lockScreenPinHint')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== SHIFT TAB ========== */}
      {activeSubTab === 'shift' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.shiftSettings')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.requireReconciliation')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.requireReconciliationHint')}</p>
                </div>
                <Toggle
                  enabled={shiftSettings.requireReconciliation}
                  onChange={() => {
                    const newVal = !shiftSettings.requireReconciliation
                    setShiftSettings({ ...shiftSettings, requireReconciliation: newVal })
                    handleSave('shiftSettings', { ...shiftSettings, requireReconciliation: newVal })
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.requireSupervisorConfirm')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.requireSupervisorConfirmHint')}</p>
                </div>
                <Toggle
                  enabled={shiftSettings.requireSupervisorConfirm}
                  onChange={() => {
                    const newVal = !shiftSettings.requireSupervisorConfirm
                    setShiftSettings({ ...shiftSettings, requireSupervisorConfirm: newVal })
                    handleSave('shiftSettings', { ...shiftSettings, requireSupervisorConfirm: newVal })
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showSummary')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.showSummaryHint')}</p>
                </div>
                <Toggle
                  enabled={shiftSettings.showSummary}
                  onChange={() => {
                    const newVal = !shiftSettings.showSummary
                    setShiftSettings({ ...shiftSettings, showSummary: newVal })
                    handleSave('shiftSettings', { ...shiftSettings, showSummary: newVal })
                  }}
                />
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.cashDifferenceLimit')}</label>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">Rp</span>
                  <input
                    type="number"
                    value={shiftSettings.cashDifferenceLimit}
                    onChange={(e) => setShiftSettings({ ...shiftSettings, cashDifferenceLimit: Number(e.target.value) })}
                    onBlur={() => handleSave('shiftSettings', shiftSettings)}
                    className="input w-32 text-center"
                    min="0"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('posSettings.cashDifferenceLimitHint')}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.summaryItems')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.summaryItemsHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'orderCount', label: t('posSettings.orderCount') },
                { key: 'customerCount', label: t('posSettings.customerCount') },
                { key: 'cashSales', label: t('posSettings.cashSales') },
                { key: 'qrisSales', label: t('posSettings.qrisSales') },
                { key: 'cashIn', label: t('posSettings.cashIn') },
                { key: 'cashOut', label: t('posSettings.cashOut') },
                { key: 'openFloat', label: t('posSettings.openFloat') },
                { key: 'closeCash', label: t('posSettings.closeCash') },
                { key: 'dineInCount', label: t('posSettings.dineInCount') },
                { key: 'gofoodCount', label: t('posSettings.gofoodCount') },
                { key: 'grabCount', label: t('posSettings.grabCount') },
                { key: 'shopeeCount', label: t('posSettings.shopeeCount') },
                { key: 'suspendedOrders', label: t('posSettings.suspendedOrders') },
                { key: 'pendingSync', label: t('posSettings.pendingSync') },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm">{item.label}</span>
                  <Toggle
                                       enabled={shiftSettings.summaryItems[item.key as keyof typeof shiftSettings.summaryItems] as boolean}
                    onChange={() => {
                      const newSummaryItems = {
                        ...shiftSettings.summaryItems,
                        [item.key]: !shiftSettings.summaryItems[item.key as keyof typeof shiftSettings.summaryItems]
                      }
                      setShiftSettings({ ...shiftSettings, summaryItems: newSummaryItems })
                      handleSave('shiftSettings', { ...shiftSettings, summaryItems: newSummaryItems })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== PAYMENT TAB ========== */}
      {activeSubTab === 'payment' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.paymentMethods')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.paymentMethodsHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'cash', label: t('posSettings.paymentCash'), icon: '💵' },
                { key: 'qris', label: t('posSettings.paymentQris'), icon: '📱' },
                { key: 'gopay', label: t('posSettings.paymentGoPay'), icon: '🟢' },
                { key: 'ovo', label: t('posSettings.paymentOvo'), icon: '🟣' },
                { key: 'dana', label: t('posSettings.paymentDana'), icon: '🔵' },
                { key: 'shopeepay', label: t('posSettings.paymentShopeePay'), icon: '🟠' },
              ].map((method) => (
                <div key={method.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{method.icon}</span>
                    <span className="text-sm">{method.label}</span>
                  </div>
                  <Toggle
                    enabled={paymentMethods[method.key as keyof typeof paymentMethods] as boolean}
                    onChange={() => {
                      const newMethods = {
                        ...paymentMethods,
                        [method.key]: !paymentMethods[method.key as keyof typeof paymentMethods]
                      }
                      setPaymentMethods(newMethods)
                      handleSave('paymentMethods', newMethods)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== RECEIPT TAB ========== */}
      {activeSubTab === 'receipt' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.receiptSettings')}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.receiptHeader')}</label>
                  <input
                    type="text"
                    value={posReceipt.header}
                    onChange={(e) => setPosReceipt({ ...posReceipt, header: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder="Bubble Tea Shop"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.receiptFooter')}</label>
                  <input
                    type="text"
                    value={posReceipt.footer}
                    onChange={(e) => setPosReceipt({ ...posReceipt, footer: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder="Thank you!"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.customHeader')}</label>
                  <input
                    type="text"
                    value={posReceipt.headerCustomText || ''}
                    onChange={(e) => setPosReceipt({ ...posReceipt, headerCustomText: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder={t('posSettings.customHeaderPlaceholder') || 'Custom header line'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.customFooter')}</label>
                  <input
                    type="text"
                    value={posReceipt.footerMessage || ''}
                    onChange={(e) => setPosReceipt({ ...posReceipt, footerMessage: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder={t('posSettings.customFooterPlaceholder') || 'Custom footer line'}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.showLogo')}</span>
               </div>
                <Toggle
                  enabled={posReceipt.showLogo}
                  onChange={() => {
                    const newVal = !posReceipt.showLogo
                    setPosReceipt({ ...posReceipt, showLogo: newVal })
                    handleSave('posReceipt', { ...posReceipt, showLogo: newVal })
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== HARDWARE TAB ========== */}
      {activeSubTab === 'hardware' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.hardwareSettings')}</h3>
            <div className="space-y-4">
              {/* Printer IP */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.printerIp')}</label>
                  <input
                    type="text"
                    value={hardwareSettings.printerIp}
                    onChange={(e) => setHardwareSettings({ ...hardwareSettings, printerIp: e.target.value })}
                    onBlur={() => handleSave('hardwareSettings', hardwareSettings)}
                    className="input"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.printerPort')}</label>
                  <input
                    type="number"
                    value={hardwareSettings.printerPort}
                    onChange={(e) => setHardwareSettings({ ...hardwareSettings, printerPort: parseInt(e.target.value) || 9100 })}
                    onBlur={() => handleSave('hardwareSettings', hardwareSettings)}
                    className="input"
                    placeholder="9100"
                  />
                </div>
              </div>

              {/* Auto Open Cash Drawer */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{t('posSettings.autoOpenCashDrawer')}</span>
                  <p className="text-sm text-gray-500">{t('posSettings.autoOpenCashDrawerHint')}</p>
                </div>
                <Toggle
                  enabled={hardwareSettings.autoOpenCashDrawer}
                  onChange={() => {
                    const newVal = !hardwareSettings.autoOpenCashDrawer
                    setHardwareSettings({ ...hardwareSettings, autoOpenCashDrawer: newVal })
                    handleSave('hardwareSettings', { ...hardwareSettings, autoOpenCashDrawer: newVal })
                  }}
                />
              </div>

              {/* Test Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    // Trigger test print by setting flag in config
                    handleSave('hardwareSettings', {
                      ...hardwareSettings,
                      testPrint: Date.now(), // Timestamp as unique trigger
                    })
                    setShowSuccess(true)
                    setTimeout(() => setShowSuccess(false), 2000)
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Printer size={16} />
                  {t('posSettings.testPrinter')}
                </button>
                <button
                  onClick={() => {
                    // Trigger test cash drawer by setting flag in config
                    handleSave('hardwareSettings', {
                      ...hardwareSettings,
                      testCashDrawer: Date.now(), // Timestamp as unique trigger
                    })
                    setShowSuccess(true)
                    setTimeout(() => setShowSuccess(false), 2000)
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  {t('posSettings.testCashDrawer')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}