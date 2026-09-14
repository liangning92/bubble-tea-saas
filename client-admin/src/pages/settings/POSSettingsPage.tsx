import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configApi, uploadApi } from '../../services/api'
import { ReceiptTemplateEditor } from '../../components/ReceiptTemplateEditor'
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

// Media file type
interface MediaFile {
  url: string
  filename: string
  mimetype: string
  isVideo: boolean
}

// DualScreen Media Upload Component
const DualScreenMediaUpload: React.FC<{
  mediaFiles: MediaFile[]
  onUpload: (files: MediaFile[]) => void
  onRemove: (index: number) => void
}> = ({ mediaFiles, onUpload, onRemove }) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFiles(Array.from(files))
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    await uploadFiles(Array.from(files))
  }

  const uploadFiles = async (files: File[]) => {
    setUploading(true)
    try {
      const response = await uploadApi.uploadDualScreen(files)
      const newFiles = response.data.data.files || []
      onUpload([...mediaFiles, ...newFiles])
    } catch (error) {
      console.error('Upload failed:', error)
      alert(t('common.error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('dualScreenFileInput')?.click()}
      >
        <input
          type="file"
          id="dualScreenFileInput"
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm text-gray-500">{t('common.uploading')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={24} className="text-gray-400" />
            <span className="text-sm text-gray-500">{t('posSettings.dualScreenUploadHint')}</span>
            <span className="text-xs text-gray-400">{t('posSettings.dualScreenFileTypes')}</span>
          </div>
        )}
      </div>

      {/* Preview Grid */}
      {mediaFiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {mediaFiles.map((file, index) => (
            <div key={index} className="relative group">
              {file.isVideo ? (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <video src={file.url} className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-2xl">▶</span>
                  </div>
                </div>
              ) : (
                <img src={file.url} alt="" className="aspect-video object-cover rounded-lg" />
              )}
              <button
                onClick={() => onRemove(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              {file.isVideo && (
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1 rounded">{t('posSettings.videoLabel')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Layout Column types
type ColumnContent = 'media' | 'promotions' | 'welcome' | 'order' | 'logo'

interface LayoutColumn {
  width: number
  content: ColumnContent
}

interface Layout {
  columns: LayoutColumn[]
}

// DualScreen Layout Editor Component
const _DualScreenLayoutEditor: React.FC<{
  layout: Layout
  onChange: (layout: Layout) => void
  title: string
}> = ({ layout, onChange, title }) => {
  const { t } = useTranslation()

  const updateColumn = (index: number, updates: Partial<LayoutColumn>) => {
    const newColumns = [...layout.columns]
    newColumns[index] = { ...newColumns[index], ...updates }
    onChange({ columns: newColumns })
  }

  const addColumn = () => {
    if (layout.columns.length >= 3) return
    const newColumns = [...layout.columns, { width: Math.floor(100 / (layout.columns.length + 1)), content: 'promotions' as ColumnContent }]
    // Redistribute widths
    const equalWidth = Math.floor(100 / newColumns.length)
    newColumns.forEach((col) => col.width = equalWidth)
    onChange({ columns: newColumns })
  }

  const removeColumn = (index: number) => {
    if (layout.columns.length <= 1) return
    const newColumns = layout.columns.filter((_, idx) => idx !== index)
    const equalWidth = Math.floor(100 / newColumns.length)
    newColumns.forEach((col) => col.width = equalWidth)
    onChange({ columns: newColumns })
  }

  return (
    <div className="p-3 bg-white rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex gap-1">
          {layout.columns.length < 3 && (
            <button onClick={addColumn} className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90">
              {t('posSettings.addColumn')}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {layout.columns.map((col, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            {/* Width slider */}
            <div className="flex items-center gap-2 w-32">
              <input
                type="range"
                min="10"
                max="80"
                value={col.width}
                onChange={(e) => updateColumn(index, { width: parseInt(e.target.value) })}
                className="w-20"
              />
              <span className="text-xs w-8">{col.width}%</span>
            </div>

            {/* Content type */}
            <select
              value={col.content}
              onChange={(e) => updateColumn(index, { content: e.target.value as ColumnContent })}
              className="flex-1 text-sm input"
            >
              <option value="media">{t('posSettings.columnMedia')}</option>
              <option value="promotions">{t('posSettings.columnPromotions')}</option>
              <option value="welcome">{t('posSettings.columnWelcome')}</option>
              <option value="order">{t('posSettings.columnOrder')}</option>
              <option value="logo">{t('posSettings.columnLogo')}</option>
            </select>

            {/* Remove */}
            {layout.columns.length > 1 && (
              <button onClick={() => removeColumn(index)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Width sum indicator */}
      <div className="mt-2 text-xs text-gray-500 text-right">
        {t('posSettings.totalWidth', { width: layout.columns.reduce((sum, col) => sum + col.width, 0) })}
      </div>
    </div>
  )
}

// DualScreen Preview Component
const DualScreenPreview: React.FC<{
  dualScreen: any
}> = ({ dualScreen }) => {
  const { t } = useTranslation()
  const [previewState, setPreviewState] = useState<'idle' | 'ordering' | 'complete'>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const promotions = dualScreen.promotions || ['🧋', '🍓', '💳', '🎁']
  const mediaFiles = dualScreen.mediaFiles || []

  const idleLayout = dualScreen.idleLayout || { columns: [{ width: 100, content: 'media' }] }
  const orderingLayout = dualScreen.orderingLayout || { columns: [{ width: 100, content: 'order' }] }
  const currentLayout = previewState === 'idle' ? idleLayout : orderingLayout

  // Auto-rotate for preview
  useEffect(() => {
    if (previewState !== 'idle') return
    if (mediaFiles.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % mediaFiles.length)
      }, 3000)
      return () => clearInterval(interval)
    } else {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % promotions.length)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [previewState, mediaFiles.length, promotions.length])

  const currentMedia = mediaFiles[currentIndex]
  const currentPromotion = promotions[currentIndex]

  // Render column content
  const renderColumnContent = (content: string) => {
    switch (content) {
      case 'media':
        if (mediaFiles.length > 0) {
          return currentMedia?.isVideo ? (
            <video src={currentMedia.url} className="w-full h-full object-contain" autoPlay loop muted />
          ) : (
            <img src={currentMedia?.url} alt="" className="w-full h-full object-contain" />
          )
        }
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500 to-pink-600 text-white">
            <span className="text-4xl">{currentPromotion}</span>
          </div>
        )
      case 'promotions':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4">
            <div className="text-3xl mb-2">{currentPromotion}</div>
            <div className="text-sm text-center">{dualScreen.welcomeText || t('posSettings.welcome')}</div>
          </div>
        )
      case 'welcome':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
            <span className="text-xl font-bold">{dualScreen.welcomeText || t('posSettings.welcome')}</span>
          </div>
        )
      case 'order':
        return (
          <div className="w-full h-full flex flex-col bg-gray-50">
            <div className="bg-primary text-white py-2 px-4 text-center text-sm font-bold">{t('posSettings.yourOrder')}</div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              <div className="flex justify-between items-center bg-white p-2 rounded text-xs">
                <div className="flex items-center gap-2">
                  <span>✨</span>
                  <div>
                    <div className="font-medium">{t('posSettings.sampleProductName')}</div>
                    <div className="text-gray-500">{t('posSettings.sampleSize')}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{t('posSettings.samplePrice')}</div>
                  <div className="text-gray-500">{t('posSettings.sampleQuantity')}</div>
                </div>
              </div>
            </div>
            <div className="bg-white border-t p-2">
              <div className="flex justify-between text-sm">
                <span>{t('common.total')}</span>
                <span className="font-bold text-primary">{t('posSettings.samplePrice')}</span>
              </div>
            </div>
          </div>
        )
      case 'logo':
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <img src="/youme-logo-red.png" alt="YOUME" className="h-20 w-auto object-contain" />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="mt-4 p-4 bg-gray-100 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">{t('posSettings.dualScreenPreview')}</span>
        <div className="flex gap-1">
          {(['idle', 'ordering', 'complete'] as const).map((state) => (
            <button
              key={state}
              onClick={() => setPreviewState(state)}
              className={`px-2 py-1 text-xs rounded ${previewState === state ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}
            >
              {state === 'idle' ? t('posSettings.previewIdle') : state === 'ordering' ? t('posSettings.previewOrdering') : t('posSettings.previewComplete')}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Screen with dynamic columns */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {previewState === 'complete' ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="text-4xl mb-2">{t('posSettings.checkmark')}</div>
            <div className="text-lg font-bold">{t('posSettings.thankYou')}</div>
            <div className="text-sm opacity-80">{t('posSettings.orderNumber')}</div>
          </div>
        ) : (
          <div className="w-full h-full flex">
            {currentLayout.columns.map((col: any, index: number) => (
              <div
                key={index}
                className="h-full overflow-hidden"
                style={{ width: `${col.width}%` }}
              >
                {renderColumnContent(col.content)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function POSSettingsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeSubTab, setActiveSubTab] = useState<POSSubTab>('layout')
  const [showSuccess, setShowSuccess] = useState(false)

  // ========== DATA LOADING ==========
  // 确保 queryKey 和实际请求的 storeId 一致
  const queryStoreId = user?.storeId || ''
  console.log('[Admin] queryStoreId:', queryStoreId)
  const { data: posConfig, isLoading } = useQuery({
    queryKey: ['config', queryStoreId],
    queryFn: () => {
      console.log('[Admin] configApi.get called with:', queryStoreId)
      return configApi.get(queryStoreId || undefined)
    }
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
    showExpense: true,
    // Button labels - 保存为 toolbarLabels 以匹配POS期望
    toolbarLabels: {
      suspend: 'toolbar.suspend',
      history: 'toolbar.history',
      scan: 'toolbar.scan',
      shift: 'toolbar.shift',
      cash: 'toolbar.cash',
      tasks: 'toolbar.tasks',
      logout: 'toolbar.logout',
      expense: 'toolbar.expense'
    }
  })

  const [channelSettings, setChannelSettings] = useState({
    dineIn: {
      enabled: true,
      name: '',
      icon: '🍵',
      color: '#EC6D88',
      availableHours: '00:00-23:59',
      minOrder: 0,
    },
    gofood: {
      enabled: true,
      name: '',
      icon: '🟢',
      color: '#25A549',
      availableHours: '09:00-22:00',
      minOrder: 0,
      commissionRate: 15,              // 平台抽成
    },
    grab: {
      enabled: true,
      name: '',
      icon: '🟡',
      color: '#F88100',
      availableHours: '09:00-22:00',
      minOrder: 0,
      commissionRate: 18,
    },
    shopee: {
      enabled: true,
      name: '',
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
  const [_posReceipt, setPosReceipt] = useState({
    header: t('posSettings.defaultReceiptHeader'),
    footer: t('posSettings.defaultReceiptFooter'),
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

  // 避免首次加载触发保存
  const receiptLoadedRef = useRef(false)
  const receiptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当 _posReceipt 变化时自动保存（首次加载完成后）
  useEffect(() => {
    if (!receiptLoadedRef.current) return // 跳过首次加载
    if (receiptSaveTimerRef.current) clearTimeout(receiptSaveTimerRef.current)
    receiptSaveTimerRef.current = setTimeout(() => {
      handleSave('posReceipt', _posReceipt)
    }, 800) // 防抖 800ms
  }, [_posReceipt])

  // 打印机类型定义
  type PrinterType = 'receipt' | 'kitchen' | 'label' | 'kds'

  // 迁移旧格式到新格式
  const migratePrinterConfig = (hw: any): any => {
    // 如果已有 printers 数组，说明是新格式，直接返回
    if (hw.printers && Array.isArray(hw.printers)) {
      return hw
    }
    // 旧格式只有一个打印机，转换为新格式
    const legacyPrinter = {
      id: 'receipt-1',
      name: 'Receipt Printer',
      type: 'receipt' as PrinterType,
      enabled: true,
      connectionType: hw.printerConnectionType || 'usb',
      printerName: hw.printerName || '',
      printerIp: hw.printerIp || '192.168.1.100',
      printerPort: hw.printerPort || 9100,
    }
    return {
      ...hw,
      printers: [legacyPrinter],
    }
  }

  // 硬件设置
  const [hardwareSettings, setHardwareSettings] = useState(() => ({
    printers: [
      {
        id: 'receipt-1',
        name: t('posSettings.defaultReceiptPrinterName'),
        type: 'receipt' as PrinterType,
        enabled: true,
        connectionType: 'usb' as const,
        printerName: '',
        printerIp: '192.168.1.100',
        printerPort: 9100,
      },
      {
        id: 'kitchen-1',
        name: t('posSettings.defaultKitchenPrinterName'),
        type: 'kitchen' as PrinterType,
        enabled: false,
        connectionType: 'usb' as const,
        printerName: '',
        printerIp: '192.168.1.100',
        printerPort: 9100,
      },
      {
        id: 'label-1',
        name: t('posSettings.defaultLabelPrinterName'),
        type: 'label' as PrinterType,
        enabled: false,
        connectionType: 'usb' as const,
        printerName: '',
        printerIp: '192.168.1.100',
        printerPort: 9100,
      },
    ],
    cashDrawerPulse: 100,          // 钱箱脉冲(毫秒)
    autoOpenCashDrawer: true,
    scannerEnabled: true,            // 扫码枪启用
    scannerType: 'usb',             // 扫码枪类型: usb / serial
    displayBrightness: 80,          // 屏幕亮度
    dualScreen: {
      enabled: false,
      // 空闲时布局 - 可自定义列数和内容
      idleLayout: {
        columns: [
          { width: 60, content: 'media' },
          { width: 40, content: 'promotions' },
        ]
      },
      // 点单时布局
      orderingLayout: {
        columns: [
          { width: 30, content: 'media' },
          { width: 70, content: 'order' },
        ]
      },
      // 共用内容
      welcomeText: t('posSettings.defaultWelcomeText'),
      promotions: ['✨', '🍓', '💳', '🎁'],
      mediaFiles: [],
    },
  }))

  // 检测到的打印机列表（从POS客户端上传）
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [lastPrinterDetection, setLastPrinterDetection] = useState<string | null>(null)
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  // 获取检测到的打印机列表（同时触发 POS 客户端重新检测）
  const fetchDetectedPrinters = async () => {
    try {
      setLoadingPrinters(true)
      const apiUrl = localStorage.getItem('api_url') || ''
      const storeId = user?.storeId || ''

      // 设置触发标志，通知 POS 客户端重新检测打印机
      // POS 轮询时看到这个标志会执行检测并上报到 /api/hardware/printers
      await axios.post(`${apiUrl}/api/config`, {
        storeId,
        key: 'hardwareSettings',
        value: JSON.stringify({ triggerPrinterDetect: Date.now() }),
        category: 'pos'
      })

      // 等待一下让 POS 上报，然后读取最新结果
      await new Promise(r => setTimeout(r, 3000))

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
    console.log('[Admin] posConfig:', posConfig)
    console.log('[Admin] posConfig?.data:', posConfig?.data)
    // API返回格式: { code: 200, data: { configKey: configValue }, timestamp }
    // axios将响应放在response.data中，所以posConfig.data是{code, data, timestamp}，需要posConfig.data.data获取实际配置
    if (posConfig?.data?.data) {
      const configs = posConfig.data.data
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
        receiptLoadedRef.current = true
      }
      // Load hardware settings
      if (configs.hardwareSettings) {
        console.log('[Admin] Loading hw:', configs.hardwareSettings)
        const migrated = migratePrinterConfig(configs.hardwareSettings)
        console.log('[Admin] Migrated:', migrated)
        setHardwareSettings(migrated)
      }
    }
  }, [posConfig])

  // ========== SAVE MUTATION ==========
  const saveConfigMutation = useMutation({
    mutationFn: (data: { key: string; value: any }) => {
      const currentStoreId = user?.storeId || ''
      return configApi.set(currentStoreId, data.key, data.value, 'pos')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', queryStoreId] })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    },
    onError: (error: any) => {
      console.error('Save config error:', error)
      alert('保存失败: ' + (error?.message || '未知错误'))
    }
  })

  const handleSave = (key: string, value: any) => {
    console.log('[Admin] handleSave called:', key, JSON.stringify(value).substring(0, 100))
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
                  <option value="3">{t('posSettings.three')} {t('posSettings.columns')}</option>
                  <option value="4">{t('posSettings.four')} {t('posSettings.columns')}</option>
                  <option value="5">{t('posSettings.five')} {t('posSettings.columns')}</option>
                  <option value="6">{t('posSettings.six')} {t('posSettings.columns')}</option>
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
                    placeholder={t('posSettings.hotkeyPlaceholder')}
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
                { key: 'showExpense', label: t('posSettings.expense') },
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
              {Object.entries(channelSettings).map(([key, channel]) => {
                const channelNameKey = key === 'dineIn' ? 'channelDineInName' : key === 'gofood' ? 'channelGofoodName' : key === 'grab' ? 'channelGrabName' : 'channelShopeeName'
                return (
                <div key={key} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{channel.icon}</span>
                      <span className="font-medium">{channel.name || t(`posSettings.${channelNameKey}`)}</span>
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
                        placeholder={t('posSettings.availableHoursPlaceholder')}
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
                          <span className="text-gray-500">{t('posSettings.percent')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )})}
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
                  <span className="text-gray-500">{t('posSettings.percent')}</span>
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
                          {t('common.remove')}
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
                      <span className="text-sm w-12">{soundSettings[sound.key as keyof typeof soundSettings]?.volume ?? 100}{t('posSettings.percent')}</span>
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
                    <option value="id">{t('posSettings.langId')}</option>
                    <option value="en">{t('posSettings.langEn')}</option>
                    <option value="zh">{t('posSettings.langZh')}</option>
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
                  placeholder={t('posSettings.pinPlaceholder')}
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
                  <span className="text-gray-500">{t('posSettings.currencySymbol')}</span>
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
                  <span className="text-gray-500">{t('posSettings.percent')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== RECEIPT TAB ========== */}
      {activeSubTab === 'receipt' && (
        <ReceiptTemplateEditor
          storeId={user?.storeId || ''}
          onSave={() => {
            // Refresh configs after saving template
            queryClient.invalidateQueries({ queryKey: ['configs', user?.storeId] })
          }}
        />
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

// ========== PRINTER CONFIG COMPONENTS ==========

type PrinterType = 'receipt' | 'kitchen' | 'label' | 'kds'

const PRINTER_TYPE_LABELS: Record<PrinterType, string> = {
  receipt: 'posSettings.receiptPrinter',
  kitchen: 'posSettings.kitchenPrinter',
  label: 'posSettings.labelPrinter',
  kds: 'posSettings.kdsDisplay'
}

const PRINTER_TYPE_ICONS: Record<PrinterType, string> = {
  receipt: '🧾',
  kitchen: '👨‍🍳',
  label: '🏷️',
  kds: '📺'
}

// Single Printer Config Card
function PrinterConfigCard({
  printer,
  detectedPrinters,
  onUpdate,
  onToggle
}: {
  printer: any
  detectedPrinters: string[]
  onUpdate: (p: any) => void
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const isEnabled = printer.enabled ?? false
  const printerType = printer.type as PrinterType

  return (
    <div className={`p-4 rounded-xl border-2 transition-colors ${isEnabled ? 'border-primary bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{PRINTER_TYPE_ICONS[printerType]}</span>
          <div>
            <div className="font-medium">{t(PRINTER_TYPE_LABELS[printerType])}</div>
            {printer.name && <div className="text-xs text-gray-500">{printer.name}</div>}
          </div>
        </div>
        <Toggle enabled={isEnabled} onChange={onToggle} />
      </div>

      {isEnabled && (
        <div className="space-y-3 mt-4 pt-4 border-t">
          {/* Printer Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.printerName')}</label>
            <input
              type="text"
              value={printer.name || ''}
              onChange={(e) => onUpdate({ ...printer, name: e.target.value })}
              className="input text-sm"
              placeholder={t('posSettings.printerNamePlaceholder')}
            />
          </div>

          {/* Connection Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.connection')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate({ ...printer, connectionType: 'usb' })}
                className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${printer.connectionType === 'usb' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}
              >
                🖨️ {t('posSettings.usbConnection')}
              </button>
              <button
                onClick={() => onUpdate({ ...printer, connectionType: 'network' })}
                className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${printer.connectionType === 'network' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600'}`}
              >
                🌐 {t('posSettings.networkConnection')}
              </button>
            </div>
          </div>

          {/* USB Printer Selection */}
          {printer.connectionType === 'usb' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.usbPrinter')}</label>
              {detectedPrinters.length > 0 && (
                <select
                  value={printer.printerName || ''}
                  onChange={(e) => onUpdate({ ...printer, printerName: e.target.value })}
                  className="input text-sm"
                >
                  <option value="">{t('posSettings.selectPrinter')}</option>
                  {detectedPrinters.map((p, i) => (
                    <option key={i} value={p}>{p}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={printer.printerName || ''}
                onChange={(e) => onUpdate({ ...printer, printerName: e.target.value })}
                className="input text-sm mt-2"
                placeholder={t('posSettings.enterManually')}
              />
            </div>
          )}

          {/* Network Printer */}
          {printer.connectionType === 'network' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.ipAddress')}</label>
                <input
                  type="text"
                  value={printer.printerIp || ''}
                  onChange={(e) => onUpdate({ ...printer, printerIp: e.target.value })}
                  className="input text-sm"
                  placeholder={t('posSettings.ipPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.port')}</label>
                <input
                  type="number"
                  value={printer.printerPort || 9100}
                  onChange={(e) => onUpdate({ ...printer, printerPort: parseInt(e.target.value) || 9100 })}
                  className="input text-sm"
                  placeholder={t('posSettings.portPlaceholder')}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!isEnabled && (
        <p className="text-xs text-gray-400 mt-2">{t('posSettings.disabledEnableConfigure')}</p>
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

  useEffect(() => {
    onRefreshPrinters()
  }, [])

  const updatePrinter = (index: number, updated: any) => {
    const printers = [...(hardwareSettings.printers || [])]
    printers[index] = updated
    const newSettings = { ...hardwareSettings, printers }
    setHardwareSettings(newSettings)
    handleSave('hardwareSettings', newSettings)
  }

  const togglePrinter = (index: number) => {
    const printers = [...(hardwareSettings.printers || [])]
    printers[index] = { ...printers[index], enabled: !printers[index].enabled }
    const newSettings = { ...hardwareSettings, printers }
    setHardwareSettings(newSettings)
    handleSave('hardwareSettings', newSettings)
  }

  const enabledPrinters = (hardwareSettings.printers || []).filter((p: any) => p.enabled)

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="text-blue-500 mt-0.5">ℹ️</div>
          <div>
            <div className="font-medium text-blue-800">{t('posSettings.multiPrinterSupport')}</div>
            <p className="text-sm text-blue-700 mt-1">
              {t('posSettings.multiPrinterSupportDesc')}
            </p>
          </div>
        </div>
      </div>

      {detectedPrinters.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{t('posSettings.detectedUsbPrinters')}</h3>
            <button onClick={onRefreshPrinters} disabled={loadingPrinters} className="btn-secondary flex items-center gap-2">
              <RefreshCw size={16} className={loadingPrinters ? 'animate-spin' : ''} />
              {t('posSettings.refresh')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {detectedPrinters.map((printer, idx) => {
              const isInUse = enabledPrinters.some((p: any) => p.printerName === printer)
              return (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <span>🖨️</span>
                  <span className="font-medium">{printer}</span>
                  {isInUse && <span className="text-xs text-green-600">{t('posSettings.checkmark')} {t('posSettings.inUse')}</span>}
                </div>
              )
            })}
          </div>
          {lastPrinterDetection && (
            <p className="text-xs text-gray-500 mt-2">{t('posSettings.lastDetected')}: {new Date(lastPrinterDetection).toLocaleString()}</p>
          )}
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('posSettings.printersEnabled', { count: enabledPrinters.length })}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(hardwareSettings.printers || []).map((printer: any, index: number) => (
            <PrinterConfigCard
              key={printer.id || index}
              printer={printer}
              detectedPrinters={detectedPrinters}
              onUpdate={(p) => updatePrinter(index, p)}
              onToggle={() => togglePrinter(index)}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">{t('posSettings.hardwareSettings')}</h3>
        <div className="space-y-4">
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

          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.cashDrawerPulse')}: {hardwareSettings.cashDrawerPulse || 100}{t('posSettings.milliseconds')}</label>
            <input
              type="range" min="50" max="500" step="10"
              value={hardwareSettings.cashDrawerPulse || 100}
              onChange={(e) => setHardwareSettings({ ...hardwareSettings, cashDrawerPulse: parseInt(e.target.value) })}
              onMouseUp={() => handleSave('hardwareSettings', hardwareSettings)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">{t('posSettings.cashDrawerPulseHint')}</p>
          </div>

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
                <option value="usb">{t('posSettings.usbScanner')}</option>
                <option value="serial">{t('posSettings.serialScanner')}</option>
              </select>
            )}
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.displayBrightness')}: {hardwareSettings.displayBrightness || 80}{t('posSettings.percent')}</label>
            <input
              type="range" min="20" max="100" step="5"
              value={hardwareSettings.displayBrightness || 80}
              onChange={(e) => setHardwareSettings({ ...hardwareSettings, displayBrightness: parseInt(e.target.value) })}
              onMouseUp={() => handleSave('hardwareSettings', hardwareSettings)}
              className="w-full"
            />
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-semibold text-blue-800">{t('posSettings.dualScreenSettings')}</span>
                <p className="text-sm text-blue-700 mt-1">{t('posSettings.dualScreenHint')}</p>
              </div>
              <Toggle
                enabled={hardwareSettings.dualScreen?.enabled || false}
                onChange={() => {
                  const newVal = !hardwareSettings.dualScreen?.enabled
                  const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, enabled: newVal } }
                  setHardwareSettings(newHardwareSettings)
                  handleSave('hardwareSettings', newHardwareSettings)
                }}
              />
            </div>

            {hardwareSettings.dualScreen?.enabled && (
              <div className="space-y-4 mt-4 pt-4 border-t border-blue-200">
                {/* Welcome Text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.dualScreenWelcome')}</label>
                  <input type="text" value={hardwareSettings.dualScreen?.welcomeText || ''} onChange={(e) => {
                    const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, welcomeText: e.target.value } }
                    setHardwareSettings(newHardwareSettings)
                  }} onBlur={() => handleSave('hardwareSettings', hardwareSettings)} className="input" placeholder={t('posSettings.welcomePlaceholder')} />
                </div>

                {/* Media Upload - Images and Videos */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.dualScreenMedia')}</label>
                  <p className="text-xs text-gray-500 mb-2">{t('posSettings.dualScreenMediaHint')}</p>
                  <DualScreenMediaUpload
                    mediaFiles={hardwareSettings.dualScreen?.mediaFiles || []}
                    onUpload={(files) => {
                      const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, mediaFiles: files } }
                      setHardwareSettings(newHardwareSettings)
                      handleSave('hardwareSettings', newHardwareSettings)
                    }}
                    onRemove={(index) => {
                      const newFiles = [...(hardwareSettings.dualScreen?.mediaFiles || [])]
                      newFiles.splice(index, 1)
                      const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, mediaFiles: newFiles } }
                      setHardwareSettings(newHardwareSettings)
                      handleSave('hardwareSettings', newHardwareSettings)
                    }}
                  />
                </div>

                {/* Promotions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('posSettings.dualScreenPromotions')}</label>
                  <textarea value={(hardwareSettings.dualScreen?.promotions || []).join('\n')} onChange={(e) => {
                    const promotions = e.target.value.split('\n').filter(line => line.trim())
                    const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, promotions } }
                    setHardwareSettings(newHardwareSettings)
                  }} onBlur={() => handleSave('hardwareSettings', hardwareSettings)} className="input min-h-[80px]" placeholder={t('posSettings.promotionsPlaceholder')} />
                </div>

                {/* Idle Layout Editor */}
                <_DualScreenLayoutEditor
                  title={t('posSettings.idleLayout')}
                  layout={hardwareSettings.dualScreen?.idleLayout || { columns: [{ width: 100, content: 'media' }] }}
                  onChange={(idleLayout: Layout) => {
                    const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, idleLayout } }
                    setHardwareSettings(newHardwareSettings)
                    handleSave('hardwareSettings', newHardwareSettings)
                  }}
                />

                {/* Ordering Layout Editor */}
                <_DualScreenLayoutEditor
                  title={t('posSettings.orderingLayout')}
                  layout={hardwareSettings.dualScreen?.orderingLayout || { columns: [{ width: 100, content: 'order' }] }}
                  onChange={(orderingLayout: Layout) => {
                    const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, orderingLayout } }
                    setHardwareSettings(newHardwareSettings)
                    handleSave('hardwareSettings', newHardwareSettings)
                  }}
                />

                {/* Preview */}
                <DualScreenPreview dualScreen={hardwareSettings.dualScreen} />
              </div>
            )}
          </div>

          <div className="p-3 bg-yellow-50 rounded-xl text-yellow-800 text-sm">
            💡 {t('posSettings.cashDrawerRj11Note')}
          </div>
        </div>
      </div>
    </div>
  )
}

