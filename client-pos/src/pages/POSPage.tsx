import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { posApi, updateApiUrl, fetchApiUrlFromServer } from '../services/api'
import { getApiUrl, setApiUrl } from '../config'
import { useAuthStore } from '../stores/auth'
import { db, syncManager, productCache, LocalProduct, getLockScreenPin, saveLockScreenPin } from '../db/offline'
import { connectionManager } from '../services/ConnectionManager'
import { formatCurrency, playSound, playSoundWithSettings } from '../utils/helpers'
import { showToast, ConfirmModal } from '../components/ui'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { ChannelSelectModal } from '../components/ChannelSelectModal'
import { AttendanceQR } from '../components/ui/AttendanceQR'
import { UpdateNotification } from '../components/UpdateNotification'
import { useHardwareManager } from '../hooks/useHardwareManager'
import { useCartStore, useProductStore, useOrderStore, useUiStore } from '../stores'
import {
  Wifi, WifiOff, X, CheckCircle, Search, Loader2,
  ShoppingCart, Trash2, Minus, Plus, Tag, User, Clock,
  Globe, FileText, Users, Printer, ScanLine, Wallet, QrCode,
  CheckSquare, ClipboardList, Lock, Settings, RotateCcw,
  Receipt, PlusCircle, XCircle
} from 'lucide-react'

// Electron API
const electronAPI = (window as any).electronAPI

// Helper to get available printer name from settings
function getPrinterName(printerSettings: { printerName?: string; printers?: Array<{ type: string; enabled: boolean; printerName?: string }> }, type: 'receipt' | 'kitchen' | 'label' = 'receipt'): string {
  // 1. First try: use configured printer for this type
  if (printerSettings?.printers && printerSettings.printers.length > 0) {
    const configured = printerSettings.printers.find(p => p.type === type && p.enabled && p.printerName)
    if (configured?.printerName) {
      return configured.printerName
    }
    const fallbackConfigured = printerSettings.printers.find(p => p.type === type && p.printerName)
    if (fallbackConfigured?.printerName) {
      return fallbackConfigured.printerName
    }
  }
  // 2. Fallback: use legacy printerName field (receipt only)
  if (type === 'receipt' && printerSettings?.printerName) {
    return printerSettings.printerName
  }
  // 3. Fallback: check localStorage for saved printer
  if (typeof window !== 'undefined') {
    if (type === 'receipt') {
      const localName = localStorage.getItem('receipt_printer_name')
      if (localName) {
        return localName
      }
    } else if (type === 'label') {
      const localName = localStorage.getItem('label_printer_name')
      if (localName) {
        return localName
      }
    }
  }
  // 4. Last resort: empty string (system default)
  return ''
}

// 语言选项
const LANGS = [
  { code: 'zh', nextCode: 'en', labelKey: '中文' },
  { code: 'en', nextCode: 'id', labelKey: 'English' },
  { code: 'id', nextCode: 'zh', labelKey: 'Bahasa Indonesia' }
]

// 渠道 - 使用i18n key
const CHANNELS = [
  { id: 'dine_in', nameKey: 'dineIn', icon: '🍵', code: 'DINE_IN' },
  { id: 'gofood', nameKey: 'gofood', icon: '🟢', code: 'GOFOOD' },
  { id: 'grab', nameKey: 'grab', icon: '🟡', code: 'GRAB' },
  { id: 'shopee', nameKey: 'shopee', icon: '🟠', code: 'SHOPEE' }
]

// 将API渠道代码转换为POS格式
function convertChannelCode(code: string): { id: string; nameKey: string } {
  const lower = code.toLowerCase()
  // DINE_IN -> dine_in, GOFOOD -> gofood, etc
  const id = lower
  // DINE_IN -> dineIn, GOFOOD -> gofood
  const nameKey = lower.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  return { id, nameKey }
}

// 渠道可用性检查函数
function isChannelAvailable(availableDays: string, availableHours: string): { available: boolean; message?: string } {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=周日, 1=周一...
  const dayStr = dayOfWeek.toString()

  // 检查日期
  const days = availableDays.split(',')
  if (!days.includes(dayStr)) {
    return { available: false, message: 'Today is not a available day for this channel' }
  }

  // 检查时间
  const hoursMatch = availableHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (hoursMatch) {
    const [, startH, startM, endH, endM] = hoursMatch
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const startMinutes = parseInt(startH) * 60 + parseInt(startM)
    const endMinutes = parseInt(endH) * 60 + parseInt(endM)

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return {
        available: false,
        message: `Channel available ${startH}:${startM}-${endH}:${endM}`
      }
    }
  }

  return { available: true }
}

// 甜度选项 - 使用i18n key
const SUGAR_LEVELS = [
  { id: 'normal_sugar', nameKey: 'pos.normalSugar' },
  { id: 'less_sugar', nameKey: 'pos.lessSugar' },
  { id: 'half_sugar', nameKey: 'pos.halfSugar' },
  { id: 'quarter_sugar', nameKey: 'pos.quarterSugar' },
  { id: 'no_sugar', nameKey: 'pos.noSugar' },
]

// 冰度选项 - 使用i18n key
const ICE_LEVELS = [
  { id: 'normal_ice', nameKey: 'pos.normalIce' },
  { id: 'less_ice', nameKey: 'pos.lessIce' },
  { id: 'no_ice', nameKey: 'pos.noIce' },
  { id: 'warm', nameKey: 'pos.warm' },
]

interface CartItem {
  id: string
  productId: string
  productName: string
  specId: string
  specName: string
  sugarLevel?: string
  sugarLevelName?: string
  iceLevel?: string
  iceLevelName?: string
  unitPrice: number
  quantity: number
  addons: { id: string; name: string; price: number; qty: number }[]
}

interface Product {
  id: string
  name: string
  category?: { id: string; name: string }
  image?: string
  specs: { id: string; name: string; price: number }[]
  addons: { addonId: string; addon: { id: string; name: string; price: number } }[]
}

interface DualScreenConfig {
  enabled: boolean
  layoutStyle: 'simple' | 'full'
  welcomeText: string
  showLogo: boolean
  adImageUrl: string
  promotions: string[]
  mediaFiles?: Array<{
    url: string
    filename: string
    mimetype: string
    isVideo: boolean
  }>
  idleLayout?: {
    columns: Array<{
      width: number
      content: 'media' | 'promotions' | 'welcome' | 'order' | 'logo'
    }>
  }
  orderingLayout?: {
    columns: Array<{
      width: number
      content: 'media' | 'promotions' | 'welcome' | 'order' | 'logo'
    }>
  }
}

export function POSPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  // 状态 - 使用Zustand stores
  const [cart, setCart] = useState<CartItem[]>([])
  const { filter, setFilter, products, setProducts, searchQuery, setSearchQuery } = useProductStore()
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'offline'>('connected')
  // 渠道状态 - 动态加载
  const [posChannels, setPosChannels] = useState<Array<{id: string; nameKey: string; icon: string; code: string; color?: string; name?: string}>>([])
  const [selectedChannel, setSelectedChannel] = useState<{id: string; nameKey: string; icon: string; code: string; color?: string; name?: string} | null>(null)
  // 渠道设置（用于控制各渠道开关）
  const [channelSettings, setChannelSettings] = useState<Record<string, { enabled: boolean }>>({})
  const [dineInCount, setDineInCount] = useState(1) // 堂食人数
  const [customerCount, setCustomerCount] = useState(1) // 顾客人数（所有渠道）
  // 订单扩展信息
  const [tableNumber, setTableNumber] = useState('')
  const [callerPhone, setCallerPhone] = useState('')
  const [platformOrderId, setPlatformOrderId] = useState('')
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('')
  const [socialRef, setSocialRef] = useState('')
  const [driverPickupTime, setDriverPickupTime] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [lang, setLang] = useState(() => localStorage.getItem('pos_lang') || i18n.language || 'zh')
  const [pendingTaskCount, setPendingTaskCount] = useState(0)
  // 历史订单数据
  const [orders, setOrders] = useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  // 卫生任务数据
  const [tasks, setTasks] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  // 现金数据
  const [cashSummary, setCashSummary] = useState<any>(null)
  // 交接班数据
  const [shiftData, setShiftData] = useState<any>(null)
  const [selectedShiftType, setSelectedShiftType] = useState<string>('morning')
  const [shiftActualCash, setShiftActualCash] = useState('')
  const [shiftSupervisorPin, setShiftSupervisorPin] = useState('')
  const [shiftInputTarget, setShiftInputTarget] = useState<'actualCash' | 'supervisorPin' | null>(null)
  // 锁屏状态
  const [isLocked, setIsLocked] = useState(false)
  const [lockPin, setLockPin] = useState('')
  const [lockError, setLockError] = useState(false)

  // 打印机检测弹窗状态
  const [showPrinterDetectModal, setShowPrinterDetectModal] = useState(false)
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [printerDetectLoading, setPrinterDetectLoading] = useState(false)
  const [printerDetectError, setPrinterDetectError] = useState<string | null>(null)
  const [selectedPrinterForSetup, setSelectedPrinterForSetup] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')

  // 费用记录状态
  const [todayExpenses, setTodayExpenses] = useState<any[]>([])
  const [expenseCategory, setExpenseCategory] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')

  // POS 操作会话 ID（用于审计日志）
  const [posSessionId] = useState(() => Date.now().toString(36) + Math.random().toString(36).slice(2, 8))
  // 追踪是否有未完成的 checkout（用于检测飞单）
  const hasCheckoutCompleteRef = useRef(false)

  // 硬件管理 - 打印机检测和钱箱控制
  useHardwareManager()

  // 弹窗 - 使用uiStore
  const {
    showAddonModal, setShowAddonModal,
    showPaymentModal, setShowPaymentModal,
    showMemberModal, setShowMemberModal,
    showDiscountModal, setShowDiscountModal,
    showSuspendModal, setShowSuspendModal,
    showShiftModal, setShowShiftModal,
    showChannelModal, setShowChannelModal,
    showScanModal, setShowScanModal,
    showHistoryModal, setShowHistoryModal,
    showCashModal, setShowCashModal,
    showTasksModal, setShowTasksModal,
    showLogoutModal, setShowLogoutModal,
    showExpenseModal, setShowExpenseModal,
    selectedProduct, setSelectedProduct,
    selectedSpec, setSelectedSpec,
    selectedAddonIds, setSelectedAddonIds,
    addonQty, setAddonQty,
    selectedSugar, setSelectedSugar,
    selectedIce, setSelectedIce
  } = useUiStore()

  // 支付方式配置 - 默认现金优先
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'cash', labelKey: 'pos.paymentCash', icon: '💵' },
    { id: 'qris', labelKey: 'pos.paymentQris', icon: '📱' },
    { id: 'gopay', labelKey: 'pos.paymentGoPay', icon: '🟢' },
    { id: 'ovo', labelKey: 'pos.paymentOvo', icon: '🟣' },
    { id: 'dana', labelKey: 'pos.paymentDana', icon: '🔵' },
    { id: 'shopeepay', labelKey: 'pos.paymentShopeePay', icon: '🟠' }
  ])

  // 挂单 - 使用orderStore
  const { suspendedOrders, setSuspendedOrders } = useOrderStore()

  // 考勤二维码弹窗
  const [showAttendanceQR, setShowAttendanceQR] = useState(false)

  // 删除申请弹窗
  const [deleteModalOrder, setDeleteModalOrder] = useState<any>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false)

  // 支付 - 使用orderStore
  const {
    paymentMethod, setPaymentMethod,
    paidAmount, setPaidAmount,
    member, setMember,
    memberPhone, setMemberPhone,
    pointsToRedeem, setPointsToRedeem,
    orderSuccess, setOrderSuccess,
    paymentModalOrderNum, setPaymentModalOrderNum,
    isCheckingOut, setIsCheckingOut,
    isSearchingMember, setIsSearchingMember
  } = useOrderStore()

  // 本地状态
  const [discountAmount, setDiscountAmount] = useState(0)
  const [tempDiscount, setTempDiscount] = useState('')
  // 优惠券状态
  const [memberCoupons, setMemberCoupons] = useState<any[]>([])
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false)

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type?: 'warning' | 'danger' | 'info'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  // QRIS Payment State
  const [qrisData, setQrisData] = useState<{
    qrImage?: string
    qrString?: string
    externalId?: string
    status: 'idle' | 'waiting' | 'paid' | 'expired' | 'failed'
  }>({ status: 'idle' })

  // Refs for keyboard handler to avoid stale closure (initialized to undefined, synced via useEffect)
  const cartRef = useRef(cart)
  const paymentMethodRef = useRef(paymentMethod)
  const paidAmountRef = useRef(paidAmount)
  const totalRef = useRef<number | undefined>(undefined)

  // Keep refs in sync
  useEffect(() => { cartRef.current = cart }, [cart])
  useEffect(() => { paymentMethodRef.current = paymentMethod }, [paymentMethod])
  useEffect(() => { paidAmountRef.current = paidAmount }, [paidAmount])


  // POS布局设置
  const [posLayout, setPosLayout] = useState({
    gridCols: '4',
    cardSize: 'medium',
    showCategory: true,
    showPrice: true,
    calculateTax: true,
    showTax: true,
    taxRate: 11,
    showSuspend: true,
    showHistory: true,
    showScan: true,
    showShift: true,
    showCash: false,
    showExpense: true,
    showTasks: true,
    showHardware: false,
    showLogout: true,
    channelDineIn: true,
    channelGoFood: true,
    channelGrab: true,
    channelShopee: true,
    // 布局样式
    productImage: 'thumb',
    compactMode: false,
    productSortBy: 'name',
    productSortOrder: 'asc',
    // 快捷键配置
    hotkeys: {
      newOrder: 'F1',
      suspendOrder: 'F2',
      recallOrder: 'F3',
      quickPay: 'F4',
      barcodeScan: 'F5',
      cashDrawer: 'F6',
      receiptPrint: 'F7',
      cancelOrder: 'F8',
    },
    // 工具栏按钮自定义标签
    toolbarLabels: {
      suspend: 'toolbar.suspend',
      history: 'toolbar.history',
      refund: 'toolbar.refund',
      scan: 'toolbar.scan',
      shift: 'toolbar.shift',
      cash: 'toolbar.cash',
      expense: 'toolbar.expense',
      tasks: 'toolbar.tasks',
      setting: 'toolbar.setting',
      hardware: 'toolbar.hardware',
      logout: 'toolbar.logout'
    } as Record<string, string>
  })

  // 店铺信息
  const [storeInfo, setStoreInfo] = useState({
    storeName: 'YOUME',
    address: '',
    phone: '',
    openingHours: '',
    storeLogo: (typeof window !== 'undefined' && localStorage.getItem('pos_store_logo')) || '',
  })

  // 小票设置
  const [posReceipt, setPosReceipt] = useState({
    header: 'YOUME',
    footer: 'Thank you!',
    taxRate: 11,
    showLogo: true,
    storeLogo: (typeof window !== 'undefined' && localStorage.getItem('pos_store_logo')) || '',
    paperSize: '80mm',
    printCopies: 1,
    showQR: false,
    qrCodeUrl: '',
    showBarcode: true,
    showKitchenNote: true,
    storePhone: '',
    storeAddress: '',
    itemDetailFormat: 'standard',
    showStaffName: true,
    showCustomerName: false,
    autoPrint: true,
  })

  // 根据 channelSettings 与 posLayout 动态过滤并补齐自定义名称的可用渠道
  const availableChannels = useMemo(() => {
    const codeToKeyMap: Record<string, string> = {
      'DINE_IN': 'dineIn',
      'GOFOOD': 'gofood',
      'GRAB': 'grab',
      'SHOPEE': 'shopee',
    }
    const codeToLayoutMap: Record<string, keyof typeof posLayout> = {
      'DINE_IN': 'channelDineIn',
      'GOFOOD': 'channelGoFood',
      'GRAB': 'channelGrab',
      'SHOPEE': 'channelShopee',
    }
    const baseList = (posChannels && posChannels.length > 0) ? posChannels : CHANNELS
    return baseList.filter(ch => {
      const adminKey = codeToKeyMap[ch.code]
      if (adminKey && channelSettings[adminKey]) {
        if (channelSettings[adminKey].enabled === false) return false
      }
      const layoutKey = codeToLayoutMap[ch.code]
      if (layoutKey && posLayout[layoutKey] === false) return false
      return true
    }).map(ch => {
      const adminKey = codeToKeyMap[ch.code]
      const cfg = adminKey ? (channelSettings as any)[adminKey] : null
      return {
        ...ch,
        name: cfg?.name || (ch as any).name || ((ch as any).nameKey ? t(`pos.channel.${(ch as any).nameKey}`, ch.code) : ch.code),
        color: cfg?.color || (ch as any).color,
        icon: cfg?.icon || ch.icon
      }
    })
  }, [posChannels, channelSettings, posLayout, t])

  // 保证当前选中的渠道必须在可用渠道内
  useEffect(() => {
    if (availableChannels.length > 0) {
      if (!selectedChannel) {
        setSelectedChannel(availableChannels[0])
      } else {
        const stillValid = availableChannels.find(c => c.id === selectedChannel.id || c.code === selectedChannel.code)
        if (!stillValid) {
          setSelectedChannel(availableChannels[0])
        }
      }
    }
  }, [availableChannels, selectedChannel])

  // 每日递增排队取餐号生成器 (如 A001, A002, G001...)
  const getNextPickupNumber = (channelCode?: string) => {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const storeKey = `pos_pickup_seq_${dateStr}`
    let currentSeq = 1
    try {
      const saved = localStorage.getItem(storeKey)
      if (saved) {
        currentSeq = (parseInt(saved, 10) || 0) + 1
      }
      localStorage.setItem(storeKey, String(currentSeq))
    } catch (e) {
      currentSeq = Math.floor(1 + Math.random() * 999)
    }

    let prefix = 'A'
    if (channelCode === 'GOFOOD') prefix = 'G'
    else if (channelCode === 'GRAB') prefix = 'B'
    else if (channelCode === 'SHOPEE') prefix = 'S'
    else if (channelCode === 'TAKEAWAY') prefix = 'T'
    else if (channelCode === 'DINE_IN') prefix = 'A'

    return `${prefix}${String(currentSeq).padStart(3, '0')}`
  }

  // 小票模板（从ReceiptTemplate表加载，支持拖拽编辑器自定义）
  const [receiptTemplate, setReceiptTemplate] = useState<any>(null)

  // POS 操作日志辅助函数
  const logPOSAction = useCallback((params: {
    action: string
    entityId?: string
    description: string
    metadata?: Record<string, any>
    severity?: 'info' | 'warning' | 'critical'
  }) => {
    const storeId = user?.storeId || 'default'
    posApi.logPOSAction({
      ...params,
      sessionId: posSessionId,
    }).catch((err: any) => console.warn('[POS Action Log]', err))
  }, [user?.storeId, posSessionId])

  // 税费设置（包含免税商品ID列表）
  const [taxSettings, setTaxSettings] = useState({
    enabled: true,
    rate: 11,
    showOnReceipt: true,
    exemptItems: [] as string[], // product IDs that are tax-exempt
  })

  // 显示设置
  const [displaySettings, setDisplaySettings] = useState({
    autoLogoutMinutes: 30,
    language: 'id',
    fontSize: 'medium',
    showOfflineIndicator: true,
    autoLockMinutes: 5, // 锁屏时间（分钟），0 = 禁用
    lockScreenPin: '', // 锁屏密码
  })

  // 硬件设置 - 支持 localStorage 本地优先与持久化缓存
  const [hardwareSettings, setHardwareSettings] = useState(() => {
    const defaultSettings = {
      printers: [
        {
          id: 'receipt-1',
          type: 'receipt' as const,
          name: 'Receipt Printer',
          enabled: true,
          connectionType: 'usb' as 'usb' | 'network',
          printerName: (typeof window !== 'undefined' && localStorage.getItem('receipt_printer_name')) || '',
          printerIp: '192.168.1.100',
          printerPort: 9100,
        },
        {
          id: 'kitchen-1',
          type: 'kitchen' as const,
          name: 'Kitchen Printer',
          enabled: false,
          connectionType: 'usb' as 'usb' | 'network',
          printerName: '',
          printerIp: '192.168.1.100',
          printerPort: 9100,
        },
        {
          id: 'label-1',
          type: 'label' as const,
          name: 'Label Printer',
          enabled: false,
          connectionType: 'usb' as 'usb' | 'network',
          printerName: '',
          printerIp: '192.168.1.100',
          printerPort: 9100,
        },
      ],
      printerConnectionType: 'usb',
      printerType: 'escpos',
      printerName: (typeof window !== 'undefined' && localStorage.getItem('receipt_printer_name')) || '',
      printerIp: '192.168.1.100',
      printerPort: 9100,
      cashDrawerPulse: 100,
      autoOpenCashDrawer: true,
      scannerEnabled: true,
      scannerType: 'usb',
      displayBrightness: 80,
      dualScreen: {
        enabled: false,
        layoutStyle: 'full' as 'simple' | 'full',
        welcomeText: 'YOUME',
        showLogo: false,
        adImageUrl: '',
        promotions: ['✨', '🍓', '💳', '🎁'],
      },
      testPrint: null as number | null,
      testCashDrawer: null as number | null,
      triggerPrinterDetect: null as number | null,
    }

    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('hardware_settings')
        if (cached) {
          const parsed = JSON.parse(cached)
          return { ...defaultSettings, ...parsed }
        }
      }
    } catch (e) {
      console.error('[POS] Failed to parse hardware_settings from localStorage:', e)
    }
    return defaultSettings
  })

  // 声音设置
  const [soundSettings, setSoundSettings] = useState({
    keypress: { enabled: true, volume: 80 },
    orderComplete: { enabled: true, volume: 100 },
    error: { enabled: true, volume: 100 },
    newOrder: { enabled: true, volume: 100 },
  })

  const taxRate = posReceipt.taxRate / 100

  // 快捷金额设置
  const [quickAmounts, setQuickAmounts] = useState({
    enabled: true,
    amounts: [5000, 10000, 20000, 50000]
  })

  // 支付设置
  const [paymentSettings, setPaymentSettings] = useState({
    defaultMethod: 'cash',
    minAmount: 0,
    maxCashAmount: 0,
    changeEnabled: true
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

  // 获取产品 (支持离线缓存)
  useEffect(() => {
    // 登录日志
    logPOSAction({
      action: 'login',
      description: `收银员登录 POS`,
      metadata: { storeId: user?.storeId, staffId: user?.staff?.id },
      severity: 'info',
    })

    // 登出清理
    return () => {
      if (cartRef.current.length > 0 && !hasCheckoutCompleteRef.current) {
        logPOSAction({
          action: 'cart_clear',
          description: `页面关闭，${cartRef.current.length}件商品未结账`,
          metadata: { itemCount: cartRef.current.length },
          severity: 'critical',
        })
      }
      logPOSAction({
        action: 'logout',
        description: `收银员退出 POS`,
        metadata: {},
        severity: 'info',
      })
    }
  }, [])

  // 自动检测打印机并同步到服务器
  useEffect(() => {
    const storeId = user?.storeId
    if (!storeId) return

    const detectAndSyncPrinters = async () => {
      // 检测 Windows 打印机列表
      if (electronAPI?.listPrinters) {
        try {
          const result = await electronAPI.listPrinters()
          if (result?.printers?.length > 0) {
            console.log('[POS] Detected printers:', result.printers)
            // 同步到服务器，供 Admin 使用
            await posApi.syncPrinters(result.printers, storeId)
            console.log('[POS] Printers synced to server')
          }
        } catch (err) {
          console.warn('[POS] Failed to detect printers:', err)
        }
      }
    }

    detectAndSyncPrinters()
  }, [user?.storeId])

  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token
    let cancelled = false

    const loadProducts = async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(`${connectionManager.getCurrentUrl()}/products?storeId=${storeId}&status=active`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          })
          const data = await res.json()
          if (cancelled) return
          if (data?.data?.list) {
            // 在线时缓存产品到IndexedDB
            const localProducts: LocalProduct[] = data.data.list.map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              categoryId: p.category?.id || '',
              categoryName: p.category?.name || '',
              specs: p.specs || [],
              addons: p.addons?.map((a: any) => ({
                id: a.addon?.id || '',
                name: a.addon?.name || '',
                price: a.addon?.price || 0
              })) || []
            }))
            await productCache.saveProducts(localProducts)

            if (!cancelled) {
              setProducts(data.data.list)
              const firstCat = data.data.list[0]?.category?.name
              if (firstCat) setFilter(firstCat)
              setLoading(false)
            }
          } else {
            // data.data.list 为空
            if (!cancelled) setLoading(false)
          }
        } catch (e) {
          if (cancelled) return
          // 在线读取失败，尝试从缓存加载
          const cached = await productCache.getProducts()
          if (cached.length > 0) {
            setProducts(cached.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              category: { id: p.categoryId, name: p.categoryName },
              specs: p.specs || [],
              addons: (p.addons || []).map(a => ({ addonId: a.id, addon: a }))
            })))
            showToast(t('pos.offlineMode') + ' - ' + t('pos.loadingFromCache'), 'info')
          } else {
            // 无缓存，加载示例产品
            const demoProducts = productCache.getDemoProducts()
            setProducts(demoProducts.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              image: p.image,
              category: { id: p.categoryId, name: p.categoryName },
              specs: p.specs,
              addons: p.addons.map(a => ({ addonId: a.id, addon: a }))
            })))
            showToast(t('pos.demoMode'), 'info')
          }
          if (!cancelled) setLoading(false)
        }
      } else {
        // 离线模式，从缓存读取
        const cached = await productCache.getProducts()
        if (cancelled) return
        if (cached.length > 0) {
          setProducts(cached.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            image: p.image,
            category: { id: p.categoryId, name: p.categoryName },
            specs: p.specs || [],
            addons: (p.addons || []).map(a => ({ addonId: a.id, addon: a }))
          })))
          if (!cancelled) setLoading(false)
        } else {
          // 无缓存，加载示例产品
          const demoProducts = productCache.getDemoProducts()
          setProducts(demoProducts.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            image: p.image,
            category: { id: p.categoryId, name: p.categoryName },
            specs: p.specs,
            addons: p.addons.map(a => ({ addonId: a.id, addon: a }))
          })))
          showToast(t('pos.demoMode'), 'info')
          if (!cancelled) setLoading(false)
        }
      }
    }

    loadProducts()
    return () => { cancelled = true }
  }, [user?.storeId])

  // 定期同步产品 (每5分钟检查一次)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token

    const syncProducts = async () => {
      if (!navigator.onLine) return

      try {
        // Check if server has newer products
        const versionRes = await fetch(`${connectionManager.getCurrentUrl()}/products/pos/version?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })

        if (versionRes.ok) {
          const versionData = await versionRes.json()
          const serverTimestamp = versionData.data?.latestUpdate

          // Check if we need to sync
          const hasNewer = await productCache.hasNewerProducts(serverTimestamp)

          if (hasNewer) {
            // Fetch all products
            const res = await fetch(`${connectionManager.getCurrentUrl()}/products?storeId=${storeId}&status=active`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            })
            const data = await res.json()

            if (data?.data?.list) {
              const localProducts: LocalProduct[] = data.data.list.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                image: p.image,
                categoryId: p.category?.id || '',
                categoryName: p.category?.name || '',
                specs: p.specs || [],
                addons: p.addons?.map((a: any) => ({
                  id: a.addon?.id || '',
                  name: a.addon?.name || '',
                  price: a.addon?.price || 0
                })) || []
              }))

              await productCache.saveProducts(localProducts)
              if (serverTimestamp) {
                await productCache.saveProductsVersion(serverTimestamp)
              }
              // 同步更新当前 React 商品状态，收银员即时看到后台修改
              setProducts(localProducts.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                image: p.image,
                category: { id: p.categoryId, name: p.categoryName },
                specs: p.specs || [],
                addons: (p.addons || []).map(a => ({ addonId: a.id, addon: a }))
              })))
            }
          }
        }
      } catch (e) {
        console.error('[ProductSync] Sync failed:', e)
        // Note: Don't call setLoading(false) here - it's handled by loadProducts
      }
    }

    // Initial sync check after 30 seconds
    const initialTimeout = setTimeout(syncProducts, 30000)

    // Then sync every 5 minutes
    const interval = setInterval(syncProducts, 5 * 60 * 1000)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
    }
  }, [user?.storeId])

  // 初始化语言（从localStorage恢复）
  useEffect(() => {
    const savedLang = localStorage.getItem('pos_lang')
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang)
      setLang(savedLang)
    }
  }, [])

  // 获取所有配置 (店铺信息、布局、支付方式、小票设置)
  const loadConfig = useCallback(() => {
    // Guard: only load when storeId is available (not during initial loading with 'default')
    if (!user?.storeId) return
    const storeId = user.storeId
    console.log('[POS] Loading config for storeId:', storeId)
    // Use configured API URL for cloud sync
    posApi.getConfigs(storeId)
      .then(res => {
        const configs = res.data?.data || {}
        console.log('[POS] Loaded configs:', Object.keys(configs))

        // 店铺信息 - Admin保存为storeInfo对象
        const storeInfoData = configs.storeInfo || {}
        const receiptConfig = configs.posReceipt || configs.receiptSettings || {}
        const resolvedStoreLogo = storeInfoData.storeLogo || storeInfoData.logo || receiptConfig.storeLogo || ''

        if (storeInfoData.storeName || storeInfoData.address || storeInfoData.phone || resolvedStoreLogo) {
          setStoreInfo({
            storeName: storeInfoData.storeName || 'YOUME',
            address: storeInfoData.address || '',
            phone: storeInfoData.phone || '',
            openingHours: storeInfoData.openingHours || '',
            storeLogo: resolvedStoreLogo,
          })
          if (resolvedStoreLogo) {
            localStorage.setItem('pos_store_logo', resolvedStoreLogo)
          }
        }

        // POS布局设置 - Admin保存为posLayout对象，包含快捷键、渠道开关等
        const posLayoutData = configs.posLayout || {}
        if (Object.keys(posLayoutData).length > 0) {
          setPosLayout(prev => ({
            ...prev,
            // 基础布局
            gridCols: posLayoutData.gridCols || prev.gridCols,
            cardSize: posLayoutData.cardSize || prev.cardSize,
            showCategory: posLayoutData.showCategory ?? prev.showCategory,
            showPrice: posLayoutData.showPrice ?? prev.showPrice,
            calculateTax: posLayoutData.calculateTax ?? prev.calculateTax,
            showTax: posLayoutData.showTax ?? prev.showTax,
            taxRate: posLayoutData.taxRate ?? prev.taxRate,
            // 工具栏按钮
            showSuspend: posLayoutData.showSuspend ?? prev.showSuspend,
            showHistory: posLayoutData.showHistory ?? prev.showHistory,
            showScan: posLayoutData.showScan ?? prev.showScan,
            showShift: posLayoutData.showShift ?? prev.showShift,
            showCash: posLayoutData.showCash ?? prev.showCash,
            // 渠道开关
            channelDineIn: posLayoutData.channelDineIn ?? prev.channelDineIn,
            channelGoFood: posLayoutData.channelGoFood ?? prev.channelGoFood,
            channelGrab: posLayoutData.channelGrab ?? prev.channelGrab,
            channelShopee: posLayoutData.channelShopee ?? prev.channelShopee,
            // 布局样式
            productImage: posLayoutData.productImage || prev.productImage,
            compactMode: posLayoutData.compactMode ?? prev.compactMode,
            // 快捷键
            hotkeys: posLayoutData.hotkeys || prev.hotkeys,
          }))
        }

        // 工具栏设置 (包含按钮标签与完整开关)
        if (configs.toolbarSettings) {
          setPosLayout(prev => ({
            ...prev,
            showSuspend: configs.toolbarSettings.showSuspend ?? prev.showSuspend,
            showHistory: configs.toolbarSettings.showHistory ?? prev.showHistory,
            showScan: configs.toolbarSettings.showScan ?? prev.showScan,
            showShift: configs.toolbarSettings.showShift ?? prev.showShift,
            showCash: configs.toolbarSettings.showCash ?? prev.showCash,
            showExpense: configs.toolbarSettings.showExpense ?? prev.showExpense,
            showTasks: configs.toolbarSettings.showTasks ?? (prev as any).showTasks,
            showHardware: configs.toolbarSettings.showHardware ?? (prev as any).showHardware,
            showLogout: configs.toolbarSettings.showLogout ?? (prev as any).showLogout,
            // Admin 保存的 key 是 toolbarLabels，但 POS 也可能用 labels 作为 fallback
            toolbarLabels: configs.toolbarSettings.toolbarLabels || configs.toolbarSettings.labels || prev.toolbarLabels,
          }))
        }

        // 小票设置 - Admin保存完整posReceipt对象，合并默认值
        if (receiptConfig && Object.keys(receiptConfig).length > 0) {
          setPosReceipt(prev => ({
            header: receiptConfig.header || receiptConfig.headerCustomText || prev.header,
            footer: receiptConfig.footer || receiptConfig.footerMessage || prev.footer,
            taxRate: receiptConfig.taxRate ?? prev.taxRate,
            showLogo: receiptConfig.showLogo ?? prev.showLogo,
            storeLogo: resolvedStoreLogo || receiptConfig.storeLogo || prev.storeLogo,
            paperSize: receiptConfig.paperSize || prev.paperSize,
            printCopies: receiptConfig.printCopies ?? prev.printCopies,
            showQR: receiptConfig.showQR ?? prev.showQR,
            qrCodeUrl: receiptConfig.qrCodeUrl || prev.qrCodeUrl,
            showBarcode: receiptConfig.showBarcode ?? prev.showBarcode,
            showKitchenNote: receiptConfig.showKitchenNote ?? prev.showKitchenNote,
            storePhone: receiptConfig.storePhone || storeInfoData.phone || prev.storePhone,
            storeAddress: receiptConfig.storeAddress || storeInfoData.address || prev.storeAddress,
            itemDetailFormat: receiptConfig.itemDetailFormat || prev.itemDetailFormat,
            showStaffName: receiptConfig.showStaffName ?? prev.showStaffName,
            showCustomerName: receiptConfig.showCustomerName ?? prev.showCustomerName,
            autoPrint: receiptConfig.autoPrint ?? prev.autoPrint,
          }))

          // 加载小票模板（如果有templateId）
          if (receiptConfig.templateId) {
            posApi.getReceiptTemplate(receiptConfig.templateId)
              .then((res: any) => {
                if (res.data?.data?.content) {
                  try {
                    const template = JSON.parse(res.data.data.content)
                    setReceiptTemplate(template)
                  } catch (e) {
                    console.error('Failed to parse receipt template:', e)
                  }
                }
              })
              .catch((err: any) => console.error('Failed to load receipt template:', err))
          }
        }

        // 税费设置（包含免税商品）- 合并默认值
        if (configs.taxSettings) {
          setTaxSettings(prev => ({ ...prev, ...configs.taxSettings }))
        }

        // 硬件设置（打印机、钱箱）- Admin保存完整结构，合并默认值
        if (configs.hardwareSettings) {
          console.log('[POS] hardwareSettings from server:', configs.hardwareSettings)
          const hw = configs.hardwareSettings
          const newDualScreen: DualScreenConfig = hw.dualScreen ? {
            enabled: hw.dualScreen.enabled ?? false,
            layoutStyle: hw.dualScreen.layoutStyle || 'full',
            welcomeText: hw.dualScreen.welcomeText || 'YOUME',
            showLogo: hw.dualScreen.showLogo ?? false,
            adImageUrl: hw.dualScreen.adImageUrl || '',
            promotions: hw.dualScreen.promotions || ['🧋', '🍓', '💳', '🎁'],
            mediaFiles: hw.dualScreen.mediaFiles || [],
            idleLayout: hw.dualScreen.idleLayout || { columns: [{ width: 100, content: 'media' }] },
            orderingLayout: hw.dualScreen.orderingLayout || { columns: [{ width: 100, content: 'order' }] },
          } : hardwareSettings.dualScreen

          setHardwareSettings((prev: any) => {
            let mergedPrinters = hw.printers && Array.isArray(hw.printers) ? [...hw.printers] : [...prev.printers]
            // 服务端配置为绝对第一优先级 (Single Source of Truth)
            const serverReceiptPrinter = mergedPrinters.find((p: any) => p.type === 'receipt' && p.printerName)?.printerName
            const activePrinterName = serverReceiptPrinter || hw.printerName || prev.printerName || (typeof window !== 'undefined' ? localStorage.getItem('receipt_printer_name') : '') || ''

            if (activePrinterName) {
              const idx = mergedPrinters.findIndex((p: any) => p.type === 'receipt')
              if (idx >= 0) {
                mergedPrinters[idx] = { ...mergedPrinters[idx], enabled: true, printerName: activePrinterName }
              } else {
                mergedPrinters.push({
                  id: 'receipt-1',
                  type: 'receipt',
                  name: 'Receipt Printer',
                  enabled: true,
                  connectionType: hw.printerConnectionType || 'usb',
                  printerName: activePrinterName,
                  printerIp: hw.printerIp || '',
                  printerPort: hw.printerPort || 9100
                })
              }
            }

            // 更新离线缓存供无网断网时使用
            try {
              localStorage.setItem('hardware_settings', JSON.stringify({ ...hw, printers: mergedPrinters, printerName: activePrinterName }))
              if (activePrinterName) {
                localStorage.setItem('receipt_printer_name', activePrinterName)
              }
            } catch (e) {
              console.warn('[POS] Failed to update offline hardware settings cache:', e)
            }

            return {
              ...prev,
              printers: mergedPrinters,
              printerConnectionType: hw.printerConnectionType || prev.printerConnectionType,
              printerType: hw.printerType || prev.printerType,
              printerName: activePrinterName,
              printerIp: hw.printerIp || prev.printerIp,
              printerPort: hw.printerPort || prev.printerPort,
              cashDrawerPulse: hw.cashDrawerPulse || prev.cashDrawerPulse,
              autoOpenCashDrawer: hw.autoOpenCashDrawer ?? prev.autoOpenCashDrawer,
              scannerEnabled: hw.scannerEnabled ?? prev.scannerEnabled,
              scannerType: hw.scannerType || prev.scannerType,
              displayBrightness: hw.displayBrightness || prev.displayBrightness,
              dualScreen: newDualScreen,
              testPrint: null,
              testCashDrawer: null,
            }
          })


          // 同步 dualScreen 配置到 localStorage，供副屏使用
          localStorage.setItem('dualScreenConfig', JSON.stringify(newDualScreen))
          window.dispatchEvent(new Event('storage'))
        }

        // 支付方式配置 - 使用Admin配置，覆盖默认值
        if (configs.paymentMethods) {
          const methods = configs.paymentMethods
          // 已知支付方式key列表（只处理这些，忽略配置中的其他字段如defaultMethod, rates等）
          const paymentMethodKeys = ['cash', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'debit', 'card']
          const enabledMethods = paymentMethodKeys
            .filter(key => methods[key] === true)
            .map(id => {
              const methodMap: Record<string, any> = {
                cash: { id: 'cash', labelKey: 'pos.paymentCash', icon: '💵' },
                qris: { id: 'qris', labelKey: 'pos.paymentQris', icon: '📱' },
                gopay: { id: 'gopay', labelKey: 'pos.paymentGoPay', icon: '🟢' },
                ovo: { id: 'ovo', labelKey: 'pos.paymentOvo', icon: '🟣' },
                dana: { id: 'dana', labelKey: 'pos.paymentDana', icon: '🔵' },
                shopeepay: { id: 'shopeepay', labelKey: 'pos.paymentShopeePay', icon: '🟠' },
                debit: { id: 'debit', labelKey: 'pos.paymentDebit', icon: '💳' },
                card: { id: 'card', labelKey: 'pos.paymentCard', icon: '💳' }
              }
              return methodMap[id] || { id, labelKey: `pos.payment${id.charAt(0).toUpperCase() + id.slice(1)}`, icon: '💰' }
            })
            // Sort to prioritize cash first
            .sort((a, b) => {
              if (a.id === 'cash') return -1
              if (b.id === 'cash') return 1
              return 0
            })
          // 如果有配置且有启用的方式，完全替换默认值
          if (enabledMethods.length > 0) {
            setPaymentMethods(enabledMethods)
            setPaymentMethod(enabledMethods[0].id)
          }
        }
        // 如果没有配置，使用默认值（空对象表示使用服务端/客户端默认）

        // 快捷金额设置 - 合并默认值
        if (configs.quickAmounts) {
          setQuickAmounts(prev => ({ ...prev, ...configs.quickAmounts }))
        }

        // 支付设置 (限额/默认方式) - Admin存到paymentMethods key下
        if (configs.paymentMethods) {
          setPaymentSettings(prev => ({
            ...prev,
            defaultMethod: configs.paymentMethods.defaultMethod || prev.defaultMethod,
            minAmount: configs.paymentMethods.minAmount ?? prev.minAmount,
            maxCashAmount: configs.paymentMethods.maxCashAmount ?? prev.maxCashAmount,
            changeEnabled: configs.paymentMethods.changeEnabled ?? prev.changeEnabled,
          }))
          if (configs.paymentMethods.defaultMethod) {
            setPaymentMethod(configs.paymentMethods.defaultMethod)
          }
        }

        // 交接班设置 - 合并默认值，防止缺失字段
        if (configs.shiftSettings) {
          setShiftSettings(prev => ({
            ...prev,
            ...configs.shiftSettings,
            summaryItems: {
              ...prev.summaryItems,
              ...(configs.shiftSettings.summaryItems || {})
            }
          }))
        }

        // 渠道颜色配置、自定义名称与开关设置
        if (configs.channelSettings) {
          setChannelSettings(configs.channelSettings)

          // 保持 posLayout 的渠道开关与 channelSettings 同步
          setPosLayout(prev => ({
            ...prev,
            channelDineIn: configs.channelSettings.dineIn?.enabled ?? prev.channelDineIn,
            channelGoFood: configs.channelSettings.gofood?.enabled ?? prev.channelGoFood,
            channelGrab: configs.channelSettings.grab?.enabled ?? prev.channelGrab,
            channelShopee: configs.channelSettings.shopee?.enabled ?? prev.channelShopee,
          }))

          setPosChannels(prev => {
            const list = (prev && prev.length > 0) ? prev : CHANNELS
            return list.map(ch => {
              const codeToKeyMap: Record<string, string> = {
                'DINE_IN': 'dineIn',
                'GOFOOD': 'gofood',
                'GRAB': 'grab',
                'SHOPEE': 'shopee',
              }
              const adminKey = codeToKeyMap[ch.code]
              const channelConfig = adminKey ? configs.channelSettings[adminKey] : null
              if (channelConfig) {
                return {
                  ...ch,
                  name: channelConfig.name || (ch as any).name || '',
                  color: channelConfig.color || (ch as any).color,
                  icon: channelConfig.icon || ch.icon,
                }
              }
              return ch
            })
          })
        }

        // 显示设置 (autoLogout, language, etc)
        if (configs.displaySettings) {
          setDisplaySettings(prev => ({
            ...prev,
            ...configs.displaySettings
          }))
          // 如果后台配置了系统语言，同步切换
          if (configs.displaySettings.language && configs.displaySettings.language !== lang) {
            i18n.changeLanguage(configs.displaySettings.language)
            setLang(configs.displaySettings.language)
            localStorage.setItem('pos_lang', configs.displaySettings.language)
          }
          // 离线解锁：保存 lockScreenPin 到本地
          if (configs.displaySettings.lockScreenPin) {
            saveLockScreenPin(configs.displaySettings.lockScreenPin)
          }
        }

        // 声音设置 - 合并默认值
        if (configs.soundSettings) {
          setSoundSettings(prev => ({ ...prev, ...configs.soundSettings }))
        }
      })
      .catch(() => {
        showToast(t('common.error') + ' - Config', 'error')
      })
  }, [user?.storeId])

  // 页面可见性或获得焦点时重新加载配置（Admin修改设置后自动秒级同步）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadConfig()
      }
    }
    const handleFocus = () => {
      loadConfig()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadConfig])

  // 初始加载配置与获取软件版本
  useEffect(() => {
    loadConfig()
    const fetchAppVersion = async () => {
      try {
        const ver = await electronAPI?.getAppVersion?.()
        if (ver) setAppVersion(ver)
      } catch (err) {
        console.error('[POS] Failed to get app version:', err)
      }
    }
    fetchAppVersion()
  }, [loadConfig])

  // 启动与登录后静默检测收银机连接的物理打印机并自动上报给服务端供Admin选配
  useEffect(() => {
    const silentDetectAndReport = async () => {
      try {
        if (!electronAPI?.getPrinters) return
        const printers = await electronAPI.getPrinters()
        if (printers && Array.isArray(printers) && printers.length > 0) {
          const names = printers.map((p: any) => typeof p === 'string' ? p : p.name).filter(Boolean)
          console.log('[POS] Auto-detected local printers on startup:', names)
          const storeId = user?.storeId || localStorage.getItem('storeId') || ''
          await posApi.reportPrinters(names, storeId)
        }
      } catch (err) {
        console.warn('[POS] Failed to auto-report printers on startup:', err)
      }
    }
    silentDetectAndReport()
  }, [user?.storeId])

  // 定期轮询配置（Admin修改后自动同步，10秒间隔）
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadConfig()
      }
    }, 10000) // 10秒轮询
    return () => clearInterval(pollInterval)
  }, [loadConfig])

  // 硬件配置轮询 - 检测 Admin 测试命令
  useEffect(() => {
    const pollHardwareConfig = async () => {
      if (!user?.storeId) return
      try {
        const res = await posApi.getConfigs(user.storeId, 'pos')
        const configs = res.data?.data || {}
        const hs = configs.hardwareSettings
        if (!hs) return

        // 检测测试打印机标志
        if (hs.testPrint && hs.testPrint !== hardwareSettings.testPrint) {
          const receiptPrinter = (hs.printers || []).find((p: any) => p.type === 'receipt' && p.enabled)
          electronAPI?.sendPrintReceipt?.({
            orderNum: 'TEST-' + Date.now(),
            header: posReceipt.header || 'YOUME',
            footer: posReceipt.footer || 'Test Print',
            printerName: receiptPrinter?.printerName || getPrinterName(hs, 'receipt'),
            items: [{ productName: 'Test Item', specName: '', quantity: 1, unitPrice: 1000, addons: [] }],
            subtotal: 1000, tax: 0, total: 1000, paymentMethod: 'Test'
          })
          // 清除测试标志
          posApi.setConfig(user.storeId, 'hardwareSettings', { ...hs, testPrint: null }, 'pos')
        }

        // 检测测试钱箱标志
        if (hs.testCashDrawer && hs.testCashDrawer !== hardwareSettings.testCashDrawer) {
          const receiptPrinter = (hs.printers || []).find((p: any) => p.type === 'receipt' && p.enabled)
          electronAPI?.openCashDrawer?.({ printerName: receiptPrinter?.printerName || getPrinterName(hs, 'receipt'), cashDrawerPulse: hs.cashDrawerPulse || 100 })
          // 清除测试标志
          posApi.setConfig(user.storeId, 'hardwareSettings', { ...hs, testCashDrawer: null }, 'pos')
        }

        // 检测刷新打印机标志（Admin 点刷新按钮时设置）
        if (hs.triggerPrinterDetect && hs.triggerPrinterDetect !== hardwareSettings.triggerPrinterDetect) {
          console.log('[POS] Admin triggered printer detect')
          // 重新检测打印机并上报
          if (electronAPI?.listPrinters) {
            try {
              const result = await electronAPI.listPrinters()
              console.log('[POS] Detected printers:', result.printers)
              await posApi.syncPrinters(result.printers || [], user.storeId)
              console.log('[POS] Printers synced to server')
            } catch (err) {
              console.warn('[POS] Failed to detect printers:', err)
            }
          }
          // 清除触发标志
          posApi.setConfig(user.storeId, 'hardwareSettings', { ...hs, triggerPrinterDetect: null }, 'pos')
        }
      } catch (err) {
        // 静默失败，不影响主流程
      }
    }

    // 每5秒轮询硬件配置
    const interval = setInterval(pollHardwareConfig, 5000)
    return () => clearInterval(interval)
  }, [user?.storeId, hardwareSettings.testPrint, hardwareSettings.testCashDrawer, hardwareSettings.triggerPrinterDetect])

  // 加载渠道列表 (从API加载，支持Admin配置)
  useEffect(() => {
    const storeId = user?.storeId || 'default'
    const token = useAuthStore.getState().token

    fetch(`${connectionManager.getCurrentUrl()}/channels?storeId=${storeId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        const apiChannels = data?.data?.list || []
        if (apiChannels.length > 0) {
          // 将API渠道转换为POS格式，排除POS本身
          // 使用 ch.id（数据库UUID）作为channelId，code用于翻译key
          const loadedChannels = apiChannels
            .filter((ch: any) => ch.status === 'active' && ch.code !== 'POS')
            .map((ch: any) => {
              const { id, nameKey } = convertChannelCode(ch.code)
              return {
                id: ch.id,  // 使用数据库中的实际UUID
                nameKey: `pos.${nameKey}` as string,
                icon: ch.icon || '📦',
                code: ch.code,  // 保留code备用
                name: ch.name || ''
              }
            })
          setPosChannels(loadedChannels)
          // 解锁后必须先选择渠道，弹出渠道选择框
          if (!selectedChannel) {
            setDineInCount(1) // 重置人数
            setCustomerCount(1) // 重置顾客人数
            setShowChannelModal(true)
          }
        } else {
          // API没有渠道，使用默认值
          setPosChannels(CHANNELS)
          if (!selectedChannel) {
            setDineInCount(1)
            setCustomerCount(1)
            setShowChannelModal(true)
          }
        }
      })
      .catch(() => {
        // 失败时使用默认渠道
        setPosChannels(CHANNELS)
        if (!selectedChannel) {
          setDineInCount(1)
          setCustomerCount(1)
          setShowChannelModal(true)
        }
      })
  }, [user?.storeId])

  // 挂单从localStorage恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem('suspended_orders')
      if (saved) setSuspendedOrders(JSON.parse(saved))
    } catch (e) {
      console.error('Failed to load suspended orders:', e)
      localStorage.removeItem('suspended_orders')
    }
  }, [])

  // 一键复购 - 从历史订单恢复商品
  useEffect(() => {
    const rebuyData = localStorage.getItem('rebuy_items')
    if (rebuyData) {
      try {
        const rebuyItems = JSON.parse(rebuyData)
        if (rebuyItems.length > 0) {
          setConfirmModal({
            isOpen: true,
            title: t('pos.rebuyConfirmTitle', 'Confirm Rebuy'),
            message: t('pos.addRebuyConfirm', { count: rebuyItems.length }),
            type: 'info',
            onConfirm: () => {
              const newItems: CartItem[] = rebuyItems.map((item: any) => ({
                id: `REBUY-${Date.now()}-${Math.random()}`,
                productId: item.productId || '',
                productName: item.productName,
                specId: item.specId || '',  // 保留规格ID以便重复检测
                specName: item.specName || item.productName,
                unitPrice: item.unitPrice || 0,
                quantity: item.quantity || 1,
                addons: item.addons || []
              }))
              setCart(newItems)
              // 恢复渠道
              const savedChannel = localStorage.getItem('rebuy_channel')
              if (savedChannel) {
                const ch = CHANNELS.find(c => c.id === savedChannel)
                if (ch) setSelectedChannel(ch)
              }
              localStorage.removeItem('rebuy_items')
              localStorage.removeItem('rebuy_channel')
            }
          })
        }
      } catch (e) {
        console.error('Failed to parse rebuy items', e)
        localStorage.removeItem('rebuy_items')
        localStorage.removeItem('rebuy_channel')
      }
    }
  }, [])

  // 条码扫描 - 从扫码页面添加商品
  useEffect(() => {
    const scanData = localStorage.getItem('scan_to_cart')
    if (scanData) {
      try {
        const item = JSON.parse(scanData)
        setConfirmModal({
          isOpen: true,
          title: t('pos.scanConfirmTitle', 'Add Scanned Item'),
          message: t('pos.addScanConfirm', { product: item.productName }),
          type: 'info',
          onConfirm: () => {
            const newItem: CartItem = {
              id: `SCAN-${Date.now()}`,
              productId: item.productId || '',
              productName: item.productName,
              specId: item.specId || '',  // 保留规格ID以便重复检测
              specName: item.specName || item.productName,
              unitPrice: item.unitPrice || 0,
              quantity: item.quantity || 1,
              addons: item.addons || []
            }
            setCart(prev => {
              const existIdx = prev.findIndex(i => i.productName === newItem.productName && i.specName === newItem.specName)
              if (existIdx >= 0) {
                return prev.map((it, i) => i === existIdx ? { ...it, quantity: it.quantity + newItem.quantity } : it)
              }
              return [...prev, newItem]
            })
            localStorage.removeItem('scan_to_cart')
          }
        })
      } catch (e) {
        console.error('Failed to parse scan data', e)
        localStorage.removeItem('scan_to_cart')
      }
    }
  }, [])

  // 同步状态
  useEffect(() => {
    syncManager.startSync(30000)
    return () => syncManager.destroy()
  }, [])

  // 检查服务器API配置 (Admin可在后台修改，POS自动获取)
  useEffect(() => {
    const checkServerApiUrl = async () => {
      const serverUrl = await fetchApiUrlFromServer()
      if (serverUrl && serverUrl !== getApiUrl()) {
        updateApiUrl(serverUrl)
        setApiUrl(serverUrl)
      }
    }

    // 启动时检查
    checkServerApiUrl()

    // 每5分钟检查一次
    const interval = setInterval(checkServerApiUrl, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // 网络状态监听
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Connection Manager 状态监听
  useEffect(() => {
    const updateConnectionStatus = (event: any) => {
      if (event.type === 'connected') {
        setConnectionStatus('connected')
        setIsOnline(true)
      } else if (event.type === 'connecting' || event.type === 'degraded') {
        setConnectionStatus('connecting')
      } else if (event.type === 'offline') {
        setConnectionStatus('offline')
        setIsOnline(false)
      }
    }
    const unsubscribe = connectionManager.addListener(updateConnectionStatus)
    // 初始化状态
    setConnectionStatus(connectionManager.getState() === 'offline' ? 'offline' : connectionManager.getState() === 'connecting' ? 'connecting' : 'connected')
    return unsubscribe
  }, [])

  // 自动登出 - 使用配置的分钟数 (默认30分钟)
  useEffect(() => {
    const timeoutMinutes = displaySettings.autoLogoutMinutes || 30
    if (timeoutMinutes <= 0) return // 0 = 禁用

    const TIMEOUT = timeoutMinutes * 60 * 1000
    let lastActivity = Date.now()

    const updateActivity = () => {
      lastActivity = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, updateActivity))

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT) {
        logout()
      }
    }, 60000) // 每分钟检查一次

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity))
      clearInterval(checkInterval)
    }
  }, [logout, displaySettings.autoLogoutMinutes])

  // 自动锁屏计时器
  useEffect(() => {
    const lockMinutes = displaySettings.autoLockMinutes || 0
    if (lockMinutes <= 0) return // 0 = 禁用

    const TIMEOUT = lockMinutes * 60 * 1000
    let lastActivity = Date.now()

    const updateActivity = () => {
      lastActivity = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, updateActivity))

    const checkInterval = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT) {
        setIsLocked(true)
      }
    }, 10000) // 每10秒检查一次

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity))
      clearInterval(checkInterval)
    }
  }, [displaySettings.autoLockMinutes, isLocked])

  // 解锁处理 - 如果设置了PIN则必须输入正确才能解锁
  const handleUnlock = async () => {
    if (displaySettings.lockScreenPin) {
      // 有设置PIN时，必须验证
      // 离线时使用本地 PIN 验证
      const isOnline = navigator.onLine
      let storedPin = displaySettings.lockScreenPin

      if (!isOnline) {
        // 离线时从本地获取 PIN
        storedPin = await getLockScreenPin() || ''
      }

      if (lockPin !== storedPin) {
        setLockError(true)
        setLockPin('')
        return
      }
    }
    // 无PIN或PIN正确时才能解锁
    setIsLocked(false)
    setLockPin('')
    setLockError(false)
  }

  // 获取待处理卫生任务数量
  useEffect(() => {
    const fetchPendingTasks = async () => {
      if (!user?.storeId) return
      try {
        const res = await posApi.getPendingTasks()
        const tasks = res?.data?.data || []
        setPendingTaskCount(tasks.length)
      } catch (e) {
        // ignore
      }
    }
    fetchPendingTasks()
    const interval = setInterval(fetchPendingTasks, 60000) // 每分钟刷新
    return () => clearInterval(interval)
  }, [user?.storeId])

  // 加载历史订单
  const fetchOrders = async () => {
    if (!user?.storeId) return
    setOrdersLoading(true)
    try {
      // Always show only today's orders (Jakarta timezone)
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date())
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '01'
      const today = `${getPart('year')}-${getPart('month')}-${getPart('day')}`
      const res = await posApi.getOrders({ storeId: user.storeId, date: today, limit: 20 })
      setOrders(res.data?.data?.list || [])
    } catch (e) {
      console.error('Failed to fetch orders:', e)
    } finally {
      setOrdersLoading(false)
    }
  }

  // 提交删除申请
  const submitDeleteRequest = async () => {
    if (!deleteModalOrder || !deleteReason.trim()) return
    setIsSubmittingDelete(true)
    try {
      await posApi.requestRefund({
        orderId: deleteModalOrder.id,
        reason: deleteReason,
        staffId: user?.id
      })
      showToast(t('orders.deleteRequestSubmitted'), 'success')
      setDeleteModalOrder(null)
      setDeleteReason('')
      fetchOrders() // 刷新列表
    } catch (e: any) {
      showToast(e?.response?.data?.message || t('orders.deleteRequestFailed'), 'error')
    } finally {
      setIsSubmittingDelete(false)
    }
  }

  // 加载卫生任务
  const fetchTasks = async () => {
    if (!user?.storeId) return
    setTasksLoading(true)
    try {
      const res = await posApi.getMyTasks()
      setTasks(res.data?.data?.list || [])
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    } finally {
      setTasksLoading(false)
    }
  }

  // 加载现金摘要
  const fetchCashSummary = async () => {
    try {
      const res = await posApi.getCashSummary({ storeId: user?.storeId })
      setCashSummary(res.data?.data)
    } catch (e) {
      console.error('Failed to fetch cash summary:', e)
    }
  }

  // 加载交接班数据
  const fetchShiftData = async () => {
    try {
      const res = await posApi.getCurrentShift()
      setShiftData(res.data?.data)
    } catch (e) {
      console.error('Failed to fetch shift data:', e)
    }
  }

  // 加载今日费用数据
  const fetchTodayExpenses = async () => {
    if (!user?.storeId) return
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      const res = await posApi.getExpenses({ startDate: todayStr })
      // Filter expenses for today based on date field
      const allExpenses = res.data?.data?.list || []
      const todayExp = allExpenses.filter((e: any) => {
        const expDate = new Date(e.date).toISOString().split('T')[0]
        return expDate === todayStr
      })
      setTodayExpenses(todayExp)
    } catch (e) {
      console.error('Failed to fetch expenses:', e)
    }
  }

  // 创建费用记录
  const createExpense = async () => {
    if (!expenseCategory || !expenseAmount || !user?.storeId) {
      showToast(t('pos.expenseRequired'), 'warning')
      return
    }
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      await posApi.createExpense({
        type: 'operational',
        category: expenseCategory,
        amount: parseInt(expenseAmount),
        description: expenseDescription,
        date: today.toISOString()
      })
      showToast(t('pos.expenseCreated'), 'success')
      setExpenseCategory('')
      setExpenseAmount('')
      setExpenseDescription('')
      fetchTodayExpenses()
    } catch (e: any) {
      showToast(e?.response?.data?.message || t('pos.expenseFailed'), 'error')
    }
  }

  // 打开费用弹窗时加载数据
  useEffect(() => {
    if (showExpenseModal) {
      fetchTodayExpenses()
    }
  }, [showExpenseModal])

  // 打开历史订单弹窗时加载数据
  useEffect(() => {
    if (showHistoryModal) fetchOrders()
  }, [showHistoryModal])

  // 打开任务弹窗时加载数据
  useEffect(() => {
    if (showTasksModal) fetchTasks()
  }, [showTasksModal])

  // 打开现金弹窗时加载数据
  useEffect(() => {
    if (showCashModal) fetchCashSummary()
  }, [showCashModal])

  // 打开交接班弹窗时加载汇总数据
  useEffect(() => {
    if (showShiftModal) fetchShiftData()
  }, [showShiftModal])

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1-F4: 渠道快捷切换（严格限定在可用渠道内）
      if (e.key === 'F1') { e.preventDefault(); if (availableChannels[0]) setSelectedChannel(availableChannels[0]) }
      if (e.key === 'F2') { e.preventDefault(); if (availableChannels[1]) setSelectedChannel(availableChannels[1]) }
      if (e.key === 'F3') { e.preventDefault(); if (availableChannels[2]) setSelectedChannel(availableChannels[2]) }
      if (e.key === 'F4') { e.preventDefault(); if (availableChannels[3]) setSelectedChannel(availableChannels[3]) }
      // F5-F8: 常用金额
      if (e.key === 'F5' && cartRef.current.length > 0) { e.preventDefault(); const pNum = getNextPickupNumber(selectedChannel?.code); setPaymentModalOrderNum(pNum); setShowPaymentModal(true) }
      // F6: 弹出钱箱 (快捷键)
      if (e.key === 'F6') { e.preventDefault(); handleOpenCashDrawer() }
      // ESC: 关闭弹窗
      if (e.key === 'Escape') {
        if (showAddonModal) setShowAddonModal(false)
        if (showPaymentModal) setShowPaymentModal(false)
        if (showMemberModal) setShowMemberModal(false)
        if (showDiscountModal) setShowDiscountModal(false)
        if (showSuspendModal) setShowSuspendModal(false)
        if (showShiftModal) setShowShiftModal(false)
        if (showHistoryModal) setShowHistoryModal(false)
        if (showScanModal) setShowScanModal(false)
        if (showCashModal) setShowCashModal(false)
        if (showLogoutModal) setShowLogoutModal(false)
      }
      // Enter: 确认支付 (在支付弹窗中)
      if (e.key === 'Enter' && showPaymentModal) {
        e.preventDefault()
        const currentPayment = paymentMethodRef.current
        const currentPaid = paidAmountRef.current
        const currentTotal = totalRef.current ?? 0
        const isValid = currentPayment !== 'cash' || (currentPaid && parseInt(currentPaid) >= currentTotal)
        if (isValid) handleCheckout()
      }
      // 数字键快速选产品 (1-9)
      if (!showAddonModal && !showPaymentModal && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9) {
          const filtered = products.filter(p => filter === 'all' || p.category?.name === filter)
          if (filtered[num - 1]) {
            const p = filtered[num - 1]
            if (p.specs?.[0]) handleSpecClick(p, p.specs[0])
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [availableChannels, products, filter, showAddonModal, showPaymentModal, showMemberModal, showDiscountModal, showSuspendModal, showShiftModal, showHistoryModal, showScanModal, showCashModal, showLogoutModal])

  const productStore = useProductStore()
  const categories = productStore.categories()
  const rawFiltered = productStore.filtered()
  const filtered = useMemo(() => {
    const list = [...rawFiltered]
    const sortBy = (posLayout as any).productSortBy || 'name'
    const sortOrder = (posLayout as any).productSortOrder || 'asc'
    const orderMul = sortOrder === 'desc' ? -1 : 1

    list.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name) * orderMul
      }
      if (sortBy === 'price_asc') {
        const priceA = a.specs?.[0]?.price ?? 0
        const priceB = b.specs?.[0]?.price ?? 0
        return (priceA - priceB) * orderMul
      }
      if (sortBy === 'price_desc') {
        const priceA = a.specs?.[0]?.price ?? 0
        const priceB = b.specs?.[0]?.price ?? 0
        return (priceB - priceA) * orderMul
      }
      if (sortBy === 'category') {
        const catA = a.category?.name || ''
        const catB = b.category?.name || ''
        const catCmp = catA.localeCompare(catB)
        if (catCmp !== 0) return catCmp * orderMul
        return a.name.localeCompare(b.name) * orderMul
      }
      return 0
    })
    return list
  }, [rawFiltered, (posLayout as any).productSortBy, (posLayout as any).productSortOrder])

  // 动态grid class
  const gridColsClass = {
    '3': 'grid-cols-3',
    '4': 'grid-cols-4',
    '5': 'grid-cols-5',
    '6': 'grid-cols-6',
    '8': 'grid-cols-8'
  }[posLayout.gridCols] || 'grid-cols-4'

  const cardHeightClass = posLayout.cardSize === 'large' ? 'h-24' : posLayout.cardSize === 'small' ? 'h-16' : 'h-20'

  const subtotal = cart.reduce((sum, item) => {
    const addonsTotal = item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0)
    return sum + (item.unitPrice + addonsTotal) * item.quantity
  }, 0)
  // 税费：根据Admin设置决定是否计算和显示，排除免税商品
  const taxableSubtotal = cart
    .filter(item => !taxSettings.exemptItems?.includes(item.productId))
    .reduce((sum, item) => {
      const addonsTotal = item.addons.reduce((a, addon) => a + addon.price * addon.qty, 0)
      return sum + (item.unitPrice + addonsTotal) * item.quantity
    }, 0)
  const tax = taxSettings.enabled !== false && posLayout.showTax !== false ? Math.round(taxableSubtotal * taxRate) : 0
  // 积分抵扣：每100积分抵扣1印尼盾，强制取整避免产生小数零头
  const pointsDiscount = Math.floor((pointsToRedeem || 0) / 100)
  const total = Math.max(0, Math.round(subtotal + tax - discountAmount - pointsDiscount))
  const change = paidAmount ? Math.max(0, (parseInt(paidAmount) || 0) - total) : 0

  // Sync totalRef after total is calculated
  useEffect(() => { totalRef.current = total }, [total])

  // 实时推流购物车状态到客显副屏
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = (window as any).electronAPI
    if (!api) return

    if (cart.length === 0) {
      api.sendOrderClear?.()
    } else {
      api.sendOrderUpdate?.({
        items: cart.map(item => ({
          id: item.id,
          productName: item.productName,
          specName: item.specName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          addons: (item.addons || []).map(a => ({ name: a.name, price: a.price }))
        })),
        subtotal,
        ppn: tax,
        discount: discountAmount,
        total
      })
    }
  }, [cart, subtotal, tax, discountAmount, total])

  // 当选择 QRIS 且生成二维码后，推流收款二维码到副屏
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = (window as any).electronAPI
    if (!api?.sendPaymentQr) return

    if (showPaymentModal && paymentMethod === 'qris' && qrisData.status === 'waiting' && qrisData.qrImage) {
      api.sendPaymentQr({
        qrImage: qrisData.qrImage,
        amount: total,
        orderNumber: paymentModalOrderNum
      })
    } else if (!showPaymentModal || paymentMethod !== 'qris' || qrisData.status !== 'waiting') {
      api.sendPaymentQr(null)
    }
  }, [showPaymentModal, paymentMethod, qrisData.status, qrisData.qrImage, total, paymentModalOrderNum])

  // Auto-apply coupon discount when selected coupon changes
  useEffect(() => {
    if (selectedCoupon?.coupon) {
      const coupon = selectedCoupon.coupon
      if (coupon.type === 'discount_fixed') {
        setDiscountAmount(Math.min(coupon.value, subtotal + tax))
      } else if (coupon.type === 'discount_percent') {
        const discount = Math.round((subtotal + tax) * (coupon.value / 100))
        const maxDiscount = coupon.maxDiscount || Infinity
        setDiscountAmount(Math.min(discount, maxDiscount, subtotal + tax))
      }
    }
  }, [selectedCoupon, subtotal, tax])

  // 最大可用积分（不能超过总价）
  const maxRedeemablePoints = member ? Math.min(member.points || 0, Math.floor(total * 100)) : 0

  // 添加到购物车
  const handleAddToCartWithAddons = () => {
    if (!selectedProduct || !selectedSpec) return
    const addons = selectedAddonIds.map(id => {
      const addon = selectedProduct.addons.find(a => a.addonId === id)?.addon
      return { id, name: addon?.name || '', price: addon?.price || 0, qty: 1 }
    })

    const sugarObj = SUGAR_LEVELS.find(s => s.id === selectedSugar)
    const iceObj = ICE_LEVELS.find(i => i.id === selectedIce)

    const newItem: CartItem = {
      id: `${selectedProduct.id}-${selectedSpec.id}-${Date.now()}`,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      specId: selectedSpec.id,
      specName: selectedSpec.name,
      sugarLevel: selectedSugar,
      sugarLevelName: sugarObj ? t(sugarObj.nameKey) : t('pos.normalSugar'),
      iceLevel: selectedIce,
      iceLevelName: iceObj ? t(iceObj.nameKey) : t('pos.normalIce'),
      unitPrice: selectedSpec.price,
      quantity: addonQty,
      addons
    }

    setCart(prev => {
      const existIdx = prev.findIndex(
        i => i.productId === newItem.productId && i.specId === newItem.specId &&
        i.sugarLevel === newItem.sugarLevel && i.iceLevel === newItem.iceLevel &&
        JSON.stringify(i.addons.map(a => a.id).sort()) === JSON.stringify(addons.map(a => a.id).sort())
      )
      if (existIdx >= 0) {
        return prev.map((item, i) => i === existIdx ? { ...item, quantity: item.quantity + addonQty } : item)
      }
      return [...prev, newItem]
    })
    // 审计日志
    logPOSAction({
      action: 'cart_add',
      entityId: newItem.id,
      description: `添加商品: ${newItem.productName} x${addonQty}`,
      metadata: {
        productId: newItem.productId,
        productName: newItem.productName,
        specId: newItem.specId,
        specName: newItem.specName,
        quantity: addonQty,
        unitPrice: newItem.unitPrice,
        addons: addons.map(a => a.name),
      },
      severity: 'info',
    })
    setShowAddonModal(false)
    setSelectedProduct(null)
    setSelectedSpec(null)
    setAddonQty(1)
    setSelectedSugar('normal_sugar')
    setSelectedIce('normal_ice')
  }

  // 点击规格 - 打开选择弹窗
  const handleSpecClick = (product: Product, spec: { id: string; name: string; price: number }) => {
    setSelectedProduct(product)
    setSelectedSpec(spec)
    setSelectedAddonIds([])
    setAddonQty(1)
    setSelectedSugar('normal_sugar')
    setSelectedIce('normal_ice')
    setShowAddonModal(true)
  }

  const addItemDirectly = (newItem: CartItem) => {
    setCart(prev => {
      const existIdx = prev.findIndex(
        i => i.productId === newItem.productId && i.specId === newItem.specId &&
        i.sugarLevel === newItem.sugarLevel && i.iceLevel === newItem.iceLevel &&
        JSON.stringify(i.addons.map(a => a.id).sort()) === JSON.stringify(newItem.addons.map(a => a.id).sort())
      )
      if (existIdx >= 0) {
        return prev.map((item, i) => i === existIdx ? { ...item, quantity: item.quantity + newItem.quantity } : item)
      }
      return [...prev, newItem]
    })
  }

  const changeQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = prev.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      ).filter(item => item.quantity > 0)
      return updated
    })
  }

  const removeItem = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const clearCart = () => {
    // 检测是否有未结账商品被清空（飞单嫌疑）
    if (cart.length > 0 && !hasCheckoutCompleteRef.current) {
      logPOSAction({
        action: 'cart_clear',
        description: `清空购物车（${cart.length}件商品未结账）`,
        metadata: { itemCount: cart.length, totalAmount: subtotal + tax },
        severity: 'warning',
      })
    }
    setCart([])
    setDiscountAmount(0)
    setMember(null)
    setDineInCount(1) // 重置堂食人数
    setCustomerCount(1) // 重置顾客人数
    setOrderSuccess('') // 清除订单成功提示
    setTableNumber('') // 重置桌号
    setPlatformOrderId('') // 重置平台单号
    setSocialRef('') // 重置社交引用
    setPurchaseOrderNo('') // 重置采购单号
  }

  // 挂单 - 同时在服务端创建订单记录
  const suspendOrder = async () => {
    if (cart.length === 0) {
      showToast(t('pos.emptyCart'), 'warning')
      return
    }
    try {
      // 在服务端创建挂单状态的订单
      const orderData: any = {
        storeId: user?.storeId || 'default',
        staffId: user?.staff?.id || 'default',
        channelId: selectedChannel?.id || 'POS',
        channelName: selectedChannel?.code || selectedChannel?.id || 'POS',  // Use code for consistency
        items: cart.map(item => ({
          productId: item.productId,
          productName: item.productName,
          specId: item.specId,
          specName: item.specName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          addons: item.addons.map(a => ({ name: a.name, price: a.price }))
        })),
        paymentMethod: 'cash', // 挂单时不选择支付方式
        discountAmount: 0,
        pointsRedeemed: 0,
        taxEnabled: taxSettings.enabled !== false,
        customerCount: selectedChannel?.code === 'DINE_IN' ? dineInCount : customerCount, // 设置默认值
        status: 'suspended' // 关键：设置为挂单状态
      }
      // 堂食时添加用餐人数和桌号
      if (selectedChannel?.code === 'DINE_IN') {
        orderData.dineInCount = dineInCount
        orderData.tableNumber = tableNumber
      }
      // 外卖平台订单号
      if (selectedChannel?.code === 'GOFOOD' || selectedChannel?.code === 'GRAB' || selectedChannel?.code === 'SHOPEE') {
        orderData.platformOrderId = platformOrderId
      }
      const res = await posApi.createOrder(orderData)
      const serverOrder = res.data?.data
      // 本地也存储一份，用于快速恢复
      const order = {
        id: serverOrder?.id || `SUSP-${Date.now()}`,
        orderNumber: serverOrder?.orderNumber,
        cart: [...cart],
        channel: selectedChannel,
        time: new Date().toLocaleTimeString()
      }
      const updated = [...suspendedOrders, order]
      setSuspendedOrders(updated)
      localStorage.setItem('suspended_orders', JSON.stringify(updated))
      logPOSAction({
        action: 'suspend',
        description: `挂单，${cart.length}件商品`,
        metadata: { itemCount: cart.length, totalAmount: subtotal + tax, orderId: serverOrder?.id },
        severity: 'info',
      })
      clearCart()
      showToast(`${t('pos.orderSuspended')} (${updated.length})`, 'success')
    } catch (err: any) {
      console.error('Failed to suspend order:', err)
      showToast(t('common.error') + ': ' + (err?.message || t('common.error')), 'error')
    }
  }

  // 检测本机打印机
  const handleDetectPrinters = async (): Promise<string[]> => {
    setPrinterDetectLoading(true)
    setPrinterDetectError(null)
    setDetectedPrinters([])
    try {
      let printerList: string[] = []
      if (electronAPI?.listPrinters) {
        const result = await electronAPI.listPrinters()
        if (result?.printers && Array.isArray(result.printers)) {
          printerList = result.printers
        }
      } else if (electronAPI?.getPrinters) {
        const raw = await electronAPI.getPrinters()
        if (Array.isArray(raw)) {
          printerList = raw.map((p: any) => typeof p === 'string' ? p : p.name).filter(Boolean)
        }
      }

      console.log('[POS] Detected printers:', printerList)
      if (printerList.length > 0) {
        setDetectedPrinters(printerList)
        setSelectedPrinterForSetup(printerList[0])
        return printerList
      } else {
        setPrinterDetectError(t('pos_no_printers', '未检测到可用打印机'))
        return []
      }
    } catch (err: any) {
      console.error('[POS] Detect printers failed:', err)
      setPrinterDetectError((err?.message) || t('common.error'))
      return []
    } finally {
      setPrinterDetectLoading(false)
    }
  }

  // 将选中的打印机设为小票打印机并保存
  const handleSetupReceiptPrinter = async () => {
    const printerToSave = (selectedPrinterForSetup || '').trim()
    if (!printerToSave) {
      showToast(t('pos.pleaseSelectPrinter') || '请选择或输入打印机名称', 'warning')
      return
    }

    const storeId = user?.storeId || localStorage.getItem('storeId') || ''

    try {
      const existingPrinters = hardwareSettings.printers || []
      const existingIndex = existingPrinters.findIndex((p: any) => p.type === 'receipt')
      let updatedPrinters = [...existingPrinters]
      if (existingIndex >= 0) {
        updatedPrinters[existingIndex] = {
          ...updatedPrinters[existingIndex],
          enabled: true,
          printerName: printerToSave
        }
      } else {
        updatedPrinters.push({
          id: 'receipt-1',
          type: 'receipt',
          name: 'Receipt Printer',
          enabled: true,
          connectionType: 'usb',
          printerName: printerToSave,
          printerIp: '',
          printerPort: 9100
        })
      }
      const newHardwareSettings = {
        ...hardwareSettings,
        printerName: printerToSave,
        printers: updatedPrinters
      }

      // 1. 本地状态更新
      setHardwareSettings(newHardwareSettings)

      // 2. 本地持久化 (localStorage)，离线与再次加载时 100% 生效
      try {
        localStorage.setItem('hardware_settings', JSON.stringify(newHardwareSettings))
        localStorage.setItem('receipt_printer_name', printerToSave)
      } catch (e) {
        console.error('[POS] Failed to save hardware settings to localStorage:', e)
      }

      // 3. 服务端配置同步 (如果有 storeId)
      if (storeId) {
        try {
          await posApi.setHardwareSettings(storeId, newHardwareSettings)
        } catch (apiErr: any) {
          console.warn('[POS] Server setHardwareSettings failed, local copy active:', apiErr)
        }
      }

      setShowPrinterDetectModal(false)
      showToast((t('pos.printerSetupSuccess') || '打印机已成功设置为') + ' ' + printerToSave, 'success')
    } catch (err: any) {
      console.error('[POS] handleSetupReceiptPrinter error:', err)
      showToast((t('common.error') || '保存失败') + ': ' + (err?.message || ''), 'error')
    }
  }

  // 将选中的打印机设为标签打印机并保存
  const handleSetupLabelPrinter = async () => {
    const printerToSave = (selectedPrinterForSetup || '').trim()
    if (!printerToSave) {
      showToast(t('pos.pleaseSelectPrinter') || '请选择或输入打印机名称', 'warning')
      return
    }

    const storeId = user?.storeId || localStorage.getItem('storeId') || ''

    try {
      const existingPrinters = hardwareSettings.printers || []
      const existingIndex = existingPrinters.findIndex((p: any) => p.type === 'label')
      let updatedPrinters = [...existingPrinters]
      if (existingIndex >= 0) {
        updatedPrinters[existingIndex] = {
          ...updatedPrinters[existingIndex],
          enabled: true,
          printerName: printerToSave,
          connectionType: 'usb'
        }
      } else {
        updatedPrinters.push({
          id: 'label-1',
          type: 'label',
          name: 'Label Printer',
          enabled: true,
          connectionType: 'usb',
          printerName: printerToSave,
          printerIp: '',
          printerPort: 9100
        })
      }
      const newHardwareSettings = {
        ...hardwareSettings,
        printers: updatedPrinters
      }

      setHardwareSettings(newHardwareSettings)

      try {
        localStorage.setItem('hardware_settings', JSON.stringify(newHardwareSettings))
        localStorage.setItem('label_printer_name', printerToSave)
      } catch (e) {
        console.error('[POS] Failed to save label printer to localStorage:', e)
      }

      if (storeId) {
        try {
          await posApi.setHardwareSettings(storeId, newHardwareSettings)
        } catch (apiErr: any) {
          console.warn('[POS] Server setHardwareSettings failed, local copy active:', apiErr)
        }
      }

      showToast((t('pos.labelPrinterSetupSuccess', '已成功设为标签打印机') || '已成功设为标签打印机') + ' ' + printerToSave, 'success')
    } catch (err: any) {
      console.error('[POS] handleSetupLabelPrinter error:', err)
      showToast((t('common.error') || '保存失败') + ': ' + (err?.message || ''), 'error')
    }
  }

  // 手动/快捷键打开钱箱
  const handleOpenCashDrawer = async () => {
    const receiptPrinter = (hardwareSettings.printers || []).find((p: any) => p.type === 'receipt' && p.enabled)
    const targetPrinterName = receiptPrinter?.printerName || getPrinterName(hardwareSettings, 'receipt')
    try {
      const res = await electronAPI?.openCashDrawer?.({
        printerName: targetPrinterName,
        cashDrawerPulse: hardwareSettings.cashDrawerPulse || 100
      })
      if (res?.success) {
        showToast(t('pos.cashDrawerOpened', '钱箱已弹开'), 'success')
      } else {
        showToast((t('pos.cashDrawerFailed', '钱箱打开失败') || '钱箱打开失败') + (res?.error ? `: ${res.error}` : ''), 'error')
      }
    } catch (err: any) {
      showToast('钱箱打开失败: ' + (err?.message || ''), 'error')
    }
  }

  // 测试打印小票
  const handleTestPrint = async () => {
    const targetName = (selectedPrinterForSetup || '').trim() || getPrinterName(hardwareSettings, 'receipt')
    try {
      const res = await electronAPI?.sendPrintReceipt?.({
        orderNum: 'TEST-' + Date.now().toString().slice(-4),
        header: posReceipt.header || 'YOUME POS',
        footer: posReceipt.footer || 'TEST PRINT / 测试打印',
        printerName: targetName,
        items: [{ productName: '测试商品 (Test Item)', specName: '标准杯', quantity: 1, unitPrice: 15000, addons: [] }],
        subtotal: 15000,
        tax: 0,
        discount: 0,
        total: 15000,
        paymentMethod: 'Cash',
        paidAmount: 15000,
        change: 0,
      })
      if (res?.success) {
        showToast((t('pos.testPrintSuccess', '测试打印已发送') || '测试打印已发送') + (targetName ? ` (${targetName})` : ''), 'success')
      } else {
        showToast((t('pos.printFailed', '打印失败') || '打印失败') + (res?.error ? `: ${res.error}` : ''), 'error')
      }
    } catch (err: any) {
      showToast('打印失败: ' + (err?.message || ''), 'error')
    }
  }

  // 测试打印标签杯贴
  const handleTestLabelPrint = async () => {
    const targetName = (selectedPrinterForSetup || '').trim() || getPrinterName(hardwareSettings, 'label')
    try {
      const res = await electronAPI?.sendCupStickers?.({
        printerName: targetName,
        stickers: [{
          orderNum: 'A001',
          cupIndex: 1,
          totalCups: 1,
          productName: '招牌珍珠奶茶 (Brown Sugar Milk Tea)',
          specName: '大杯 Large',
          sugarLevelName: '50% 少糖',
          iceLevelName: 'Less Ice 微冰',
          addons: [{ name: '波霸 Boba' }, { name: '椰果 Jelly' }],
          storeName: storeInfo.storeName || 'YOUME',
          channelName: '堂食 (Dine-in)'
        }],
        isTspl: true
      })
      if (res?.success) {
        showToast((t('pos.testLabelSuccess', '杯贴测试打印已发送') || '杯贴测试打印已发送') + (targetName ? ` (${targetName})` : ''), 'success')
      } else {
        showToast((t('pos.printFailed', '打印失败') || '打印失败') + (res?.error ? `: ${res.error}` : ''), 'error')
      }
    } catch (err: any) {
      showToast('杯贴打印失败: ' + (err?.message || ''), 'error')
    }
  }

  // 测试弹开钱箱
  const handleTestCashDrawer = async () => {
    const targetName = (selectedPrinterForSetup || '').trim() || getPrinterName(hardwareSettings, 'receipt')
    try {
      const res = await electronAPI?.openCashDrawer?.({
        printerName: targetName,
        cashDrawerPulse: hardwareSettings.cashDrawerPulse || 100
      })
      if (res?.success) {
        showToast((t('pos.cashDrawerOpened', '钱箱测试已触发') || '钱箱测试已触发') + (targetName ? ` (${targetName})` : ''), 'success')
      } else {
        showToast((t('pos.cashDrawerFailed', '钱箱弹开失败') || '钱箱弹开失败') + (res?.error ? `: ${res.error}` : ''), 'error')
      }
    } catch (err: any) {
      showToast('钱箱弹开失败: ' + (err?.message || ''), 'error')
    }
  }

  const resumeOrder = async (order: typeof suspendedOrders[0]) => {
    // 如果当前购物车有内容，需要确认覆盖
    if (cart.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: t('pos.resumeConfirmTitle', 'Resume Order'),
        message: t('pos.resumeConfirm'),
        type: 'warning',
        onConfirm: () => resumeOrderConfirmed(order)
      })
      return
    }
    await resumeOrderConfirmed(order)
  }

  const resumeOrderConfirmed = async (order: typeof suspendedOrders[0]) => {
    // 取单时删除服务端 suspended 订单（结账会创建新订单）
    try {
      if (order.id && !order.id.startsWith('SUSP-')) {
        await posApi.deleteOrder(order.id)
      }
    } catch (err) {
      console.error('Failed to delete suspended order from server:', err)
      // 继续流程，不阻塞取单
    }
    setCart(order.cart)
    setSelectedChannel(order.channel)
    setSuspendedOrders(prev => {
      const updated = prev.filter(o => o.id !== order.id)
      localStorage.setItem('suspended_orders', JSON.stringify(updated))
      return updated
    })
    logPOSAction({ action: 'resume', description: `取单恢复`, metadata: { itemCount: order.cart.length, orderId: order.orderNumber }, severity: 'info' })
    showToast(t('pos.orderResumed'), 'success')
  }

  // 查找会员
  const searchMember = async () => {
    if (!memberPhone || isSearchingMember) return
    setIsSearchingMember(true)
    setMemberCoupons([])
    setSelectedCoupon(null)
    setDiscountAmount(0)
    try {
      const res = await posApi.getMembers({ phone: memberPhone })
      if (res.data?.data?.list?.[0]) {
        const found = res.data.data.list[0]
        setMember(found)
        logPOSAction({
          action: 'member_add',
          entityId: found.id,
          description: `添加会员: ${found.name}`,
          metadata: { memberId: found.id, memberName: found.name, phone: found.phone },
          severity: 'info',
        })
        // 获取会员优惠券
        try {
          const couponsRes = await posApi.getMemberCoupons(found.id)
          if (couponsRes.data?.data?.list) {
            const unusedCoupons = couponsRes.data.data.list.filter((c: any) => c.status === 'unused')
            setMemberCoupons(unusedCoupons)
          }
        } catch {
          // 优惠券获取失败不影响主流程
        }
      } else {
        setMember(null)
        showToast(t('pos.noMemberFound'), 'info')
      }
    } catch {
      setMember(null)
      showToast(t('pos.memberSearchError'), 'error')
    } finally {
      setIsSearchingMember(false)
    }
  }

  // 结账
  const handleCheckout = async () => {
    if (cart.length === 0 || isCheckingOut) return

    // QRIS: Generate QR code first
    if (paymentMethod === 'qris' && qrisData.status === 'idle') {
      // Check if online - QRIS requires internet connection
      if (!navigator.onLine) {
        showToast(t('pos.qrisOfflineNotice'), 'warning')
        setIsCheckingOut(false)
        return
      }
      setIsCheckingOut(true)
      try {
        const res = await posApi.createQrisPayment(user?.storeId || 'default', `ORDER-${Date.now()}`, total)
        if (res.data?.success) {
          setQrisData({
            qrImage: res.data.data.qrImage,
            qrString: res.data.data.qrString,
            externalId: res.data.data.externalId,
            status: 'waiting'
          })
          setIsCheckingOut(false)
          return // Wait for webhook or manual confirmation
        } else {
          showToast(res.data?.error || t('pos.qrisCreateFailed'), 'error')
          setIsCheckingOut(false)
          return
        }
      } catch (error: any) {
        showToast(t('pos.qrisOfflineNotice'), 'warning')
        setIsCheckingOut(false)
        return
      }
    }

    // QRIS: If already waiting, confirm payment manually
    if (paymentMethod === 'qris' && qrisData.status === 'waiting') {
      // For now, allow manual confirmation after payment is received
      showToast(t('pos.confirmPaymentManual'), 'info')
      return
    }

    // QRIS: If paid, proceed to create order
    if (paymentMethod === 'qris' && qrisData.status !== 'paid') {
      // Handle expired/failed status with user feedback
      if (qrisData.status === 'expired') {
        showToast(t('pos.qrisExpired'), 'warning')
        setQrisData({ status: 'idle', qrImage: '', qrString: '', externalId: '' })
        return
      }
      if (qrisData.status === 'failed') {
        showToast(t('pos.qrisFailed'), 'error')
        setQrisData({ status: 'idle', qrImage: '', qrString: '', externalId: '' })
        return
      }
      return // Wait for payment (idle/waiting)
    }

    // 渠道必填字段检查
    const orderChannel = selectedChannel || { id: 'POS', nameKey: 'pos.counter' as const, code: 'POS' }
    if (orderChannel.code === 'DINE_IN' && (!dineInCount || dineInCount < 1)) {
      showToast(t('pos.dineInCountRequired'), 'error')
      return
    }
    if (['GOFOOD', 'GRAB', 'SHOPEE'].includes(orderChannel.id) && !platformOrderId) {
      showToast(t('pos.platformOrderIdRequired'), 'error')
      return
    }

    // 现金限额检查
    if (paymentMethod === 'cash' && paymentSettings.maxCashAmount > 0 && parseInt(paidAmount) > paymentSettings.maxCashAmount) {
      showToast(`${t('pos.cashOverLimit')} ${formatCurrency(paymentSettings.maxCashAmount)}`, 'error')
      setIsCheckingOut(false)
      return
    }

    setIsCheckingOut(true)
    logPOSAction({
      action: 'checkout_start',
      description: `开始结账，合计: ${formatCurrency(total)}`,
      metadata: { totalAmount: total, itemCount: cart.length, paymentMethod },
      severity: 'info',
    })
    const localId = `LOCAL-${Date.now()}`
    // 发送原始数据，服务端统一计算税费和总价
    const orderData: any = {
      storeId: user?.storeId || 'default',
      staffId: user?.staff?.id || 'default',
      channelId: orderChannel.id,
      channelName: t(orderChannel.nameKey),
      memberId: member?.id,
      items: cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        specId: item.specId,
        specName: item.specName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,  // 原始单价，不含税
        addons: item.addons.map(a => ({ name: a.name, price: a.price }))
      })),
      paymentMethod,
      discountAmount,              // 折扣金额（客户端计算）
      pointsRedeemed: pointsToRedeem,  // 积分抵扣（客户端计算）
      taxEnabled: taxSettings.enabled !== false,  // 税费开关
      orderNumber: paymentModalOrderNum
    }
    // 所有订单都记录顾客人数
    orderData.customerCount = customerCount
    // 堂食时添加用餐人数和桌号
    if (orderChannel.code === 'DINE_IN') {
      orderData.dineInCount = dineInCount
      orderData.tableNumber = tableNumber
    }
    // 外卖平台订单号
    if (orderChannel.code === 'GOFOOD' || orderChannel.code === 'GRAB' || orderChannel.code === 'SHOPEE') {
      orderData.platformOrderId = platformOrderId
    }
    // 订单备注
    if (orderNote) {
      orderData.note = orderNote
    }

    const initialOrderNum = orderData.orderNumber || getNextPickupNumber(selectedChannel?.code) || localId.replace('LOCAL-', '')
    orderData.orderNumber = initialOrderNum
    const shouldOpenDrawer = paymentMethod === 'cash' && (hardwareSettings.autoOpenCashDrawer !== false)
    let orderNum = initialOrderNum

    try {
      const res = await posApi.createOrder(orderData)
      orderNum = res.data?.data?.orderNumber || initialOrderNum
      // 使用服务端计算的权威金额（包含税费、折扣、积分）
      const serverGrandTotal = res.data?.data?.grandTotal || total
      setOrderSuccess(orderNum)
      playSoundWithSettings('orderComplete', soundSettings.orderComplete)

      // 审计日志
      hasCheckoutCompleteRef.current = true
      logPOSAction({
        action: 'checkout_complete',
        entityId: orderNum,
        description: `结账完成，订单: ${orderNum}`,
        metadata: { orderId: res.data?.data?.id, orderNum, totalAmount: serverGrandTotal, paymentMethod, itemCount: cart.length },
        severity: 'info',
      })
      logPOSAction({
        action: 'order_created',
        entityId: res.data?.data?.id || orderNum,
        description: `订单创建: ${orderNum}`,
        metadata: { orderId: res.data?.data?.id, orderNum, totalAmount: serverGrandTotal },
        severity: 'info',
      })

      // 核销会员优惠券
      if (selectedCoupon?.id) {
        try {
          await posApi.redeemCoupon(selectedCoupon.id, orderNum)
        } catch (couponErr) {
          console.error('Failed to redeem coupon:', couponErr)
        }
      }

      // 清空已使用的优惠券
      setSelectedCoupon(null)
      setMemberCoupons(prev => prev.filter(c => c.id !== selectedCoupon?.id))

      // 现金支付：自动开钱箱
      const shouldOpenDrawer = paymentMethod === 'cash' && (hardwareSettings.autoOpenCashDrawer !== false)
      if (shouldOpenDrawer) {
        const receiptPrinter = (hardwareSettings.printers || []).find((p: any) => p.type === 'receipt' && p.enabled)
        const targetPrinterName = receiptPrinter?.printerName || getPrinterName(hardwareSettings, 'receipt')
        try {
          const drawerResult = await electronAPI?.openCashDrawer?.({
            printerName: targetPrinterName,
            cashDrawerPulse: hardwareSettings.cashDrawerPulse || 100
          })
          if (drawerResult && !drawerResult.success) {
            console.warn('[POS] Cash drawer auto-open failed:', drawerResult.error)
          }
        } catch (e) {
          console.warn('[POS] Cash drawer invocation error:', e)
        }
      }

      // 打印小票（遵从后台管理系统 posReceipt.autoPrint 设置，默认为 true）
      if (posReceipt.autoPrint !== false) {
        const printResult = await printReceipt(orderNum, {
          ...orderData,
          openCashDrawer: shouldOpenDrawer
        })
        if (!printResult) {
          showToast(t('pos.printFailed') || '小票打印失败', 'error')
        }
      }
      // 打印厨房单
      printKitchenOrder(orderNum, cart)
      // 打印茶饮单杯杯贴 (TSPL)
      printCupStickers(orderNum, cart)
      // 通知副屏结账完成
      electronAPI?.sendOrderComplete?.(orderNum)
      // 现金销售事件由服务端 OrderService 在创建订单时统一创建（保证原子性）
      // 结账成功：立即清空购物车和关闭弹窗
      clearCart()
      setShowPaymentModal(false)
      showToast(`${t('pos.orderSuccess')} #${orderNum}`, 'success')
    } catch (error: any) {
      playSoundWithSettings('error', soundSettings.error)
      // 解析服务端错误码并翻译
      const rawMsg = error?.response?.data?.message || error?.message || ''
      let displayMsg = rawMsg
      if (rawMsg.startsWith('INVENTORY_INSUFFICIENT:')) {
        const parts = rawMsg.split(':')
        // parts: [INVENTORY_INSUFFICIENT, itemName, available, needed]
        const itemName = parts[1] || ''
        const available = parts[2] || '0'
        const needed = parts[3] || '0'
        displayMsg = t('pos.inventoryInsufficient', { item: itemName, available, needed })
      } else {
        displayMsg = rawMsg || t('pos.paymentError')
      }
      showToast(displayMsg + ' - ' + t('pos.orderSavedOffline'), 'warning')
      try {
        await db.orders.add({
          localId, storeId: orderData.storeId, staffId: orderData.staffId,
          items: orderData.items, subtotal, ppn: tax, totalAmount: subtotal,
          finalAmount: total, discountAmount, paymentMethod,
          taxEnabled: orderData.taxEnabled, pointsRedeemed: orderData.pointsRedeemed,
          orderNumber: orderData.orderNumber, customerCount: orderData.customerCount || 1,
          status: 'pending', syncAttempts: 0, createdAt: new Date()
        })
      } catch (dbErr) {
        console.error('[POS] Failed to add offline order to DB:', dbErr)
      }
      // 离线模式同样下发打印和副屏通知
      if (posReceipt.autoPrint !== false) {
        printReceipt(orderNum, { ...orderData, openCashDrawer: shouldOpenDrawer })
      }
      printKitchenOrder(orderNum, cart)
      printCupStickers(orderNum, cart)
      electronAPI?.sendOrderComplete?.(orderNum)
      // Don't show success banner - order is pending sync
      // 清空购物车让用户可以开始新的订单
      clearCart()
      setShowPaymentModal(false)
    } finally {
      setIsCheckingOut(false)
    }
  }

  // Keep handleCheckoutRef in sync - called after handleCheckout is defined
  // This is called via ref callback at the end of handleCheckout definition

  // 打印小票
  const printReceipt = async (orderNum: string, orderData: any): Promise<boolean> => {
    console.log('[POS PAGE] printReceipt called, electronAPI exists:', !!electronAPI?.sendPrintReceipt)
    if (!electronAPI?.sendPrintReceipt) {
      console.log('[POS PAGE] electronAPI.sendPrintReceipt not available')
      return false
    }
    // Find enabled receipt printer or fallback to default
    const receiptPrinter = hardwareSettings.printers?.find((p: any) => p.type === 'receipt' && p.enabled)
    console.log('[POS PAGE] receiptPrinter:', receiptPrinter)
    const isNetworkPrinter = receiptPrinter?.connectionType === 'network'
    const printerName = isNetworkPrinter
      ? undefined
      : receiptPrinter?.printerName || getPrinterName(hardwareSettings, 'receipt') || ''
    const printerHost = isNetworkPrinter ? receiptPrinter?.printerIp : undefined
    const printerPort = isNetworkPrinter ? (receiptPrinter?.printerPort || 9100) : undefined
    try {
      const result = await electronAPI?.sendPrintReceipt({
        orderNum,
        header: posReceipt.header,
        footer: posReceipt.footer,
        paperSize: posReceipt.paperSize || '80mm',
        printCopies: posReceipt.printCopies || 1,
        storeName: storeInfo.storeName || posReceipt.header || 'YOUME',
        storePhone: posReceipt.storePhone || storeInfo.phone || '',
        storeAddress: posReceipt.storeAddress || storeInfo.address || '',
        storeLogo: posReceipt.storeLogo || storeInfo.storeLogo || '',
        language: lang || 'id',
        channelName: (selectedChannel as any)?.name || (selectedChannel ? t(selectedChannel.nameKey) : ''),
        tableNumber: selectedChannel?.code === 'DINE_IN' ? tableNumber : undefined,
        cashierName: user?.staff?.name || (user as any)?.name || user?.phone || '',
        customerName: member?.name || '',
        showStaffName: posReceipt.showStaffName ?? true,
        showCustomerName: posReceipt.showCustomerName ?? true,
        showKitchenNote: posReceipt.showKitchenNote ?? true,
        showLogo: posReceipt.showLogo ?? true,
        showQR: posReceipt.showQR ?? false,
        qrCodeUrl: posReceipt.qrCodeUrl || '',
        printerName,
        printerHost,
        printerPort,
        openCashDrawer: orderData?.openCashDrawer ?? false,
        items: cart.map(item => ({
          productName: item.productName,
          specName: item.specName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sugarLevelName: item.sugarLevelName,
          iceLevelName: item.iceLevelName,
          addons: item.addons
        })),
        subtotal,
        tax,
        discount: discountAmount,
        total,
        paymentMethod: t(paymentMethods.find(m => m.id === paymentMethod)?.labelKey || 'pos.paymentCash') || paymentMethod,
        paidAmount: paidAmount ? parseInt(paidAmount) : 0,
        change,
        memberName: member?.name,
        pointsRedeemed: pointsToRedeem,
        // Pass template blocks if loaded, otherwise undefined (electron uses legacy)
        ...(receiptTemplate?.blocks ? {
          blocks: receiptTemplate.blocks,
          data: {
            header: posReceipt.header,
            footer: posReceipt.footer,
            storeName: storeInfo.storeName || 'YOUME',
            storePhone: posReceipt.storePhone || storeInfo.phone || '',
            storeAddress: posReceipt.storeAddress || storeInfo.address || '',
            items: cart.map(item => ({
              productName: item.productName,
              specName: item.specName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              sugarLevelName: item.sugarLevelName,
              iceLevelName: item.iceLevelName,
              addons: item.addons
            })),
            subtotal,
            tax,
            total,
            discount: discountAmount,
            paymentMethod: t(paymentMethods.find(m => m.id === paymentMethod)?.labelKey || 'pos.paymentCash') || paymentMethod,
            cashierName: user?.staff?.name || (user as any)?.name || user?.phone || '',
            customerName: member?.name || '',
            orderDate: undefined,
            paidAmount: paidAmount ? parseInt(paidAmount) : 0,
            change,
          }
        } : {})
      })
      return result?.success ?? false
    } catch (err) {
      console.warn('Print error:', err)
      return false
    }
  }

  const printKitchenOrder = (orderNum: string, items: any[]) => {
    const kitchenPrinter = hardwareSettings.printers?.find((p: any) => p.type === 'kitchen' && p.enabled)
    if (!kitchenPrinter) {
      return
    }
    if (!electronAPI?.sendKitchenOrder) {
      return
    }
    const isNetworkKitchenPrinter = kitchenPrinter.connectionType === 'network'
    const printerName = isNetworkKitchenPrinter
      ? undefined
      : kitchenPrinter.printerName || undefined
    const printerHost = isNetworkKitchenPrinter ? kitchenPrinter.printerIp : undefined
    const printerPort = isNetworkKitchenPrinter ? (kitchenPrinter.printerPort || 9100) : undefined
    try {
      electronAPI?.sendKitchenOrder?.({ orderNum, printerName, printerHost, printerPort, items })
    } catch (err) {
      console.warn('Kitchen print error:', err)
    }
  }

  // 打印茶饮单杯杯贴/不干胶标签 (TSPL)
  const printCupStickers = (orderNum: string, items: any[]) => {
    const labelPrinter = (hardwareSettings.printers || []).find((p: any) => p.type === 'label' && p.enabled)
    const isNetworkLabelPrinter = labelPrinter?.connectionType === 'network'
    const printerName = isNetworkLabelPrinter
      ? undefined
      : labelPrinter?.printerName || getPrinterName(hardwareSettings, 'label') || undefined
    const printerHost = isNetworkLabelPrinter ? labelPrinter?.printerIp : undefined
    const printerPort = isNetworkLabelPrinter ? (labelPrinter?.printerPort || 9100) : undefined

    if ((!printerName && !printerHost) || !electronAPI?.sendCupStickers) {
      return
    }

    const stickerList: any[] = []
    let totalCups = 0
    items.forEach((item: any) => { totalCups += (item.quantity || 1) })

    let cupIndex = 1
    items.forEach((item: any) => {
      const qty = item.quantity || 1
      for (let q = 0; q < qty; q++) {
        stickerList.push({
          orderNum,
          cupIndex,
          totalCups,
          productName: item.productName || item.name || '',
          specName: item.specName || '',
          sugarLevelName: item.sugarLevelName || '',
          iceLevelName: item.iceLevelName || '',
          addons: item.addons || [],
          storeName: storeInfo.storeName || 'YOUME',
          channelName: (selectedChannel as any)?.name || (selectedChannel ? t(selectedChannel.nameKey) : '')
        })
        cupIndex++
      }
    })

    try {
      electronAPI?.sendCupStickers?.({
        printerName,
        printerHost,
        printerPort,
        stickers: stickerList,
        isTspl: true
      })
    } catch (err) {
      console.warn('Cup stickers print error:', err)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    )
  }
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header + Toolbar 合并 - 品牌底色 */}
      <header className="bg-primary px-3 py-2 flex items-center justify-between gap-2">
        {/* 左侧：店铺信息 */}
        <div className="flex items-center gap-3">
          <img
            src={storeInfo.storeLogo || '/youme-logo-white.png'}
            alt={storeInfo.storeName || 'YOUME'}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/youme-logo-white.png'
            }}
            className="h-8 max-w-[120px] object-contain rounded"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold text-sm">{storeInfo.storeName || 'YOUME'}</span>
              {appVersion && <span className="text-white/80 text-xs bg-white/20 px-1.5 py-0.5 rounded font-mono">v{appVersion}</span>}
            </div>
            <span className="text-white/70 text-xs">{user?.staff?.name || t('pos.cashier')}</span>
          </div>
          {selectedChannel && (
            <span
              onClick={() => setShowChannelModal(true)}
              className="px-3 py-1 text-white rounded-xl text-sm font-medium cursor-pointer hover:bg-white/20 transition-colors"
              style={{ backgroundColor: selectedChannel.color ? `${selectedChannel.color}40` : 'rgba(255,255,255,0.2)' }}
            >
              {selectedChannel.icon} {(selectedChannel as any)?.name || t(selectedChannel.nameKey)}
              {selectedChannel.code === 'DINE_IN' && ` (${dineInCount}${t('pos.dineInCount')})`}
            </span>
          )}
          <span className={`px-3 py-1 rounded-xl text-sm font-medium ${
            connectionStatus === 'connected' ? 'bg-green-100 text-green-700' :
            connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-700 animate-pulse' :
            'bg-red-500 text-white animate-pulse'
          }`}>
            {connectionStatus === 'connected' ? t('pos.online') :
             connectionStatus === 'connecting' ? t('pos.connecting') :
             t('pos.offline')}
          </span>
        </div>

        {/* 中间：语言切换 */}
        <div className="flex items-center gap-2">
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={async () => {
                await i18n.changeLanguage(l.code)
                localStorage.setItem('pos_lang', l.code)
                setLang(l.code)
              }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium touch-feedback ${
                lang === l.code ? 'bg-white text-primary' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>

        {/* 右侧：工具栏 - 自动平均分配宽度 */}
        {selectedChannel && (() => {
          // 构建工具栏按钮数组
          const toolbarButtons: Array<{
            id: string
            icon: JSX.Element
            labelKey: string
            onClick: () => void
            badge?: number
          }> = []

          if (posLayout.showShift !== false) {
            toolbarButtons.push({
              id: 'shift',
              icon: <Users size={20} />,
              labelKey: posLayout.toolbarLabels?.shift || 'toolbar.shift',
              onClick: () => setShowShiftModal(true)
            })
          }
          if (posLayout.showSuspend !== false) {
            toolbarButtons.push({
              id: 'suspend',
              icon: <Clock size={20} />,
              labelKey: posLayout.toolbarLabels?.suspend || 'toolbar.suspend',
              onClick: () => setShowSuspendModal(true),
              badge: suspendedOrders.length
            })
          }
          if (posLayout.showScan !== false) {
            toolbarButtons.push({
              id: 'scan',
              icon: <ScanLine size={20} />,
              labelKey: posLayout.toolbarLabels?.scan || 'toolbar.scan',
              onClick: () => setShowScanModal(true)
            })
          }
          if (posLayout.showHistory !== false) {
            toolbarButtons.push({
              id: 'history',
              icon: <FileText size={20} />,
              labelKey: posLayout.toolbarLabels?.history || 'toolbar.history',
              onClick: () => setShowHistoryModal(true)
            })
          }
          if (posLayout.showCash === true) {
            toolbarButtons.push({
              id: 'cash',
              icon: <Wallet size={20} />,
              labelKey: posLayout.toolbarLabels?.cash || 'toolbar.cash',
              onClick: () => setShowCashModal(true)
            })
          }
          // 费用按钮 - 记录每日临时支出
          if (posLayout.showExpense !== false) {
            toolbarButtons.push({
              id: 'expense',
              icon: <Receipt size={20} />,
              labelKey: posLayout.toolbarLabels?.expense || 'toolbar.expense',
              onClick: () => setShowExpenseModal(true)
            })
          }
          // 巡店卫生与员工任务
          if (posLayout.showTasks === true) {
            toolbarButtons.push({
              id: 'tasks',
              icon: <ClipboardList size={20} />,
              labelKey: posLayout.toolbarLabels?.tasks || 'toolbar.tasks',
              onClick: () => navigate('/hygiene')
            })
          }
          // 硬件设备状态自检（仅在后台明确开启 showHardware 时开放，默认收银员无此项）
          if (posLayout.showHardware === true) {
            toolbarButtons.push({
              id: 'hardware',
              icon: <Printer size={20} />,
              labelKey: posLayout.toolbarLabels?.hardware || 'toolbar.hardware',
              onClick: () => {
                setShowPrinterDetectModal(true)
              }
            })
          }
          if (posLayout.showLogout !== false) {
            toolbarButtons.push({
              id: 'logout',
              icon: <X size={20} />,
              labelKey: posLayout.toolbarLabels?.logout || 'toolbar.logout',
              onClick: () => setShowLogoutModal(true)
            })
          }

          return (
            <div className="flex items-stretch gap-3">
              {toolbarButtons.map(btn => (
                <button
                  key={btn.id}
                  onClick={btn.onClick}
                  className="flex-1 flex flex-col items-center justify-center py-2 px-2 text-white/90 hover:bg-white/20 rounded-xl touch-feedback min-h-[64px] relative"
                >
                  <div className="relative">
                    {btn.icon}
                    {btn.badge !== undefined && btn.badge > 0 && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 text-white text-xs rounded-full flex items-center justify-center">
                        {btn.badge > 9 ? '9+' : btn.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-sm mt-2 font-medium">
                    {btn.labelKey.startsWith('toolbar.') ? t(btn.labelKey) : btn.labelKey}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
      </header>

      {/* 渠道选择弹窗 - 解锁后必须先选择 */}
      {showChannelModal && (
        <ChannelSelectModal
          channels={availableChannels.length > 0 ? availableChannels : posChannels}
          posLayout={posLayout}
          channelSettings={channelSettings}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          dineInCount={dineInCount}
          onDineInCountChange={setDineInCount}
          tableNumber={tableNumber}
          onTableNumberChange={setTableNumber}
          platformOrderId={platformOrderId}
          onPlatformOrderIdChange={setPlatformOrderId}
          onConfirm={() => {
            if (selectedChannel) {
              // 堂食时同步 customerCount 和 dineInCount
              if (selectedChannel.code === 'DINE_IN') {
                setCustomerCount(dineInCount)
              }
              setShowChannelModal(false)
              const cats = productStore.categories()
              if (cats.length > 0 && !filter) {
                setFilter(cats[0])
              }
            }
          }}
          t={t}
        />
      )}

      {/* 订单成功 */}
      {orderSuccess && (
        <div className="bg-primary text-white py-2 px-4 flex items-center justify-center gap-2">
          <CheckCircle size={18} />
          <span className="font-bold">{t('pos.orderSuccessNo')}{orderSuccess}</span>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：分类栏 + 产品区 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 渠道快捷切换条 (根据后台渠道设置实时生效) */}
          {availableChannels.length > 1 && (
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">
                  {t('pos.channel', '渠道')}:
                </span>
                {availableChannels.map(ch => {
                  const isSelected = selectedChannel?.code === ch.code || selectedChannel?.id === ch.id
                  const displayName = (ch as any).name || ((ch as any).nameKey ? t(`pos.channel.${(ch as any).nameKey}`, ch.code) : ch.code)
                  return (
                    <button
                      key={ch.id || ch.code}
                      onClick={() => {
                        setSelectedChannel(ch)
                        if (ch.code === 'DINE_IN' && !dineInCount) {
                          setDineInCount(1)
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all touch-feedback ${
                        isSelected
                          ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200/80'
                      }`}
                      style={isSelected && (ch as any).color ? { backgroundColor: (ch as any).color } : {}}
                    >
                      <span className="text-sm">{(ch as any).icon || '🛍️'}</span>
                      <span>{displayName}</span>
                      {ch.code === 'DINE_IN' && isSelected && (
                        <span className="ml-1 px-1.5 py-0.5 bg-black/20 rounded text-[10px]">
                          {dineInCount || 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 分类区域 - 白色背景 */}
          {selectedChannel && (
            <div className="bg-white px-4 py-2 border-b flex-shrink-0">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {categories.map(cat => {
                  const count = products.filter(p => p.category?.name === cat).length
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`min-h-14 px-5 rounded-xl text-base font-medium whitespace-nowrap flex items-center gap-2 transition-all touch-feedback ${
                        filter === cat
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-primary-light'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-sm ${filter === cat ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 产品网格 */}
          <div className="flex-1 overflow-y-auto p-3 bg-gray-100 min-h-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <p className="text-lg font-medium">{t('pos.noProductInCategory')}</p>
              </div>
            ) : (
            <div className={`grid ${gridColsClass} gap-2`}>
              {filtered.map(product => (
                <button
                  key={product.id}
                  onClick={() => {
                    if (product.specs?.length) handleSpecClick(product, product.specs[0])
                  }}
                  className={`${cardHeightClass} bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary active:scale-95 transition-all overflow-hidden flex flex-col items-center justify-center ${!product.specs?.length ? 'opacity-50' : ''}`}
                  style={{ minHeight: '110px' }}
                >
                  {product.image && (posLayout.productImage as any) !== false && posLayout.productImage !== 'hidden' ? (
                    <div className="w-full h-full flex flex-col items-center justify-between p-1.5">
                      <div className="w-full flex-1 flex items-center justify-center min-h-0 overflow-hidden">
                        <img src={product.image} alt={product.name} className="max-w-full max-h-full object-contain rounded" />
                      </div>
                      <div className="flex flex-col items-center justify-center w-full mt-1">
                        <span className="font-semibold text-sm text-gray-900 text-center leading-tight truncate w-full">{product.name}</span>
                        {posLayout.showPrice && (
                          <span className="text-primary font-bold text-sm mt-0.5">{formatCurrency(product.specs[0]?.price || 0)}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full px-2">
                      <span className="font-bold text-base text-gray-900 text-center leading-tight line-clamp-2 w-full">{product.name}</span>
                      {posLayout.showPrice && (
                        <span className="text-primary font-bold text-lg mt-1">{formatCurrency(product.specs[0]?.price || 0)}</span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
            )}
          </div>

          {/* 公告看板 - 只覆盖产品区域 */}
          <AnnouncementBanner />
        </div>

        {/* 购物车 - 大屏设计 */}
        <div className="w-80 bg-white border-l flex flex-col">
          <div className="p-2 border-b flex items-center justify-between bg-gray-50">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <ShoppingCart size={20} />
              {t('pos.cart')}
              <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">{cart.length}</span>
            </h2>
            <div className="flex gap-1">
              {cart.length > 0 && (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: t('pos.clearCartConfirmTitle', 'Clear Cart'),
                      message: t('pos.clearCartConfirm'),
                      type: 'danger',
                      onConfirm: () => clearCart()
                    })
                  }}
                  className="w-10 h-10 flex items-center justify-center text-red-500 bg-red-50 rounded-lg hover:bg-red-100"
                  title={t('pos.clearCart')}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={() => setShowSuspendModal(true)} className="w-10 h-10 flex items-center justify-center text-yellow-600 bg-yellow-50 rounded-lg hover:bg-yellow-100">
                <Clock size={20} />
              </button>
              <button onClick={() => setShowMemberModal(true)} className="w-10 h-10 flex items-center justify-center text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                <User size={20} />
              </button>
            </div>
          </div>

          {/* 商品列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">{t('pos.emptyCart')}</div>
            ) : (
              cart.map((item, idx) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1">
                      <p className="font-bold text-sm">{item.productName}</p>
                      <p className="text-xs text-gray-400">{item.specName}</p>
                    </div>
                    <button onClick={() => removeItem(idx)} className="min-w-8 min-h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 touch-feedback">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* 甜度冰度标签 */}
                  <div className="flex gap-1 mb-1">
                    {item.sugarLevelName && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">{item.sugarLevelName}</span>
                    )}
                    {item.iceLevelName && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">{item.iceLevelName}</span>
                    )}
                  </div>
                  {/* 加料列表 */}
                  {item.addons.length > 0 && (
                    <div className="space-y-1 mb-1">
                      {item.addons.map((a, ai) => (
                        <div key={ai} className="flex justify-between text-xs text-primary">
                          <span>{t('pos.add')} {a.name} × {a.qty}</span>
                          <span>{formatCurrency(a.price * a.qty)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(idx, -1)} className="min-w-8 min-h-8 rounded-full bg-gray-200 font-bold flex items-center justify-center active:scale-95 touch-feedback text-base">-</button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => changeQty(idx, 1)} className="min-w-8 min-h-8 rounded-full bg-primary text-white font-bold flex items-center justify-center active:scale-95 touch-feedback text-base">+</button>
                    </div>
                    <span className="text-primary font-bold text-sm">{formatCurrency((item.unitPrice + item.addons.reduce((s, a) => s + a.price * a.qty, 0)) * item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 金额 */}
          <div className="p-3 border-t space-y-1 text-sm bg-gray-50">
            {(posLayout.showTax !== false) && (
              <div className="flex justify-between text-gray-500">
                <span>{t('pos.tax')}</span>
                <span>{formatCurrency(tax)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-500">
                <span>{t('pos.discount')}</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t">
              <span>{t('pos.total')}</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="p-3 border-t space-y-2 bg-white">
            {cart.length > 0 && (
              <>
                <button onClick={() => { playSoundWithSettings('keypress', soundSettings.keypress); setShowDiscountModal(true) }} className="w-full py-2 border-2 border-dashed border-primary/30 rounded-xl text-primary font-bold text-base touch-feedback">
                  + {t('pos.discount')}
                </button>
                <button onClick={() => {
                  playSoundWithSettings('keypress', soundSettings.keypress)
                  const pNum = getNextPickupNumber(selectedChannel?.code)
                  setPaymentModalOrderNum(pNum)
                  setShowPaymentModal(true)
                }} className="w-full py-3 bg-primary text-white rounded-xl font-bold text-base active:scale-95 transition-transform touch-feedback">
                  💰 {t('pos.checkout')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============ 弹窗 ============ */}

      {/* 加料弹窗 */}
      {showAddonModal && selectedProduct && selectedSpec && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddonModal(false)}>
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col z-[60]" onClick={e => e.stopPropagation()}>
      <div className="bg-primary text-white px-4 py-3 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">{selectedProduct.name}</h2>
          <p className="text-sm opacity-90">{selectedSpec.name} - {formatCurrency(selectedSpec.price)}</p>
        </div>
        <button onClick={() => setShowAddonModal(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-lg font-bold mb-3">{t('pos.sugarLevel')}</p>
          <div className="grid grid-cols-5 gap-2">
            {SUGAR_LEVELS.map(sugar => (
              <button
                key={sugar.id}
                onClick={() => setSelectedSugar(sugar.id)}
                className={`min-h-[64px] rounded-xl border-2 font-bold text-sm ${selectedSugar === sugar.id ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 text-gray-700'}`}
              >
                {t(sugar.nameKey)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-lg font-bold mb-3">{t('pos.iceLevel')}</p>
          <div className="grid grid-cols-4 gap-2">
            {ICE_LEVELS.map(ice => (
              <button
                key={ice.id}
                onClick={() => setSelectedIce(ice.id)}
                className={`min-h-[64px] rounded-xl border-2 font-bold text-sm ${selectedIce === ice.id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-700'}`}
              >
                {t(ice.nameKey)}
              </button>
            ))}
          </div>
        </div>
        {selectedProduct.addons?.length > 0 && (
          <div>
            <p className="text-lg font-bold mb-3">{t('pos.addonsSelect')}</p>
            <div className="grid grid-cols-2 gap-2">
              {selectedProduct.addons.map(pa => {
                const addon = pa.addon
                const selected = selectedAddonIds.includes(pa.addonId)
                return (
                  <button
                    key={pa.addonId}
                    onClick={() => setSelectedAddonIds(prev =>
                      selected ? prev.filter(id => id !== pa.addonId) : [...prev, pa.addonId]
                    )}
                    className={`min-h-[72px] rounded-xl border-2 text-left p-3 ${selected ? 'border-primary bg-primary-light' : 'border-gray-200'}`}
                  >
                    <p className="font-bold text-sm">{addon?.name}</p>
                    <p className="text-primary text-xs">+{formatCurrency(addon?.price || 0)}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="px-5 py-4 bg-gray-50 border-t space-y-3">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium">{t('pos.quantity')}</span>
                   <button onClick={() => setAddonQty(Math.max(1, addonQty - 1))} className="w-12 h-12 rounded-full bg-white border-2 border-gray-200 font-bold text-xl flex items-center justify-center active:scale-95 touch-feedback">-</button>
          <span className="w-10 text-center text-xl font-bold">{addonQty}</span>
          <button onClick={() => setAddonQty(addonQty + 1)} className="w-12 h-12 rounded-full bg-primary text-white font-bold text-xl flex items-center justify-center active:scale-95 touch-feedback">+</button>
        </div>
        <button onClick={handleAddToCartWithAddons} className="w-full py-3 bg-primary text-white rounded-xl text-base font-bold active:scale-95 transition-transform touch-feedback">
          {t('pos.addToCartConfirm')} ({addonQty})
        </button>
      </div>
    </div>
  </div>
)}

{showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl max-h-[94vh] flex flex-col z-[60] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header (紧凑单行) */}
            <div className="bg-primary text-white px-4 py-2.5 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-base flex items-center gap-1.5">
                  <span>💰</span>
                  <span>{t('pos.confirmPayment', '结账与收款')}</span>
                </h2>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">
                  #{paymentModalOrderNum}
                </span>
                <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">
                  {selectedChannel?.icon} {(selectedChannel as any)?.name || t(selectedChannel?.nameKey || '')}
                  {selectedChannel?.code === 'DINE_IN' && ` (${dineInCount}${t('pos.dineInCount', '人')})`}
                </span>
              </div>
              <button
                onClick={async () => {
                  try {
                    await posApi.createCashEvent({
                      type: 'payment_modal_closed',
                      amount: 0,
                      paymentMethod: paymentMethod,
                      orderId: paymentModalOrderNum || `CLOSED-${Date.now()}`,
                      note: `关闭支付弹窗 #${paymentModalOrderNum || 'unknown'}`
                    })
                  } catch (e) {
                    console.error('Failed to log modal close:', e)
                  }
                  setShowPaymentModal(false)
                  setQrisData({ status: 'idle' })
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 主内容区域：宽屏双列自适应布局，高度绝不超屏 */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-start">
                
                {/* 左列 (应收金额 + 支付方式 + QRIS动态码展示) */}
                <div className="md:col-span-5 space-y-3">
                  {/* 应收金额大卡片 */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-emerald-800 font-medium uppercase tracking-wider">{t('pos.receivable', '应收总计')}</p>
                      <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 leading-tight">
                        {formatCurrency(total)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-1 bg-emerald-200/60 text-emerald-900 rounded-md font-semibold">
                        {paymentMethods.find(m => m.id === paymentMethod)?.labelKey ? t(paymentMethods.find(m => m.id === paymentMethod)!.labelKey) : paymentMethod.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* 支付方式网格 */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      {t('pos.paymentMethod', '选择收款渠道')}
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {paymentMethods.map(m => {
                        const isSelected = paymentMethod === m.id
                        return (
                          <button
                            key={m.id}
                            onClick={() => setPaymentMethod(m.id)}
                            className={`p-2 rounded-xl border-2 flex items-center gap-2 transition-all touch-feedback text-left ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary'
                                : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <span className="text-xl flex-shrink-0">{m.icon}</span>
                            <span className="text-xs truncate">{t(m.labelKey)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* QRIS 扫码展示区 (若选中QRIS时在左列直接呈现) */}
                  {paymentMethod === 'qris' && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center justify-center">
                      {qrisData.status === 'idle' && (
                        <div className="text-center py-4">
                          <QrCode size={36} className="mx-auto text-gray-400 mb-1" />
                          <p className="text-xs text-gray-500">{t('pos.qrisInstruction', '请出示二维码由顾客手机扫码')}</p>
                        </div>
                      )}
                      {qrisData.status === 'waiting' && qrisData.qrImage && (
                        <div className="flex flex-col items-center">
                          <img src={qrisData.qrImage} alt="QRIS" className="w-32 h-32 object-contain rounded-lg border bg-white p-1" />
                          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-amber-600">
                            <Loader2 size={14} className="animate-spin" />
                            <span>{t('pos.waitingPayment', '等待顾客扫码支付...')}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-0.5">客显副屏已同步全屏展示</span>
                        </div>
                      )}
                      {qrisData.status === 'paid' && (
                        <div className="text-center py-4 text-emerald-600">
                          <CheckCircle size={36} className="mx-auto mb-1 text-emerald-600" />
                          <p className="font-bold text-sm">{t('pos.paymentReceived', '扫码收款已成功')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 右列 (现金输入键盘 / 非现金引导) */}
                <div className="md:col-span-7 space-y-2.5">
                  {paymentMethod === 'cash' ? (
                    <div>
                      {/* 实收与找零金额并列显示 */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-gray-100 rounded-xl p-2 border border-gray-200">
                          <div className="text-[11px] text-gray-500 font-medium">{t('pos.paidAmount', '实收现金')}</div>
                          <div className="text-lg sm:text-xl font-bold text-gray-800 truncate font-mono">
                            {formatCurrency(parseInt(paidAmount) || 0)}
                          </div>
                        </div>
                        <div className={`rounded-xl p-2 border ${change > 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="text-[11px] text-gray-500 font-medium">{t('pos.change', '应找零钱')}</div>
                          <div className={`text-lg sm:text-xl font-bold truncate font-mono ${change > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {change > 0 ? formatCurrency(change) : 'Rp 0'}
                          </div>
                        </div>
                      </div>

                      {/* 紧凑数字小键盘 (高度经过精密缩减) */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                          <button
                            key={n}
                            onClick={() => setPaidAmount(prev => {
                              if (prev.length >= 8) return prev
                              if (prev === '0') return String(n)
                              return prev + String(n)
                            })}
                            className="h-10 bg-white border border-gray-300 rounded-xl text-base font-bold text-gray-800 hover:bg-gray-100 active:scale-95 transition-all touch-feedback shadow-sm"
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          onClick={() => setPaidAmount('')}
                          className="h-10 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-100 active:scale-95 transition-all touch-feedback"
                        >
                          C {t('common.clear', '清空')}
                        </button>
                        <button
                          onClick={() => setPaidAmount(prev => {
                            if (prev.length >= 8) return prev
                            if (prev === '0') return '0'
                            return prev + '0'
                          })}
                          className="h-10 bg-white border border-gray-300 rounded-xl text-base font-bold text-gray-800 hover:bg-gray-100 active:scale-95 transition-all touch-feedback shadow-sm"
                        >
                          0
                        </button>
                        <button
                          onClick={() => setPaidAmount(prev => prev.slice(0, -1))}
                          className="h-10 bg-gray-100 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-200 active:scale-95 transition-all touch-feedback"
                        >
                          ← {t('common.backspace', '退格')}
                        </button>
                      </div>

                      {/* 快捷现金面额按钮 + 正好 */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          onClick={() => setPaidAmount(String(total))}
                          className="py-1.5 px-1 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors touch-feedback"
                        >
                          ⚡ {t('pos.exactAmount', '正好')}
                        </button>
                        {(quickAmounts.enabled && quickAmounts.amounts.length > 0 ? quickAmounts.amounts.slice(0, 3) : [50000, 100000, 200000]).map(amount => (
                          <button
                            key={amount}
                            onClick={() => setPaidAmount(String(amount))}
                            className="py-1.5 px-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors touch-feedback truncate"
                          >
                            {formatCurrency(amount)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[200px] bg-gray-50 rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl mb-2">
                        {paymentMethods.find(m => m.id === paymentMethod)?.icon || '💳'}
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm">
                        {paymentMethods.find(m => m.id === paymentMethod)?.labelKey ? t(paymentMethods.find(m => m.id === paymentMethod)!.labelKey) : paymentMethod.toUpperCase()}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-xs">
                        {paymentMethod === 'qris'
                          ? t('pos.qrisHelp', '请提示顾客扫码，支付成功后系统将自动出单')
                          : t('pos.externalPayHelp', '请引导顾客在外接刷卡机 (EDC) 或扫码机上完成刷卡/交易，完成后点击下方确认结账')}
                      </p>
                      <div className="mt-3 px-3 py-1 bg-white rounded-lg border text-xs font-mono font-bold text-gray-700">
                        {t('pos.amountDue', '支付金额')}: {formatCurrency(total)}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* 确认支付操作栏 - 紧凑固定底栏 */}
            <div className="flex-shrink-0 px-4 py-2.5 bg-gray-50 border-t flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500 truncate hidden sm:block">
                {paymentMethod === 'cash' ? (
                  Boolean(paidAmount) && parseInt(paidAmount) >= total ? (
                    <span className="text-emerald-600 font-medium">✅ 实收已足额，点击确认完成结账并打印小票/杯贴</span>
                  ) : (
                    <span>💡 输入顾客支付的现金金额，系统将自动核算找零</span>
                  )
                ) : (
                  <span>📱 电子支付或刷卡成功后，点击右侧按钮出单</span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-xl text-xs font-semibold hover:bg-gray-50 touch-feedback"
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={
                    isCheckingOut ||
                    (paymentMethod === 'cash' && Boolean(paidAmount) && parseInt(paidAmount) < total) ||
                    (paymentSettings.minAmount > 0 && total < paymentSettings.minAmount) ||
                    (paymentMethod === 'qris' && qrisData.status === 'waiting')
                  }
                  className="px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm disabled:bg-gray-300 hover:bg-primary/90 active:scale-95 transition-all touch-feedback shadow-md flex items-center gap-2 min-w-[140px] justify-center"
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t('common.loading', '正在结账...')}</span>
                    </>
                  ) : paymentMethod === 'qris' && qrisData.status === 'waiting' ? (
                    t('pos.waitingPayment', '等待支付')
                  ) : (
                    <>
                      <span>💰</span>
                      <span>{t('pos.confirmPayment', '确认结账')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            {paymentSettings.minAmount > 0 && total < paymentSettings.minAmount && (
              <div className="bg-red-50 text-red-500 text-[11px] py-1 px-4 text-center border-t border-red-100">
                {t('pos.minAmountRequired')} {formatCurrency(paymentSettings.minAmount)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 折扣弹窗 */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDiscountModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.discount')}</h3>
              <button onClick={() => setShowDiscountModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 金额显示 */}
              <div className="bg-gray-100 rounded-xl p-4 mb-4 text-right">
                <span className="text-3xl font-bold text-primary">{formatCurrency(parseInt(tempDiscount) || 0)}</span>
              </div>
              {/* 数字键盘 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setTempDiscount(prev => {
                    if (prev === '0') return String(n)
                    return prev + String(n)
                  })}
                  className="h-12 bg-white border rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light"
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setTempDiscount('')}
                className="h-12 bg-red-50 border rounded-xl text-base font-bold text-red-500 hover:bg-red-100"
              >
                C
              </button>
              <button
                onClick={() => setTempDiscount(prev => {
                  if (prev === '0') return '0'
                  return prev + '0'
                })}
                className="h-12 bg-white border rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light"
              >
                0
              </button>
              <button
                onClick={() => setTempDiscount(prev => prev.slice(0, -1))}
                className="h-12 bg-gray-100 border rounded-xl text-base font-bold hover:bg-gray-200"
              >
                ←
              </button>
            </div>
            {/* 快捷金额 */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1000, 3000, 5000].map(amount => (
                <button key={amount} onClick={() => setTempDiscount(String(amount))} className="py-2 border rounded-lg text-xs hover:bg-primary-light touch-feedback">
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 border rounded-xl touch-feedback">{t('common.cancel')}</button>
              <button onClick={() => { setDiscountAmount(Math.min(parseInt(tempDiscount) || 0, total)); setShowDiscountModal(false) }} className="flex-1 py-3 bg-primary text-white rounded-xl touch-feedback">{t('common.confirm')}</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 会员弹窗 */}

      {/* 会员弹窗 */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowMemberModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.member')}</h3>
              <button onClick={() => setShowMemberModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 手机号显示 */}
              <div className="bg-gray-100 rounded-xl p-3 mb-3 text-center">
                <span className="text-2xl font-bold text-gray-700">{memberPhone || '-'}</span>
              </div>
              {/* 数字键盘 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setMemberPhone(prev => prev + String(n))}
                  className="min-h-12 bg-white border rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setMemberPhone('')}
                className="min-h-14 bg-red-50 border rounded-xl text-base font-bold text-red-500 hover:bg-red-100 touch-feedback"
              >
                C
              </button>
              <button
                onClick={() => setMemberPhone(prev => prev + '0')}
                className="min-h-12 bg-white border rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
              >
                0
              </button>
              <button
                onClick={() => setMemberPhone(prev => prev.slice(0, -1))}
                className="min-h-14 bg-gray-100 border rounded-xl text-base font-bold hover:bg-gray-200 touch-feedback"
              >
                ←
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={searchMember} disabled={isSearchingMember} className="flex-1 py-3 bg-primary text-white rounded-xl disabled:bg-pink-300">
                {isSearchingMember ? t('common.loading') : t('pos.search')}
              </button>
              <button onClick={() => navigate('/register-member')} className="flex-1 py-3 bg-blue-500 text-white rounded-xl">{t('pos.register')}</button>
            </div>
            {member ? (
              <div className="p-3 bg-green-50 rounded-xl mb-4">
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-gray-500">{member.phone}</p>
                <p className="text-sm text-green-600">{t('pos.points')}: {member.points || 0}</p>
                {maxRedeemablePoints > 0 && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <p className="text-xs text-gray-600 mb-1">{t('pos.redeemPoints')}: {pointsToRedeem}</p>
                    <input
                      type="range"
                      min="0"
                      max={maxRedeemablePoints}
                      value={pointsToRedeem}
                      onChange={e => setPointsToRedeem(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-right text-green-600">-{formatCurrency(pointsDiscount)}</p>
                  </div>
                )}
              </div>
            ) : memberPhone && !isSearchingMember ? (
              <div className="p-3 bg-red-50 rounded-xl mb-4 text-center text-red-500 text-sm">
                {t('pos.noMemberFound')}
              </div>
            ) : null}
            <button onClick={() => setShowMemberModal(false)} className="w-full py-2 border rounded-xl">{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 挂单弹窗 */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSuspendModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('pos.suspendOrderTitle')}</h3>
              <button onClick={() => setShowSuspendModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            {cart.length > 0 && (
              <button onClick={suspendOrder} className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold mb-4">
                {t('pos.suspendCurrent')}
              </button>
            )}
            {suspendedOrders.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm text-gray-600">{t('pos.pendingOrders')}</p>
                {suspendedOrders.map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium">{order.channel.icon} {t(order.channel.nameKey)}</p>
                      <p className="text-xs text-gray-500">{order.time} - {order.cart.length} {t('pos.items')}</p>
                    </div>
                    <button onClick={() => resumeOrder(order)} className="px-3 py-1 bg-primary text-white rounded-lg text-sm">{t('pos.takeOrder')}</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowSuspendModal(false)} className="w-full mt-4 py-2 border rounded-xl">{t('common.close')}</button>
          </div>
        </div>
      )}

      {/* 交接班弹窗 */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShiftModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b bg-primary text-white rounded-t-2xl">
              <h3 className="font-bold">{shiftData?.hasOpenShift ? t('pos.shiftChange') : t('pos.shiftOpen')}</h3>
              <button onClick={() => setShowShiftModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {/* 无开班记录 - 显示开班界面 */}
              {!shiftData?.hasOpenShift ? (
                <>
                  <div className="p-4 bg-blue-50 rounded-xl mb-4">
                    <p className="text-center text-gray-600 mb-2">{t('pos.noOpenShift')}</p>
                  </div>

                  {/* 班次选择 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.selectShift')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['morning', 'afternoon', 'evening'].map((shift) => (
                        <button
                          key={shift}
                          onClick={() => setSelectedShiftType(shift)}
                          className={`py-3 rounded-xl font-medium touch-feedback ${
                            selectedShiftType === shift
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {shift === 'morning' ? t('pos.morningShift') : shift === 'afternoon' ? t('pos.afternoonShift') : t('pos.eveningShift')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 开班金额输入 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.openFloatAmount')}</label>
                    <input
                      type="number"
                      id="openFloatInput"
                      placeholder={t('pos.enterOpenFloat')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl touch-feedback text-lg"
                      defaultValue="50000"
                    />
                  </div>

                  {/* 开班按钮 */}
                  <button
                    onClick={async () => {
                      const floatInput = document.getElementById('openFloatInput') as HTMLInputElement
                      const floatAmount = parseInt(floatInput?.value) || 0
                      if (floatAmount <= 0) {
                        showToast(t('pos.openFloatRequired'), 'error')
                        return
                      }
                      try {
                        await posApi.openShift({
                          openFloat: floatAmount,
                          shift: selectedShiftType || 'morning'
                        })
                        showToast(t('pos.shiftOpened'), 'success')
                        fetchShiftData()
                      } catch (e) {
                        showToast(t('pos.shiftOpenFailed'), 'error')
                      }
                    }}
                    className="w-full py-4 bg-green-500 text-white rounded-xl font-bold touch-feedback text-lg"
                  >
                    {t('pos.confirmOpenShift')}
                  </button>
                </>
              ) : (
                <>
                  {/* 班次信息 */}
                  <div className="p-3 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">{t('pos.currentCashier')}</p>
                        <p className="font-bold text-lg">{user?.staff?.name || t('pos.cashier')}</p>
                      </div>
                      {shiftData?.shift && (
                        <div className="text-right">
                          <p className="text-sm text-gray-500">{shiftData.shift.shift === 'morning' ? t('pos.morningShift') : shiftData.shift.shift === 'afternoon' ? t('pos.afternoonShift') : t('pos.eveningShift')}</p>
                          <p className="font-bold text-primary">{new Date(shiftData.shift.openedAt).toLocaleTimeString()}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 开班金额和应收现金 */}
                  {shiftSettings.showSummary && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {shiftSettings.summaryItems?.openFloat && (
                        <div className="p-3 bg-blue-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.openFloat')}</p>
                          <p className="font-bold text-blue-600">{formatCurrency(shiftData?.openFloat || 0)}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.closeCash && (
                        <div className="p-3 bg-green-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.expectedCash')}</p>
                          <p className="font-bold text-green-600">{formatCurrency(shiftData?.expectedCash || 0)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 今日汇总 */}
                  {shiftSettings.showSummary && (
                    <div className="p-3 bg-gray-50 rounded-xl mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">{t('pos.todaySummary')}</p>
                      <div className="space-y-1">
                        {shiftSettings.summaryItems?.cashSales && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashSales')}</span>
                            <span className="font-medium">{formatCurrency(shiftData?.todayCashSales || 0)}</span>
                          </div>
                        )}
                        {shiftSettings.summaryItems?.cashIn && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashIn')}</span>
                            <span className="font-medium text-green-600">+{formatCurrency(shiftData?.todayCashIns || 0)}</span>
                          </div>
                        )}
                        {shiftSettings.summaryItems?.cashOut && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{t('pos.cashOut')}</span>
                            <span className="font-medium text-red-600">-{formatCurrency(shiftData?.todayCashOuts || 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 订单统计 */}
                  {shiftSettings.showSummary && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {shiftSettings.summaryItems?.orderCount && (
                        <div className="p-3 bg-orange-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.todayOrders')}</p>
                          <p className="font-bold text-orange-600">{shiftData?.todayOrderCount || 0}</p>
                        </div>
                      )}
                      {shiftData?.todayOrderAmount > 0 && (
                        <div className="p-3 bg-orange-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.todaySales')}</p>
                          <p className="font-bold text-orange-600">{formatCurrency(shiftData?.todayOrderAmount || 0)}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.suspendedOrders && (
                        <div className="p-3 bg-purple-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('pos.suspendedOrders')}</p>
                          <p className="font-bold text-purple-600">{shiftData?.suspendedOrderCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.customerCount && (
                        <div className="p-3 bg-teal-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.customerCount')}</p>
                          <p className="font-bold text-teal-600">{shiftData?.customerCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.qrisSales && (
                        <div className="p-3 bg-indigo-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.qrisSales')}</p>
                          <p className="font-bold text-indigo-600">{formatCurrency(shiftData?.qrisSales || 0)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 渠道订单统计 */}
                  {shiftSettings.showSummary && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {shiftSettings.summaryItems?.dineInCount && (
                        <div className="p-3 bg-pink-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.dineInOrders')}</p>
                          <p className="font-bold text-pink-600">{shiftData?.dineInCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.gofoodCount && (
                        <div className="p-3 bg-yellow-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.gofoodOrders')}</p>
                          <p className="font-bold text-yellow-600">{shiftData?.gofoodCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.grabCount && (
                        <div className="p-3 bg-green-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.grabOrders')}</p>
                          <p className="font-bold text-green-600">{shiftData?.grabCount || 0}</p>
                        </div>
                      )}
                      {shiftSettings.summaryItems?.shopeeCount && (
                        <div className="p-3 bg-orange-50 rounded-xl">
                          <p className="text-xs text-gray-500">{t('settings.shopeeOrders')}</p>
                          <p className="font-bold text-orange-600">{shiftData?.shopeeCount || 0}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 状态信息 */}
                  {shiftSettings.showSummary && shiftSettings.summaryItems?.pendingSync && (
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('pos.pendingSync')}</span>
                        <span className="font-medium">{suspendedOrders.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('pos.offlineMode')}</span>
                        <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
                          {isOnline ? t('common.yes') : t('common.no')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 实际现金输入 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('pos.actualCash')}</label>
                    <div
                      className="w-full px-4 py-3 border-2 border-primary/30 bg-primary/5 rounded-xl text-lg font-bold text-center cursor-pointer"
                      onClick={() => setShiftInputTarget('actualCash')}
                    >
                      {shiftActualCash ? formatCurrency(parseInt(shiftActualCash) || 0) : (shiftData?.expectedCash ? formatCurrency(shiftData.expectedCash) : '0')}
                    </div>
                    {shiftData?.expectedCash && (
                      <p className="text-xs text-gray-500 mt-1">
                        {t('pos.expectedHint')} {formatCurrency(shiftData.expectedCash)}
                      </p>
                    )}
                  </div>

                  {/* 主管确认 */}
                  {shiftSettings.requireSupervisorConfirm && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('pos.supervisorPin')}</label>
                      <div
                        className="w-full px-4 py-3 border-2 border-primary/30 bg-primary/5 rounded-xl text-center cursor-pointer"
                        onClick={() => setShiftInputTarget('supervisorPin')}
                      >
                        {'●'.repeat(shiftSupervisorPin.length) || <span className="text-gray-400">{t('pos.enterSupervisorPin')}</span>}
                      </div>
                    </div>
                  )}

                  {/* 交班按钮 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowShiftModal(false)}
                      className="flex-1 py-3 border border-gray-300 rounded-xl font-medium touch-feedback"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={async () => {
                        if (shiftSettings.requireSupervisorConfirm) {
                          if (!shiftSupervisorPin || shiftSupervisorPin.length < 4) {
                            showToast(t('pos.supervisorPinRequired'), 'error')
                            return
                          }
                        }
                        const actualCash = parseInt(shiftActualCash) || 0
                        try {
                          await posApi.closeShift({
                            actualCash,
                            closeNote: ''
                          })
                          // 自动打印交接班对账小票 (Z-Report)
                          try {
                            const receiptPrinter = hardwareSettings.printers?.find((p: any) => p.type === 'receipt' && p.enabled)
                            const isNetwork = receiptPrinter?.connectionType === 'network'
                            const printerName = isNetwork ? undefined : (receiptPrinter?.printerName || getPrinterName(hardwareSettings, 'receipt'))
                            const printerHost = isNetwork ? receiptPrinter?.printerIp : undefined
                            const printerPort = isNetwork ? (receiptPrinter?.printerPort || 9100) : undefined

                            await electronAPI?.sendPrintShiftReport?.({
                              printerName,
                              printerHost,
                              printerPort,
                              paperSize: posReceipt.paperSize || '80mm',
                              language: lang || 'id',
                              storeName: storeInfo.storeName || 'YOUME',
                              cashierName: user?.staff?.name || (user as any)?.name || user?.phone || 'Kasir',
                              shiftType: selectedShiftType || shiftData?.shift?.shift || 'Regular',
                              openedAt: shiftData?.shift?.openedAt ? new Date(shiftData.shift.openedAt).toLocaleString() : '',
                              closedAt: new Date().toLocaleString(),
                              openFloat: shiftData?.openFloat || 0,
                              cashSales: shiftData?.cashSales || 0,
                              qrisSales: shiftData?.qrisSales || 0,
                              gofoodSales: shiftData?.gofoodSales || 0,
                              grabSales: shiftData?.grabSales || 0,
                              shopeeSales: shiftData?.shopeeSales || 0,
                              expenses: shiftData?.expenses || 0,
                              expectedCash: shiftData?.expectedCash || 0,
                              actualCash,
                              totalOrders: (shiftData?.dineInCount || 0) + (shiftData?.gofoodCount || 0) + (shiftData?.grabCount || 0) + (shiftData?.shopeeCount || 0),
                              totalCups: shiftData?.customerCount || 0,
                            })
                          } catch (reportErr) {
                            console.warn('[Shift] Failed to print shift report:', reportErr)
                          }
                          clearCart()
                          setSuspendedOrders([])
                          localStorage.removeItem('suspended_orders')
                          setShowShiftModal(false)
                          setShiftActualCash('')
                          setShiftSupervisorPin('')
                          logout()
                        } catch (e) {
                          showToast(t('pos.shiftCloseFailed'), 'error')
                        }
                      }}
                      className="flex-1 py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
                    >
                      {t('pos.shiftConfirm')}
                    </button>
                  </div>

                  {/* 交接班数字键盘 */}
                  {shiftInputTarget && (
                    <div className="mt-4 p-3 bg-gray-100 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">
                          {shiftInputTarget === 'actualCash' ? t('pos.actualCash') : t('pos.supervisorPin')}
                        </span>
                        <button onClick={() => setShiftInputTarget(null)} className="text-gray-500 hover:text-gray-700">
                          ✕
                        </button>
                      </div>
                      <div className="text-2xl font-bold text-center mb-3 h-10">
                        {shiftInputTarget === 'actualCash'
                          ? (shiftActualCash ? formatCurrency(parseInt(shiftActualCash) || 0) : '0')
                          : '●'.repeat(shiftSupervisorPin.length) || '—'}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                          <button
                            key={n}
                            onClick={() => {
                              if (shiftInputTarget === 'actualCash') {
                                const newVal = shiftActualCash === '0' ? String(n) : shiftActualCash + String(n)
                                if (newVal.length <= 10) setShiftActualCash(newVal)
                              } else {
                                if (shiftSupervisorPin.length < 6) setShiftSupervisorPin(prev => prev + String(n))
                              }
                            }}
                            className="h-12 bg-white border rounded-xl text-lg font-bold hover:bg-primary-light active:bg-primary-light touch-feedback"
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            if (shiftInputTarget === 'actualCash') setShiftActualCash('0')
                            else setShiftSupervisorPin('')
                          }}
                          className="h-12 bg-red-50 border rounded-xl text-base font-bold text-red-500 hover:bg-red-100 touch-feedback"
                        >
                          C
                        </button>
                        <button
                          onClick={() => {
                            if (shiftInputTarget === 'actualCash') {
                              const newVal = shiftActualCash + '0'
                              if (newVal.length <= 10) setShiftActualCash(newVal)
                            } else {
                              if (shiftSupervisorPin.length < 6) setShiftSupervisorPin(prev => prev + '0')
                            }
                          }}
                          className="h-12 bg-white border rounded-xl text-lg font-bold hover:bg-gray-100 touch-feedback"
                        >
                          0
                        </button>
                        <button
                          onClick={() => {
                            if (shiftInputTarget === 'actualCash') {
                              if (shiftActualCash.length > 1) setShiftActualCash(prev => prev.slice(0, -1))
                              else setShiftActualCash('0')
                            } else {
                              setShiftSupervisorPin(prev => prev.slice(0, -1))
                            }
                          }}
                          className="h-12 bg-white border rounded-xl text-lg font-bold hover:bg-gray-100 touch-feedback"
                        >
                          ←
                        </button>
                        <button
                          onClick={() => setShiftInputTarget(null)}
                          className="h-12 bg-primary text-white border rounded-xl text-base font-bold hover:bg-primary-dark touch-feedback"
                        >
                          ✓
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />

      {/* 考勤二维码弹窗 */}
      {showAttendanceQR && (
        <AttendanceQR
          posId={user?.storeId || 'default'}
          onClose={() => setShowAttendanceQR(false)}
        />
      )}

      {/* 扫描弹窗 */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowScanModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.scan')}</h3>
              <button onClick={() => setShowScanModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-gray-500 text-center py-8">{t('toolbar.scanPlaceholder')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录弹窗 */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.history')}</h3>
              <button onClick={() => setShowHistoryModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {ordersLoading ? (
                <p className="text-gray-500 text-center py-8">Loading...</p>
              ) : orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No orders found</p>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => (
                    <div
                      key={order.id}
                      onClick={() => {
                        setDeleteModalOrder(order)
                        setDeleteReason('')
                      }}
                      className={`p-3 rounded-xl cursor-pointer transition-all ${
                        deleteModalOrder?.id === order.id
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold">#{order.orderNumber || order.id}</p>
                          <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{formatCurrency(order.finalAmount || order.totalAmount)}</p>
                          <p className="text-xs text-gray-500">{order.channelName || order.channelId}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        {order.items?.map((item: any, idx: number) => (
                          <span key={idx}>{item.quantity}x {item.productName}{idx < order.items.length - 1 ? ', ' : ''}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除申请弹窗 */}
      {deleteModalOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setDeleteModalOrder(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl z-[80]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('orders.requestDelete')}</h3>
              <button onClick={() => setDeleteModalOrder(null)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="font-bold">#{deleteModalOrder.orderNumber || deleteModalOrder.id}</p>
                <p className="text-sm text-gray-500">{formatCurrency(deleteModalOrder.finalAmount || deleteModalOrder.totalAmount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('orders.deleteReason')}</label>
                <textarea
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="w-full p-3 border rounded-lg"
                  rows={3}
                  placeholder={t('orders.deleteReasonPlaceholder')}
                />
              </div>
              <button
                onClick={submitDeleteRequest}
                disabled={!deleteReason.trim() || isSubmittingDelete}
                className="w-full py-3 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmittingDelete ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <RotateCcw size={20} />
                )}
                {t('orders.submitDeleteRequest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 现金管理弹窗 */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCashModal(false)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.cash')}</h3>
              <button onClick={() => setShowCashModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-gray-500 text-center py-8">{t('toolbar.cashComingSoon')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 费用记录弹窗 */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowExpenseModal(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b bg-primary text-white rounded-t-2xl">
              <h3 className="font-bold">{t('pos.expense')}</h3>
              <button onClick={() => setShowExpenseModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* 今日费用汇总 */}
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-sm text-gray-500">{t('pos.todayExpenses')}</p>
                <p className="font-bold text-red-600 text-xl">
                  {formatCurrency(todayExpenses.reduce((sum: number, e: any) => sum + e.amount, 0))}
                </p>
                <p className="text-xs text-gray-500">{todayExpenses.length} {t('pos.expenseItems')}</p>
              </div>

              {/* 今日费用列表 */}
              {todayExpenses.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {todayExpenses.map((expense: any) => (
                    <div key={expense.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{expense.category}</p>
                        <p className="text-gray-500 text-xs">{expense.description || '-'}</p>
                      </div>
                      <p className="font-medium text-red-500">-{formatCurrency(expense.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 新增费用表单 */}
              <div className="border-t pt-4">
                <p className="font-medium mb-3">{t('pos.addExpense')}</p>

                {/* 费用类别 */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-500 mb-1">{t('pos.expenseCategory')}</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl"
                  >
                    <option value="">{t('pos.selectCategory')}</option>
                    <option value="supplies">{t('pos.expenseSupplies')}</option>
                    <option value="utilities">{t('pos.expenseUtilities')}</option>
                    <option value="rent">{t('pos.expenseRent')}</option>
                    <option value="transport">{t('pos.expenseTransport')}</option>
                    <option value="packaging">{t('pos.expensePackaging')}</option>
                    <option value="cleaning">{t('pos.expenseCleaning')}</option>
                    <option value="maintenance">{t('pos.expenseMaintenance')}</option>
                    <option value="other">{t('pos.expenseOther')}</option>
                  </select>
                </div>

                {/* 金额 */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-500 mb-1">{t('pos.expenseAmount')}</label>
                  <input
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                {/* 备注 */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-1">{t('pos.expenseNote')}</label>
                  <input
                    type="text"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder={t('pos.expenseNotePlaceholder')}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>

                {/* 提交按钮 */}
                <button
                  onClick={createExpense}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
                >
                  {t('pos.saveExpense')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 硬件设备状态与自检弹窗 (纯只读与测试，由后台统一管控) */}
      {showPrinterDetectModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPrinterDetectModal(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b bg-primary text-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Printer size={18} />
                  {t('pos.hardwareStatus', '外设状态与自检')}
                </h3>
                <p className="text-xs text-white/80 mt-0.5">{t('pos.hardwareAdminManaged', '所有外设由后台管理统一配置并自动同步')}</p>
              </div>
              <button onClick={() => setShowPrinterDetectModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* 设备绑定状态列表 */}
              <div className="space-y-2">
                {/* 小票打印机 */}
                {(() => {
                  const receiptPrinter = hardwareSettings.printers?.find((p: any) => p.type === 'receipt')
                  const pName = receiptPrinter?.printerName || hardwareSettings.printerName || '系统默认打印机'
                  const isNetwork = receiptPrinter?.connectionType === 'network'
                  return (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-base">
                          🧾
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-800">{t('posSettings.receiptPrinter', '小票打印机')}</div>
                          <div className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                            {isNetwork ? `${receiptPrinter?.printerIp}:${receiptPrinter?.printerPort || 9100}` : pName}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 bg-green-100 text-green-700 font-semibold rounded-md">
                        {t('common.ready', '已就绪')}
                      </span>
                    </div>
                  )
                })()}

                {/* 标签杯贴机 */}
                {(() => {
                  const labelPrinter = hardwareSettings.printers?.find((p: any) => p.type === 'label')
                  const isEnabled = labelPrinter?.enabled ?? false
                  const pName = labelPrinter?.printerName || (isEnabled ? '标签机已启用' : '未启用 (后台配置)')
                  return (
                    <div className={`p-3 rounded-xl border flex items-center justify-between ${isEnabled ? 'bg-indigo-50/50 border-indigo-200' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-base">
                          🏷️
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-800">{t('posSettings.labelPrinter', '标签杯贴机')}</div>
                          <div className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{pName}</div>
                        </div>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 font-semibold rounded-md ${isEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
                        {isEnabled ? t('common.ready', '已就绪') : t('common.disabled', '未启用')}
                      </span>
                    </div>
                  )
                })()}

                {/* 钱箱与客显状态 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">💰 {t('posSettings.cashDrawer', '收银钱箱')}:</span>
                    <span className="font-semibold text-gray-800">
                      {hardwareSettings.autoOpenCashDrawer !== false ? t('common.auto', '自动弹开') : t('common.manual', '手动')}
                    </span>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">🖥️ {t('posSettings.dualScreen', '客显副屏')}:</span>
                    <span className={`font-semibold ${hardwareSettings.dualScreen?.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {hardwareSettings.dualScreen?.enabled ? t('common.enabled', '已开启') : t('common.disabled', '未开启')}
                    </span>
                  </div>
                </div>
              </div>

              {/* 一键自检与测试区 */}
              <div className="pt-2 border-t">
                <div className="text-xs font-bold text-gray-700 mb-2">
                  ⚡ {t('pos.quickSelfTest', '一键外设自检测试')}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    className="py-2.5 px-2 border border-primary text-primary rounded-xl text-xs font-semibold hover:bg-primary/5 flex flex-col items-center justify-center gap-1 touch-feedback"
                  >
                    <Printer size={16} />
                    <span>{t('pos.testPrint', '测试小票')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestLabelPrint}
                    className="py-2.5 px-2 border border-indigo-600 text-indigo-600 rounded-xl text-xs font-semibold hover:bg-indigo-50 flex flex-col items-center justify-center gap-1 touch-feedback"
                  >
                    <Tag size={16} />
                    <span>{t('pos.testLabel', '测试杯贴')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestCashDrawer}
                    className="py-2.5 px-2 border border-amber-600 text-amber-700 bg-amber-50/50 rounded-xl text-xs font-semibold hover:bg-amber-100 flex flex-col items-center justify-center gap-1 touch-feedback"
                  >
                    <Wallet size={16} />
                    <span>{t('pos.testCashDrawer', '测试钱箱')}</span>
                  </button>
                </div>
              </div>

              {/* 重新扫描并上报本地 USB 打印机 */}
              <div className="pt-2 flex items-center justify-between text-xs text-gray-400 border-t">
                <button
                  type="button"
                  onClick={async () => {
                    handleDetectPrinters().then(printers => {
                      if (printers && printers.length > 0) {
                        const storeId = user?.storeId || localStorage.getItem('storeId') || ''
                        posApi.reportPrinters(printers, storeId).then(() => {
                          showToast(t('pos.printersReported', '已成功同步本地打印机至后台'), 'success')
                        }).catch(() => {})
                      }
                    })
                  }}
                  className="text-gray-500 hover:text-primary flex items-center gap-1 py-1"
                >
                  <RotateCcw size={12} />
                  <span>{t('pos.syncPrintersToAdmin', '同步本地打印机至后台')}</span>
                </button>
                <button
                  onClick={() => setShowPrinterDetectModal(false)}
                  className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                >
                  {t('common.close', '关闭')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 退出确认弹窗 */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLogoutModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto z-[60]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex justify-between items-center border-b">
              <h3 className="font-bold">{t('toolbar.logout')}</h3>
              <button onClick={() => setShowLogoutModal(false)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-center text-gray-600">{t('pos.logoutConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-3 border rounded-xl touch-feedback">{t('common.cancel')}</button>
                <button onClick={() => { setShowLogoutModal(false); setIsLocked(false); logout() }} className="flex-1 py-3 bg-primary text-white rounded-xl touch-feedback">{t('toolbar.logout')}</button>
                           </div>
            </div>
          </div>
        </div>
      )}

      {/* 锁屏界面 */}
      {isLocked && (
        <div className="fixed inset-0 bg-primary z-[100] flex items-center justify-center">
          <div className="bg-white w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('pos.locked')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('pos.enterPinToUnlock')}</p>
            </div>
            {displaySettings.lockScreenPin ? (
              <div className="space-y-4">
                <input
                  type="password"
                  value={lockPin}
                  onChange={(e) => { setLockPin(e.target.value); setLockError(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder={t('pos.pinPlaceholder')}
                  className={`w-full px-4 py-3 text-center text-2xl tracking-widest border rounded-xl ${lockError ? 'border-red-500' : 'border-gray-300'}`}
                  maxLength={6}
                  autoFocus
                />
                {lockError && <p className="text-red-500 text-sm text-center">{t('pos.wrongPin') || 'Wrong PIN'}</p>}
                <button
                  onClick={handleUnlock}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold touch-feedback"
                >
                  {t('pos.unlock') || 'Unlock'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-red-500 font-medium">{t('pos.lockPinNotSet') || 'Screen lock PIN has not been set'}</p>
                <p className="text-sm text-gray-500">{t('pos.contactAdmin') || 'Please contact administrator to set lock screen PIN in Admin settings → POS Settings → Display'}</p>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="w-full py-3 bg-gray-500 text-white rounded-xl font-bold touch-feedback"
                >
                  {t('pos.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 自动更新通知 */}
      <UpdateNotification />
    </div>
  )
}

