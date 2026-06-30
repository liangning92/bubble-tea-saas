import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { CheckCircle, Loader2, Smartphone, LayoutGrid, CreditCard, Volume2, Tag, Layers, Users, Receipt, Wallet, Printer, RefreshCw, Upload, X } from 'lucide-react'
import axios from 'axios'

type POSSubTab = 'layout' | 'toolbar' | 'channels' | 'tax' | 'quickAmounts' | 'sound' | 'display' | 'shift' | 'payment' | 'receipt' | 'hardware'

// Toggle Component (shared)
const Toggle: React.FC<{ enabled: boolean; onChange: () => void }> = ({ enabled, onChange }) => (
  <button
    onClick={onChange}
    className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
  >
    <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-[2px] transition-transform ${enabled ? 'translate-x-[26px]' : 'translate-x-[2px]'}`} />
  </button>
)

export function POSSettingsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeSubTab, setActiveSubTab] = useState<POSSubTab>('layout')
  const [showSuccess, setShowSuccess] = useState(false)

  // ========== DATA LOADING ==========
  const { data: posConfig, isLoading } = useQuery({
    queryKey: ['config', 'pos'],
    queryFn: () => configApi.get()
  })

  // ========== STATE WITH DEFAULT VALUES ==========
  // 注意: 这些字段名和结构需要与POS客户端期望的一致
  const [posLayout, setPosLayout] = useState({
    gridCols: '4',
    cardSize: 'medium',
    showCategory: true,
    showPrice: true,
    productImage: true,
    compactMode: false,
    productSortBy: 'name', // name, price_asc, price_desc, category
    productSortOrder: 'asc',
    // POS期望的渠道开关 (扁平结构)
    channelDineIn: true,
    channelGoFood: true,
    channelGrab: true,
    channelShopee: true,
    // 快捷键配置
    hotkeys: {
      newOrder: 'F1',           // 新订单
      suspendOrder: 'F2',       // 挂起
      recallOrder: 'F3',        // 提取
      quickPay: 'F4',           // 快速支付
      barcodeScan: 'F5',         // 扫描
      cashDrawer: 'F6',         // 开钱箱
      receiptPrint: 'F7',      // 重打小票
      cancelOrder: 'F8',         // 取消订单
    },
    // 分类折叠状态
    categoryCollapseState: {} as Record<string, boolean>,
  })

  const [toolbarSettings, setToolbarSettings] = useState({
    showSuspend: true,
    showHistory: true,
    showScan: true,
    showShift: true,
    showCash: false,
    showTasks: true,
    showLogout: true,
    // Button labels - 保存为 toolbarLabels 以匹配POS期望
    toolbarLabels: {
      suspend: 'toolbar.suspend',
      history: 'toolbar.history',
      scan: 'toolbar.scan',
      shift: 'toolbar.shift',
      cash: 'toolbar.cash',
      tasks: 'toolbar.tasks',
      logout: 'toolbar.logout'
    }
  })

  const [channelSettings, setChannelSettings] = useState({
    dineIn: {
      enabled: true,
      name: 'Dine In',
      icon: '🍵',
      color: '#EC6D88',
      availableHours: '00:00-23:59',
      minOrder: 0,
    },
    gofood: {
      enabled: true,
      name: 'GoFood',
      icon: '🟢',
      color: '#25A549',
      availableHours: '09:00-22:00',
      minOrder: 0,
      commissionRate: 15,              // 平台抽成
    },
    grab: {
      enabled: true,
      name: 'Grab',
      icon: '🟡',
      color: '#F88100',
      availableHours: '09:00-22:00',
      minOrder: 0,
      commissionRate: 18,
    },
    shopee: {
      enabled: true,
      name: 'Shopee',
      icon: '🟠',
      color: '#EE4D2D',
      availableHours: '08:00-22:00',
      minOrder: 0,
      commissionRate: 20,
    },
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
    // 升级字段
    defaultMethod: 'cash',           // 默认支付方式
    minAmount: 0,                    // 最低消费
    maxCashAmount: 100000,           // 现金最大金额
    changeEnabled: true,             // 允许找零
    // 通道费率 (百分比)
    rates: {
      qris: 0.7,      // QRIS费率
      gopay: 1.5,     // GoPay费率
      ovo: 1.5,       // OVO费率
      dana: 1.5,       // DANA费率
      shopeepay: 1.5,  // ShopeePay费率
      debit: 1.0,     // 借记卡费率
      card: 1.5,       // 信用卡费率
    },
    settlementCycle: 'same_day',     // 结算周期: same_day / next_day
    installmentEnabled: false,       // 支持分期
  })

  // 小票设置
  const [posReceipt, setPosReceipt] = useState({
    header: 'Bubble Tea Shop',
    footer: 'Thank you!',
    taxRate: 11,
    showLogo: true,
    storeLogo: '',               // 店铺Logo URL
    headerCustomText: '',
    footerMessage: '',
    // 升级字段
    paperSize: '80mm',           // 纸张尺寸: 58mm / 80mm
    printCopies: 1,              // 打印份数
    showQR: false,                // 显示支付二维码
    qrCodeUrl: '',               // 二维码链接/图片URL
    showBarcode: true,            // 显示订单条码
    showKitchenNote: true,        // 显示厨师备注
    storePhone: '',               // 店铺电话
    storeAddress: '',            // 店铺地址
    itemDetailFormat: 'standard', // 明细格式: standard / compact
    showStaffName: true,          // 显示收款员
    showCustomerName: false,      // 显示顾客名称
    autoPrint: true,             // 自动打印
  })

  // 硬件设置
  const [hardwareSettings, setHardwareSettings] = useState({
    printerConnectionType: 'usb',
    printerType: 'escpos',          // 打印机类型: escpos / pcl
    printerIp: '192.168.1.100',
    printerPort: 9100,
    printerName: '',
    cashDrawerPulse: 100,          // 钱箱脉冲(毫秒)
    autoOpenCashDrawer: true,
    scannerEnabled: true,            // 扫码枪启用
    scannerType: 'usb',             // 扫码枪类型: usb / serial
    displayBrightness: 80,          // 屏幕亮度
    dualScreenEnabled: false,        // 双屏异显
    adScreenImageUrl: '',            // 广告屏图片URL
  })

  // 检测到的打印机列表（从POS客户端上传）
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [lastPrinterDetection, setLastPrinterDetection] = useState<string | null>(null)
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  // 获取检测到的打印机列表
  const fetchDetectedPrinters = async () => {
    try {
      setLoadingPrinters(true)
      const apiUrl = localStorage.getItem('api_url') || ''
      const response = await axios.get(`${apiUrl}/api/hardware/printers`)
      if (response.data?.printers) {
        setDetectedPrinters(response.data.printers)
        setLastPrinterDetection(response.data.lastDetection)
      }
    } catch (err) {
      console.error('Failed to fetch detected printers:', err)
    } finally {
      setLoadingPrinters(false)
    }
  }

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
          toolbarLabels: { ...prev.toolbarLabels, ...(configs.toolbarSettings.toolbarLabels || configs.toolbarSettings.labels || {}) }
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

          {/* Hotkeys */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.hotkeySettings')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.hotkeySettingsHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(posLayout.hotkeys || {}).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600 w-28">{t(`posSettings.hotkey${key.charAt(0).toUpperCase() + key.slice(1)}`)}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                      const newHotkeys = { ...posLayout.hotkeys, [key]: e.target.value }
                      setPosLayout({ ...posLayout, hotkeys: newHotkeys })
                    }}
                    onBlur={() => handleSave('posLayout', { ...posLayout, hotkeys: posLayout.hotkeys })}
                    className="input w-24 text-center"
                    placeholder="F1"
                  />
                </div>
              ))}
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
                        handleSave('posLayout', {
                          ...posLayout,
                          channelDineIn: newChannels.dineIn?.enabled ?? posLayout.channelDineIn,
                          channelGoFood: newChannels.gofood?.enabled ?? posLayout.channelGoFood,
                          channelGrab: newChannels.grab?.enabled ?? posLayout.channelGrab,
                          channelShopee: newChannels.shopee?.enabled ?? posLayout.channelShopee,
                        })
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
                  {/* 扩展设置 */}
                  <div className="grid grid-cols-3 gap-3 ml-10 mt-3">
                    <div>
                      <label className="text-xs text-gray-500">{t('posSettings.availableHours')}</label>
                      <input
                        type="text"
                        value={channel.availableHours || ''}
                        onChange={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, availableHours: e.target.value }
                          }
                          setChannelSettings(newChannels)
                        }}
                        onBlur={() => handleSave('channelSettings', channelSettings)}
                        className="input text-sm"
                        placeholder="09:00-22:00"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">{t('posSettings.minOrder')}</label>
                      <input
                        type="number"
                        value={channel.minOrder || 0}
                        onChange={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, minOrder: parseInt(e.target.value) || 0 }
                          }
                          setChannelSettings(newChannels)
                        }}
                        onBlur={() => handleSave('channelSettings', channelSettings)}
                        className="input text-sm"
                        min="0"
                      />
                    </div>
                    {key !== 'dineIn' && (
                      <div>
                        <label className="text-xs text-gray-500">{t('posSettings.commissionRate')}</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={(channel as any).commissionRate || 0}
                            onChange={(e) => {
                              const newChannels = {
                                ...channelSettings,
                                [key]: { ...(channel as any), commissionRate: parseFloat(e.target.value) || 0 }
                              }
                              setChannelSettings(newChannels)
                            }}
                            onBlur={() => handleSave('channelSettings', channelSettings)}
                            className="input text-sm"
                            min="0"
                            max="100"
                          />
                          <span className="text-gray-500">%</span>
                        </div>
                      </div>
                    )}
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
          {/* 支付方式开关 */}
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
                { key: 'debit', label: t('posSettings.paymentDebit'), icon: '💳' },
                { key: 'card', label: t('posSettings.paymentCard'), icon: '💰' },
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

          {/* 基本设置 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.paymentBasic')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.defaultMethod')}</label>
                <select
                  value={paymentMethods.defaultMethod || 'cash'}
                  onChange={(e) => {
                    setPaymentMethods({ ...paymentMethods, defaultMethod: e.target.value })
                    handleSave('paymentMethods', { ...paymentMethods, defaultMethod: e.target.value })
                  }}
                  className="input"
                >
                  <option value="cash">{t('posSettings.paymentCash')}</option>
                  <option value="qris">{t('posSettings.paymentQris')}</option>
                  <option value="gopay">{t('posSettings.paymentGoPay')}</option>
                  <option value="ovo">{t('posSettings.paymentOvo')}</option>
                  <option value="dana">{t('posSettings.paymentDana')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.settlementCycle')}</label>
                <select
                  value={paymentMethods.settlementCycle || 'same_day'}
                  onChange={(e) => {
                    setPaymentMethods({ ...paymentMethods, settlementCycle: e.target.value })
                    handleSave('paymentMethods', { ...paymentMethods, settlementCycle: e.target.value })
                  }}
                  className="input"
                >
                  <option value="same_day">{t('posSettings.settlementSameDay')}</option>
                  <option value="next_day">{t('posSettings.settlementNextDay')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.minAmount')}</label>
                <input
                  type="number"
                  value={paymentMethods.minAmount || 0}
                  onChange={(e) => setPaymentMethods({ ...paymentMethods, minAmount: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleSave('paymentMethods', paymentMethods)}
                  className="input"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.maxCashAmount')}</label>
                <input
                  type="number"
                  value={paymentMethods.maxCashAmount || 100000}
                  onChange={(e) => setPaymentMethods({ ...paymentMethods, maxCashAmount: parseInt(e.target.value) || 0 })}
                  onBlur={() => handleSave('paymentMethods', paymentMethods)}
                  className="input"
                  min="0"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <span className="font-medium">{t('posSettings.changeEnabled')}</span>
                <p className="text-sm text-gray-500">{t('posSettings.changeEnabledHint')}</p>
              </div>
              <Toggle
                enabled={paymentMethods.changeEnabled ?? true}
                onChange={() => {
                  const newVal = !paymentMethods.changeEnabled
                  setPaymentMethods({ ...paymentMethods, changeEnabled: newVal })
                  handleSave('paymentMethods', { ...paymentMethods, changeEnabled: newVal })
                }}
              />
            </div>
          </div>

          {/* 通道费率 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.paymentRates')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('posSettings.paymentRatesHint')}</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'qris', label: t('posSettings.paymentQris') },
                { key: 'gopay', label: t('posSettings.paymentGoPay') },
                { key: 'ovo', label: t('posSettings.paymentOvo') },
                { key: 'dana', label: t('posSettings.paymentDana') },
                { key: 'shopeepay', label: t('posSettings.paymentShopeePay') },
                { key: 'debit', label: t('posSettings.paymentDebit') },
                { key: 'card', label: t('posSettings.paymentCard') },
              ].map((method) => (
                <div key={method.key} className="flex items-center gap-3">
                  <span className="text-sm w-20">{method.label}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={paymentMethods.rates?.[method.key as keyof typeof paymentMethods.rates] || 0}
                    onChange={(e) => {
                      const newRates = { ...paymentMethods.rates, [method.key]: parseFloat(e.target.value) || 0 }
                      setPaymentMethods({ ...paymentMethods, rates: newRates })
                    }}
                    onBlur={() => handleSave('paymentMethods', paymentMethods)}
                    className="input w-24 text-center"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== RECEIPT TAB ========== */}
      {activeSubTab === 'receipt' && (
        <div className="space-y-6">
          {/* 基础信息 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.receiptBasic')}</h3>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.storePhone')}</label>
                  <input
                    type="text"
                    value={posReceipt.storePhone || ''}
                    onChange={(e) => setPosReceipt({ ...posReceipt, storePhone: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder="021-1234567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.storeAddress')}</label>
                  <input
                    type="text"
                    value={posReceipt.storeAddress || ''}
                    onChange={(e) => setPosReceipt({ ...posReceipt, storeAddress: e.target.value })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    placeholder="Jl. Sudirman No.1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 打印设置 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.printSettings')}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.paperSize')}</label>
                  <select
                    value={posReceipt.paperSize || '80mm'}
                    onChange={(e) => {
                      setPosReceipt({ ...posReceipt, paperSize: e.target.value })
                      handleSave('posReceipt', { ...posReceipt, paperSize: e.target.value })
                    }}
                    className="input"
                  >
                    <option value="58mm">58mm</option>
                    <option value="80mm">80mm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.printCopies')}</label>
                  <input
                    type="number"
                    value={posReceipt.printCopies || 1}
                    onChange={(e) => setPosReceipt({ ...posReceipt, printCopies: parseInt(e.target.value) || 1 })}
                    onBlur={() => handleSave('posReceipt', posReceipt)}
                    className="input"
                    min="1"
                    max="5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.itemDetailFormat')}</label>
                  <select
                    value={posReceipt.itemDetailFormat || 'standard'}
                    onChange={(e) => {
                      setPosReceipt({ ...posReceipt, itemDetailFormat: e.target.value })
                      handleSave('posReceipt', { ...posReceipt, itemDetailFormat: e.target.value })
                    }}
                    className="input"
                  >
                    <option value="standard">{t('posSettings.formatStandard')}</option>
                    <option value="compact">{t('posSettings.formatCompact')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 显示选项 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.displayOptions')}</h3>
            <div className="space-y-3">
              {[
                { key: 'showLogo', label: t('posSettings.showLogo') },
                { key: 'showQR', label: t('posSettings.showQR') },
                { key: 'showBarcode', label: t('posSettings.showBarcode') },
                { key: 'showKitchenNote', label: t('posSettings.showKitchenNote') },
                { key: 'showStaffName', label: t('posSettings.showStaffName') },
                { key: 'showCustomerName', label: t('posSettings.showCustomerName') },
                { key: 'autoPrint', label: t('posSettings.autoPrint') },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{item.label}</span>
                  <Toggle
                    enabled={posReceipt[item.key as keyof typeof posReceipt] as boolean}
                    onChange={() => {
                      const newVal = !posReceipt[item.key as keyof typeof posReceipt]
                      setPosReceipt({ ...posReceipt, [item.key]: newVal })
                      handleSave('posReceipt', { ...posReceipt, [item.key]: newVal })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Logo上传 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.storeLogo') || 'Store Logo'}</h3>
            <div className="space-y-4">
              {posReceipt.storeLogo && (
                <div className="relative inline-block">
                  <img src={posReceipt.storeLogo} alt="Store Logo" className="h-20 object-contain border rounded-lg p-2 bg-white" />
                  <button
                    onClick={() => {
                      setPosReceipt({ ...posReceipt, storeLogo: '' })
                      handleSave('posReceipt', { ...posReceipt, storeLogo: '' })
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div>
                <input
                  type="text"
                  value={posReceipt.storeLogo || ''}
                  onChange={(e) => setPosReceipt({ ...posReceipt, storeLogo: e.target.value })}
                  onBlur={() => handleSave('posReceipt', posReceipt)}
                  className="input"
                  placeholder={t('posSettings.logoUrlPlaceholder') || 'Logo URL or upload below'}
                />
                <p className="text-xs text-gray-500 mt-1">{t('posSettings.logoUrlHint') || 'Enter logo URL or use upload button'}</p>
              </div>
              <div>
                <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                  <Upload size={16} />
                  {t('posSettings.uploadLogo') || 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      try {
                        const formData = new FormData()
                        formData.append('images', file)
                        const res = await axios.post('/api/upload/product', formData, {
                          headers: { 'Content-Type': 'multipart/form-data' }
                        })
                        const url = res.data.data.urls[0]
                        setPosReceipt({ ...posReceipt, storeLogo: url })
                        handleSave('posReceipt', { ...posReceipt, storeLogo: url })
                      } catch (err) {
                        console.error('Logo upload failed:', err)
                        alert('Logo upload failed')
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* QR码设置 */}
          {posReceipt.showQR && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">{t('posSettings.qrCode') || 'QR Code'}</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('posSettings.qrCodeUrl') || 'QR Code URL / Content'}
                </label>
                <input
                  type="text"
                  value={posReceipt.qrCodeUrl || ''}
                  onChange={(e) => setPosReceipt({ ...posReceipt, qrCodeUrl: e.target.value })}
                  onBlur={() => handleSave('posReceipt', posReceipt)}
                  className="input"
                  placeholder={t('posSettings.qrCodePlaceholder') || 'Enter payment QR code URL or content'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('posSettings.qrCodeHint') || 'Enter URL or text content for the QR code on receipt'}
                </p>
              </div>
            </div>
          )}

          {/* 自定义文字 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">{t('posSettings.customText')}</h3>
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
          </div>
        </div>
      )}

      {/* ========== HARDWARE TAB ========== */}
      {activeSubTab === 'hardware' && (
        <HardwareTabContent
          hardwareSettings={hardwareSettings}
          setHardwareSettings={setHardwareSettings}
          handleSave={handleSave}
          detectedPrinters={detectedPrinters}
          lastPrinterDetection={lastPrinterDetection}
          loadingPrinters={loadingPrinters}
          onRefreshPrinters={fetchDetectedPrinters}
        />
      )}
    </div>
  )
}

// Hardware Tab Content Component
function HardwareTabContent({ hardwareSettings, setHardwareSettings, handleSave, detectedPrinters, lastPrinterDetection, loadingPrinters, onRefreshPrinters }: {
  hardwareSettings: any
  setHardwareSettings: any
  handleSave: (key: string, value: any) => void
  detectedPrinters: string[]
  lastPrinterDetection: string | null
  loadingPrinters: boolean
  onRefreshPrinters: () => void
}) {
  const { t } = useTranslation()

  // Fetch printers when component mounts
  useEffect(() => {
    onRefreshPrinters()
  }, [])

  return (
    <div className="space-y-6">
      {/* Info Box */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="text-blue-500 mt-0.5">ℹ️</div>
          <div>
            <div className="font-medium text-blue-800">Printer Auto-Detection</div>
            <p className="text-sm text-blue-700 mt-1">
              When the <strong>POS App</strong> is opened on the cashier computer and goes to <strong>Settings → Hardware</strong>, 
              it will automatically detect and upload connected USB printers here.
            </p>
          </div>
        </div>
      </div>

      {/* Detected Printers */}
      {detectedPrinters.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Detected USB Printers</h3>
            <button
              onClick={onRefreshPrinters}
              disabled={loadingPrinters}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={16} className={loadingPrinters ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {detectedPrinters.map((printer, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xl">🖨️</span>
                <span className="font-medium">{printer}</span>
                {printer === hardwareSettings.printerName && (
                  <span className="ml-auto text-sm text-primary">✓ Selected</span>
                )}
              </div>
            ))}
          </div>
          {lastPrinterDetection && (
            <p className="text-xs text-gray-500 mt-2">
              Last detected: {new Date(lastPrinterDetection).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">{t('posSettings.hardwareSettings')}</h3>
        <div className="space-y-4">
          {/* Connection Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Printer Connection Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setHardwareSettings({ ...hardwareSettings, printerConnectionType: 'usb' })
                  handleSave('hardwareSettings', { ...hardwareSettings, printerConnectionType: 'usb' })
                }}
                className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                  hardwareSettings.printerConnectionType === 'usb'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">🖨️</div>
                <div className="font-medium text-sm">USB Printer</div>
              </button>
              <button
                onClick={() => {
                  setHardwareSettings({ ...hardwareSettings, printerConnectionType: 'network' })
                  handleSave('hardwareSettings', { ...hardwareSettings, printerConnectionType: 'network' })
                }}
                className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                  hardwareSettings.printerConnectionType === 'network'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">🌐</div>
                <div className="font-medium text-sm">Network Printer</div>
              </button>
            </div>
          </div>

          {/* USB Printer Selection */}
          {hardwareSettings.printerConnectionType === 'usb' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">USB Printer</label>
              {detectedPrinters.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={hardwareSettings.printerName}
                    onChange={(e) => {
                      setHardwareSettings({ ...hardwareSettings, printerName: e.target.value })
                      handleSave('hardwareSettings', { ...hardwareSettings, printerName: e.target.value })
                    }}
                    className="input"
                  >
                    <option value="">-- Select a detected printer --</option>
                    {detectedPrinters.map((printer, idx) => (
                      <option key={idx} value={printer}>{printer}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    Select from detected printers, or enter manually below
                  </p>
                </div>
              ) : (
                <p className="text-sm text-yellow-600 mb-2">
                  No printers detected. Make sure POS App is running on the cashier computer.
                </p>
              )}
              <input
                type="text"
                value={hardwareSettings.printerName}
                onChange={(e) => setHardwareSettings({ ...hardwareSettings, printerName: e.target.value })}
                onBlur={() => handleSave('hardwareSettings', hardwareSettings)}
                className="input mt-2"
                placeholder="Or enter printer name manually"
              />
            </div>
          )}

          {/* Network Printer IP/Port */}
          {hardwareSettings.printerConnectionType === 'network' && (
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
          )}

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

          {/* Printer Type */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.printerType')}</label>
            <select
              value={hardwareSettings.printerType || 'escpos'}
              onChange={(e) => {
                setHardwareSettings({ ...hardwareSettings, printerType: e.target.value })
                handleSave('hardwareSettings', { ...hardwareSettings, printerType: e.target.value })
              }}
              className="input"
            >
              <option value="escpos">ESC/POS</option>
              <option value="pcl">PCL</option>
            </select>
          </div>

          {/* Cash Drawer Pulse */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.cashDrawerPulse')}: {hardwareSettings.cashDrawerPulse || 100}ms</label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={hardwareSettings.cashDrawerPulse || 100}
              onChange={(e) => {
                setHardwareSettings({ ...hardwareSettings, cashDrawerPulse: parseInt(e.target.value) })
              }}
              onMouseUp={() => handleSave('hardwareSettings', hardwareSettings)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">{t('posSettings.cashDrawerPulseHint')}</p>
          </div>

          {/* Scanner Settings */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{t('posSettings.scannerEnabled')}</label>
              <Toggle
                enabled={hardwareSettings.scannerEnabled ?? true}
                onChange={() => {
                  const newVal = !hardwareSettings.scannerEnabled
                  setHardwareSettings({ ...hardwareSettings, scannerEnabled: newVal })
                  handleSave('hardwareSettings', { ...hardwareSettings, scannerEnabled: newVal })
                }}
              />
            </div>
            {hardwareSettings.scannerEnabled !== false && (
              <select
                value={hardwareSettings.scannerType || 'usb'}
                onChange={(e) => {
                  setHardwareSettings({ ...hardwareSettings, scannerType: e.target.value })
                  handleSave('hardwareSettings', { ...hardwareSettings, scannerType: e.target.value })
                }}
                className="input mt-2"
              >
                <option value="usb">USB Scanner</option>
                <option value="serial">Serial Scanner</option>
              </select>
            )}
          </div>

          {/* Display Settings */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.displayBrightness')}: {hardwareSettings.displayBrightness || 80}%</label>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={hardwareSettings.displayBrightness || 80}
              onChange={(e) => {
                setHardwareSettings({ ...hardwareSettings, displayBrightness: parseInt(e.target.value) })
              }}
              onMouseUp={() => handleSave('hardwareSettings', hardwareSettings)}
              className="w-full"
            />
          </div>

          {/* Dual Screen */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <span className="font-medium">{t('posSettings.dualScreenEnabled')}</span>
              <p className="text-sm text-gray-500">{t('posSettings.dualScreenHint')}</p>
            </div>
            <Toggle
              enabled={hardwareSettings.dualScreenEnabled || false}
              onChange={() => {
                const newVal = !hardwareSettings.dualScreenEnabled
                setHardwareSettings({ ...hardwareSettings, dualScreenEnabled: newVal })
                handleSave('hardwareSettings', { ...hardwareSettings, dualScreenEnabled: newVal })
              }}
            />
          </div>

          {hardwareSettings.dualScreenEnabled && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.adScreenImageUrl')}</label>
              <input
                type="text"
                value={hardwareSettings.adScreenImageUrl || ''}
                onChange={(e) => setHardwareSettings({ ...hardwareSettings, adScreenImageUrl: e.target.value })}
                onBlur={() => handleSave('hardwareSettings', hardwareSettings)}
                className="input"
                placeholder="https://example.com/ad-image.png"
              />
            </div>
          )}

          {/* Cash Drawer Info */}
          <div className="p-3 bg-yellow-50 rounded-xl text-yellow-800 text-sm">
            💡 Cash drawer connects via RJ11 cable to your printer (not directly to computer)
          </div>
        </div>
      </div>
    </div>
  )
}