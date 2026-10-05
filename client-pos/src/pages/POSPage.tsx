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
import { WindowControls } from '../components/WindowControls'
import { YOUME_LOGO_WHITE } from '../assets/logo'
import { useHardwareManager } from '../hooks/useHardwareManager'
import { useCartStore, useProductStore, useOrderStore, useUiStore } from '../stores'
import {
  Wifi, WifiOff, X, CheckCircle, Search, Loader2,
  ShoppingCart, Trash2, Minus, Plus, Tag, User, Clock,
  Globe, FileText, Users, Printer, ScanLine, Wallet, QrCode,
  CheckSquare, ClipboardList, Lock, Settings, RotateCcw,
  Receipt, PlusCircle, XCircle, Sparkles, Gift, Ticket
} from 'lucide-react'
import { evaluateBestPromotion, AppliedPromotion, getPromotionUpsellHint, getActivePromotionsSummary } from '../utils/promotionEngine'

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
  const [lang, setLang] = useState(() => localStorage.getItem('pos_lang') || i18n.language || 'id')
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
  const [shiftStatusLoaded, setShiftStatusLoaded] = useState(false)
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
  const [isManualDiscount, setIsManualDiscount] = useState(false)
  const [activeDiscountRules, setActiveDiscountRules] = useState<any[]>([])
  const [appliedPromotion, setAppliedPromotion] = useState<AppliedPromotion | null>(null)
  // 优惠券状态
  const [memberCoupons, setMemberCoupons] = useState<any[]>([])
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null)
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [couponCodeInput, setCouponCodeInput] = useState('')
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false)

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
   