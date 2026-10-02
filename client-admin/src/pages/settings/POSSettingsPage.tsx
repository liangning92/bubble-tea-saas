import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configApi, uploadApi, receiptTemplateApi } from '../../services/api'
import { ReceiptTemplateEditor } from '../../components/ReceiptTemplateEditor'
import { useAuthStore } from '../../stores/auth'
import { CheckCircle, Loader2, Smartphone, LayoutGrid, CreditCard, Volume2, Tag, Layers, Users, Receipt, Wallet, Printer, RefreshCw, Upload, X, QrCode } from 'lucide-react'
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
  onMediaFilesChange?: (getNewFiles: (current: MediaFile[]) => MediaFile[]) => void
}> = ({ mediaFiles, onUpload, onRemove, onMediaFilesChange }) => {
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
      if (onMediaFilesChange) {
        // Use functional update to avoid stale closure
        onMediaFilesChange((current) => [...current, ...newFiles])
      } else {
        onUpload([...mediaFiles, ...newFiles])
      }
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
}> = React.memo(({ dualScreen }) => {
  const { t } = useTranslation()
  const [previewState, setPreviewState] = useState<'idle' | 'ordering' | 'complete'>('idle')
  const [currentIndex, setCurrentIndex] = useState(0)
  const promotions = dualScreen.promotions || ['🧋', '🍓', '💳', '🎁']
  const mediaFiles = dualScreen.mediaFiles || []

  // Use refs to avoid stale closure in interval callbacks
  const mediaFilesRef = useRef(mediaFiles)
  const promotionsRef = useRef(promotions)
  mediaFilesRef.current = mediaFiles
  promotionsRef.current = promotions

  const idleLayout = useMemo(() => dualScreen.idleLayout || { columns: [{ width: 100, content: 'media' }] }, [dualScreen.idleLayout])
  const orderingLayout = useMemo(() => dualScreen.orderingLayout || { columns: [{ width: 100, content: 'order' }] }, [dualScreen.orderingLayout])
  const currentLayout = previewState === 'idle' ? idleLayout : orderingLayout

  // Auto-rotate for preview
  useEffect(() => {
    if (previewState !== 'idle') return
    const mf = mediaFilesRef.current
    const pr = promotionsRef.current
    if (mf.length > 0) {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % mf.length)
      }, 3000)
      return () => clearInterval(interval)
    } else {
      const interval = setInterval(() => {
        setCurrentIndex(p => (p + 1) % pr.length)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [previewState])

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
})

export function POSSettingsPage({ initialTab = 'layout' }: { initialTab?: POSSubTab } = {}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeSubTab, setActiveSubTab] = useState<POSSubTab>(initialTab)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab)
    }
  }, [initialTab])

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

  // 店铺基础信息（用于小票电话、地址的智能继承与占位）
  const fallbackStoreInfo = useMemo(() => {
    const raw = posConfig?.data?.data || (posConfig as any)?.data || {}
    return raw.storeInfo || (posConfig as any)?.storeInfo || {}
  }, [posConfig])

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
    showHardware: false,
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
      hardware: 'toolbar.hardware',
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
    language: i18n.language || 'id',
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

  // 小票设置视图模式 (基础设置 / 模板设计器)
  const [receiptSubMode, setReceiptSubMode] = useState<'basic' | 'template'>('basic')

  // 小票设置
  const [_posReceipt, setPosReceipt] = useState({
    header: t('posSettings.defaultReceiptHeader'),
    footer: 'Thank you!',
    templateId: '',
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

  // 确保 storeId 可用于模板查询（兼容店长与超管）
  const effectiveStoreId = user?.storeId || (posConfig?.data?.data as any)?.storeId || ''

  // 小票模板列表
  const { data: receiptTemplatesData, refetch: refetchReceiptTemplates } = useQuery({
    queryKey: ['receipt-templates', effectiveStoreId],
    queryFn: () => receiptTemplateApi.list(effectiveStoreId),
    enabled: !!effectiveStoreId
  })
  const receiptTemplates = useMemo(() => receiptTemplatesData?.data?.data || [], [receiptTemplatesData])



  // ========== SAVE MUTATION ==========
  const saveConfigMutation = useMutation({
    mutationFn: (data: { key: string; value: any }) => {
      const currentStoreId = user?.storeId || ''
      return configApi.set(currentStoreId, data.key, data.value, 'pos')
    },
    onSuccess: () => {
      // 使用函数式 queryKey，运行时获取最新的 storeId，避免闭包捕获 stale 值
      queryClient.invalidateQueries({ queryKey: ['config', user?.storeId || ''] })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    },
    onError: (error: any) => {
      console.error('Save config error:', error)
      alert(t('pos.saveFailed') + ': ' + (error?.message || t('common.unknownError')))
    }
  })

  const handleSave = useCallback((key: string, value: any) => {
    console.log('[Admin] handleSave called:', key, JSON.stringify(value).substring(0, 100))
    saveConfigMutation.mutate({ key, value })
    if (key === 'posReceipt' && value && value.storeLogo !== undefined) {
      const currentStoreInfo = (posConfig as any)?.storeInfo || {}
      if (currentStoreInfo.storeLogo !== value.storeLogo) {
        configApi.set(user?.storeId || '', 'storeInfo', { ...currentStoreInfo, storeLogo: value.storeLogo }, 'pos').catch(() => {})
      }
    }
  }, [user?.storeId, posConfig])

  // 小票 Logo 上传状态与方法
  const [uploadingReceiptLogo, setUploadingReceiptLogo] = useState(false)
  const receiptLogoInputRef = useRef<HTMLInputElement>(null)

  const handleReceiptLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]

    if (!file.type.startsWith('image/')) {
      alert(t('common.invalidImageType', '请上传有效的图片文件 (PNG, JPG, SVG 等)'))
      return
    }

    setUploadingReceiptLogo(true)
    try {
      const response = await uploadApi.uploadReceipt([file])
      const urls = response.data?.data?.urls || []
      if (urls.length > 0) {
        setPosReceipt(prev => {
          const updated = {
            ...prev,
            storeLogo: urls[0],
            showLogo: true
          }
          handleSave('posReceipt', updated)
          return updated
        })
      }
    } catch (error) {
      console.error('Failed to upload receipt logo:', error)
      alert(t('common.uploadFailed', '上传失败，请重试'))
    } finally {
      setUploadingReceiptLogo(false)
      if (receiptLogoInputRef.current) {
        receiptLogoInputRef.current.value = ''
      }
    }
  }

  // 小票二维码上传状态与方法
  const [uploadingReceiptQr, setUploadingReceiptQr] = useState(false)
  const receiptQrInputRef = useRef<HTMLInputElement>(null)

  const handleReceiptQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]

    if (!file.type.startsWith('image/')) {
      alert(t('common.invalidImageType', '请上传有效的图片文件 (PNG, JPG, SVG 等)'))
      return
    }

    setUploadingReceiptQr(true)
    try {
      const response = await uploadApi.uploadReceipt([file])
      const urls = response.data?.data?.urls || []
      if (urls.length > 0) {
        setPosReceipt(prev => {
          const updated = {
            ...prev,
            qrCodeUrl: urls[0],
            showQR: true
          }
          handleSave('posReceipt', updated)
          return updated
        })
      }
    } catch (error) {
      console.error('Failed to upload receipt QR code:', error)
      alert(t('common.uploadFailed', '上传失败，请重试'))
    } finally {
      setUploadingReceiptQr(false)
      if (receiptQrInputRef.current) {
        receiptQrInputRef.current.value = ''
      }
    }
  }

  // 打印机类型定义
  type PrinterType = 'receipt' | 'kitchen' | 'label' | 'kds'

  // 迁移旧格式到新格式，并确保小票、标签、后厨插槽完备
  const migratePrinterConfig = (hw: any): any => {
    const existing = hw.printers && Array.isArray(hw.printers) ? [...hw.printers] : []
    const hasReceipt = existing.some((p: any) => p.type === 'receipt')
    const hasKitchen = existing.some((p: any) => p.type === 'kitchen')
    const hasLabel = existing.some((p: any) => p.type === 'label')

    if (!hasReceipt) {
      existing.unshift({
        id: 'receipt-1',
        name: t('posSettings.defaultReceiptPrinterName', 'Printer Struk'),
        type: 'receipt' as PrinterType,
        enabled: true,
        connectionType: hw.printerConnectionType || 'usb',
        printerName: hw.printerName || '',
        printerIp: hw.printerIp || '192.168.1.100',
        printerPort: hw.printerPort || 9100,
      })
    }
    if (!hasKitchen) {
      existing.push({
        id: 'kitchen-1',
        name: t('posSettings.defaultKitchenPrinterName', 'Printer Dapur'),
        type: 'kitchen' as PrinterType,
        enabled: false,
        connectionType: 'usb' as const,
        printerName: '',
        printerIp: '192.168.1.100',
        printerPort: 9100,
      })
    }
    if (!hasLabel) {
      existing.push({
        id: 'label-1',
        name: t('posSettings.defaultLabelPrinterName', 'Printer Label'),
        type: 'label' as PrinterType,
        enabled: false,
        connectionType: 'usb' as const,
        printerName: '',
        printerIp: '192.168.1.100',
        printerPort: 9100,
      })
    }

    return {
      ...hw,
      printers: existing,
    }
  }

  // 硬件设置
  const [hardwareSettings, setHardwareSettings] = useState<any>(() => ({
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
          { width: 60, content: 'media' as ColumnContent },
          { width: 40, content: 'promotions' as ColumnContent },
        ]
      },
      // 点单时布局
      orderingLayout: {
        columns: [
          { width: 30, content: 'media' as ColumnContent },
          { width: 70, content: 'order' as ColumnContent },
        ]
      },
      // 共用内容
      welcomeText: t('posSettings.defaultWelcomeText'),
      promotions: ['✨', '🍓', '💳', '🎁'],
      mediaFiles: [] as MediaFile[],
    },
  }))

  // 检测到的打印机列表（从POS客户端上传）
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [lastPrinterDetection, setLastPrinterDetection] = useState<string | null>(null)
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  // 获取检测到的打印机列表（同时触发 POS 客户端重新检测并上传）
  const fetchDetectedPrinters = async () => {
    try {
      setLoadingPrinters(true)
      const apiUrl = localStorage.getItem('api_url') || ''
      const storeId = user?.storeId || ''

      // 通知后端检测指令 (同时通知硬件路由与保留现有 hardwareSettings)
      try {
        await axios.post(`${apiUrl}/api/hardware/detect`, { storeId })
      } catch (e) {
        console.warn('hardware/detect call failed, falling back to config trigger', e)
      }

      // 读取最新结果（按门店拉取已上报的物理打印机列表）
      const response = await axios.get(`${apiUrl}/api/hardware/printers`, {
        params: storeId ? { storeId } : undefined
      })
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
                { key: 'showSuspend', labelKey: 'suspend', label: t('posSettings.suspendOrder') },
                { key: 'showHistory', labelKey: 'history', label: t('posSettings.orderHistory') },
                { key: 'showScan', labelKey: 'scan', label: t('posSettings.scanBarcode') },
                { key: 'showShift', labelKey: 'shift', label: t('posSettings.shiftChange') },
                { key: 'showCash', labelKey: 'cash', label: t('posSettings.cashManagement') },
                { key: 'showExpense', labelKey: 'expense', label: t('posSettings.expense') },
                { key: 'showTasks', labelKey: 'tasks', label: t('posSettings.hygieneTasks') },
                { key: 'showHardware', labelKey: 'hardware', label: t('posSettings.hardwareCheck', '设备自检 (测试打印/钱箱)') },
                { key: 'showLogout', labelKey: 'logout', label: t('posSettings.logout') },
              ].map((item) => {
                const currentRaw = toolbarSettings.toolbarLabels?.[item.labelKey as keyof typeof toolbarSettings.toolbarLabels] || ''
                const legacyDefaults = ['挂单', '历史', '扫码', '交班', '现金', '支出', '任务', '自检', '登出']
                const isDefaultVal = !currentRaw || currentRaw.startsWith('toolbar.') || legacyDefaults.includes(currentRaw)
                const displayVal = isDefaultVal ? '' : currentRaw
                return (
                  <div key={item.key} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
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
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-200/60">
                      <span className="text-xs text-gray-500 whitespace-nowrap">{t('posSettings.buttonLabel', '显示文字')}:</span>
                      <input
                        type="text"
                        value={displayVal}
                        onChange={(e) => {
                          const newLabels = {
                            ...toolbarSettings.toolbarLabels,
                            [item.labelKey]: e.target.value
                          }
                          setToolbarSettings(prev => ({ ...prev, toolbarLabels: newLabels }))
                        }}
                        onBlur={(e) => {
                          const trimmed = e.target.value.trim()
                          const newLabels = {
                            ...toolbarSettings.toolbarLabels,
                            [item.labelKey]: trimmed || `toolbar.${item.labelKey}`
                          }
                          const newSettings = {
                            ...toolbarSettings,
                            toolbarLabels: newLabels
                          }
                          handleSave('toolbarSettings', newSettings)
                        }}
                        placeholder={item.label}
                        className="input text-xs py-1 px-2 h-7"
                      />
                    </div>
                  </div>
                )
              })}
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
                        onBlur={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, name: e.target.value }
                          }
                          handleSave('channelSettings', newChannels)
                        }}
                        placeholder={t(`posSettings.${channelNameKey}`)}
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
                        onBlur={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, icon: e.target.value }
                          }
                          handleSave('channelSettings', newChannels)
                        }}
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
                        onBlur={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, availableHours: e.target.value }
                          }
                          handleSave('channelSettings', newChannels)
                        }}
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
                        onBlur={(e) => {
                          const newChannels = {
                            ...channelSettings,
                            [key]: { ...channel, minOrder: parseInt(e.target.value) || 0 }
                          }
                          handleSave('channelSettings', newChannels)
                        }}
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
                            onBlur={(e) => {
                              const newChannels = {
                                ...channelSettings,
                                [key]: { ...(channel as any), commissionRate: parseFloat(e.target.value) || 0 }
                              }
                              handleSave('channelSettings', newChannels)
                            }}
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
                    onBlur={(e) => handleSave('taxSettings', { ...taxSettings, rate: Number(e.target.value) })}
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
                        onBlur={(e) => {
                          const newAmounts = [...quickAmounts.amounts]
                          newAmounts[idx] = parseInt(e.target.value) || 0
                          handleSave('quickAmounts', { ...quickAmounts, amounts: newAmounts })
                        }}
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
                      const newLang = e.target.value
                      setDisplaySettings({ ...displaySettings, language: newLang })
                      handleSave('displaySettings', { ...displaySettings, language: newLang })
                      localStorage.setItem('bubble-tea-language', newLang)
                      i18n.changeLanguage(newLang)
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

          {/* 客显副屏与多媒体配置 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{t('posSettings.dualScreenSettings', '客显副屏多媒体与版式')}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('posSettings.dualScreenHint', '配置面向顾客的双屏客显内容、轮播海报、促销信息及版式排版')}</p>
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
              <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
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
                    onMediaFilesChange={(getNewFiles) => {
                      setHardwareSettings((prev: any) => {
                        const current = prev.dualScreen?.mediaFiles || []
                        const updated = getNewFiles(current)
                        const newHardwareSettings = { ...prev, dualScreen: { ...prev.dualScreen!, mediaFiles: updated } }
                        handleSave('hardwareSettings', newHardwareSettings)
                        return newHardwareSettings
                      })
                    }}
                    onRemove={(index) => {
                      setHardwareSettings((prev: any) => {
                        const current = prev.dualScreen?.mediaFiles || []
                        const newFiles = [...current]
                        newFiles.splice(index, 1)
                        const newHardwareSettings = { ...prev, dualScreen: { ...prev.dualScreen!, mediaFiles: newFiles } }
                        handleSave('hardwareSettings', newHardwareSettings)
                        return newHardwareSettings
                      })
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
                  layout={hardwareSettings.dualScreen?.idleLayout || { columns: [{ width: 100, content: 'media' as ColumnContent }] }}
                  onChange={(idleLayout: Layout) => {
                    const newHardwareSettings = { ...hardwareSettings, dualScreen: { ...hardwareSettings.dualScreen!, idleLayout } }
                    setHardwareSettings(newHardwareSettings)
                    handleSave('hardwareSettings', newHardwareSettings)
                  }}
                />

                {/* Ordering Layout Editor */}
                <_DualScreenLayoutEditor
                  title={t('posSettings.orderingLayout')}
                  layout={hardwareSettings.dualScreen?.orderingLayout || { columns: [{ width: 100, content: 'order' as ColumnContent }] }}
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
        <div className="space-y-6">
          {/* Sub-tab Switcher: Basic Settings vs Template Editor */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReceiptSubMode('basic')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  receiptSubMode === 'basic'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border text-gray-700 hover:bg-gray-50'
                }`}
              >
                🧾 {t('posSettings.basicReceiptSettings', '基础小票与打印设置')}
              </button>
              <button
                type="button"
                onClick={() => setReceiptSubMode('template')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  receiptSubMode === 'template'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border text-gray-700 hover:bg-gray-50'
                }`}
              >
                🎨 {t('posSettings.templateDesigner', '高级小票模板设计器')}
              </button>
            </div>
            {receiptSubMode === 'basic' && (
              <button
                type="button"
                onClick={() => handleSave('posReceipt', _posReceipt)}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                💾 {t('common.saveSettings', '保存小票配置')}
              </button>
            )}
          </div>

          {receiptSubMode === 'basic' ? (
            <div className="card space-y-6 max-w-4xl">
              <div>
                <h3 className="text-lg font-semibold">{t('posSettings.receiptPrintSettings', '小票规格与内容设置')}</h3>
              </div>

              {/* 生效的视觉小票模板 */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-800 text-sm">🎨 {t('posSettings.activeTemplate', '生效的小票视觉模板')}</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => refetchReceiptTemplates()}
                      className="text-xs text-gray-500 hover:text-primary flex items-center gap-1 font-medium"
                      title="重新拉取模板列表"
                    >
                      🔄 刷新列表 ({receiptTemplates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptSubMode('template')}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t('posSettings.openTemplateDesigner', '打开模板设计器 →')}
                    </button>
                  </div>
                </div>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    <select
                      value={_posReceipt.templateId || ''}
                      onChange={(e) => {
                        const newId = e.target.value
                        setPosReceipt(prev => {
                          const updated = { ...prev, templateId: newId }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                      className="input text-sm flex-1"
                    >
                      <option value="">{t('posSettings.defaultTemplateAuto', '自动使用默认模板 (Default)')}</option>
                      {receiptTemplates.map((tpl: any) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} {tpl.isDefault ? `(${t('common.default', '默认')})` : ''}
                        </option>
                      ))}
                    </select>
                    {_posReceipt.templateId ? (
                      <span className="text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg">
                        ✓ {t('posSettings.templateAssigned', '已指定专属模板')}
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg">
                        ℹ️ {t('posSettings.usingDefaultTemplate', '沿用默认模板')}
                      </span>
                    )}
                </div>
              </div>

              {/* 纸张与打印基础 */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                <h4 className="font-medium text-gray-800 text-sm">🖨️ {t('posSettings.printerSpecs', '打印机规格与份数')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 纸张尺寸 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.paperSize', '纸张尺寸')}</label>
                    <div className="flex gap-2">
                      {(['80mm', '58mm'] as const).map(size => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setPosReceipt(prev => {
                              const updated = { ...prev, paperSize: size }
                              handleSave('posReceipt', updated)
                              return updated
                            })
                          }}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            _posReceipt.paperSize === size
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          {size} {size === '80mm' ? t('posSettings.paperStandard', '(标准)') : t('posSettings.paperMini', '(迷你)')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 打印份数 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.printCopies', '打印份数')}</label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(copies => (
                        <button
                          key={copies}
                          type="button"
                          onClick={() => {
                            setPosReceipt(prev => {
                              const updated = { ...prev, printCopies: copies }
                              handleSave('posReceipt', updated)
                              return updated
                            })
                          }}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            _posReceipt.printCopies === copies
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          {copies} {t('posSettings.copiesUnit', '联')} {copies === 2 ? t('posSettings.copiesCustomerMerchant', '(顾客+商户)') : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 自动打印 */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.autoPrintReceipt', '结账自动打印')}</div>
                    <Toggle
                      enabled={_posReceipt.autoPrint !== false}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, autoPrint: !prev.autoPrint }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 商户与联络信息 */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                <h4 className="font-medium text-gray-800 text-sm">🏪 {t('posSettings.storeContactInfo', '小票商户与联络信息')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('settings.phone', '店铺联系电话 (小票打印)')}
                    </label>
                    <input
                      type="text"
                      value={_posReceipt.storePhone || ''}
                      onChange={(e) => setPosReceipt(prev => ({ ...prev, storePhone: e.target.value }))}
                      onBlur={() => handleSave('posReceipt', _posReceipt)}
                      className="input text-sm"
                      placeholder={fallbackStoreInfo.phone || '+62 812-3456-7890'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('settings.address', '店铺地址 (小票打印)')}
                    </label>
                    <input
                      type="text"
                      value={_posReceipt.storeAddress || ''}
                      onChange={(e) => setPosReceipt(prev => ({ ...prev, storeAddress: e.target.value }))}
                      onBlur={() => handleSave('posReceipt', _posReceipt)}
                      className="input text-sm"
                      placeholder={fallbackStoreInfo.address || 'Jl. Sudirman No. 12, Jakarta'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.headerCustomText', '页眉宣传文案')}</label>
                    <input
                      type="text"
                      value={_posReceipt.header || _posReceipt.headerCustomText || ''}
                      onChange={(e) => setPosReceipt(prev => ({ ...prev, header: e.target.value, headerCustomText: e.target.value }))}
                      onBlur={() => handleSave('posReceipt', _posReceipt)}
                      className="input text-sm"
                      placeholder="YOUME TEA"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.footerMessage', '页脚感谢文案')}</label>
                    <input
                      type="text"
                      value={_posReceipt.footer || _posReceipt.footerMessage || ''}
                      onChange={(e) => setPosReceipt(prev => ({ ...prev, footer: e.target.value, footerMessage: e.target.value }))}
                      onBlur={() => handleSave('posReceipt', _posReceipt)}
                      className="input text-sm"
                      placeholder="TERIMA KASIH / THANK YOU"
                    />
                  </div>
                  {/* 小票 Logo 上传与设置 */}
                  <div className="md:col-span-2 p-3.5 bg-white border border-gray-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-gray-700">
                          {t('posSettings.storeLogo', '小票 Logo')}
                        </label>
                      </div>
                      <div>
                        <input
                          ref={receiptLogoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleReceiptLogoUpload}
                        />
                        <button
                          type="button"
                          disabled={uploadingReceiptLogo}
                          onClick={() => receiptLogoInputRef.current?.click()}
                          className="px-3 py-1.5 bg-gray-50 border border-gray-300 hover:border-primary text-gray-700 hover:text-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          {uploadingReceiptLogo ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-primary" />
                              <span>{t('common.uploading', '正在上传...')}</span>
                            </>
                          ) : (
                            <>
                              <Upload size={13} />
                              <span>{_posReceipt.storeLogo ? t('common.changeImage', '更换 Logo 图片') : t('common.uploadImage', '上传 Logo 图片')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Logo 预览与清除 */}
                    {_posReceipt.storeLogo ? (
                      <div className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="w-16 h-12 bg-white rounded border border-gray-300 flex items-center justify-center p-1 overflow-hidden flex-shrink-0">
                          <img
                            src={_posReceipt.storeLogo}
                            alt="Receipt Logo Preview"
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-gray-600 truncate">
                            {_posReceipt.storeLogo}
                          </div>
                          <div className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                            <CheckCircle size={12} />
                            <span>{t('posSettings.logoActiveAndSynced', 'Logo 已生效并实时同步')}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPosReceipt(prev => {
                              const updated = { ...prev, storeLogo: '' }
                              handleSave('posReceipt', updated)
                              return updated
                            })
                          }}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title={t('posSettings.removeLogo', '移除 Logo')}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : null}

                    {/* URL 辅助输入框 */}
                    <div>
                      <input
                        type="text"
                        value={_posReceipt.storeLogo || ''}
                        onChange={(e) => setPosReceipt(prev => ({ ...prev, storeLogo: e.target.value }))}
                        onBlur={() => handleSave('posReceipt', _posReceipt)}
                        className="input text-xs w-full py-1.5"
                        placeholder={t('posSettings.logoUrlPlaceholder', '或直接输入图片 URL（例如: https://... 或 /youme-logo-red.png）')}
                      />
                    </div>
                  </div>

                  {/* 小票二维码设置与上传 */}
                  <div className="md:col-span-2 p-3.5 bg-white border border-gray-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <QrCode size={14} className="text-primary" />
                          <span>{t('posSettings.showQR', '小票底部二维码')}</span>
                        </label>
                      </div>
                      <div>
                        <input
                          ref={receiptQrInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleReceiptQrUpload}
                        />
                        <button
                          type="button"
                          disabled={uploadingReceiptQr}
                          onClick={() => receiptQrInputRef.current?.click()}
                          className="px-3 py-1.5 bg-gray-50 border border-gray-300 hover:border-primary text-gray-700 hover:text-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          {uploadingReceiptQr ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-primary" />
                              <span>{t('common.uploading', '正在上传...')}</span>
                            </>
                          ) : (
                            <>
                              <Upload size={13} />
                              <span>{_posReceipt.qrCodeUrl ? t('common.changeImage', '更换二维码图片') : t('common.uploadImage', '上传二维码图片')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 二维码预览与清除 */}
                    {_posReceipt.qrCodeUrl ? (
                      <div className="flex items-center gap-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="w-16 h-16 bg-white rounded border border-gray-300 flex items-center justify-center p-1 overflow-hidden flex-shrink-0">
                          <img
                            src={_posReceipt.qrCodeUrl}
                            alt="Receipt QR Preview"
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-gray-600 truncate">
                            {_posReceipt.qrCodeUrl}
                          </div>
                          <div className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                            <CheckCircle size={12} />
                            <span>{t('posSettings.qrReady', '小票二维码已就绪')}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPosReceipt(prev => {
                              const updated = { ...prev, qrCodeUrl: '', showQR: false }
                              handleSave('posReceipt', updated)
                              return updated
                            })
                          }}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title={t('posSettings.removeQR', '移除二维码')}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : null}

                    {/* URL/内容辅助输入框 */}
                    <div>
                      <input
                        type="text"
                        value={_posReceipt.qrCodeUrl || ''}
                        onChange={(e) => setPosReceipt(prev => ({ ...prev, qrCodeUrl: e.target.value, showQR: !!e.target.value }))}
                        onBlur={() => handleSave('posReceipt', _posReceipt)}
                        className="input text-xs w-full py-1.5"
                        placeholder={t('posSettings.qrUrlPlaceholder', '或直接输入二维码图片 URL / 跳转网址（例如: https://... 或 /uploads/receipts/qr.png）')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 小票展示内容开关 */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                <h4 className="font-medium text-gray-800 text-sm">📋 {t('posSettings.displayOptions', '小票字段与开关')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 是否打印 Logo 开关 */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showLogo', '打印小票时显示 Logo')}</div>
                    <Toggle
                      enabled={_posReceipt.showLogo !== false}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showLogo: !prev.showLogo }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  {/* 是否打印二维码开关 */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showQR', '打印小票时显示二维码')}</div>
                    <Toggle
                      enabled={_posReceipt.showQR === true}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showQR: !prev.showQR }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showStaffName', '打印收银员姓名')}</div>
                    <Toggle
                      enabled={_posReceipt.showStaffName !== false}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showStaffName: !prev.showStaffName }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showCustomerName', '打印顾客/会员姓名')}</div>
                    <Toggle
                      enabled={_posReceipt.showCustomerName === true}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showCustomerName: !prev.showCustomerName }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showKitchenNote', '打印制作备注')}</div>
                    <Toggle
                      enabled={_posReceipt.showKitchenNote !== false}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showKitchenNote: !prev.showKitchenNote }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{t('posSettings.showBarcode', '打印订单条形码')}</div>
                    <Toggle
                      enabled={_posReceipt.showBarcode !== false}
                      onChange={() => {
                        setPosReceipt(prev => {
                          const updated = { ...prev, showBarcode: !prev.showBarcode }
                          handleSave('posReceipt', updated)
                          return updated
                        })
                      }}
                    />
                  </div>

                  {/* 商品行排版格式 */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{t('posSettings.itemDetailFormat', '商品行排版格式')}</div>
                      <div className="text-xs text-gray-400">{t('posSettings.itemDetailFormatHint', '紧凑模式配料单行显示更省纸，标准模式清晰换行')}</div>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { key: 'standard', label: t('posSettings.formatStandard', '标准') },
                        { key: 'compact', label: t('posSettings.formatCompact', '紧凑') }
                      ].map(f => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => {
                            setPosReceipt(prev => {
                              const updated = { ...prev, itemDetailFormat: f.key }
                              handleSave('posReceipt', updated)
                              return updated
                            })
                          }}
                          className={`px-3 py-1 text-xs rounded-lg font-medium border transition-colors ${
                            (_posReceipt.itemDetailFormat || 'standard') === f.key
                              ? 'bg-primary text-white border-primary'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ReceiptTemplateEditor
              storeId={effectiveStoreId}
              defaultLogo={_posReceipt.storeLogo}
              defaultQrCode={_posReceipt.qrCodeUrl}
              onSave={() => {
                // Refresh all configs and template queries after saving template
                queryClient.invalidateQueries({ queryKey: ['receipt-templates'] })
                queryClient.invalidateQueries({ queryKey: ['config'] })
                refetchReceiptTemplates()
              }}
            />
          )}
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

          {/* Label size settings for label printer */}
          {printerType === 'label' && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.labelWidth', '宽 (mm)')}</label>
                <input
                  type="number"
                  value={printer.stickerWidth || 40}
                  onChange={(e) => onUpdate({ ...printer, stickerWidth: parseInt(e.target.value) || 40 })}
                  className="input text-sm"
                  min="20"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.labelHeight', '高 (mm)')}</label>
                <input
                  type="number"
                  value={printer.stickerHeight || 30}
                  onChange={(e) => onUpdate({ ...printer, stickerHeight: parseInt(e.target.value) || 30 })}
                  className="input text-sm"
                  min="15"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('posSettings.labelGap', '间距 (mm)')}</label>
                <input
                  type="number"
                  value={printer.stickerGap || 2}
                  onChange={(e) => onUpdate({ ...printer, stickerGap: parseInt(e.target.value) || 2 })}
                  className="input text-sm"
                  min="0"
                  max="10"
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
            <span className="font-medium">{t('posSettings.autoOpenCashDrawer')}</span>
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
        </div>
      </div>
    </div>
  )
}

